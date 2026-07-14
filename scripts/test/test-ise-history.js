const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function testHistory() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Using the MAC from the previous investigation
    const mac = "C8:CB:9E:D3:1E:31";
    const seconds = 86400; // 24 hours
    const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${mac}/${seconds}/50/All`;
    
    console.log(`Querying History for: ${mac}`);
    console.log(`Endpoint: ${endpoint}`);

    try {
        const response = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml",
                "X-ERS-Internal-User": "true"
            },
            httpsAgent: agent,
            timeout: 10000
        });

        console.log("Raw Response Status:", response.status);
        console.log("Raw XML Preview (first 1000 chars):");
        console.log(response.data.substring(0, 1000));

        const data = await parseStringPromise(response.data, { 
            explicitArray: false,
            tagNameProcessors: [ (name) => name.split(':').pop() || name ]
        });

        const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
        if (!rawNodes) {
            console.log("\n[!!!] No history nodes found in parsed data.");
            console.log("Keys in parsed root:", Object.keys(data));
            return;
        }
        
        const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
        console.log(`\nFound ${nodesArray.length} records.`);
        
        nodesArray.forEach((n, i) => {
            console.log(`Record ${i+1}:`);
            console.log(`  - Timestamp: ${n.acs_timestamp || n.acsTimestamp}`);
            console.log(`  - User: ${n.user_name || n.userName}`);
            console.log(`  - Status: ${n.passed}`);
            console.log(`  - Reason: ${n.failure_reason || "Passed"}`);
        });

    } catch (err) {
        console.error(`Fetch failed: ${err.message}`);
        if (err.response) {
            console.log("Error Status:", err.response.status);
            console.log("Error Data:", err.response.data);
        }
    }
}

testHistory();
