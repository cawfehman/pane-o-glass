const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const urlStr = process.env.ISE_PAN_URL;
const user = process.env.ISE_API_USER;
const pass = process.env.ISE_API_PASSWORD;

if (!urlStr || !user || !pass) {
    console.error("ERROR: ISE Credentials not found in .env");
    process.exit(1);
}

const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

const endpoints = [
    // Standard ISE 3.x
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus/All/604800/10/All`,
    // User-All variant
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus/User/All/604800/10/All`,
    // Shared AuthStatus (ISE 2.x / Unified)
    `${urlStr}/admin/API/mnt/AuthStatus/All/604800/10/All`,
    // Swapped segments
    `${urlStr}/admin/API/mnt/AuthStatus/TACACS/604800/10/All`,
    // Lowercase
    `${urlStr}/admin/API/mnt/tacacs/AuthStatus/All/604800/10/All`,
    // Legacy Log path
    `${urlStr}/admin/API/mnt/Log/All/604800/10/All`,
    // Root level check
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus`
];

async function sweep() {
    console.log(`\n--- ISE MnT ENDPOINT SWEEPER (v1.7.0) ---`);
    console.log(`Node: ${urlStr}`);
    
    for (const endpoint of endpoints) {
        console.log(`\nTesting: ${endpoint}`);
        try {
            const result = await new Promise((resolve, reject) => {
                const options = {
                    headers: {
                        "Authorization": `Basic ${basicAuth}`,
                        "Accept": "application/xml"
                    },
                    rejectUnauthorized: false
                };
                https.get(endpoint, options, (res) => {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 500) }));
                }).on('error', reject);
            });
            
            console.log(`Status: ${result.status}`);
            if (result.status === 200) {
                console.log(`SUCCESS! Found endpoint. Body start: ${result.body}`);
            } else if (result.status === 404) {
                console.log(`404: Not found at this path.`);
            } else {
                console.log(`Error: ${result.status} - ${result.body}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- SWEEP COMPLETE ---`);
}

sweep();
