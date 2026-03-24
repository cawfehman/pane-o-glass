require('dotenv').config();
const axios = require('axios');
const https = require('https');

const agent = new https.Agent({ rejectUnauthorized: false });

const VECTRA_CLIENT_ID = process.env.VECTRA_CLIENT_ID;
const VECTRA_CLIENT_SECRET = process.env.VECTRA_CLIENT_SECRET;
const VECTRA_URL = (process.env.VECTRA_URL || '').replace(/\/$/, '');

async function test() {
    console.log('--- Vectra Diagnostic Start ---');
    console.log('Env Keys:', Object.keys(process.env).filter(k => k.startsWith('VECTRA')));
    console.log('URL:', VECTRA_URL);
    
    // Safety delay
    await new Promise(r => setTimeout(r, 2000));

    try {
        const auth = await axios.post(`${VECTRA_URL}/oauth2/token`, 
            'grant_type=client_credentials&scope=read', 
            { 
                httpsAgent: agent, 
                auth: { username: VECTRA_CLIENT_ID, password: VECTRA_CLIENT_SECRET } 
            }
        );
        const token = auth.data.access_token;
        console.log('Auth: SUCCESS');

        // Target: EFT01 (Hostname)
        try {
            console.log('Targeting Hostname: EFT01');
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/detections?name=EFT01&limit=5`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log('--- Detection Pivot via Name ---');
            console.log(`DETECTIONS: SUCCESS - Count: ${res.data.count}`);
            if (res.data.results && res.data.results.length > 0) {
                const d = res.data.results[0];
                console.log('DETECTION_SAMPLE:', {
                    id: d.id,
                    type: d.detection_type,
                    host: d.host,
                    account: d.account,
                    account_id: d.account_id
                });
            }
        } catch (e) {
            console.log(`DETECTION NAME PROBE FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
