const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function getDetails(mac) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Fetching surgical details for MAC: ${mac}...`);
    try {
        const ep = `/admin/API/mnt/Session/MACAddress/${mac}`;
        const res = await axios.get(`${url}${ep}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });
        console.log(`Success! Status: ${res.status}`);
        console.log(res.data);
    } catch (e) {
        console.log(`Failed: ${e.message}`);
    }
}

getDetails("76:AB:0A:71:DD:0A");
