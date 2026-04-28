const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function deepTelemetryScan() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Scanning for ANY Signal/Profiling telemetry in ActiveList...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const macMatches = res.data.match(/<calling_station_id>(.*?)<\/calling_station_id>/g) || [];
        let macs = macMatches.map(m => m.match(/>(.*?)<\//)[1]).filter(m => m.includes(':') || m.includes('-'));
        
        // Random sample of 1000
        macs = macs.sort(() => 0.5 - Math.random()).slice(0, 1000);
        console.log(`Checking 1000 sessions...`);

        let found = 0;
        for (let i = 0; i < macs.length; i += 20) {
            const batch = macs.slice(i, i + 20);
            await Promise.allSettled(batch.map(async (mac) => {
                try {
                    const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                        httpsAgent: agent,
                        timeout: 5000
                    });

                    const xml = detail.data;
                    const lowerXml = xml.toLowerCase();
                    
                    if (lowerXml.includes('rssi') || lowerXml.includes('signal') || lowerXml.includes('user-agent') || lowerXml.includes('airespace')) {
                        found++;
                        console.log(`\n[FOUND] MAC: ${mac}`);
                        const attrStr = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                        attrStr.split(':!:').forEach(pair => {
                            const lp = pair.toLowerCase();
                            if (lp.includes('rssi') || lp.includes('signal') || lp.includes('user-agent') || lp.includes('airespace')) {
                                console.log(`  - ${pair}`);
                            }
                        });
                    }
                } catch (e) {}
            }));
            if (i % 100 === 0) process.stdout.write('.');
        }
        
        console.log(`\nScan Complete. Found ${found} sessions with telemetry.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

deepTelemetryScan();
