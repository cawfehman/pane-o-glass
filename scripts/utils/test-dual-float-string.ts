import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testDualFloatString() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING DUAL COMPATIBILITY (NUMERIC FLOAT + HISTORICAL STRING) ===");

    const dualQueries = [
        { name: "Clean (Score >= 5.0)", query: 'esa_url_rep_score:[5.0 TO 10.0] OR esa_url_rep_score:/[5-9]\\..*/ OR esa_url_rep_score:"10.0"' },
        { name: "Neutral (Score 3.0 - 4.9)", query: 'esa_url_rep_score:[3.0 TO 4.9] OR esa_url_rep_score:/[3-4]\\..*/' },
        { name: "Uncategorized (Score 0.0 - 2.9)", query: 'esa_url_rep_score:[0.0 TO 2.9] OR esa_url_rep_score:/[0-2]\\..*/' },
        { name: "Suspect (Score -0.1 to -4.9)", query: 'esa_url_rep_score:[-4.9 TO -0.1] OR esa_url_rep_score:/-[0-4]\\..*/' },
        { name: "Malicious (Score <= -5.0)", query: 'esa_url_rep_score:[-10.0 TO -5.0] OR esa_url_rep_score:/-[5-9]\\..*/ OR esa_url_rep_score:"-10.0"' }
    ];

    let totalHits = 0;

    for (const q of dualQueries) {
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
            console.log(`[${q.name}] -> Hits: ${count.toLocaleString()} (${duration}ms)`);
            totalHits += count;
        } catch (e: any) {
            console.error(`[${q.name}] -> Error:`, e.message);
        }
    }

    console.log(`\nTotal Dual-Compatible Hits: ${totalHits.toLocaleString()}`);
}

testDualFloatString();
