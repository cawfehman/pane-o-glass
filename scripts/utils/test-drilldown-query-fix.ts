import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testDrilldownQueryFix() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING CLEAN DRILL-DOWN QUERIES ===");

    // Test 1: Pure Extractor Field Numeric Query
    const pureFieldQuery = "esa_url_rep_score:[-10.0 TO -5.0]";
    // Test 2: Dual Compatibility Query with clean text matching
    const dualQuery = 'esa_url_rep_score:[-10.0 TO -5.0] OR (NOT _exists_:esa_url_rep_score AND (message:"reputation -5." OR message:"reputation -6." OR message:"reputation -7." OR message:"reputation -8." OR message:"reputation -9." OR message:"reputation -10."))';

    const queries = [
        { name: "Pure Extractor Field Query", query: pureFieldQuery },
        { name: "Clean Dual Compatibility Query", query: dualQuery }
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
            const count = res.data.total_results || 0;
            console.log(`\n[${q.name}] -> Total Hits: ${count.toLocaleString()}`);
            const msgs = res.data.messages || [];
            msgs.forEach((m: any, idx: number) => {
                const score = m.message.esa_url_rep_score !== undefined ? m.message.esa_url_rep_score : m.message.message;
                console.log(`  Sample ${idx + 1}: Score = ${score}`);
            });
        } catch (e: any) {
            console.error(`[${q.name}] -> Error:`, e.message);
        }
    }
}

testDrilldownQueryFix();
