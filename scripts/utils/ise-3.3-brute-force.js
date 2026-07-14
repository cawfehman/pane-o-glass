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

    console.log("ISE 3.3 MnT Brute-Force (Deeper Scan)...");

    const eps = [
        "/admin/API/mnt/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/LastNRecords/All/10/All",
        "/admin/API/mnt/FailureStatus/All/3600/10/All",
        "/admin/API/mnt/Session/AuthStatus/All/3600/10/All",
        "/admin/API/mnt/authstatus/All/3600/10/All",
        "/admin/API/mnt/authStatus/All/3600/10/All",
        "/admin/API/mnt/Session/FailureList",
        "/admin/API/mnt/AuthStatus/MACAddress/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/UserName/All/3600/10/All",
        "/admin/API/mnt/AuthStatus/IPAddress/All/3600/10/All",
        "/ise/mnt/api/AuthStatus/All/3600/10/All"
    ];

    for (const ep of eps) {
        try {
            const res = await axios.get(`${url}${ep}`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                httpsAgent: agent,
                timeout: 5000
            });
            console.log(`  [SUCCESS 200] ${ep}`);
        } catch (e) {
            console.log(`  [FAILED ${e.response?.status || "ERR"}] ${ep}`);
        }
    }
}
discovery();
