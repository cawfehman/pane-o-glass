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

    async getHistogram(
        query: string, 
        rangeSeconds: number = 86400, 
        interval: "minute" | "hour" | "day" = "hour"
    ): Promise<{ total: number, series: GraylogHistogramData[] }> {
        const params = new URLSearchParams({
            query: query,
            range: rangeSeconds.toString(),
            interval: interval,
            filter: `streams:${this.streamId}`
        });

        const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative/histogram?${params.toString()}`;
        
        try {
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    "Authorization": this.authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                timeout: 10000
            });

            const data = res.data;
            let total = 0;
            const series: GraylogHistogramData[] = [];
            
            if (data.results && Object.keys(data.results).length > 0) {
                for (const [timestampStr, count] of Object.entries(data.results)) {
                    const ts = parseInt(timestampStr, 10) * 1000;
                    const c = count as number;
                    total += c;
                    series.push({ timestamp: ts, count: c });
                }
                series.sort((a, b) => a.timestamp - b.timestamp);
                return { total, series };
            }
        } catch (error) {
            // Fallback below
        }

        // --- FALLBACK: Multi-Bucket Relative Querying ---
        const bucketCount = Math.min(Math.max(Math.floor(rangeSeconds / 3600), 12), 168);
        const bucketDuration = Math.floor(rangeSeconds / bucketCount);
        const nowMs = Date.now();
        const series: GraylogHistogramData[] = [];
        let total = 0;

        const bucketPromises = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const bucketEndOffset = i * bucketDuration;
            const bucketStartOffset = (i + 1) * bucketDuration;
            const timestamp = nowMs - bucketEndOffset * 1000;

            const bParams = new URLSearchParams({
                query: query,
                range: bucketStartOffset.toString(),
                filter: `streams:${this.streamId}`,
                limit: "1"
            });

            const bUrl = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${bParams.toString()}`;

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
                    timestamp,
                    count: res.data.total_results || 0
                })).catch(() => ({
                    timestamp,
                    count: 0
                }))
            );
        }

        const bucketResults = await Promise.all(bucketPromises);
        bucketResults.forEach(item => {
            series.push(item);
            total += item.count;
        });

        series.sort((a, b) => a.timestamp - b.timestamp);
        return { total, series };
    }

    async getDashboardStats(rangeSeconds: number = 86400, volumeQuery: string = 'message:"inbound table"') {
        const [
            volumeData,
            delayedData,
            phishingData,
            malwareData
        ] = await Promise.all([
            this.getHistogram(volumeQuery, rangeSeconds),
            this.getHistogram('message:"Info: Delayed:"', rangeSeconds),
            this.getHistogram('message:"Action: URL redirected to Cisco Security proxy"', rangeSeconds),
            this.getHistogram('message:"interim AV verdict using" AND NOT message:"CLEAN"', rangeSeconds)
        ]);

        return {
            rangeSeconds,
            volumeQuery,
            totalVolume: volumeData.total,
            totalVolumeChart: volumeData.series,
            delayedMessages: delayedData.total,
            delayedMessagesChart: delayedData.series,
            phishingAlerts: phishingData.total,
            phishingAlertsChart: phishingData.series,
            malwareAlerts: malwareData.total,
            malwareAlertsChart: malwareData.series
        };
    }
}

async function syncIronportLogs() {
    console.log(`[${new Date().toISOString()}] Starting IronPort Graylog Sync...`);
    
    // Parse command line arguments
    const args = process.argv.slice(2);
    let days = 1; // Default to last 1 day (lightweight for recurring cron)

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
