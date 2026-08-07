import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testDelayQueries() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const tests = [
        { name: "Total Delays", query: 'message:"Info: Delayed:"' },
        { name: "ESA01 Delays (esa01)", query: 'message:"Info: Delayed:" AND (source:esa01* OR message:esa01*)' },
        { name: "ESA02 Delays (esa02)", query: 'message:"Info: Delayed:" AND (source:esa02* OR message:esa02*)' },
        { name: "SMA Delays (sma)", query: 'message:"Info: Delayed:" AND (source:sma* OR message:sma*)' },
        { name: "Unassigned Delays (NOT esa01 AND NOT esa02 AND NOT sma)", query: 'message:"Info: Delayed:" AND NOT (source:esa01* OR message:esa01*) AND NOT (source:esa02* OR message:esa02*) AND NOT (source:sma* OR message:sma*)' }
    ];

    console.log("=== DELAY QUERY MATCHING TEST ===");

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

            console.log(`[Test] ${t.name} -> Total: ${res.data.total_results || 0}`);
        } catch (e: any) {
            console.error(`[Test] ${t.name} -> Error: ${e.message}`);
        }
    }
}

testDelayQueries();
