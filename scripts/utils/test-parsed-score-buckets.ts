import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testParsedScoreBuckets() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING SUB-10MS IN-DEPTH SCORE BUCKET QUERIES USING esa_url_rep_score ===");

    const scoreQueries = [
        { name: "Clean / Established (Score >= 3.0)", query: 'esa_url_rep_score:[3.0 TO 10.0] OR (message:"has reputation" AND NOT message:"reputation 0.0" AND NOT message:"reputation 1." AND NOT message:"reputation 2.")' },
        { name: "Uncategorized / Neutral (Score 0.0 - 2.9)", query: 'esa_url_rep_score:[0.0 TO 2.9] OR message:"reputation 0.0"' },
        { name: "Risky / Threat Proxy (Action Rewritten / Score < 0)", query: 'esa_cisco_action:"URL redirected to Cisco Security proxy" OR message:"URL redirected to Cisco Security proxy"' }
    ];

    let totalHits = 0;
    const results: any[] = [];

    for (const q of scoreQueries) {
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
            const count = res.data.total_results || 0;
            results.push({ name: q.name, count, duration });
            totalHits += count;
        } catch (e: any) {
            console.error(`[${q.name}] -> Error:`, e.message);
        }
    }

    console.log(`\n--- IN-DEPTH WRS SCORE BREAKDOWN (24h Total: ${totalHits.toLocaleString()}) ---`);
    results.forEach(r => {
        const pct = totalHits > 0 ? ((r.count / totalHits) * 100).toFixed(1) : "0.0";
        console.log(`[${r.name}] -> ${r.count.toLocaleString()} hits (${pct}%) - Query took ${r.duration}ms`);
    });
}

testParsedScoreBuckets();
