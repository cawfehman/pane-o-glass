const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function listTags() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const mac = "C8:CB:9E:D3:1E:31";
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        const data = await parseStringPromise(res.data, { explicitArray: false });
        const node = data.sessionParameters || data.activeSession;
        console.log("Found Tags:", Object.keys(node).join(', '));
        console.log("\nValue of network_device_name:", node.network_device_name);
        console.log("Value of nas_identifier:", node.nas_identifier);
    } catch (e) {
        console.error(e.message);
    }
}

listTags();
