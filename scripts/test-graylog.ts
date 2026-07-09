import axios from "axios";
import * as https from "https";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    console.log("Checking Graylog for 401002 (Shun) logs...");
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
        console.log(`Querying stream ID: ${streamId} for 401002 (last 7 days)...`);
        const params = new URLSearchParams();
        params.append("query", "401002");
        params.append("range", "604800"); 
        params.append("limit", "10");
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
            console.log(`Stream ${streamId} Results:`, response.data?.messages?.length);
            if (response.data?.messages && response.data.messages.length > 0) {
                response.data.messages.forEach((msg: any, i: number) => {
                    console.log(`[Shun Log ${i}]`);
                    console.log("Message Text:", msg.message.message);
                });
            }
        } catch (e: any) {
            console.error(`Error:`, e.message);
        }
    }
}

main().catch(console.error);
