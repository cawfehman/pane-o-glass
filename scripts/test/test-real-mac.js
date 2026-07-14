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
        console.log("Fetching ActiveList to find a valid MAC...");
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        
        const data = await parseStringPromise(res.data);
        const sessions = data.activeList.activeSession;
        const firstSession = Array.isArray(sessions) ? sessions[0] : sessions;
        const mac = firstSession.calling_station_id;

        console.log(`Found MAC: ${mac}. Testing drill-down...`);
        const drillRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        console.log(`  [DRILL-DOWN SUCCESS] ${drillRes.status}`);

        console.log("Testing AuthStatus (failures) for this specific MAC...");
        // AuthStatus by MAC is often: /admin/API/mnt/AuthStatus/MACAddress/{mac}/{seconds}/{num_records}/All
        const authRes = await axios.get(`${url}/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/10/All`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        console.log(`  [AUTH-STATUS MAC SUCCESS] ${authRes.status}`);

    } catch (e) {
        console.log(`  [FAILED] ${e.response?.status || e.message}`);
        if (e.response?.data) console.log("Response Body:", e.response.data);
    }
}
discovery();
