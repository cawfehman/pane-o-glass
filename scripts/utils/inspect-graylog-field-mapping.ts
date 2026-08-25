import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectGraylogFieldMapping() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== INSPECTING ELASTICSEARCH FIELD MAPPING FOR esa_url_rep_score ===");

    // Query exact score match: esa_url_rep_score:"-10.0" or esa_url_rep_score:"-5.0"
    const testQueries = [
        { name: "String Range [-10.0 TO -5.0]", query: 'esa_url_rep_score:[-10.0 TO -5.0]' },
        { name: "Exact Match -10.0", query: 'esa_url_rep_score:"-10.0"' },
        { name: "Exact Match -5.0", query: 'esa_url_rep_score:"-5.0"' },
        { name: "Wildcard -5.*", query: 'esa_url_rep_score:-5.*' },
        { name: "Wildcard -6.*", query: 'esa_url_rep_score:-6.*' },
        { name: "Wildcard -7.*", query: 'esa_url_rep_score:-7.*' },
        { name: "Wildcard -8.*", query: 'esa_url_rep_score:-8.*' },
        { name: "Wildcard -9.*", query: 'esa_url_rep_score:-9.*' },
        { name: "Wildcard -10.*", query: 'esa_url_rep_score:-10.*' }
    ];

    for (const q of testQueries) {
        const params = new URLSearchParams({
            query: q.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "3"
        });

        try {
            const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
                httpsAgent,
                headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                timeout: 8000
            });
            const count = res.data.total_results || 0;
            console.log(`\n[${q.name}] -> Hits: ${count.toLocaleString()}`);
            const msgs = res.data.messages || [];
            if (msgs.length > 0) {
                console.log("  Sample 1 value:", msgs[0].message.esa_url_rep_score);
            }
        } catch (e: any) {
            console.error(`[${q.name}] -> Error:`, e.message);
        }
    }
}

inspectGraylogFieldMapping();
