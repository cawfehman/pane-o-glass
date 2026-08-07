import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectDelaySources() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const params = new URLSearchParams({
        query: 'message:"Info: Delayed:"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "100"
    });

    const url = `${baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;

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

        const messages = res.data.messages || [];
        const sourceMap: Record<string, number> = {};

        messages.forEach((m: any) => {
            const src = m.message.source || "unknown";
            sourceMap[src] = (sourceMap[src] || 0) + 1;
        });

        console.log("=== Sources in Delayed Messages ===");
        console.dir(sourceMap);

        if (messages.length > 0) {
            console.log("\nSample Raw Message [0]:", messages[0].message.message);
            console.log("Sample Source [0]:", messages[0].message.source);
            console.log("Sample Fields [0]:", Object.keys(messages[0].message));
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

inspectDelaySources();
