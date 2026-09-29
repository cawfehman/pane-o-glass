import { PrismaClient } from '@prisma/client';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const prisma = new PrismaClient();

function ipToLong(ip: string): number {
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

function isPrivateIp(ip: string): boolean {
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch {
        return false;
    }
}

async function main() {
    console.log("==================================================================");
    console.log(`[${new Date().toISOString()}] Starting Shun IP Enrichment Backfill Utility...`);
    console.log("==================================================================");

    try {
        // Parse CLI arguments
        const args = process.argv.slice(2);
        const limitArgIdx = args.indexOf('--limit');
        const customLimit = limitArgIdx !== -1 && args[limitArgIdx + 1] ? parseInt(args[limitArgIdx + 1], 10) : null;
        const forceAll = args.includes('--force');

        // 1. Resolve RFC 1918 / Private IPs first
        const allUnenriched = await prisma.shunDatabaseIp.findMany({
            where: { enrichedAt: null },
            select: { ip: true }
        });

        console.log(`Total unenriched IPs in database: ${allUnenriched.length}`);

        let privateCount = 0;
        for (const record of allUnenriched) {
            if (isPrivateIp(record.ip)) {
                await prisma.shunDatabaseIp.update({
                    where: { ip: record.ip },
                    data: {
                        ipAsn: "PRIVATE",
                        org: "RFC 1918 / Private Network",
                        ipCountry: "Internal Network",
                        city: "Private Subnet",
                        continent: "Internal",
                        enrichedAt: new Date()
                    }
                });
                privateCount++;
            }
        }

        if (privateCount > 0) {
            console.log(`Enriched ${privateCount} private RFC 1918 IP(s) locally.`);
        }

        // 2. Determine quota
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);

        const queriesUsedToday = await prisma.auditLog.count({
            where: {
                action: "IPLOCATE_API_QUERY",
                createdAt: { gte: startOfUtcDay }
            }
        });

        const dailyQuota = parseInt(process.env.IPLOCATE_DAILY_QUOTA || "1000", 10);
        let allowedQueries = forceAll ? 999999 : Math.max(0, dailyQuota - queriesUsedToday);
        if (customLimit) {
            allowedQueries = Math.min(allowedQueries, customLimit);
        }

        console.log(`IPLocate daily limit: ${dailyQuota} | Used today: ${queriesUsedToday} | Quota allowance: ${allowedQueries}`);

        if (allowedQueries <= 0) {
            console.log("No remaining daily quota for IPLocate. Pass --force or wait for next UTC day.");
            return;
        }

        const pendingPublicIps = await prisma.shunDatabaseIp.findMany({
            where: { enrichedAt: null },
            take: allowedQueries,
            select: { ip: true }
        });

        if (pendingPublicIps.length === 0) {
            console.log("No public pending IPs require enrichment. Database is 100% enriched!");
            return;
        }

        console.log(`Found ${pendingPublicIps.length} pending public IPs to enrich. Processing batches...`);
        const ipList = pendingPublicIps.map(p => p.ip);
        const apiKey = process.env.IPLOCATE_API_KEY;
        let enrichedCount = 0;
        let quotaExhausted = false;

        for (let i = 0; i < ipList.length && !quotaExhausted; i += 100) {
            const batch = ipList.slice(i, i + 100);
            const results: Record<string, any> = {};

            for (const batchIp of batch) {
                try {
                    const res = await axios.get(`https://www.iplocate.io/api/lookup/${batchIp}`, {
                        headers: apiKey ? { "X-API-KEY": apiKey } : {},
                        timeout: 5000
                    });
                    results[batchIp] = res.data;

                    await prisma.auditLog.create({
                        data: {
                            action: "IPLOCATE_API_QUERY",
                            details: `Executed lookup for IP: ${batchIp} via Shun IP Enrichment Utility.`,
                            ipAddress: batchIp
                        }
                    });
                } catch (e: any) {
                    if (e.response?.status === 429) {
                        console.warn(`[utility] IPLocate API rate limit / quota exceeded (HTTP 429) at IP ${batchIp}. Halting queue.`);
                        quotaExhausted = true;
                        break;
                    }
                    console.error(`Failed to enrich IP ${batchIp}:`, e.message);
                }
            }

            for (const ip of batch) {
                const data = results[ip];
                if (data && data.country_code) {
                    const asnString = typeof data.asn === 'object' ? data.asn?.asn : data.asn;
                    const orgString = typeof data.asn === 'object' ? (data.asn?.name || data.asn?.org || data.org) : data.org;

                    await prisma.shunDatabaseIp.update({
                        where: { ip },
                        data: {
                            ipAsn: asnString ? String(asnString) : null,
                            org: orgString ? String(orgString) : null,
                            ipCountry: data.country,
                            ipCountryCode: data.country_code,
                            city: data.city,
                            continent: data.continent,
                            enrichedAt: new Date()
                        }
                    });
                    enrichedCount++;
                }
            }

            console.log(`Processed batch ${i} to ${i + batch.length} (${enrichedCount} enriched)...`);
        }

        console.log(`[${new Date().toISOString()}] Successfully enriched ${enrichedCount} public IPs!`);
    } catch (err: any) {
        console.error("Critical error in enrich-shun-ips:", err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
