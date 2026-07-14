const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function fetchMap() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        console.error("ISE Credentials not configured");
        return;
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // The WADL file is the "Map" of all available MnT APIs
    const endpoint = `${url}/admin/API/mnt/application.wadl`;

    console.log(`Fetching API Map from: ${endpoint}`);

    try {
        const response = await axios.get(endpoint, {
            headers: { 
                "Authorization": `Basic ${basicAuth}`, 
                "Accept": "application/xml"
            },
            httpsAgent: agent,
            timeout: 10000
        });
        
        console.log("Successfully retrieved API Map!");
        console.log("-----------------------------------");
        // Look for any resource that sounds like "Auth" or "Status" or "Failure"
        const wadl = response.data;
        const resources = wadl.match(/path="(.*?)"/g);
        if (resources) {
            console.log("Available Endpoints Found:");
            resources.forEach(r => {
                if (r.toLowerCase().includes('auth') || r.toLowerCase().includes('session') || r.toLowerCase().includes('status')) {
                    console.log(`  -> ${r}`);
                }
            });
        } else {
            console.log("No specific paths found in WADL, dumping first 1000 chars:");
            console.log(wadl.substring(0, 1000));
        }

    } catch (e) {
        console.log(`Failed to fetch map: ${e.response?.status || e.message}`);
        if (e.response?.status === 404) {
            console.log("WADL not found at this path. Testing base /admin/API/mnt/");
            // Try just the directory
            try {
                const res2 = await axios.get(`${url}/admin/API/mnt/`, {
                    headers: { "Authorization": `Basic ${basicAuth}` },
                    httpsAgent: agent
                });
                console.log("MNT Base Directory exists. Listing contents:");
                console.log(res2.data.substring(0, 500));
            } catch (e2) {
                console.log("Base directory also inaccessible.");
            }
        }
    }
}

fetchMap();
