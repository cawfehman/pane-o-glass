const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function test() {
    const url = process.env.ISE_PAN_URL.replace(/"/g, '');
    const user = process.env.ISE_API_USER.replace(/"/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/"/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    
    // Testing the direct Failure endpoint (often bypasses the 'All' wildcard bug)
    const endpoint = `${url}/admin/API/mnt/AuthStatus/Failure/3600/50`;
    console.log(`Testing Failure Endpoint: ${endpoint}`);

    try {
        const res = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml",
                "X-ERS-Internal-User": "true"
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        console.log(`Status: ${res.status}`);
        console.log("Data Length:", res.data.length);
        console.log("Snippet:", res.data.substring(0, 500));
    } catch (e) {
        console.error("Failed:", e.response?.status || e.message);
    }
}

test();
