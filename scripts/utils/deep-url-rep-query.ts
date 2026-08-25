import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function deepUrlRepQuery() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== DEEP INVESTIGATION: SEARCHING ALL URL REPUTATION SYSLOG FORMATS ===");

    // Query 1: Search for any log with "reputation"
    const q1 = 'message:"reputation"';
    // Query 2: Search for any log with "URL"
    const q2 = 'message:"URL"';
    // Query 3: Search for "has reputation"
    const q3 = 'message:"has reputation"';

    const queries = [
        { name: "message:reputation", query: q1 },
        { name: "message:URL", query: q2 },
        { name: "message:has reputation", query: q3 },
        { name: "reputation positive (> 0)", query: 'message:"has reputation" AND NOT message:"has reputation -"' }
    ];

    for (const q of queries) {
        const params = new URLSearchParams({
            query: q.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "5"
        });

        try {
            const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
                httpsAgent,
                headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                timeout: 8000
            });

            console.log(`\nQuery [${q.name}] -> Total 24h Hits: ${(res.data.total_results || 0).toLocaleString()}`);
            const msgs = res.data.messages || [];
            if (msgs.length > 0) {
                console.log("Sample 1:", msgs[0].message.message);
                if (msgs.length > 1) console.log("Sample 2:", msgs[1].message.message);
            }
        } catch (e: any) {
            console.error(`Error running ${q.name}:`, e.message);
        }
    }
}

deepUrlRepQuery();
