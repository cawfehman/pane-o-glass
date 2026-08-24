import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectUrlAmpWidgets() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    console.log("=== INSPECTING GRAYLOG LOGS FOR DASHBOARD WIDGETS ===");

    // 1. Fetch sample URL Reputation logs
    const urlParams = new URLSearchParams({
        query: 'message:"URL" AND message:"reputation"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "5"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${urlParams.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 8000
        });

        console.log("\n--- Top URL Reputation Payloads ---");
        (res.data.messages || []).forEach((m: any, i: number) => {
            console.log(`[URL ${i+1}] ${m.message.message}`);
        });
    } catch (e: any) {
        console.error("URL Fetch Error:", e.message);
    }

    // 2. Fetch sample AMP logs
    const ampParams = new URLSearchParams({
        query: 'message:"AMP file reputation verdict"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "5"
    });

    try {
        const res = await axios.get(`${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${ampParams.toString()}`, {
            httpsAgent,
            headers: { "Authorization": authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
            timeout: 8000
        });

        console.log("\n--- Top AMP File Verdict Payloads ---");
        (res.data.messages || []).forEach((m: any, i: number) => {
            console.log(`[AMP ${i+1}] ${m.message.message}`);
        });
    } catch (e: any) {
        console.error("AMP Fetch Error:", e.message);
    }
}

inspectUrlAmpWidgets();
