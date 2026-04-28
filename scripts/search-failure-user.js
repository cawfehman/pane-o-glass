const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchFailureUser(userQuery) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching Failure logs for string: ${userQuery}...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Failure/All`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 30000
        });
        
        console.log(`Success! Status: ${res.status}`);
        const xml = res.data;
        const shortUser = userQuery.split('@')[0];
        
        if (xml.includes(shortUser)) {
            console.log(`FOUND ${shortUser} in Failure logs!`);
            const regex = new RegExp(`<failureRecord>[\\s\\S]*?${shortUser}[\\s\\S]*?</failureRecord>`, 'gi');
            const matches = xml.match(regex);
            if (matches) {
                console.log(`Found ${matches.length} failure records.`);
                console.log(`Last one: ${matches[matches.length - 1]}`);
            }
        } else {
            console.log(`User not found in recent failure logs.`);
        }
    } catch (e) {
        console.error(`Failed: ${e.message}`);
    }
}

searchFailureUser("jones-chloe@cooperhealth.edu");
