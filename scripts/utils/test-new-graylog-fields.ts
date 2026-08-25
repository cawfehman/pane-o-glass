import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testNewGraylogFields() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING NEWLY CREATED GRAYLOG EXTRACTED FIELDS ===");

    const fields = [
        { name: "esa_url_rep_score", query: "_exists_:esa_url_rep_score" },
        { name: "esa_mid", query: "_exists_:esa_mid" },
        { name: "esa_rfc_message_id", query: "_exists_:esa_rfc_message_id" },
        { name: "esa_amp_file_verdict", query: "_exists_:esa_amp_file_verdict" },
        { name: "esa_cisco_action", query: "_exists_:esa_cisco_action" }
    ];

    for (const f of fields) {
        const params = new URLSearchParams({
            query: f.query,
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
            console.log(`[Field: ${f.name}] -> Live Ingested Hits: ${count.toLocaleString()}`);
            const msgs = res.data.messages || [];
            if (msgs.length > 0) {
                const sampleMsg = msgs[0].message;
                console.log(`  Sample parsed value for ${f.name}:`, sampleMsg[f.name] !== undefined ? sampleMsg[f.name] : sampleMsg.message);
            }
        } catch (e: any) {
            console.error(`[Field: ${f.name}] -> Error: ${e.message}`);
        }
    }
}

testNewGraylogFields();
