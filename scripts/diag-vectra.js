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

        const versions = ['v3.4'];
        for (const v of versions) {
            try {
                // Test 1: Ordering
                const res1 = await axios.get(`${VECTRA_URL}/api/${v}/hosts?ordering=-last_detection_timestamp`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`PROBE ordering: SUCCESS - Count: ${res1.data.count}`);

                // Test 2: min_threat
                const res2 = await axios.get(`${VECTRA_URL}/api/${v}/hosts?min_threat=0`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`PROBE min_threat: SUCCESS - Count: ${res2.data.count}`);

                // Test 3: empty search
                const res3 = await axios.get(`${VECTRA_URL}/api/${v}/hosts?name=`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`PROBE name=(empty): SUCCESS - Count: ${res3.data.count}`);
            } catch (e) {
                console.log(`PROBE FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
            }
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
