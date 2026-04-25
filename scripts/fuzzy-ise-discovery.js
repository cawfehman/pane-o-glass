const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function fuzzyDiscover() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Test both the working path with a HUGE window, and other variations
    const endpoints = [
        "/admin/API/mnt/AuthenticationStatus/MACAddress/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/MACAddress/All/0/100/All", 
        "/admin/API/mnt/Session/AuthStatus/All/3600/10/All"
    ];

    console.log("Starting Deep Data Discovery...");

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
            
            const dataLen = response.data.length;
            const hasData = response.data.includes("<authStatus") || response.data.includes("<activeSession");
            console.log(`  [SUCCESS] Status: ${response.status} | Data Length: ${dataLen} | Has Records: ${hasData}`);
            if (hasData && !ep.includes('ActiveList')) {
                console.log("FOUND DATA! Sample:");
                console.log(response.data.substring(0, 500));
            }
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || "ERROR"}`);
        }
    }
}

fuzzyDiscover();
