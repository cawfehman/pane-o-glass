const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function fuzzyDiscover() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Fuzzy variations for ISE 3.3
    const endpoints = [
        "/admin/API/mnt/Session/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/Session/AuthenticationStatus/All/3600/10/All",
        "/admin/API/mnt/Session/FailureReasons",
        "/admin/API/mnt/Log/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/AuthenticationStatus/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/MACAddress/All/3600/10/All",
        "/admin/API/mnt/Log/Authentication/All/3600/10/All"
    ];

    console.log("Starting Fuzzy Telemetry Discovery...");

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
                timeout: 5000
            });
            console.log(`  [SUCCESS!!] Status: ${response.status}`);
            process.exit(0); // Stop once we find the winner
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || "ERROR"}`);
        }
    }
}

fuzzyDiscover();
