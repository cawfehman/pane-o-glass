import axios from "axios";
import * as https from "https";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    console.log("Checking Graylog Disk Journal API...");
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;

    if (!rawUrl || !rawToken) {
        console.error("Missing credentials.");
        return;
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');

    const searchUrl = `${url}/api/system/journal`;
    const authHeader = token.includes(":") 
        ? `Basic ${Buffer.from(token).toString("base64")}`
        : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
    
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
        const response = await axios.get(searchUrl, {
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            httpsAgent: agent,
            timeout: 10000
        });
        console.log("Journal API Status:", response.status);
        console.log("Journal API Data:", JSON.stringify(response.data, null, 2));
    } catch (e: any) {
        console.error(`Error querying journal:`, e.message);
        if (e.response) {
            console.error("Response data:", e.response.data);
        }
    }
}

main().catch(console.error);
