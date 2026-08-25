import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testExactStringScores() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== TESTING EXACT NEGATIVE SCORE MATCHES ===");

    // Fetch 100 raw messages containing _exists_:esa_url_rep_score
    const params = new URLSearchParams({
        query: '_exists_:esa_url_rep_score',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "100"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        console.log(`Fetched ${messages.length} raw parsed score lines.\n`);

        const scoresFound: Record<string, number> = {};

        messages.forEach((m: any) => {
            const val = m.message.esa_url_rep_score;
            if (val !== undefined) {
                const strVal = val.toString();
                scoresFound[strVal] = (scoresFound[strVal] || 0) + 1;
            }
        });

        console.log("Extracted Parsed Score Values in Graylog:");
        Object.entries(scoresFound).forEach(([s, count]) => {
            console.log(`  Value: "${s}" -> Count: ${count}`);
        });

    } catch (e: any) {
        console.error("Error inspecting exact string scores:", e.message);
    }
}

testExactStringScores();
