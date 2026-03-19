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
    // Accounting Paths
    `${urlStr}/admin/API/mnt/TACACS/Accounting/All/604800/10/All`,
    `${urlStr}/admin/API/mnt/TACACS/Accounting/User/${testUser}/604800/10/All`,
    // Identity Segment Variants
    `${urlStr}/admin/API/mnt/AuthStatus/UserName/${testUser}/604800/10/All`,
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus/UserName/${testUser}/604800/10/All`,
    // Shared / Root Level Probes
    `${urlStr}/admin/API/mnt/AuthStatus/TACACS/All/604800/10/All`,
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus/MACAddress/All/604800/10/All`,
    // Singular variant
    `${urlStr}/admin/API/mnt/TACACSAuthStatus/User/${testUser}/86400/10/All`,
    // Path discovery
    `${urlStr}/admin/API/mnt/Session/TACACS/All/86400/10/All`
];

async function sweep() {
    console.log(`\n--- ISE MnT ACCOUNTING & SEGMENT SWEEPER (v1.7.2) ---`);
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
