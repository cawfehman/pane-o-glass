const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function discovery() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
        console.log("Fetching ActiveList to find PSN names...");
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        
        const data = await parseStringPromise(res.data);
        const sessions = data.activeList.activeSession;
        const firstSession = Array.isArray(sessions) ? sessions[0] : sessions;
        
        // Detailed lookup of first session to get its acs_server
        const mac = firstSession.calling_station_id;
        const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        const detailData = await parseStringPromise(detailRes.data);
        const psn = detailData.sessionParameters.acs_server;

        console.log(`Found PSN Hostname: ${psn}. Testing node-specific status...`);
        const nodeStatusEp = `/admin/API/mnt/AuthStatus/PSNNode/${psn}/86400/10/All`;
        console.log(`Testing: ${nodeStatusEp}`);
        
        const nodeRes = await axios.get(`${url}${nodeStatusEp}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        console.log(`  [NODE-STATUS SUCCESS] ${nodeRes.status}`);

    } catch (e) {
        console.log(`  [FAILED] ${e.response?.status || e.message}`);
        if (e.response?.data) console.log("Response Body:", e.response.data);
    }
}
discovery();
