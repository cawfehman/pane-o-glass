import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testFastUrlQueries() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING FAST OPTIMIZED LUCENE QUERIES ===");

    const queries = [
        { name: "Total Evaluated URLs", query: 'message:"has reputation"' },
        { name: "Threat Proxy Rewrites", query: 'message:"URL redirected to Cisco Security proxy"' },
        { name: "AMP Skipped", query: 'message:"AMP file reputation verdict : SKIPPED"' },
        { name: "AMP Unknown", query: 'message:"AMP file reputation verdict : UNKNOWN"' },
        { name: "AMP Clean", query: 'message:"AMP file reputation verdict : CLEAN"' }
    ];

    for (const q of queries) {
        const start = Date.now();
        const params = new URLSearchParams({
            query: q.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "1"
        });

        try {
            const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
                httpsAgent,
                headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                timeout: 8000
            });
            const duration = Date.now() - start;
            console.log(`[${q.name}] -> Count: ${(res.data.total_results || 0).toLocaleString()} (took ${duration}ms)`);
        } catch (e: any) {
            console.error(`[${q.name}] -> Error: ${e.message}`);
        }
    }
}

testFastUrlQueries();
