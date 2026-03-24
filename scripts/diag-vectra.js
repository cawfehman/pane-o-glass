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

        // Probe 1: Attribution Modeling Discovery
        try {
            const hRes = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?ordering=-t_score&limit=5`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`--- High Score Host Attribution Probe ---`);
            for (const h of hRes.data.results) {
                const details = await axios.get(`${VECTRA_URL}/api/v3.4/hosts/${h.id}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                const d = details.data;
                console.log(`Host: ${d.name} (${d.id}) | Score: ${d.t_score}`);
                console.log(`  - probable_owner:`, d.probable_owner);
                console.log(`  - assignment:`, d.assignment);
                console.log(`  - last_account_name:`, d.last_account_name);
                console.log(`  - detection_profile:`, d.detection_profile);
            }
        } catch (e) {
            console.log(`ATTRIBUTION PROBE FAILED - ${e.message}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
