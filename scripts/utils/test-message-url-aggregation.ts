import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export interface MessageUrlAggregation {
    mid: string;
    messageId?: string;
    totalUrls: number;
    worstScore: number;
    riskyUrlCount: number;
    urls: Array<{ url: string; score: number }>;
    threatLevel: "CRITICAL" | "SUSPECT" | "NEUTRAL" | "LOW";
    timestamp: string;
    source: string;
}

async function testMessageUrlAggregation() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING PER-MESSAGE URL THREAT AGGREGATION ENGINE ===");

    // Query 150 recent URL reputation logs
    const params = new URLSearchParams({
        query: '_exists_:esa_url_rep_score OR (message:"URL" AND message:"reputation")',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "150",
        sort: "timestamp:desc"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        console.log(`Fetched ${messages.length} URL telemetry events.\n`);

        const midMap: Record<string, MessageUrlAggregation> = {};

        messages.forEach((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const urlMatch = raw.match(/URL (https?:\/\/\S+)/i);
            const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

            const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            if (!mid) return;

            let score = 0.0;
            if (h.message.esa_url_rep_score !== undefined) {
                score = parseFloat(h.message.esa_url_rep_score);
            } else if (repMatch) {
                score = parseFloat(repMatch[1]);
            }

            const url = urlMatch ? urlMatch[1] : raw;

            if (!midMap[mid]) {
                midMap[mid] = {
                    mid,
                    messageId: h.message.esa_rfc_message_id || "",
                    totalUrls: 0,
                    worstScore: score,
                    riskyUrlCount: 0,
                    urls: [],
                    threatLevel: "LOW",
                    timestamp: h.message.timestamp,
                    source: h.message.source ? h.message.source.split('.')[0] : "esa"
                };
            }

            midMap[mid].urls.push({ url, score });
            midMap[mid].totalUrls += 1;
            if (score < midMap[mid].worstScore) {
                midMap[mid].worstScore = score;
            }
            if (score < 0) {
                midMap[mid].riskyUrlCount += 1;
            }
        });

        // Compute threat levels
        const aggregatedList = Object.values(midMap).map(m => {
            if (m.worstScore <= -5.0) {
                m.threatLevel = "CRITICAL";
            } else if (m.worstScore < 0.0) {
                m.threatLevel = "SUSPECT";
            } else if (m.worstScore < 3.0) {
                m.threatLevel = "NEUTRAL";
            } else {
                m.threatLevel = "LOW";
            }
            return m;
        });

        // Sort by worst score ascending (most dangerous first)
        aggregatedList.sort((a, b) => a.worstScore - b.worstScore);

        console.log(`--- PER-MESSAGE THREAT AGGREGATIONS (${aggregatedList.length} Unique Messages Analyzed) ---`);
        aggregatedList.slice(0, 10).forEach((m, idx) => {
            console.log(`\n[${idx + 1}] MID: ${m.mid} | Threat Level: ${m.threatLevel} | Worst Score: ${m.worstScore.toFixed(1)} | Total URLs: ${m.totalUrls} | Risky URLs: ${m.riskyUrlCount}`);
            m.urls.slice(0, 2).forEach(u => {
                console.log(`    -> Score ${u.score.toFixed(1)}: ${u.url.substring(0, 70)}`);
            });
        });

    } catch (e: any) {
        console.error("Error in message URL aggregation test:", e.message);
    }
}

testMessageUrlAggregation();
