import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectExactWrsScores() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== EMPIRICAL DISCOVERY: REAL CISCO WRS SCORE DISTRIBUTION ===");

    // Fetch 100 raw messages containing "has reputation"
    const params = new URLSearchParams({
        query: 'message:"has reputation"',
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
        console.log(`Fetched ${messages.length} raw URL reputation lines.\n`);

        const scoreCounts: Record<string, number> = {};
        let totalParsed = 0;

        messages.forEach((m: any) => {
            const raw = m.message.message || "";
            const match = raw.match(/has reputation ([\-\d\.]+)/i);
            if (match) {
                const score = match[1];
                scoreCounts[score] = (scoreCounts[score] || 0) + 1;
                totalParsed++;
            }
        });

        console.log("Captured WRS Score Frequency Distribution (from 100 sample messages):");
        Object.entries(scoreCounts)
            .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
            .forEach(([score, count]) => {
                const pct = ((count / totalParsed) * 100).toFixed(1);
                console.log(`Score [${score}]: ${count} hits (${pct}%)`);
            });

    } catch (e: any) {
        console.error("Error inspecting exact scores:", e.message);
    }
}

inspectExactWrsScores();
