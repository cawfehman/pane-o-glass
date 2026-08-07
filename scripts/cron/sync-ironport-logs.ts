import { prisma } from "../../src/lib/prisma";
import { OgGraylogClient } from "../../src/lib/og-graylog";

async function syncIronportLogs() {
    console.log(`[${new Date().toISOString()}] Starting IronPort Graylog Sync...`);
    const client = new OgGraylogClient();

    try {
        // Query hourly rollups for the last 7 days (604,800s) to populate historical database buckets
        const rangeSeconds = 604800; 
        const stats = await client.getDashboardStats(rangeSeconds, 'message:"inbound table"');
        const outboundStats = await client.getHistogram('message:"outbound table"', rangeSeconds);

        // Map timestamps to hourly buckets
        const mapByTime: Record<number, { inbound: number; outbound: number; delayed: number; phishing: number; malware: number }> = {};

        const ensureBucket = (ts: number) => {
            if (!mapByTime[ts]) {
                mapByTime[ts] = { inbound: 0, outbound: 0, delayed: 0, phishing: 0, malware: 0 };
            }
            return mapByTime[ts];
        };

        (stats.totalVolumeChart || []).forEach(pt => {
            ensureBucket(pt.timestamp).inbound = pt.count;
        });

        (outboundStats.series || []).forEach(pt => {
            ensureBucket(pt.timestamp).outbound = pt.count;
        });

        (stats.delayedMessagesChart || []).forEach(pt => {
            ensureBucket(pt.timestamp).delayed = pt.count;
        });

        (stats.phishingAlertsChart || []).forEach(pt => {
            ensureBucket(pt.timestamp).phishing = pt.count;
        });

        (stats.malwareAlertsChart || []).forEach(pt => {
            ensureBucket(pt.timestamp).malware = pt.count;
        });

        let savedCount = 0;
        for (const [tsStr, counts] of Object.entries(mapByTime)) {
            const timestamp = new Date(parseInt(tsStr, 10));

            await (prisma as any).ironportHourlyStat.upsert({
                where: { timestamp },
                update: {
                    inboundVolume: counts.inbound,
                    outboundVolume: counts.outbound,
                    delayedCount: counts.delayed,
                    phishingCount: counts.phishing,
                    malwareCount: counts.malware,
                },
                create: {
                    timestamp,
                    inboundVolume: counts.inbound,
                    outboundVolume: counts.outbound,
                    delayedCount: counts.delayed,
                    phishingCount: counts.phishing,
                    malwareCount: counts.malware,
                }
            });
            savedCount++;
        }

        console.log(`[${new Date().toISOString()}] Successfully synced ${savedCount} hourly IronPort buckets to database.`);

        // Record successful run in BackgroundJob table
        await prisma.backgroundJob.upsert({
            where: { name: "IronPort Graylog Sync" },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Synced ${savedCount} hourly metrics from Graylog.`
            },
            create: {
                name: "IronPort Graylog Sync",
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Synced ${savedCount} hourly metrics from Graylog.`
            }
        });

    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] IronPort Sync Failed:`, error);
        await prisma.backgroundJob.upsert({
            where: { name: "IronPort Graylog Sync" },
            update: {
                lastRun: new Date(),
                status: "FAILURE",
                message: error.message || "Unknown error during IronPort sync"
            },
            create: {
                name: "IronPort Graylog Sync",
                lastRun: new Date(),
                status: "FAILURE",
                message: error.message || "Unknown error during IronPort sync"
            }
        });
    }
}

syncIronportLogs()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
