import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function checkHourlyBreakdown() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const ranges = [
        { name: "Last 1 Hour (3,600s)", seconds: "3600" },
        { name: "Last 6 Hours (21,600s)", seconds: "21600" },
        { name: "Last 24 Hours (86,400s)", seconds: "86400" }
    ];

    const queries = [
        { name: "Inbound Clean Mail (inbound table)", query: 'message:"inbound table"' },
        { name: "Outbound Clean Mail (outbound table)", query: 'message:"outbound table"' },
        { name: "Message Queued for Delivery", query: 'message:"queued for delivery"' },
        { name: "Message Delivered Success", query: 'message:"Response positive"' },
        { name: "ICID Connections Accepted", query: 'message:"ACCEPT policy"' }
    ];

    for (const r of ranges) {
        console.log(`\n=== TIMEFRAME: ${r.name} ===`);
        for (const q of queries) {
            const params = new URLSearchParams({
                query: q.query,
                range: r.seconds,
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

                console.log(`  -> ${q.name}: ${(res.data.total_results || 0).toLocaleString()}`);
            } catch (e: any) {
                console.error(`  -> ${q.name}: Error ${e.message}`);
            }
        }
    }
}

checkHourlyBreakdown();
