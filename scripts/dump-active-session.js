const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function dump() {
    const url = process.env.ISE_PAN_URL.replace(/"/g, '');
    const user = process.env.ISE_API_USER.replace(/"/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/"/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    
    const endpoint = `${url}/admin/API/mnt/Session/Active/All`;
    console.log(`Fetching from: ${endpoint}`);

    try {
        const res = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml",
                "X-ERS-Internal-User": "true"
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        const xml = res.data;
        const firstSession = xml.match(/<activeSession>([\s\S]*?)<\/activeSession>/);
        
        if (firstSession) {
            console.log("--- RAW SESSION XML ---");
            console.log(firstSession[0]);
            console.log("-----------------------");
        } else {
            console.log("No sessions found in XML.");
        }
    } catch (e) {
        console.error("Failed:", e.message);
    }
}

dump();
