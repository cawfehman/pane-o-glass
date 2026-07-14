const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function testPsn() {
    const url = "https://ise-adm02.chsmail.root.cooperhealth.edu";
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Test querying logs for a SPECIFIC PSN instead of "All"
    // IP 172.18.163.99 is your busiest PSN
    const psnIp = "172.18.163.99";
    const endpoint = `${url}/admin/API/mnt/AuthStatus/NASIPAddress/${psnIp}/3600/50/All`;

    console.log(`Testing query by PSN IP: ${psnIp}`);
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
        const hasRecords = response.data.includes('<authStatusElements>');
        console.log(`Has Records: ${hasRecords}`);
        if (hasRecords) {
            console.log("Data Snippet:");
            console.log(response.data.substring(0, 1000));
        }
    } catch (e) {
        console.log(`Failed: ${e.response?.status || e.message}`);
    }
}

testPsn();
