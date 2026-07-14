const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchIdentity(userQuery, macQuery) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // 1. Search for Username
    console.log(`Searching for Username: ${userQuery}...`);
    try {
        // Since surgical UserName lookup often fails in 3.3 for certain formats, 
        // we'll check ActiveList and manual AuthStatus
        const shortUser = userQuery.split('@')[0];
        const endpoints = [
            `/admin/API/mnt/Session/UserName/${encodeURIComponent(userQuery)}`,
            `/admin/API/mnt/Session/UserName/${encodeURIComponent(shortUser)}`,
            `/admin/API/mnt/Session/ActiveList`
        ];

        for (const ep of endpoints) {
            try {
                console.log(`  Testing: ${ep}...`);
                const res = await axios.get(`${url}${ep}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 30000
                });
                if (res.data.includes(shortUser) || res.data.includes(userQuery)) {
                    console.log(`  FOUND match in ${ep}!`);
                    const macMatch = res.data.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
                    if (macMatch) console.log(`  Associated MAC: ${macMatch[1]}`);
                    if (ep.includes('ActiveList')) {
                        // Extract specific session for the user
                        const regex = new RegExp(`<activeSession>[\\s\\S]*?${shortUser}[\\s\\S]*?</activeSession>`, 'i');
                        const match = res.data.match(regex);
                        if (match) console.log(`  Session Data: ${match[0].substring(0, 500)}`);
                    }
                }
            } catch (e) {
                console.log(`  Endpoint ${ep} failed: ${e.message}`);
            }
        }
    } catch (e) {
        console.log(`  User search failed: ${e.message}`);
    }

    // 2. Search for Second MAC
    console.log(`Searching for MAC: ${macQuery}...`);
    try {
        const ep = `/admin/API/mnt/AuthStatus/MACAddress/${macQuery}/86400/10/All`;
        const res = await axios.get(`${url}${ep}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });
        console.log(`  AuthStatus Success! Status: ${res.status}`);
        if (res.data.includes('authStatusElements')) {
            console.log(`  FOUND results for ${macQuery}!`);
            console.log(res.data.substring(0, 1000));
        } else {
            console.log(`  No logs found for ${macQuery}.`);
        }
    } catch (e) {
        console.log(`  MAC search failed: ${e.message}`);
    }
}

searchIdentity("jones-chloe@cooperhealth.edu", "16:7D:50:C8:81:BA");
