const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function findNonUnknownProfile() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching for non-Unknown profiles...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const matches = res.data.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        
        for (let i = 0; i < Math.min(matches.length, 100); i++) {
            const mac = matches[i].match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1];
            try {
                const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const xml = detail.data;
                const profile = xml.match(/<endpoint_profile>(.*?)<\/endpoint_profile>/)?.[1] || "N/A";
                const attrStr = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                
                let foundProfile = "Unknown";
                attrStr.split(':!:').forEach(pair => {
                    if (pair.toLowerCase().includes('profile')) {
                        foundProfile = pair;
                    }
                });

                if (profile !== "Unknown" || (foundProfile !== "Unknown" && !foundProfile.includes('Unknown'))) {
                    console.log(`\nFOUND: MAC ${mac}`);
                    console.log(`  Tag endpoint_profile: ${profile}`);
                    console.log(`  Attr containing 'profile': ${foundProfile}`);
                }
            } catch (e) {}
        }
    } catch (e) {
        console.error(e.message);
    }
}

findNonUnknownProfile();
