const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchUserFailures(userQuery) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching AuthStatus for Username: ${userQuery}...`);
    try {
        const shortUser = userQuery.split('@')[0];
        const endpoints = [
            `/admin/API/mnt/AuthStatus/UserName/${encodeURIComponent(shortUser)}/86400/50/All`,
            `/admin/API/mnt/AuthStatus/UserName/${encodeURIComponent(userQuery)}/86400/50/All`
        ];

        for (const ep of endpoints) {
            console.log(`  Testing: ${ep}...`);
            try {
                const res = await axios.get(`${url}${ep}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 20000
                });
                console.log(`  Success! Status: ${res.status}`);
                if (res.data.includes('authStatusElements')) {
                    console.log(`  FOUND results for ${userQuery} in ${ep}!`);
                    // Extract failure records
                    const regex = /<authStatusElements>([\s\S]*?)<\/authStatusElements>/g;
                    const matches = res.data.match(regex);
                    if (matches) {
                        console.log(`  Found ${matches.length} authentication events.`);
                        for (const m of matches.slice(-5)) {
                            const passed = m.includes('<passed>true</passed>');
                            const mac = m.match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1];
                            const time = m.match(/<acs_timestamp>(.*?)<\/acs_timestamp>/)?.[1];
                            console.log(`    - [${time}] Passed: ${passed} | MAC: ${mac}`);
                        }
                    }
                }
            } catch (err) {
                console.log(`  Endpoint ${ep} failed: ${err.message}`);
            }
        }
    } catch (e) {
        console.error(e.message);
    }
}

searchUserFailures("jones-chloe@cooperhealth.edu");
