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

        // Probe 1: Account Schema Discovery (High-Fidelity)
        try {
            const aRes = await axios.get(`${VECTRA_URL}/api/v3.4/accounts?ordering=-t_score&limit=5`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`--- High Score Account Telemetry Probe ---`);
            for (const acc of aRes.data.results) {
                const details = await axios.get(`${VECTRA_URL}/api/v3.4/accounts/${acc.id}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                const d = details.data;
                console.log(`Account: ${d.name} (${d.id}) | Score: ${d.t_score}`);
                console.log(`  - last_seen:`, d.last_seen || d.last_timestamp || d.last_login);
                console.log(`  - KEYS:`, Object.keys(d).sort().join(', '));

                // Probe Detections
                const detRes = await axios.get(`${VECTRA_URL}/api/v3.4/detections?account_id=${acc.id}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`  - detections (via account_id):`, detRes.data.count);
                
                const detQuery = await axios.get(`${VECTRA_URL}/api/v3.4/detections?query=${encodeURIComponent(d.name)}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                console.log(`  - detections (via query):`, detQuery.data.count);
            }
        } catch (e) {
            console.log(`ACCOUNT PROBE FAILED - ${e.message}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
