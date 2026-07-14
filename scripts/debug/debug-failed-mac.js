const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function debugMac(mac) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const macDash = mac.replace(/:/g, "-");
    const macRaw = mac.replace(/:/g, "");
    const endpoints = [
        `/admin/API/mnt/Session/MACAddress/${mac}`,
        `/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/50/All`,
        `/admin/API/mnt/AuthStatus/MACAddress/${macDash}/86400/50/All`,
        `/admin/API/mnt/AuthStatus/MACAddress/${macRaw}/86400/50/All`,
        `/admin/API/mnt/Session/ActiveList`
    ];

    for (const ep of endpoints) {
        console.log(`Testing: ${ep}...`);
        try {
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 10000
            });
            console.log(`Success! Status: ${res.status}`);
            console.log(`Data (first 500 chars): ${res.data.substring(0, 500)}`);
            if (ep.includes('ActiveList') && res.data.includes(mac)) {
                console.log(`FOUND in ActiveList XML!`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
}

debugMac("12:F0:4F:1A:ED:D2");
