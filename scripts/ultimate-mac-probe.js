const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function probe() {
    const url = process.env.ISE_PAN_URL.replace(/"/g, '');
    const user = process.env.ISE_API_USER.replace(/"/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/"/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Step 1: Get one active MAC from KEL
    const activeEndpoint = `${url}/admin/API/mnt/Session/ActiveList`;
    const res = await axios.get(activeEndpoint, {
        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
        httpsAgent: agent
    });

    const macMatch = res.data.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
    if (!macMatch) return console.log("No active MACs found.");
    const targetMac = macMatch[1];
    console.log(`Targeting MAC: ${targetMac}`);

    // Step 2: Try every possible forensic path
    const paths = [
        `/admin/API/mnt/AuthStatus/MACAddress/${targetMac}/86400/10/All`,
        `/admin/API/mnt/AuthStatus/MACAddress/${targetMac.replace(/:/g, '-')}/86400/10/All`,
        `/admin/API/mnt/AuthStatus/MACAddress/${targetMac.replace(/:/g, '')}/86400/10/All`,
        `/admin/API/mnt/AuthStatus/MACAddress/${targetMac}/3600/10/PASSED`,
        `/admin/API/mnt/AuthStatus/MACAddress/${targetMac}/3600/10/FAILED`
    ];

    for (const path of paths) {
        console.log(`Testing: ${path}`);
        try {
            const probeRes = await axios.get(`${url}${path}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                httpsAgent: agent
            });
            console.log(`  [SUCCESS] Status: ${probeRes.status} | Data: ${probeRes.data.length} bytes`);
            if (probeRes.data.includes("<authStatusElements>")) {
                console.log("  !!! FOUND RECORDS !!!");
                break;
            }
        } catch (e) {
            console.log(`  [FAILED] Status: ${e.response?.status || e.message}`);
        }
    }
}

probe();
