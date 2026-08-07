import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectEsaBreakdown() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const esaQueries = [
        { name: "ESA01 Inbound Mail", query: 'message:"inbound table" AND (source:esa01* OR message:esa01*)' },
        { name: "ESA02 Inbound Mail", query: 'message:"inbound table" AND (source:esa02* OR message:esa02*)' },
        { name: "ESA01 Delays", query: 'message:"Info: Delayed:" AND (source:esa01* OR message:esa01*)' },
        { name: "ESA02 Delays", query: 'message:"Info: Delayed:" AND (source:esa02* OR message:esa02*)' },
    ];

    console.log("=== 24-HOUR PER-ESA APPLIANCE BREAKDOWN ===");

    for (const item of esaQueries) {
        const params = new URLSearchParams({
            query: item.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "1"
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

            console.log(`[ESA Check] ${item.name} -> Total: ${(res.data.total_results || 0).toLocaleString()}`);
        } catch (e: any) {
            console.error(`[ESA Check] ${item.name} -> Error: ${e.message}`);
        }
    }
}

inspectEsaBreakdown();
