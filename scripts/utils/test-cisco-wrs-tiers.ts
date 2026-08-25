import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testCiscoWrsTiers() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING 5 CISCO OFFICIAL WRS TIERS ===");

    const scoreQueries = [
        { name: "Clean / Established (+3.0 to +10.0)", query: 'esa_url_rep_score:[3.0 TO 10.0] OR esa_url_rep_score:/[3-9]\\..*/ OR esa_url_rep_score:"10.0"' },
        { name: "Neutral / Uncategorized (0.0 to +2.9)", query: 'esa_url_rep_score:[0.0 TO 2.9] OR esa_url_rep_score:/[0-2]\\..*/' },
        { name: "Low Suspect (-0.1 to -2.9)", query: 'esa_url_rep_score:[-2.9 TO -0.1] OR esa_url_rep_score:/-[0-2]\\..*/' },
        { name: "Risky / Threat (-3.0 to -5.9)", query: 'esa_url_rep_score:[-5.9 TO -3.0] OR esa_url_rep_score:/-[3-5]\\..*/' },
        { name: "Malicious / Critical Block (-6.0 to -10.0)", query: 'esa_url_rep_score:[-10.0 TO -6.0] OR esa_url_rep_score:/-[6-9]\\..*/ OR esa_url_rep_score:"-10.0"' }
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

    console.log(`\n--- OFFICIAL CISCO WRS TIER BREAKDOWN (24h Total Evaluated: ${totalHits.toLocaleString()}) ---`);
    results.forEach(r => {
        const pct = totalHits > 0 ? ((r.count / totalHits) * 100).toFixed(1) : "0.0";
        console.log(`[${r.name}] -> ${r.count.toLocaleString()} hits (${pct}%) - Query took ${r.duration}ms`);
    });
}

testCiscoWrsTiers();
