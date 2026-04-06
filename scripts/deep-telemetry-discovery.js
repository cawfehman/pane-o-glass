const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function discovery() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log("ISE 3.3 MnT Deep Telemetry Discovery...");

    // Testing all common variations of the 'Failure' feed
    const eps = [
        "/admin/API/mnt/AuthStatus/All/86400/10/All",
        "/admin/API/mnt/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/AuthStatus/LastNRecords/10/All",
        "/admin/API/mnt/FailureStatus/All/86400/10/All",
        "/admin/API/mnt/FailureStatus/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/MACAddress/All/86400/10/All",
        "/admin/API/mnt/Session/AuthStatus/All/86400/10/All"
    ];

    for (const ep of eps) {
        try {
            process.stdout.write(`Testing ${ep}... `);
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 30000 // 30s timeout for these heavy ones
            });
            console.log(`[SUCCESS] Result Length: ${res.data.length}`);
            if (res.data.includes("<authStatus>")) {
                console.log("  !!! DATA FOUND !!!");
            } else {
                console.log("  (Empty response)");
            }
        } catch (e) {
            console.log(`[FAILED ${e.response?.status || "ERR"}] - ${e.message}`);
        }
    }
}
discovery();
