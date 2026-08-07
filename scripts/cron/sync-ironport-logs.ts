import { PrismaClient } from "@prisma/client";
import path from "path";
import https from "https";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export interface GraylogHistogramData {
    timestamp: number;
    count: number;
}

class OgGraylogClient {
    private baseUrl: string;
    private apiToken: string;
    private streamId: string;

    constructor() {
        this.baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
        this.apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
        this.streamId = "5d7ff82fb209026ab43e167b";
    }

    private get authHeader() {
        if (!this.apiToken) throw new Error("OG_GRAYLOG_API_TOKEN is not configured.");
        return "Basic " + Buffer.from(this.apiToken + ":token").toString("base64");
    }

    /**
     * Executes non-overlapping 1-hour clock-aligned queries against Graylog to build hourly DB metrics.
     */
    async getHourlyBuckets(
        query: string, 
        hoursCount: number = 24
    ): Promise<GraylogHistogramData[]> {
        const hourMs = 3600000;
        const endAnchorMs = Math.floor(Date.now() / hourMs) * hourMs;
        const series: GraylogHistogramData[] = [];

        const bucketPromises = [];

        for (let i = hoursCount - 1; i >= 0; i--) {
            const fromMs = endAnchorMs - i * hourMs;
            const toMs = endAnchorMs - (i - 1) * hourMs;

            const fromIso = new Date(fromMs).toISOString();
            const toIso = new Date(toMs).toISOString();

            const bParams = new URLSearchParams({
                query: query,
                from: fromIso,
                to: toIso,
                filter: `streams:${this.streamId}`,
                limit: "1"
            });

            const bUrl = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/absolute?${bParams.toString()}`;

            bucketPromises.push(
                axios.get(bUrl, {
                    httpsAgent,
                    headers: {
                        "Authorization": this.authHeader,
                        "Accept": "application/json",
                        "X-Requested-By": "cli"
                    },
                    timeout: 8000
                }).then(res => ({
                    timestamp: fromMs,
                    count: res.data.total_results || 0
                })).catch(() => ({
                    timestamp: fromMs,
                    count: 0
                }))
            );
        }

        const results = await Promise.all(bucketPromises);
        results.sort((a, b) => a.timestamp - b.timestamp);
        return results;
    }
}

async function syncIronportLogs() {
    console.log(`[${new Date().toISOString()}] Starting IronPort Graylog Sync...`);
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    let hoursCount = 24; // Default to last 24 hours

    const daysArg = args.find(a => a.startsWith('--days='));
    if (daysArg) {
        hoursCount = (parseInt(daysArg.split('=')[1], 10) || 7) * 24;
    } else if (args.includes('--historical') || args.includes('--full')) {
        hoursCount = 7 * 24;
    }

    console.log(`Ingesting Graylog hourly metrics for range: ${hoursCount} hour(s)...`);

    const client = new OgGraylogClient();

    try {
        const [inboundData, outboundData, delayedData, phishingData, malwareData] = await Promise.all([
            client.getHourlyBuckets('message:"inbound table"', hoursCount),
            client.getHourlyBuckets('message:"outbound table"', hoursCount),
            client.getHourlyBuckets('message:"Info: Delayed:"', hoursCount),
            client.getHourlyBuckets('message:"Action: URL redirected to Cisco Security proxy"', hoursCount),
            client.getHourlyBuckets('message:"interim AV verdict using" AND NOT message:"CLEAN"', hoursCount)
        ]);

        const mapByTime: Record<number, { inbound: number; outbound: number; delayed: number; phishing: number; malware: number }> = {};

        const ensureBucket = (ts: number) => {
            // Lock timestamp to exact top-of-hour boundary
            const hourTs = Math.floor(ts / 3600000) * 3600000;
            if (!mapByTime[hourTs]) {
                mapByTime[hourTs] = { inbound: 0, outbound: 0, delayed: 0, phishing: 0, malware: 0 };
            }
            return mapByTime[hourTs];
        };

        inboundData.forEach(pt => { ensureBucket(pt.timestamp).inbound = pt.count; });
        outboundData.forEach(pt => { ensureBucket(pt.timestamp).outbound = pt.count; });
        delayedData.forEach(pt => { ensureBucket(pt.timestamp).delayed = pt.count; });
        phishingData.forEach(pt => { ensureBucket(pt.timestamp).phishing = pt.count; });
        malwareData.forEach(pt => { ensureBucket(pt.timestamp).malware = pt.count; });

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

        console.log(`[${new Date().toISOString()}] Successfully synced ${savedCount} top-of-hour IronPort records to database.`);

        // Record successful run in BackgroundJob table
        await prisma.backgroundJob.upsert({
            where: { name: "IronPort Graylog Sync" },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Synced ${savedCount} top-of-hour metrics from Graylog (${hoursCount}h range).`
            },
            create: {
                name: "IronPort Graylog Sync",
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Synced ${savedCount} top-of-hour metrics from Graylog (${hoursCount}h range).`
            }
        });

    } catch (error: any) {
        console.error(`[${new Date().toISOString()}] IronPort Sync Failed:`, error);
        try {
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
        } catch (e: any) {
            console.error("Failed to write error to BackgroundJob:", e);
        }
    } finally {
        await prisma.$disconnect();
    }
}

syncIronportLogs()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
