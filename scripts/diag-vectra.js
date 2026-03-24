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

        // Probe 1: Full Account Detection Inspection
        try {
            // Pick a high score account
            const aRes = await axios.get(`${VECTRA_URL}/api/v3.4/accounts?ordering=-t_score&limit=1`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            if (aRes.data.results && aRes.data.results.length > 0) {
                const acc = aRes.data.results[0];
                console.log(`--- Deep Account Inspection: ${acc.name} (${acc.id}) ---`);
                
                const dRes = await axios.get(`${VECTRA_URL}/api/v3.4/detections?account_id=${acc.id}`, { 
                    httpsAgent: agent, 
                    headers: { Authorization: 'Bearer ' + token } 
                });
                
                console.log('Detection Count:', dRes.data.count);
                if (dRes.data.results && dRes.data.results.length > 0) {
                    const det = dRes.data.results[0];
                    console.log('DETECTION_KEYS:', Object.keys(det).sort().join(', '));
                    console.log('SAMPLE:', JSON.stringify(det, null, 2));
                    
                    // Probe specifically for attribution fields
                    console.log('ATTRIBUTION_TEST:', {
                        host: det.host,
                        host_name: det.host_name,
                        src_host: det.src_host,
                        dst_hosts: det.dst_hosts,
                        account: det.account,
                        account_name: det.account_name
                    });
                }
            }
        } catch (e) {
            console.log(`ACCOUNT PROBE FAILED - ${e.message}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
