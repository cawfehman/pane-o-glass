import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspect24h() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const queries = [
        { name: "Inbound Table (Policy match)", query: 'message:"inbound table"' },
        { name: "Inbound Table Exact Policy Match", query: 'message:"matched all recipients for per-recipient policy"' },
        { name: "Outbound Table", query: 'message:"outbound table"' },
        { name: "All Stream 5d7ff82 Messages (*)", query: '*' },
        { name: "MID Inbound Evaluation", query: 'message:"Info: MID" AND message:"inbound table"' },
        { name: "New Message Started (MID)", query: 'message:"Info: New MID"' },
        { name: "Message Completed (MID)", query: 'message:"Info: MID" AND message:"queued for delivery"' }
    ];

    console.log("=== 24-HOUR GRAYLOG TOTALS (86,400s) ===");

    for (const item of queries) {
        const params = new URLSearchParams({
            query: item.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "1"
        });

        const url = `${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;

        try {
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    "Authorization": authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                timeout: 10000
            });

            console.log(`[Query] ${item.name} -> Total Count: ${(res.data.total_results || 0).toLocaleString()}`);
        } catch (e: any) {
            console.error(`[Query] ${item.name} -> Error: ${e.message}`);
        }
    }
}

inspect24h();
