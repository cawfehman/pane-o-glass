const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function discovery() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Wide net for ISE 3.3 404 mystery
    const eps = [
        "/admin/API/mnt/Session/ActiveList",
        "/admin/API/mnt/Session/MACAddress/00:00:00:00:00:00",
        "/admin/API/mnt/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/authStatus/All/3600/10/All",
        "/admin/API/mnt/FailureStatus/All/3600/10/All",
        "/admin/API/mnt/Session/FailureList",
        "/admin/API/mnt/FailureRecovery/All/3600/10/All",
        "/admin/API/mnt/Log/Failure/3600/10",
        "/ise/mnt/api/AuthStatus/All/3600/10/All"
    ];

    for (const ep of eps) {
        try {
            console.log(`Testing ${ep}...`);
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 5000
            });
            console.log(`  [SUCCESS] ${res.status}`);
        } catch (e) {
            console.log(`  [FAILED] ${e.response?.status || e.message}`);
        }
    }
}
discovery();
