const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchFailures(mac) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching Failure logs for MAC: ${mac}...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Failure/All`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 30000
        });
        
        console.log(`Success! Status: ${res.status}`);
        const xml = res.data;
        
        // Use regex to find failures for this MAC (Standardize format to dashes or colons)
        const macDash = mac.replace(/:/g, '-').toUpperCase();
        const macColon = mac.replace(/-/g, ':').toUpperCase();
        
        if (xml.includes(macDash) || xml.includes(macColon)) {
            console.log(`FOUND MAC ${mac} in Failure logs!`);
            // Extract the matching failure record
            const regex = new RegExp(`<failureRecord>[\\s\\S]*?(${macDash}|${macColon})[\\s\\S]*?</failureRecord>`, 'g');
            const matches = xml.match(regex);
            if (matches) {
                console.log(`Found ${matches.length} failure records.`);
                console.log(`Last one: ${matches[matches.length - 1]}`);
            }
        } else {
            console.log(`MAC not found in recent failure logs.`);
        }
    } catch (e) {
        console.error(`Failed: ${e.message}`);
    }
}

searchFailures("12:F0:4F:1A:ED:D2");
