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
     * Executes non-overlapping clock-aligned absolute search queries against Graylog to build smooth time series.
     */
    async getHistogram(
        query: string, 
        rangeSeconds: number = 86400
    ): Promise<{ total: number, series: GraylogHistogramData[] }> {
        let bucketCount = 24;

        if (rangeSeconds <= 3600) {
            bucketCount = 12; // 5-minute resolution for 1h
        } else if (rangeSeconds <= 21600) {
            bucketCount = 24; // 15-minute resolution for 6h
        } else if (rangeSeconds <= 43200) {
            bucketCount = 24; // 30-minute resolution for 12h
        } else if (rangeSeconds <= 86400) {
            bucketCount = 24; // 1-hour resolution for 24h
        } else if (rangeSeconds <= 259200) {
            bucketCount = 36; // 2-hour resolution for 3d
        } else {
            bucketCount = 28; // 6-hour resolution for 7d
        }

        const bucketDurationMs = Math.floor((rangeSeconds * 1000) / bucketCount);
        // Lock end of timeline to nearest clean clock boundary
        const endAnchorMs = Math.floor(Date.now() / bucketDurationMs) * bucketDurationMs;
        const series: GraylogHistogramData[] = [];
        let total = 0;

        const bucketPromises = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const fromMs = endAnchorMs - i * bucketDurationMs;
            const toMs = endAnchorMs - (i - 1) * bucketDurationMs;

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
     * Fetches all stats required for the IronPort dashboard.
     */
    async getDashboardStats(rangeSeconds: number = 86400, volumeQuery: string = 'message:"inbound table"'): Promise<GraylogStats> {
        const [
            volumeData,
            delayedData,
            urlRewritesData,
            malwareData,
            whitelistedData
        ] = await Promise.all([
            this.getHistogram(volumeQuery, rangeSeconds),
            this.getHistogram('message:"Info: Delayed:"', rangeSeconds),
            this.getHistogram('message:"Action: URL redirected to Cisco Security proxy"', rangeSeconds),
            this.getHistogram('message:"interim AV verdict using" AND NOT message:"CLEAN"', rangeSeconds),
            this.getHistogram('message:"Whitelisted Addresses"', rangeSeconds)
        ]);

        const whitelistedTotal = whitelistedData.total;
        const defaultTotal = Math.max(0, volumeData.total - whitelistedTotal);

        const inboundCategories: GraylogCategoryBreakdown[] = [
            {
                name: "Standard Inbound Policy",
                value: defaultTotal,
                color: "#3b82f6", // Blue
                query: 'message:"per-recipient policy DEFAULT"',
                chart: volumeData.series
            },
            {
                name: "Whitelisted Senders",
                value: whitelistedTotal,
                color: "#a855f7", // Purple
                query: 'message:"Whitelisted Addresses"',
                chart: whitelistedData.series
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
