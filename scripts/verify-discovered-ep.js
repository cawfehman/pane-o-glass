const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function verifyData() {
    // ALLOW OVERRIDING URL AND TIME WINDOW FROM COMMAND LINE
    const url = process.argv[2] || process.env.ISE_PAN_URL;
    const window = process.argv[3] || "3600";
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // The path that returned 200 OK
    const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/All/${window}/10/All`;

    console.log(`Verifying data content from: ${endpoint}`);

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
        
        console.log("SUCCESS! Raw Data Preview:");
        console.log("-----------------------------------");
        console.log(response.data.substring(0, 2000)); // Show enough to see the structure
        console.log("-----------------------------------");
        
    } catch (e) {
        console.log(`Failed to verify: ${e.response?.status || e.message}`);
    }
}

verifyData();
