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

        // Probe 1: Account ID filtering
        try {
            const aRes = await axios.get(`${VECTRA_URL}/api/v3.4/accounts?ordering=-t_score&limit=1`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            if (aRes.data.results && aRes.data.results.length > 0) {
                const accId = aRes.data.results[0].id;
                console.log(`Targeting Account ID: ${accId}`);
                const dRes = await axios.get(`${VECTRA_URL}/api/v3.4/detections?account_id=${accId}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`PROBE account_id: SUCCESS - Count: ${dRes.data.count}`);
                if (dRes.data.results && dRes.data.results.length > 0) {
                    const det = dRes.data.results[0];
                    console.log('Detection Keys:', Object.keys(det).join(', '));
                    console.log('Property Mapping Test:', {
                        type: det.detection_type,
                        cat: det.category,
                        acc: det.account,
                        acc_name: det.account_name,
                        host: det.host
                    });
                }
            }
        } catch (e) {
            console.log(`PROBE account_id FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
