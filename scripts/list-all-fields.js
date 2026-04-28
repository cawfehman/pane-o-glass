const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function listAllFields() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
        // Get one active session MAC
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const macMatches = res.data.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        const wirelessSession = macMatches.find(m => m.includes('CooperEmployee')) || macMatches[0];
        
        const macMatch = wirelessSession.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
        if (!macMatch) {
            console.log("No sessions found to sample.");
            return;
        }
        const mac = macMatch[1];

        const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 5000
        });

        console.log(`--- RAW FIELD LIST FOR MAC ${mac} ---`);
        // Use a simple regex to find all tags
        const tags = detail.data.match(/<(.*?)>/g);
        const uniqueTags = [...new Set(tags.map(t => t.replace(/[<>/\s]/g, '').split(' ')[0]))].filter(t => t && t !== '?xml' && !t.startsWith('!'));
        
        console.log(uniqueTags.sort().join('\n'));
        
        console.log(`\n--- SAMPLE VALUES ---`);
        uniqueTags.forEach(tag => {
            const valMatch = detail.data.match(new RegExp(`<${tag}.*?>(.*?)</${tag}>`));
            if (valMatch) {
                console.log(`${tag}: ${valMatch[1].substring(0, 100)}${valMatch[1].length > 100 ? '...' : ''}`);
            }
        });

    } catch (e) {
        console.error(e.message);
    }
}

listAllFields();
