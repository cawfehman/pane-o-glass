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

// We'll try to find an admin username from the environment or a hardcoded one (the user can override it)
const testUser = process.argv[2] || user; // Default to the API user itself if it's an admin

const endpoints = [
    // Version Check
    `${urlStr}/admin/API/mnt/Version`,
    // Identity-based lookups
    `${urlStr}/admin/API/mnt/TACACS/AuthStatus/User/${testUser}/604800/10/All`,
    `${urlStr}/admin/API/mnt/AuthStatus/User/${testUser}/604800/10/All`,
    // Shared AuthStatus (ISE 2.x) - Check if User lookup works even for TACACS
    `${urlStr}/admin/API/mnt/AuthStatus/MACAddress/All/86400/10/All`,
    // Check if Service status is active
    `${urlStr}/admin/API/mnt/Service/Status`
];

async function sweep() {
    console.log(`\n--- ISE MnT IDENTITY SWEEPER (v1.7.1) ---`);
    console.log(`Node: ${urlStr}`);
    console.log(`Testing Identity: ${testUser}`);
    
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
                    res.on('end', () => resolve({ status: res.statusCode, body: body.substring(0, 1000) }));
                }).on('error', reject);
            });
            
            console.log(`Status: ${result.status}`);
            if (result.status === 200) {
                console.log(`SUCCESS! Found data or service response.`);
                console.log(`Body start: ${result.body}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- IDENTITY SWEEP COMPLETE ---`);
    console.log(`Tip: If 404 persists, please provide a different username to test: \n  node scripts/debug-ise-tacacs.js <YOUR_ADMIN_USER>`);
}

sweep();
