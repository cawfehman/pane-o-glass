const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function checkFailures() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Fetching latest failure logs...`);
    // Try multiple possible failure endpoints
    const endpoints = [
        '/admin/API/mnt/Failure/All',
        '/admin/API/mnt/Failure/Last/100',
        '/admin/API/mnt/AuthStatus/Failure/All',
        '/admin/API/mnt/Session/Failure/All'
    ];

    for (const ep of endpoints) {
        console.log(`Testing: ${ep}...`);
        try {
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 20000
            });
            console.log(`  Success! Status: ${res.status}`);
            const macs = res.data.match(/[0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}[:.-][0-9A-Fa-f]{2}/g) || [];
            console.log(`  Found ${macs.length} MAC addresses in this list.`);
            const target = "12:F0:4F:1A:ED:D2".toUpperCase();
            const similar = macs.filter(m => m.toUpperCase().startsWith(target.substring(0, 8)));
            if (similar.length > 0) {
                console.log(`  [MATCH] Found similar MACs: ${similar.join(', ')}`);
            }
        } catch (e) {
            console.log(`  Failed: ${e.message}`);
        }
    }
}

checkFailures();
