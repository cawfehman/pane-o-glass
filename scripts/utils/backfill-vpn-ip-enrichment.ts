import { PrismaClient } from '@prisma/client';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

function ipToLong(ip: string) {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

const NON_PUBLIC_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" },
    { start: "100.64.0.0", end: "100.127.255.255" },
    { start: "127.0.0.0", end: "127.255.255.255" },
    { start: "169.254.0.0", end: "169.254.255.255" },
    { start: "172.16.0.0", end: "172.31.255.255" },
    { start: "192.0.0.0", end: "192.0.0.255" },
    { start: "192.0.2.0", end: "192.0.2.255" },
    { start: "192.168.0.0", end: "192.168.255.255" },
    { start: "198.18.0.0", end: "198.19.255.255" },
    { start: "198.51.100.0", end: "198.51.100.255" },
    { start: "203.0.113.0", end: "203.0.113.255" },
    { start: "224.0.0.0", end: "239.255.255.255" },
    { start: "240.0.0.0", end: "255.255.255.255" }
];

function isPrivateIp(ip: string) {
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch (e) {
        return true;
    }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function backfillVpnIpEnrichment() {
    // Parse limit from CLI args (e.g. node script.js --limit 20000)
    const limitArgIndex = process.argv.indexOf('--limit');
    const targetLimit = (limitArgIndex !== -1 && process.argv[limitArgIndex + 1])
        ? parseInt(process.argv[limitArgIndex + 1], 10)
        : 20000;

    console.log("==================================================================");
    console.log(`[IP-BACKFILL] Starting VPN IP Enrichment for Most Recent ${targetLimit.toLocaleString()} IPs...`);
    console.log("==================================================================");

    const apiKey = process.env.IPLOCATE_API_KEY;
    console.log(`[IP-BACKFILL] API Key status: ${apiKey ? "YES (Live iplocate.io API)" : "NO (Fallback high-fidelity simulation)"}`);

    // Query most recent unenriched IPs using optimized raw SQL
    console.log(`[IP-BACKFILL] Executing SQL to pull top ${targetLimit.toLocaleString()} most recent unique public IPs...`);
    
    const rawResults: { sourceIp: string; latest_date: Date }[] = await prisma.$queryRaw`
        SELECT "sourceIp", MAX("createdAt") as latest_date
        FROM "VpnEvent"
        WHERE "sourceIp" IS NOT NULL
          AND ("ipAsn" IS NULL OR "ipCountry" IS NULL)
        GROUP BY "sourceIp"
        ORDER BY latest_date DESC
        LIMIT ${targetLimit};
    `;

    const publicIps = rawResults
        .map(e => e.sourceIp)
        .filter(ip => ip && !isPrivateIp(ip));

    const newestDate = rawResults.length > 0 ? rawResults[0].latest_date : null;
    const oldestDate = rawResults.length > 0 ? rawResults[rawResults.length - 1].latest_date : null;

    console.log(`[IP-BACKFILL] Isolated ${publicIps.length.toLocaleString()} unique public IPs needing enrichment.`);
    if (newestDate && oldestDate) {
        console.log(`[IP-BACKFILL] Timeframe window: From ${new Date(oldestDate).toLocaleString()} to ${new Date(newestDate).toLocaleString()}`);
    }

    // 1. Check local IpLookupCache in PostgreSQL first (0 external API calls)
    console.log("[IP-BACKFILL] Phase 1: Checking local PostgreSQL IpLookupCache...");
    const cachedMap = new Map<string, any>();
    const chunkSize = 2000;
    
    for (let i = 0; i < publicIps.length; i += chunkSize) {
        const chunk = publicIps.slice(i, i + chunkSize);
        const cachedRecords = await prisma.ipLookupCache.findMany({
            where: { ip: { in: chunk } }
        });
        for (const r of cachedRecords) {
            try {
                cachedMap.set(r.ip, JSON.parse(r.rawJson));
            } catch (e) {}
        }
    }

    console.log(`[IP-BACKFILL] Resolved ${cachedMap.size.toLocaleString()} IPs directly from local cache (0 API calls).`);

    // Backfill cached IPs into VpnEvent rows immediately
    let cacheApplied = 0;
    for (const [ip, data] of cachedMap.entries()) {
        const ipAsn = data.asn?.asn || data.asn || null;
        const ipAsName = data.asn?.name || data.company?.name || data.org || null;
        const ipAsDomain = data.asn?.domain || data.company?.domain || null;
        const ipCountry = data.country || null;
        const ipCountryCode = data.country_code || null;

        await prisma.vpnEvent.updateMany({
            where: { sourceIp: ip },
            data: { ipAsn, ipAsName, ipAsDomain, ipCountry, ipCountryCode }
        });
        cacheApplied++;
    }
    console.log(`[IP-BACKFILL] Applied local cache data to ${cacheApplied.toLocaleString()} IP event groups.`);

    // 2. Identify remaining uncached IPs
    const uncachedIps = publicIps.filter(ip => !cachedMap.has(ip));
    console.log(`[IP-BACKFILL] Phase 2: ${uncachedIps.length.toLocaleString()} uncached IPs require external lookup.`);

    if (uncachedIps.length === 0) {
        console.log("[IP-BACKFILL] All target IPs resolved from cache! Work complete.");
        return;
    }

    // Process uncached IPs in controlled batches with rate limit safety
    let externalSuccess = 0;
    let rateLimited = false;
    const batchSize = 10;
    const delayMs = 500; // 500ms pause between calls to respect rate limits

    for (let i = 0; i < uncachedIps.length; i += batchSize) {
        if (rateLimited) {
            console.log("[IP-BACKFILL-WARNING] Stopping external lookups due to rate limit response.");
            break;
        }

        const chunk = uncachedIps.slice(i, i + batchSize);
        console.log(`[IP-BACKFILL] External Batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(uncachedIps.length / batchSize)} (${externalSuccess + cacheApplied}/${publicIps.length} completed)...`);

        for (const ip of chunk) {
            try {
                const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                    headers: apiKey ? { "X-API-KEY": apiKey } : {},
                    timeout: 5000
                }).catch(async (err) => {
                    if (err.response && err.response.status === 429) {
                        rateLimited = true;
                        console.error("[IP-BACKFILL] Rate limit hit (HTTP 429). Exiting gracefully.");
                        await prisma.auditLog.create({
                            data: {
                                action: "IPLOCATE_RATE_LIMIT",
                                details: `IPLocate.io API Rate Limit Exceeded (HTTP 429) during backfill utility. Script gracefully stopped after enriching ${externalSuccess} IPs.`,
                                ipAddress: ip
                            }
                        }).catch(() => {});
                    }
                    return null;
                });

                if (res?.data) {
                    const data = res.data;
                    const ipAsn = data.asn?.asn || data.asn || null;
                    const ipAsName = data.asn?.name || data.company?.name || data.org || null;
                    const ipAsDomain = data.asn?.domain || data.company?.domain || null;
                    const ipCountry = data.country || null;
                    const ipCountryCode = data.country_code || null;

                    // Log audit query
                    await prisma.auditLog.create({
                        data: {
                            action: "IPLOCATE_API_QUERY",
                            details: `Executed backfill lookup for IP: ${ip} via IPLocate.io.`,
                            ipAddress: ip
                        }
                    }).catch(() => {});

                    // Cache in PostgreSQL
                    await prisma.ipLookupCache.upsert({
                        where: { ip },
                        update: {
                            latitude: data.latitude || null,
                            longitude: data.longitude || null,
                            countryCode: ipCountryCode,
                            city: data.city || null,
                            subdivision: data.subdivision || null,
                            rawJson: JSON.stringify(data)
                        },
                        create: {
                            ip,
                            latitude: data.latitude || null,
                            longitude: data.longitude || null,
                            countryCode: ipCountryCode,
                            city: data.city || null,
                            subdivision: data.subdivision || null,
                            rawJson: JSON.stringify(data)
                        }
                    }).catch(() => {});

                    // Update VpnEvent records
                    await prisma.vpnEvent.updateMany({
                        where: { sourceIp: ip },
                        data: { ipAsn, ipAsName, ipAsDomain, ipCountry, ipCountryCode }
                    });

                    externalSuccess++;
                }

                await sleep(delayMs);
            } catch (err: any) {
                console.error(`[IP-BACKFILL-ERROR] Failed to look up IP ${ip}:`, err.message);
            }
        }
    }

    console.log("==================================================================");
    console.log(`[IP-BACKFILL] Finished! Successfully enriched ${(cacheApplied + externalSuccess).toLocaleString()} of ${publicIps.length.toLocaleString()} target IPs.`);
    console.log(`[IP-BACKFILL] Local Cache Hits: ${cacheApplied.toLocaleString()} | External API Fetches: ${externalSuccess.toLocaleString()}`);
    console.log("==================================================================");
}

backfillVpnIpEnrichment()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error("[IP-BACKFILL-FATAL]", e);
        await prisma.$disconnect();
        process.exit(1);
    });
