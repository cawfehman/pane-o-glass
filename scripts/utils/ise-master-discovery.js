const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function masterDiscover() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const endpoints = [
        "/admin/API/mnt/AuthStatus/MACAddress/All/3600/10/All",
        "/admin/API/mnt/TACACS/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/FailureReasons",
        "/admin/API/mnt/Session/ActiveList",
        "/admin/API/mnt/Log/AuthStatus/All/3600/10/All",
        "/admin/api/mnt/AuthStatus/MACAddress/All/3600/10/All"
    ];

    console.log("Starting ISE Master Telemetry Discovery...");

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
            
            const hasData = response.data.length > 200; // More than just an empty shell
            console.log(`  [SUCCESS] Status: ${response.status} | Data Size: ${response.data.length} | Has Content: ${hasData}`);
            if (hasData) {
                console.log("SAMPLE DATA FOUND:");
                console.log(response.data.substring(0, 500));
            }
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || "ERROR"}`);
        }
    }
}

masterDiscover();
