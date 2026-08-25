import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function debugDashboardStats() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== DEBUGGING getTopMessageThreatAggregations ===");

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
        console.log(`Fetched ${messages.length} raw search messages from Graylog.`);

        const midMap: Record<string, any> = {};

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
                    primaryThreatUrl: url,
                    threatLevel: "CLEAN",
                    timestamp: h.message.timestamp,
                    source: h.message.source ? h.message.source.split('.')[0] : "esa"
                };
            }

            midMap[mid].totalUrls += 1;

            if (score < midMap[mid].worstScore) {
                midMap[mid].worstScore = score;
                midMap[mid].primaryThreatUrl = url;
            }

            if (score < 0) {
                midMap[mid].riskyUrlCount += 1;
            }
        });

        const aggregatedList = Object.values(midMap);
        console.log(`Aggregated ${aggregatedList.length} unique messages.`);
        if (aggregatedList.length > 0) {
            console.log("Sample aggregated message:", JSON.stringify(aggregatedList[0], null, 2));
        }
    } catch (e: any) {
        console.error("Error fetching Graylog search messages:", e.message);
    }
}

debugDashboardStats();
