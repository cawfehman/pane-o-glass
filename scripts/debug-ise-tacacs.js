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

// Default target to test
const testUser = process.argv[2] || user;

const endpoints = [
    // CamelCase variants (Common in older 3.x and refined 2.x interfaces)
    `${urlStr}/admin/API/mnt/AuthStatusTacacs/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACSAuthStatus/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACSAccounting/All/86400/10/All`,
    
    // Service-Specific Authorization / Authentication
    `${urlStr}/admin/API/mnt/TACACS/Authentication/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACS/Authorization/All/86400/10/All`,
    
    // Identity-Specific CamelCase
    `${urlStr}/admin/API/mnt/AuthStatusTacacs/User/${testUser}/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACSAuthStatus/User/${testUser}/86400/10/All`,
    
    // Extreme Fallback
    `${urlStr}/admin/API/mnt/AuthStatus/TACACS/All/86400/10/All`
];

async function sweep() {
    console.log(`\n--- ISE MnT CAMELCASE & AUTHORIZATION SWEEPER (v1.7.3) ---`);
    console.log(`Node: ${urlStr}`);
    console.log(`Identity: ${testUser}`);
    
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
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                }).on('error', reject);
            });
            
            console.log(`Status: ${result.status}`);
            if (result.status === 200) {
                console.log(`SUCCESS! Found data or service response.`);
                console.log(`Body start: ${result.body.substring(0, 1000)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 200)}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- SWEEP COMPLETE ---`);
}

sweep();
