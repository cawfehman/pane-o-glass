const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function debugIseFields() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;
    const query = process.argv[2] || "00:00:00:00:00:00"; // Default to dummy or let user provide

    if (!url || !user || !pass) {
        console.error("ISE Credentials missing");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Searching for: ${query}`);

    let mac = query;
    // Basic MAC formatting for search
    if (query.length === 12) {
        mac = query.match(/.{1,2}/g).join(":");
    }
    mac = mac.toUpperCase();

    // Endpoint for last 1 day, 5 records
    const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/5/All`;

    try {
        const response = await axios.get(endpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent
        });

        const data = await parseStringPromise(response.data, { explicitArray: false });
        
        const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
        if (!rawNodes) {
            console.log("No auth logs found for this MAC.");
            return;
        }

        const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
        const elements = nodesArray[0].authStatusElements || nodesArray[0];
        const firstLog = Array.isArray(elements) ? elements[0] : elements;

        console.log("\n--- RAW FIELDS DETECTED ---");
        Object.keys(firstLog).forEach(key => {
            const val = firstLog[key]?._ || firstLog[key];
            console.log(`${key}: ${val}`);
        });
        console.log("---------------------------\n");

    } catch (e) {
        console.error("Error:", e.response?.status || e.message);
        if (e.response?.data) console.log(e.response.data);
    }
}

debugIseFields();
