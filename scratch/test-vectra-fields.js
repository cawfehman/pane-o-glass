const axios = require('axios');
const https = require('https');
require('dotenv').config({ path: '.env' });

const VECTRA_CLIENT_ID = process.env.VECTRA_CLIENT_ID;
const VECTRA_CLIENT_SECRET = process.env.VECTRA_CLIENT_SECRET;
const VECTRA_URL = (process.env.VECTRA_URL || '').replace(/\/api\/v[0-9.]+$/, '').replace(/\/$/, '');

async function test() {
    console.log("Connecting to:", VECTRA_URL);
    
    // Get Token
    const tokenRes = await axios.post(`${VECTRA_URL}/oauth2/token`, 
        new URLSearchParams({
            grant_type: 'client_credentials',
            scope: 'read',
            client_id: VECTRA_CLIENT_ID,
            client_secret: VECTRA_CLIENT_SECRET
        }), 
        {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            auth: { username: VECTRA_CLIENT_ID, password: VECTRA_CLIENT_SECRET }
        }
    );
    const token = tokenRes.data.access_token;
    console.log("Token Acquired.");

    // Fetch High Risk Hosts
    const hostsRes = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?ordering=-t_score&page_size=1`, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: { Authorization: `Bearer ${token}` }
    });

    const host = hostsRes.data.results[0];
    if (!host) {
        console.log("No hosts found.");
        return;
    }

    console.log("Sample Host Metadata Keys:", Object.keys(host));
    console.log("Sample Host JSON:", JSON.stringify(host, null, 2));

    // Fetch Details for this host
    const detailRes = await axios.get(`${VECTRA_URL}/api/v3.4/hosts/${host.id}`, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        headers: { Authorization: `Bearer ${token}` }
    });
    console.log("Full Host Detail JSON:", JSON.stringify(detailRes.data, null, 2));
}

test().catch(console.error);
