import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectHistogram() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const params = new URLSearchParams({
        query: 'message:"inbound table"',
        range: "21600", // 6 hours
        interval: "minute",
        filter: `streams:${streamId}`
    });

    const url = `${baseUrl.replace(/\/$/, '')}/api/search/universal/relative/histogram?${params.toString()}`;

    try {
        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            timeout: 10000
        });

        console.log("--- Graylog Histogram Results Keys Count ---", Object.keys(res.data.results || {}).length);
        const entries = Object.entries(res.data.results || {}).slice(0, 15);
        entries.forEach(([tsStr, count]) => {
            const date = new Date(parseInt(tsStr, 10) * 1000);
            console.log(`Timestamp: ${tsStr} (${date.toISOString()} -> ${date.toLocaleTimeString()}) = ${count}`);
        });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

inspectHistogram();
