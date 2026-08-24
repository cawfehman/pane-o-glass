import https from "https";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function inspectNewEsaStreams() {
    const baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const streamId = "5d7ff82fb209026ab43e167b";
    const authHeader = "Basic " + Buffer.from(apiToken + ":token").toString("base64");

    const tests = [
        { name: "Message-ID Header Logs", query: 'message:"Message-ID" OR message:"Subject"' },
        { name: "Graymail Logs", query: 'message:"Greymail" OR message:"graymail"' },
        { name: "URL Reputation Logs (url_rep)", query: 'message:"URL" OR message:"url_rep"' },
        { name: "AMP Engine Logs (amp)", query: 'message:"AMP" OR message:"amp"' },
        { name: "Antivirus Logs (antivirus)", query: 'message:"AV" OR message:"antivirus" OR message:"Sophos"' }
    ];

    console.log("=== INSPECTING NEW ESA LOG STREAMS IN GRAYLOG ===");

    for (const t of tests) {
        const params = new URLSearchParams({
            query: t.query,
            range: "86400",
            filter: `streams:${streamId}`,
            limit: "3"
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

            const count = res.data.total_results || 0;
            const messages = res.data.messages || [];

            console.log(`\n--------------------------------------------------`);
            console.log(`[Stream Test] ${t.name} -> Total 24h Hits: ${count.toLocaleString()}`);

            if (messages.length > 0) {
                console.log(`Sample Payload [0]:`, messages[0].message.message || messages[0].message);
            } else {
                console.log(`No payload samples found for query.`);
            }
        } catch (e: any) {
            console.error(`[Stream Test] ${t.name} -> Error: ${e.message}`);
        }
    }
}

inspectNewEsaStreams();
