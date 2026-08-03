require('dotenv').config();
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const VECTRA_CLIENT_ID = process.env.VECTRA_CLIENT_ID || '';
const VECTRA_CLIENT_SECRET = process.env.VECTRA_CLIENT_SECRET || '';
const RAW_URL = (process.env.VECTRA_URL || '').replace(/\/$/, '');
const VECTRA_URL = RAW_URL.replace(/\/api\/v[0-9.]+$/, '');

async function testAuth() {
    try {
        const response = await axios.post(`${VECTRA_URL}/oauth2/token`, 
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'read',
                client_id: VECTRA_CLIENT_ID,
                client_secret: VECTRA_CLIENT_SECRET
            }), 
            {
                httpsAgent,
                auth: { username: VECTRA_CLIENT_ID, password: VECTRA_CLIENT_SECRET },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );
        return response.data.access_token;
    } catch (error) {
        return null;
    }
}

async function testDetections(token) {
    try {
        const response = await axios.get(`${VECTRA_URL}/api/v3.3/detections`, {
            httpsAgent,
            headers: { Authorization: `Bearer ${token}` },
            params: { page_size: 5 }
        });
        const results = response.data.results || [];
        console.log("Fetched", results.length, "detections.");
        if (results.length > 0) {
            console.log("Sample Detection Keys:", Object.keys(results[0]));
            console.log("Sample Detection Data:", JSON.stringify(results[0], null, 2));
        }
    } catch (error) {
        console.log("Error:", error.response ? error.response.status + " " + error.message : error.message);
    }
}

async function run() {
    const token = await testAuth();
    if (!token) return console.log("Auth failed.");
    await testDetections(token);
}

run();
