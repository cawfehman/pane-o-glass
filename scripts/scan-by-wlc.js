const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function scanByWlc() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Fetching ActiveList to find NAS IPs...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const activeXml = res.data;
        const matches = activeXml.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
        console.log(`Found ${matches.length} active sessions.`);

        const nasIps = new Set();
        matches.forEach(m => {
            const match = m.match(/<nas_ip_address>(.*?)<\/nas_ip_address>/);
            if (match) nasIps.add(match[1]);
        });
        
        console.log(`Found ${nasIps.size} unique NAS IPs. We will sample 1 MAC from each to find their hostnames.`);

        for (const nasIp of nasIps) {
            // Find a session with this NAS IP
            const sessionXml = matches.find(m => m.includes(`<nas_ip_address>${nasIp}</nas_ip_address>`));
            if (!sessionXml) continue;

            const macMatch = sessionXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
            if (!macMatch) continue;
            const mac = macMatch[1];
            if (!mac.includes(':') && !mac.includes('-')) continue;

            try {
                const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const xml = detailRes.data;
                const apNameMatch = xml.match(/<network_device_name>(.*?)<\/network_device_name>/)?.[1] || '';
                
                if (apNameMatch) {
                    console.log(`\nFound NAS Device: ${apNameMatch} (IP: ${nasIp})`);
                }
            } catch (e) {
                // Ignore
            }
        }
        
        console.log(`\nScan Complete.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

scanByWlc();
