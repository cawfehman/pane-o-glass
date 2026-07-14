const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function discovery() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log("ISE 3.3 MnT 'Last Record' Brute-Force...");

    const eps = [
        "/admin/API/mnt/AuthStatus/LastNRecords/10",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10",
        "/admin/API/mnt/AuthStatus/LastNRecords/10/All",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/Session/AuthStatus/LastN/10",
        "/admin/API/mnt/AuthStatus/Failure/LastN/10"
    ];

    for (const ep of eps) {
        try {
            console.log(`Testing ${ep}...`);
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 10000
            });
            console.log(`  [SUCCESS] ${res.status} - Data length: ${res.data.length}`);
        } catch (e) {
            console.log(`  [FAILED ${e.response?.status || "ERR"}] ${ep}`);
        }
    }
}
discovery();
