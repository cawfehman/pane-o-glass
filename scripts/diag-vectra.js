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

        // Probe 1: ordering=-last_detection_timestamp
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?ordering=-last_detection_timestamp&state=active`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`PROBE LAST_DETECTION: SUCCESS - Count: ${res.data.count}`);
        } catch (e) {
            console.log(`PROBE LAST_DETECTION FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }

        // Probe 2: ordering=-threat
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?ordering=-threat`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`PROBE THREAT: SUCCESS - Count: ${res.data.count}`);
            if (res.data.results && res.data.results.length > 0) {
                console.log('TOP_THREAT_HOST:', res.data.results[0].name, 'Threat:', res.data.results[0].threat);
            }
        } catch (e) {
            console.log(`PROBE THREAT FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }

        // Probe 3: min_threat (The one we suspect causes 400)
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?min_threat=1`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`PROBE MIN_THREAT: SUCCESS - Count: ${res.data.count}`);
        } catch (e) {
            console.log(`PROBE MIN_THREAT FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
