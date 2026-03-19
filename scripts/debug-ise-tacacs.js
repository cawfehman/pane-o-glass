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
    // Dashed & Underscored variants (Standard for some ISE 3.3 images)
    `${urlStr}/admin/API/mnt/TACACS-AuthStatus/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACS_AuthStatus/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/AuthStatus-TACACS/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/AuthStatus_TACACS/All/86400/10/All`,
    
    // Legacy / Unified Probes
    `${urlStr}/admin/API/mnt/AuthStatus/TACACS/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/AuthStatus/TACACS/${testUser}/86400/10/All`,
    
    // Accounting Variants
    `${urlStr}/admin/API/mnt/TACACS-Accounting/All/86400/10/All`,
    `${urlStr}/admin/API/mnt/TACACS_Accounting/All/86400/10/All`,
    
    // Simplified Lowercase Discovery
    `${urlStr}/admin/API/mnt/tacacsauthstatus/All/86400/10/All`,
    
    // Verify successful path from Step 6224 as a control
    `${urlStr}/admin/API/mnt/AuthStatus/MACAddress/All/86400/10/All`
];

async function sweep() {
    console.log(`\n--- ISE MnT DASH & UNDERSCORE SWEEPER (v1.7.4) ---`);
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
