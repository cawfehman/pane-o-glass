import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testFullStreamAggregations() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING 100% FULL-DATASET GRAYLOG AGGREGATIONS ===");

    const urlQueries = [
        { name: "High Score (> 5.0)", query: 'message:"URL" AND (message:"reputation 5." OR message:"reputation 6." OR message:"reputation 7." OR message:"reputation 8." OR message:"reputation 9." OR message:"reputation 10.")' },
        { name: "Moderate Score (3.0 - 5.0)", query: 'message:"URL" AND (message:"reputation 3." OR message:"reputation 4.")' },
        { name: "Low Score (< 3.0)", query: 'message:"URL" AND message:"reputation" AND NOT (message:"reputation 3." OR message:"reputation 4." OR message:"reputation 5." OR message:"reputation 6." OR message:"reputation 7." OR message:"reputation 8." OR message:"reputation 9." OR message:"reputation 10.")' }
    ];

    let totalUrlHits = 0;
    const urlResults: any[] = [];

    for (const u of urlQueries) {
        const params = new URLSearchParams({
            query: u.query,
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
            const count = res.data.total_results || 0;
            urlResults.push({ name: u.name, count });
            totalUrlHits += count;
        } catch (e: any) {
            console.error("URL Aggregation Error:", e.message);
        }
    }

    console.log(`\n--- 100% FULL-DATASET URL REPUTATION BREAKDOWN (24h Total: ${totalUrlHits.toLocaleString()}) ---`);
    urlResults.forEach(r => {
        const pct = totalUrlHits > 0 ? ((r.count / totalUrlHits) * 100).toFixed(1) : "0";
        console.log(`[${r.name}] ${r.count.toLocaleString()} hits (${pct}%)`);
    });

    const ampQueries = [
        { name: "No Attachment (Skipped)", query: 'message:"AMP file reputation verdict : SKIPPED"' },
        { name: "Clean File Scans", query: 'message:"AMP file reputation verdict : CLEAN"' },
        { name: "Analyzing / Unknown", query: 'message:"AMP file reputation verdict : UNKNOWN" OR message:"FILE UNKNOWN"' },
        { name: "Malicious File Verdicts", query: 'message:"AMP file reputation verdict : MALICIOUS"' }
    ];

    let totalAmpHits = 0;
    const ampResults: any[] = [];

    for (const a of ampQueries) {
        const params = new URLSearchParams({
            query: a.query,
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
            const count = res.data.total_results || 0;
            ampResults.push({ name: a.name, count });
            totalAmpHits += count;
        } catch (e: any) {
            console.error("AMP Aggregation Error:", e.message);
        }
    }

    console.log(`\n--- 100% FULL-DATASET AMP VERDICT BREAKDOWN (24h Total: ${totalAmpHits.toLocaleString()}) ---`);
    ampResults.forEach(r => {
        const pct = totalAmpHits > 0 ? ((r.count / totalAmpHits) * 100).toFixed(1) : "0";
        console.log(`[${r.name}] ${r.count.toLocaleString()} hits (${pct}%)`);
    });
}

testFullStreamAggregations();
