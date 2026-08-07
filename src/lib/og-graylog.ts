import https from "https";
import axios from "axios";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export interface GraylogHistogramData {
    timestamp: number;
    count: number;
}

export interface GraylogCategoryBreakdown {
    name: string;
    value: number;
    color: string;
    query: string;
    chart: GraylogHistogramData[];
}

export interface GraylogStats {
    rangeSeconds: number;
    volumeQuery: string;
    totalVolume: number;
    totalVolumeChart: GraylogHistogramData[];
    delayedMessages: number;
    delayedMessagesChart: GraylogHistogramData[];
    urlRewrites: number;
    urlRewritesChart: GraylogHistogramData[];
    malwareAlerts: number;
    malwareAlertsChart: GraylogHistogramData[];
    inboundCategories: GraylogCategoryBreakdown[];
}

export class OgGraylogClient {
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
     * Executes a histogram query against Graylog to get counts over time.
     * Uses non-overlapping absolute search windows for fallbacks to avoid cumulative duplication.
     */
    async getHistogram(
        query: string, 
        rangeSeconds: number = 86400
    ): Promise<{ total: number, series: GraylogHistogramData[] }> {
        let interval: "minute" | "hour" | "day" = "hour";
        let bucketCount = 12;

        if (rangeSeconds <= 3600) {
            interval = "minute";
            bucketCount = 12; // 5-minute buckets
        } else if (rangeSeconds <= 21600) {
            interval = "minute";
            bucketCount = 12; // 30-minute buckets
        } else if (rangeSeconds <= 43200) {
            interval = "hour";
            bucketCount = 12; // 1-hour buckets
        } else if (rangeSeconds <= 86400) {
            interval = "hour";
            bucketCount = 12; // 2-hour buckets
        } else if (rangeSeconds <= 259200) {
            interval = "hour";
            bucketCount = 12; // 6-hour buckets
        } else {
            interval = "day";
            bucketCount = 14; // 12-hour buckets for 7d
        }

        // Try Graylog legacy histogram endpoint first
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
            // Histogram endpoint unavailable or failed - proceed to non-overlapping absolute fallback below
        }

        // --- FALLBACK: Multi-Bucket Non-Overlapping Absolute Querying ---
        const bucketDurationMs = Math.floor((rangeSeconds * 1000) / bucketCount);
        const nowMs = Date.now();
        const series: GraylogHistogramData[] = [];
        let total = 0;

        const bucketPromises = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const fromMs = nowMs - (i + 1) * bucketDurationMs;
            const toMs = nowMs - i * bucketDurationMs;

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
                    timestamp: toMs,
                    count: res.data.total_results || 0
                })).catch(() => ({
                    timestamp: toMs,
                    count: 0
                }))
            );
        }

        const bucketResults = await Promise.all(bucketPromises);
        bucketResults.forEach(item => {
            series.push(item);
            total += item.count;
        });

        // Also fetch total for full range to ensure card total is exact
        try {
            const fullParams = new URLSearchParams({
                query: query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: "1"
            });
            const fullUrl = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${fullParams.toString()}`;
            const fullRes = await axios.get(fullUrl, {
                httpsAgent,
                headers: {
                    "Authorization": this.authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                timeout: 8000
            });
            if (fullRes.data?.total_results !== undefined) {
                total = fullRes.data.total_results;
            }
        } catch (e) {
            // Keep cumulative total
        }

        series.sort((a, b) => a.timestamp - b.timestamp);
        return { total, series };
    }

    /**
     * Searches raw messages in Graylog.
     */
    async searchMessages(query: string, limit: number = 100, rangeSeconds: number = 86400): Promise<any[]> {
        const params = new URLSearchParams({
            query: query,
            range: rangeSeconds.toString(),
            filter: `streams:${this.streamId}`,
            limit: limit.toString(),
            sort: "timestamp:desc"
        });

        const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;

        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                "Authorization": this.authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            timeout: 12000
        });

        return res.data.messages || [];
    }

    /**
     * Fetches all stats required for the IronPort dashboard, including content categories.
     */
    async getDashboardStats(rangeSeconds: number = 86400, volumeQuery: string = 'message:"inbound table"'): Promise<GraylogStats> {
        const [
            volumeData,
            delayedData,
            urlRewritesData,
            malwareData,
            marketingData
        ] = await Promise.all([
            this.getHistogram(volumeQuery, rangeSeconds),
            this.getHistogram('message:"Info: Delayed:"', rangeSeconds),
            this.getHistogram('message:"Action: URL redirected to Cisco Security proxy"', rangeSeconds),
            this.getHistogram('message:"interim AV verdict using" AND NOT message:"CLEAN"', rangeSeconds),
            this.getHistogram('message:"inbound table" AND (message:"Marketing" OR message:"Bulk" OR message:"Newsletter")', rangeSeconds)
        ]);

        const marketingTotal = marketingData.total;
        const corporateTotal = Math.max(0, volumeData.total - marketingTotal);

        const inboundCategories: GraylogCategoryBreakdown[] = [
            {
                name: "Corporate Transactional",
                value: corporateTotal,
                color: "#3b82f6", // Blue
                query: 'message:"inbound table" AND NOT message:"Marketing" AND NOT message:"Bulk"',
                chart: volumeData.series
            },
            {
                name: "Marketing & Newsletter",
                value: marketingTotal,
                color: "#a855f7", // Purple
                query: 'message:"inbound table" AND (message:"Marketing" OR message:"Bulk" OR message:"Newsletter")',
                chart: marketingData.series
            }
        ];

        return {
            rangeSeconds,
            volumeQuery,
            totalVolume: volumeData.total,
            totalVolumeChart: volumeData.series,
            delayedMessages: delayedData.total,
            delayedMessagesChart: delayedData.series,
            urlRewrites: urlRewritesData.total,
            urlRewritesChart: urlRewritesData.series,
            malwareAlerts: malwareData.total,
            malwareAlertsChart: malwareData.series,
            inboundCategories
        };
    }
}
