// Since I can't easily import from the Next.js app in a standalone script without setup,
// I'll mimic the logic using the .env variables.

const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function searchVectra(mac) {
    const VECTRA_CLIENT_ID = process.env.VECTRA_CLIENT_ID || '';
    const VECTRA_CLIENT_SECRET = process.env.VECTRA_CLIENT_SECRET || '';
    const VECTRA_URL = (process.env.VECTRA_URL || '').replace(/\/$/, '');

    console.log(`Searching Vectra for MAC: ${mac} at ${VECTRA_URL}...`);
    
    try {
        // 1. Get Token
        const tokenRes = await axios.post(`${VECTRA_URL}/oauth2/token`, 
            new URLSearchParams({
                grant_type: 'client_credentials',
                scope: 'read',
                client_id: VECTRA_CLIENT_ID,
                client_secret: VECTRA_CLIENT_SECRET
            }), 
            {
                auth: {
                    username: VECTRA_CLIENT_ID,
                    password: VECTRA_CLIENT_SECRET
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        const token = tokenRes.data.access_token;
        console.log("Acquired Token.");

        // 2. Search Hosts
        const res = await axios.get(`${VECTRA_URL}/api/v3.4/hosts`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { name: mac }
        });
        
        console.log(`Host Search: Found ${res.data.results.length} results.`);
        if (res.data.results.length > 0) {
            console.log(JSON.stringify(res.data.results[0], null, 2));
        }

        // 3. Search Detections
        const detRes = await axios.get(`${VECTRA_URL}/api/v3.4/detections`, {
            headers: { Authorization: `Bearer ${token}` },
            params: { name: mac }
        });
        console.log(`Detection Search: Found ${detRes.data.results.length} results.`);

    } catch (e) {
        console.error(`Vectra search failed: ${e.message}`);
        if (e.response) console.error(JSON.stringify(e.response.data, null, 2));
    }
}

searchVectra("12:f0:4f:1a:ed:d2");
