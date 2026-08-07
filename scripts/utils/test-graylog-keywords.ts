import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testKeywords() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";

    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const queries = [
        'message:"inbound table"',
        'message:"inbound table" AND message:"Marketing"',
        'message:"inbound table" AND message:"Bulk"',
        'message:"inbound table" AND message:"Greymail"',
        'message:"Action: URL redirected to Cisco Security proxy"',
        'message:"Info: Delayed:"',
        'message:"interim AV verdict using"'
    ];

    console.log("Testing Graylog Lucene Queries against Stream", streamId);

    for (const q of queries) {
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

testKeywords();
