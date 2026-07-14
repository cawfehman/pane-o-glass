const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function checkiPhoneProfileFast() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching for profiles concurrently...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const matches = res.data.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        const profiles = new Set();
        const batchSize = 20;

        for (let i = 0; i < Math.min(matches.length, 200); i += batchSize) {
            const batch = matches.slice(i, i + batchSize);
            await Promise.all(batch.map(async (s) => {
                const mac = s.match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1];
                try {
                    const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                        httpsAgent: agent,
                        timeout: 5000
                    });

                    const xml = detail.data;
                    const profile = xml.match(/<endpoint_profile>(.*?)<\/endpoint_profile>/)?.[1] || "Unknown";
                    profiles.add(profile);
                    
                    if (profile.toLowerCase().includes('apple') || profile.toLowerCase().includes('iphone')) {
                        console.log(`\nFOUND TARGET SESSION: MAC ${mac} | Profile: ${profile}`);
                    }
                } catch (e) {}
            }));
            process.stdout.write('.');
        }
        
        console.log("\n\nUnique Profiles Found:");
        console.log([...profiles].sort().join('\n'));
    } catch (e) {
        console.error(e.message);
    }
}

checkiPhoneProfileFast();
