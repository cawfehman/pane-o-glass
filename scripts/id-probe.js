const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function probeId() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const sessionId = "63a312ac0064908e2144eb69";

    const paths = [
        `/admin/API/mnt/AuthStatus/audit_session_id/${sessionId}/0`,
        `/admin/API/mnt/Session/AuthStatus/audit_session_id/${sessionId}/0`,
        `/admin/API/mnt/AuthStatus/SessionID/${sessionId}/0`,
        `/admin/API/mnt/Session/AuthStatus/SessionID/${sessionId}/0`,
        `/admin/API/mnt/AuthStatus/MACAddress/All/86400/100/All`, // Retry All with the ID context
    ];

    console.log(`Probing for Session ID: ${sessionId} on ${url}`);

    for (const path of paths) {
        const fullUrl = `${url}${path}`;
        console.log(`Testing: ${path}`);
        try {
            const response = await axios.get(fullUrl, {
                headers: { 
                    "Authorization": `Basic ${basicAuth}`, 
                    "Accept": "application/xml",
                    "X-ERS-Internal-User": "true"
                },
                httpsAgent: agent,
                timeout: 5000
            });
            console.log(`  [SUCCESS!!] Status: ${response.status}`);
            console.log("Data Snippet:");
            console.log(response.data.substring(0, 500));
            return; // STOP! We found the secret path!
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || e.message}`);
        }
    }
}

probeId();
