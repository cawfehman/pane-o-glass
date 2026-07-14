const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function dumpWirelessAttrs() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Dumping wireless attributes...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const matches = res.data.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        const wirelessMatches = matches.filter(m => m.includes('CooperEmployee')).slice(0, 5);

        for (const s of wirelessMatches) {
            const mac = s.match(/<calling_station_id>(.*?)<\/calling_station_id>/)?.[1];
            try {
                const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const xml = detail.data;
                const attrStr = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                console.log(`\n--- MAC: ${mac} ---`);
                console.log(attrStr.split(':!:').join('\n'));
            } catch (e) {}
        }
    } catch (e) {
        console.error(e.message);
    }
}

dumpWirelessAttrs();
