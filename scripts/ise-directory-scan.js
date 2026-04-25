const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function scanDirs() {
    const url = process.argv[2] || process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Every possible root-level MnT folder in ISE 3.3
    const dirs = [
        "/admin/API/mnt/Log",
        "/admin/API/mnt/History",
        "/admin/API/mnt/RADIUS",
        "/admin/API/mnt/Authentication",
        "/admin/API/mnt/AuthStatus",
        "/admin/API/mnt/Session",
        "/admin/API/mnt/FailureReasons",
        "/admin/API/mnt/AccountStatus"
    ];

    console.log(`Scanning MnT Root on ${url}...`);

    for (const dir of dirs) {
        const fullUrl = `${url}${dir}`;
        console.log(`Checking: ${dir}`);
        try {
            const response = await axios.get(fullUrl, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 5000
            });
            console.log(`  [FOUND] Status: ${response.status}`);
        } catch (e) {
            console.log(`  [MISSING] Status: ${e.response?.status || e.message}`);
        }
    }
}

scanDirs();
