import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testSma4Buckets() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const queries = [
        { name: "Total Attempted Mail", query: 'message:"inbound table"' },
        { name: "Clean Mail (Passed All Filters)", query: 'message:"inbound table" AND NOT message:"Whitelisted Addresses"' },
        { name: "Whitelisted Senders", query: 'message:"Whitelisted Addresses"' },
        { name: "Threats (URL Rewrites / Malware)", query: 'message:"Action: URL redirected to Cisco Security proxy" OR (message:"interim AV verdict using" AND NOT message:"CLEAN")' },
        { name: "Delivery Queue Delays", query: 'message:"Info: Delayed:" AND (source:esa* OR message:esa*)' }
    ];

    console.log("=== REFINED CISCO SMA 4-BUCKET QUERY TEST ===");

    for (const q of queries) {
        const params = new URLSearchParams({
            query: q.query,
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

            console.log(`[SMA Bucket] ${q.name} -> ${(res.data.total_results || 0).toLocaleString()}`);
        } catch (e: any) {
            console.error(`[SMA Bucket] ${q.name} -> Error: ${e.message}`);
        }
    }
}

testSma4Buckets();
