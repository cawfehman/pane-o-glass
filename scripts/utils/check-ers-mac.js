const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function checkErsMac() {
    const mntUrl = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const ersUrl = mntUrl.replace(':8443', ':9060');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    const mac = "FA:CF:5C:8D:63:77";
    console.log(`Checking ERS for MAC: ${mac}`);

    try {
        const res = await axios.get(`${ersUrl}/ers/config/endpoint/name/${mac}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
            httpsAgent: agent,
            timeout: 5000
        });

        console.log(JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.error(`ERS Fetch failed: ${e.message}`);
    }
}

checkErsMac();
