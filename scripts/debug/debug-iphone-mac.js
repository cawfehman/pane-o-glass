const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function debugMacProfile() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const mac = "FA:CF:5C:8D:63:77";
    console.log(`Debugging MAC: ${mac}`);

    try {
        const detail = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });

        const xml = detail.data;
        console.log("\n--- RAW XML START ---");
        console.log(xml);
        console.log("--- RAW XML END ---\n");

        const attrStr = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
        console.log("Attributes in other_attr_string:");
        attrStr.split(':!:').forEach(pair => {
            console.log(`  - ${pair}`);
        });

    } catch (e) {
        console.error(`Fetch failed: ${e.message}`);
    }
}

debugMacProfile();
