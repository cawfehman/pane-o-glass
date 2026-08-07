import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectSample() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";

    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const params = new URLSearchParams({
        query: 'message:"inbound table"',
        range: "86400",
        filter: `streams:${streamId}`,
        limit: "10"
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
            timeout: 8000
        });

        const messages = res.data.messages || [];
        console.log(`--- Sample Inbound Messages (${messages.length}) ---`);
        messages.forEach((m: any, i: number) => {
            console.log(`[${i+1}] ${m.message.message}`);
        });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}

inspectSample();
