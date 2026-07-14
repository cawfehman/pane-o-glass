const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function testMac() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Use a MAC address we KNOW is active from your Live Logs
    const targetMac = "F6:2C:31:2A:E8:D3";
    const endpoint = `https://ise-adm02.chsmail.root.cooperhealth.edu/admin/API/mnt/AuthStatus/MACAddress/${targetMac}/86400/1/All`;

    console.log(`Testing specific MAC: ${targetMac}`);
    console.log(`Endpoint: ${endpoint}`);

    try {
        const response = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml",
                "X-ERS-Internal-User": "true"
            },
            httpsAgent: agent,
            timeout: 10000
        });
        
        console.log(`[SUCCESS] Status: ${response.status}`);
        console.log("Data Content:");
        console.log(response.data);
    } catch (e) {
        console.log(`Failed: ${e.response?.status || e.message}`);
    }
}

testMac();
