const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function debugIseFields() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const query = process.argv[2] || "00:00:00:00:00:00";

    if (!url || !user || !pass) {
        console.error("ISE Credentials missing");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Deep Debug for: ${query}`);

    let mac = query;
    if (query.length === 12) {
        mac = query.match(/.{1,2}/g).join(":");
    }
    mac = mac.toUpperCase();

    // 1. Fetch Session Details (Most Detailed)
    const sessionUrl = `${url}/admin/API/mnt/Session/MACAddress/${mac}`;
    console.log(`\n--- FETCHING SESSION DATA (${sessionUrl}) ---`);
    try {
        const res = await axios.get(sessionUrl, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        const data = await parseStringPromise(res.data, { explicitArray: false });
        const session = data.sessionParameters || data.activeSession;
        if (session) {
            Object.keys(session).forEach(key => {
                const val = session[key]?._ || session[key];
                console.log(`${key}: ${val}`);
            });
        } else {
            console.log("No active session found (showing only auth history).");
        }
    } catch (e) {
        console.log(`Session lookup failed: ${e.message}`);
    }

    // 2. Fetch Auth Status (History)
    const authUrl = `${url}/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/1/All`;
    console.log(`\n--- FETCHING AUTH HISTORY (${authUrl}) ---`);
    try {
        const response = await axios.get(authUrl, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });
        const data = await parseStringPromise(response.data, { explicitArray: false });
        const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
        if (rawNodes) {
            const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
            const elements = nodesArray[0].authStatusElements || nodesArray[0];
            const firstLog = Array.isArray(elements) ? elements[0] : elements;
            Object.keys(firstLog).forEach(key => {
                const val = firstLog[key]?._ || firstLog[key];
                // Only print if not already shown in session or if we want to see it again
                console.log(`Auth_${key}: ${val}`);
            });
        }
    } catch (e) {
        console.error("Auth History Error:", e.message);
    }
}

debugIseFields();
