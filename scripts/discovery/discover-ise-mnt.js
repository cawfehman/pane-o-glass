const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function discoverMnt() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        console.error("ISE Credentials not configured");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Endpoints to test
    const endpoints = [
        "/admin/API/mnt/Session/ActiveList",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/Version"
    ];

    for (const ep of endpoints) {
        const fullUrl = `${url}${ep}`;
        console.log(`Testing: ${fullUrl}`);
        try {
            const response = await axios.get(fullUrl, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 10000
            });
            console.log(`  [SUCCESS] Status: ${response.status}`);
            console.log(`  Preview: ${response.data.substring(0, 500)}...`);
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || "ERROR"} - ${e.message}`);
        }
    }
}

discoverMnt();
