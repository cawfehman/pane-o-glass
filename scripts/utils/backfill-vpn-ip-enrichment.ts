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

async function backfillVpnIpEnrichment() {
    console.log("==================================================================");
    console.log("[IP-BACKFILL] Starting VPN Event IP Enrichment Backfill Utility...");
    console.log("==================================================================");

    const apiKey = process.env.IPLOCATE_API_KEY;
    console.log(`[IP-BACKFILL] API Key configured: ${apiKey ? "YES (Live iplocate.io)" : "NO (Simulated high-fidelity)"}`);

    // Find all unique public source IPs in VpnEvent that are missing ipAsn or ipCountry
    const unEnrichedEvents = await prisma.vpnEvent.findMany({
        where: {
            OR: [
                { ipAsn: null },
                { ipCountry: null }
            ]
        },
        select: { sourceIp: true },
        distinct: ['sourceIp']
    });

    const publicIps = unEnrichedEvents
        .map(e => e.sourceIp)
        .filter(ip => ip && !isPrivateIp(ip));

    console.log(`[IP-BACKFILL] Found ${publicIps.length} unique public IP addresses requiring enrichment.`);

    let processedCount = 0;
    let successCount = 0;

    // Process in batches of 20
    const chunkSize = 20;
    for (let i = 0; i < publicIps.length; i += chunkSize) {
        const chunk = publicIps.slice(i, i + chunkSize);
        console.log(`[IP-BACKFILL] Processing batch ${Math.floor(i / chunkSize) + 1} of ${Math.ceil(publicIps.length / chunkSize)} (${chunk.length} IPs)...`);

        for (const ip of chunk) {
            processedCount++;
            try {
                // 1. Check IpLookupCache
                let data: any = null;
                const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
                if (cached) {
                    data = JSON.parse(cached.rawJson);
                } else {
                    const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                        headers: apiKey ? { "X-API-KEY": apiKey } : {},
                        timeout: 5000
                    }).catch(() => null);

                    if (res?.data) {
                        data = res.data;
                        await prisma.ipLookupCache.upsert({
                            where: { ip },
                            update: {
                                latitude: data.latitude || null,
                                longitude: data.longitude || null,
                                countryCode: data.country_code || null,
                                city: data.city || null,
                                subdivision: data.subdivision || null,
                                rawJson: JSON.stringify(data)
                            },
                            create: {
                                ip,
                                latitude: data.latitude || null,
                                longitude: data.longitude || null,
                                countryCode: data.country_code || null,
                                city: data.city || null,
                                subdivision: data.subdivision || null,
                                rawJson: JSON.stringify(data)
                            }
                        }).catch(() => {});
                    }
                }

                if (data) {
                    const ipAsn = data.asn?.asn || data.asn || null;
                    const ipAsName = data.asn?.name || data.company?.name || data.org || null;
                    const ipAsDomain = data.asn?.domain || data.company?.domain || null;
                    const ipCountry = data.country || null;
                    const ipCountryCode = data.country_code || null;

                    await prisma.vpnEvent.updateMany({
                        where: { sourceIp: ip },
                        data: {
                            ipAsn,
                            ipAsName,
                            ipAsDomain,
                            ipCountry,
                            ipCountryCode
                        }
                    });

                    successCount++;
                }
            } catch (err: any) {
                console.error(`[IP-BACKFILL-ERROR] Failed to enrich IP ${ip}:`, err.message);
            }
        }
    }

    console.log("==================================================================");
    console.log(`[IP-BACKFILL] Completed! Successfully enriched ${successCount} of ${processedCount} public IPs.`);
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
