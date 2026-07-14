const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchFailureUserV2(userQuery) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Failure Window: Last 24 hours
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const formatTime = (d) => d.toISOString().replace(/\.\d{3}Z$/, '');
    const timeStart = formatTime(dayAgo);
    const timeEnd = formatTime(now);

    const endpoint = `${url}/admin/API/mnt/Failure/All/${timeStart}/${timeEnd}/All/All/All`;
    console.log(`Searching Failure logs: ${endpoint}...`);
    
    try {
        const res = await axios.get(endpoint, {
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
                for (const m of matches.slice(-5)) {
                    const mac = m.match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1];
                    const time = m.match(/<acs_timestamp>(.*?)<\/acs_timestamp>/)?.[1];
                    const reason = m.match(/<failure_reason>(.*?)<\/failure_reason>/)?.[1];
                    console.log(`  - [${time}] MAC: ${mac} | Reason: ${reason}`);
                }
            }
        } else {
            console.log(`User not found in failure logs for the last 24 hours.`);
        }
    } catch (e) {
        console.error(`Failed: ${e.message}`);
        if (e.response) console.error(e.response.data);
    }
}

searchFailureUserV2("jones-chloe@cooperhealth.edu");
