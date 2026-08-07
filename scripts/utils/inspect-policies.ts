import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectPolicies() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";

    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const policies = [
        'message:"per-recipient policy DEFAULT"',
        'message:"per-recipient policy Whitelisted Addresses"',
        'message:"per-recipient policy"',
        'message:"interim AV verdict using CLEAN"'
    ];

    for (const q of policies) {
        const params = new URLSearchParams({
            query: q,
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

            console.log(`Query: '${q}' -> Total Hits: ${res.data.total_results || 0}`);
        } catch (e: any) {
            console.error(`Query: '${q}' -> Error: ${e.message}`);
        }
    }
}

inspectPolicies();
