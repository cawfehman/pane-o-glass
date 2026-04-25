const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function discoverNodes() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // This endpoint lists all nodes in the deployment and their roles
    const endpoints = [
        "/admin/API/mnt/Deployment/Nodes",
        "/admin/API/mnt/MntNodes"
    ];

    console.log("Discovering ISE Deployment Roles...");

    for (const ep of endpoints) {
        const fullUrl = `${url}${ep}`;
        console.log(`Testing: ${ep}`);
        try {
            const response = await axios.get(fullUrl, {
                headers: { 
                    "Authorization": `Basic ${basicAuth}`, 
                    "Accept": "application/xml",
                    "X-ERS-Internal-User": "true"
                },
                httpsAgent: agent,
                timeout: 10000
            });
            
            console.log(`[SUCCESS] Status: ${response.status}`);
            console.log("Response Data:");
            console.log(response.data);
            console.log("-----------------------------------");
        } catch (e) {
            console.log(`[FAILED] Status: ${e.response?.status || e.message}`);
        }
    }
}

discoverNodes();
