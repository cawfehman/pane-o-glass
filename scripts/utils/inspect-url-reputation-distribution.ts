import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectUrlReputationDistribution() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== DEEP INSPECTION: CISCO WRS SCORE RANGES IN GRAYLOG ===");

    // Fetch 20 raw URL reputation syslog payloads
    const params = new URLSearchParams({
        query: 'message:"URL" AND message:"reputation"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "20"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        console.log(`Captured ${messages.length} raw URL reputation payloads:\n`);

        messages.forEach((m: any, idx: number) => {
            const raw = m.message.message || "";
            const repMatch = raw.match(/reputation ([\-\d\.]+)/i);
            const score = repMatch ? repMatch[1] : "N/A";
            console.log(`[${idx + 1}] Score: ${score} -> Payload: ${raw.substring(0, 140)}...`);
        });

        // Let's test score range buckets:
        // Cisco WRS Scale:
        // Malicious: -10.0 to -6.0
        // Suspect / Low: -5.9 to 5.9
        // Clean / Neutral: 6.0 to 10.0 (or > 6.0)
        // Or let's test exact queries:
        const ranges = [
            { name: "Clean / Trusted (WRS >= 6.0)", query: 'message:"URL" AND (message:"reputation 6." OR message:"reputation 7." OR message:"reputation 8." OR message:"reputation 9." OR message:"reputation 10.")' },
            { name: "Neutral / Moderate (WRS 0.0 to 5.9)", query: 'message:"URL" AND (message:"reputation 0." OR message:"reputation 1." OR message:"reputation 2." OR message:"reputation 3." OR message:"reputation 4." OR message:"reputation 5.")' },
            { name: "Negative / Malicious (WRS < 0.0)", query: 'message:"URL" AND message:"reputation -"' }
        ];

        console.log("\n--- Testing Exact Cisco WRS Score Bucket Queries ---");
        for (const r of ranges) {
            const rParams = new URLSearchParams({
                query: r.query,
                range: "86400",
                filter: `streams:${streamId}`,
                limit: "1"
            });
            const rRes = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${rParams.toString()}`, {
                httpsAgent,
                headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                timeout: 8000
            });
            console.log(`Bucket [${r.name}] -> Hits: ${(rRes.data.total_results || 0).toLocaleString()}`);
        }

    } catch (e: any) {
        console.error("Error inspecting URL distribution:", e.message);
    }
}

inspectUrlReputationDistribution();
