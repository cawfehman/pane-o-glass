import { prisma } from "../../src/lib/prisma";
import { OgGraylogClient } from "../../src/lib/og-graylog";

async function syncIronportLogs() {
    console.log(`[${new Date().toISOString()}] Starting IronPort Graylog Sync...`);
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    let days = 1; // Default to last 1-2 days (lightweight for recurring cron)

    const daysArg = args.find(a => a.startsWith('--days='));
    if (daysArg) {
        days = parseInt(daysArg.split('=')[1], 10) || 7;
    } else if (args.includes('--historical') || args.includes('--full')) {
        days = 7;
    }

    const rangeSeconds = Math.max(days * 86400, 21600); // At least 6 hours (21600s), up to N days
    console.log(`Ingesting Graylog metrics for range: ${days} day(s) (${rangeSeconds} seconds)...`);

    const client = new OgGraylogClient();

    try {
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
                message: `Synced ${savedCount} hourly metrics from Graylog (${days}d range).`
            },
            create: {
                name: "IronPort Graylog Sync",
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Synced ${savedCount} hourly metrics from Graylog (${days}d range).`
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
