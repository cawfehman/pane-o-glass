import axios from "axios";
import * as https from "https";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    console.log("Checking total messages in streams over last 24 hours...");
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (!rawUrl || !rawToken) {
        console.error("Missing credentials.");
        return;
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    const streamIds = rawStreams 
        ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
        : [];

    const searchUrl = `${url}/api/search/universal/relative`;
    const authHeader = token.includes(":") 
        ? `Basic ${Buffer.from(token).toString("base64")}`
        : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
    
    const agent = new https.Agent({ rejectUnauthorized: false });
    const streamsToQuery = streamIds.length > 0 ? streamIds : [null];

    for (const streamId of streamsToQuery) {
        console.log(`Querying stream ID: ${streamId} for last 24 hours...`);
        const params = new URLSearchParams();
        params.append("query", "*");
        params.append("range", "86400"); // 24 hours
        params.append("limit", "1000");
        params.append("decorate", "false");
        if (streamId) {
            params.append("filter", `streams:${streamId}`);
        }

        try {
            const response = await axios.get(searchUrl, {
                params,
                headers: {
                    "Authorization": authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                httpsAgent: agent,
                timeout: 30000
            });
            console.log(`Stream ${streamId} Messages Count:`, response.data?.messages?.length);
            if (response.data?.messages?.length > 0) {
                // print the timestamps of the newest and oldest messages
                const newest = response.data.messages[0].message.timestamp;
                const oldest = response.data.messages[response.data.messages.length - 1].message.timestamp;
                console.log(`Newest timestamp: ${newest}`);
                console.log(`Oldest timestamp: ${oldest}`);
            }
        } catch (e: any) {
            console.error(`Error:`, e.message);
        }
    }
}

main().catch(console.error);
