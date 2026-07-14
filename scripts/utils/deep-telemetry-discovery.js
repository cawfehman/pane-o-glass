const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function deepDiscover() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        console.error("ISE Credentials not configured");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Every possible variation of the AuthStatus endpoint for ISE 3.3
    const endpoints = [
        "/admin/API/mnt/AuthenticationStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/Log/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/Session/ActiveList" // Known working baseline
    ];

    console.log("Starting Deep Telemetry Discovery...");

    for (const ep of endpoints) {
        const fullUrl = `${url}${ep}`;
        console.log(`Testing: ${ep}`);
        try {
            const response = await axios.get(fullUrl, {
                headers: { 
                    "Authorization": `Basic ${basicAuth}`, 
                    "Accept": "application/xml",
                    "X-ERS-Internal-User": "true"
                },
                httpsAgent: agent,
                timeout: 10000
            });
            console.log(`  [SUCCESS] Status: ${response.status}`);
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || "ERROR"}`);
        }
    }
}

deepDiscover();
