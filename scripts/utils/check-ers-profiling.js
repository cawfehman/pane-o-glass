const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function checkErsProfiling() {
    const mntUrl = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const ersUrl = mntUrl.replace(':8443', ':9060');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Checking ERS Endpoint API for profiling data...`);
    try {
        const res = await axios.get(`${mntUrl}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const macMatches = res.data.match(/<calling_station_id>(.*?)<\/calling_station_id>/g) || [];
        let macs = macMatches.map(m => m.match(/>(.*?)<\//)[1]).filter(m => m.includes(':') || m.includes('-')).slice(0, 50);

        for (const mac of macs) {
            try {
                const ersRes = await axios.get(`${ersUrl}/ers/config/endpoint/name/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const ep = ersRes.data.ERSEndPoint;
                if (ep.mdmAttributes || (ep.customAttributes && Object.keys(ep.customAttributes.customAttributes).length > 0)) {
                    console.log(`\n[EP DATA] MAC: ${mac}`);
                    console.log(JSON.stringify(ep, null, 2));
                }
                
                // Also check for 'User-Agent' specifically in common attributes
                const rawJson = JSON.stringify(ep);
                if (rawJson.toLowerCase().includes('agent') || rawJson.toLowerCase().includes('user')) {
                     console.log(`\n[POTENTIAL PROFILING] MAC: ${mac}`);
                     console.log(JSON.stringify(ep, null, 2));
                }
            } catch (e) {}
        }
        console.log(`Scan Complete.`);
    } catch (e) {
        console.error(e.message);
    }
}

checkErsProfiling();
