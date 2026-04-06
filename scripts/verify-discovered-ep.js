const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function verify() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // The discovered working endpoint
    const ep = "/admin/API/mnt/AuthStatus/MACAddress/All/3600/10/All";
    console.log(`Verifying content of ${ep}...`);

    try {
        const res = await axios.get(`${url}${ep}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });
        console.log(`  [SUCCESS] Status: ${res.status}`);
        console.log(`  XML Response: ${res.data.substring(0, 1000)}`);
    } catch (e) {
        console.log(`  [FAILED] ${e.message}`);
    }
}
verify();
