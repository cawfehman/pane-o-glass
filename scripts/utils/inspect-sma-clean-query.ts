import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectSmaCleanQuery() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const tests = [
        { name: "Raw Inbound Table logs", query: 'message:"inbound table"' },
        { name: "Delivered / Queued for Delivery logs", query: 'message:"queued for delivery"' },
        { name: "Clean Anti-Spam (sbrs: or NOT spam)", query: 'message:"inbound table" AND NOT message:"positive" AND NOT message:"Greymail"' },
        { name: "ICID Connections Accepted", query: 'message:"ACCEPT policy"' },
        { name: "Per-Recipient Policy DEFAULT", query: 'message:"per-recipient policy DEFAULT"' }
    ];

    console.log("=== GRAYLOG QUERY COMPARISON FOR SMA CLEAN MAIL (Target: ~42.5k) ===");

    for (const t of tests) {
        const params = new URLSearchParams({
            query: t.query,
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
                timeout: 8000
            });

            console.log(`[Test] ${t.name} -> Total: ${(res.data.total_results || 0).toLocaleString()}`);
        } catch (e: any) {
            console.error(`[Test] ${t.name} -> Error: ${e.message}`);
        }
    }
}

inspectSmaCleanQuery();
