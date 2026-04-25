const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function surgicalDiscover() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log("Step 1: Extracting a Session ID from Active List...");

    try {
        const activeRes = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 15000
        });

        // Regex to grab the first audit_session_id
        const sessionMatch = activeRes.data.match(/<audit_session_id>(.*?)<\/audit_session_id>/);
        if (!sessionMatch) {
            console.error("Could not find any Session IDs in the Active List.");
            return;
        }

        const sessionId = sessionMatch[1];
        console.log(`Found Session ID: ${sessionId}`);

        console.log("Step 2: Querying detailed AuthStatus (No Session Prefix)...");
        
        // This uses the root AuthStatus path which we know exists
        const detailUrl = `${url}/admin/API/mnt/AuthStatus/audit_session_id/${sessionId}/0`;
        console.log(`Polling: ${detailUrl}`);

        const detailRes = await axios.get(detailUrl, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });

        console.log(`[SUCCESS] Status: ${detailRes.status}`);
        console.log("Data Content:");
        console.log(detailRes.data);

    } catch (e) {
        console.error(`Surgical discovery failed: ${e.response?.status || e.message}`);
        if (e.response?.data) console.log(e.response.data);
    }
}

surgicalDiscover();
