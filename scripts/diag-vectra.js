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

        // Probe 1: ordering=-t_score on HOSTS
        try {
            const res = await axios.get(`${VECTRA_URL}/api/v3.4/hosts?ordering=-t_score`, { 
                httpsAgent: agent, 
                headers: { Authorization: 'Bearer ' + token } 
            });
            console.log(`PROBE T_SCORE: SUCCESS - Count: ${res.data.count}`);
            if (res.data.results && res.data.results.length > 0) {
                console.log('--- Top 10 Scored Hosts ---');
                res.data.results.slice(0, 10).forEach(h => {
                    console.log(`- ${h.name} [ID: ${h.id}] | T: ${h.t_score} / C: ${h.c_score}`);
                });
            } else {
                console.log('PROBE T_SCORE: No results returned.');
            }
        } catch (e) {
            console.log(`PROBE T_SCORE FAILED - ${e.message} - ${JSON.stringify(e.response?.data || '')}`);
        }
    } catch (e) {
        console.log('Auth: FAILED -', e.response?.data || e.message);
    }
}

test();
