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

        // Probe 1: Fetch a specific detection from EFT01's set
        // EFT01 (ID: 2565426) has detection ID 434676
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/detections/434676`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log('--- Detection 434676 Payload ---');
            console.log(JSON.stringify({
                id: res.data.id,
                type: res.data.detection_type,
                host: res.data.host,
                src_ip: res.data.src_ip,
                account: res.data.account,
                account_id: res.data.account_id,
                tags: res.data.tags
            }, null, 2));
        } catch (e) {
            console.log(`DETECTION PROBE FAILED - ${e.message}`);
        }

        // Probe 2: Fetch a high-threat account
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/accounts?ordering=-t_score`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            if (res.data.results && res.data.results.length > 0) {
                const acc = res.data.results[0];
                const fullAcc = await axios.get(`${VECTRA_URL}/api/v3.4/accounts/${acc.id}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log('\n--- High-Threat Account Payload ---');
                console.log(JSON.stringify(fullAcc.data, null, 2));
            }
        } catch (e) {
            console.log(`ACCOUNT PROBE FAILED - ${e.message}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
