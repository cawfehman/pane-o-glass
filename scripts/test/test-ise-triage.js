const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function testTriage() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        console.error("ISE Credentials not configured");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const endpoint = `${url}/admin/API/mnt/AuthStatus/LastNRecords/All/50/All`;

    console.log(`Checking URL: ${url}`);
    console.log(`Checking full endpoint: ${endpoint}`);

    try {
        const response = await axios.get(endpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });

        console.log("Response Status:", response.status);
        console.log("Raw XML:", response.data);
    } catch (e) {
        console.error("Error:", e.response?.data || e.message);
    }
}

testTriage();
