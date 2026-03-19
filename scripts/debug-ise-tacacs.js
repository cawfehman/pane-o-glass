const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

const user = process.env.ISE_API_USER;
const pass = process.env.ISE_API_PASSWORD;

if (!user || !pass) {
    console.error("ERROR: ISE Credentials not found in .env");
    process.exit(1);
}

const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

// Parse Arguments
const args = process.argv.slice(2);
let host = process.env.ISE_PAN_URL;
let identity = user;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i+1]) {
        host = args[i+1];
        if (!host.startsWith('http')) host = `https://${host}`;
        i++;
    } else if (!args[i].startsWith('--')) {
        identity = args[i];
    }
}

const endpoints = [
    // The Standard ISE 3.x TACACS path
    `${host}/admin/API/mnt/TACACS/AuthStatus/All/86400/10/All`,
    `${host}/admin/API/mnt/TACACS/AuthStatus/User/${identity}/86400/10/All`,
    
    // Unified AuthStatus (RADIUS path - used as Control Check)
    `${host}/admin/API/mnt/AuthStatus/MACAddress/All/86400/5/All`,
    
    // Accounting Check
    `${host}/admin/API/mnt/TACACS/Accounting/All/86400/10/All`,
    
    // DeviceAdmin variant
    `${host}/admin/API/mnt/DeviceAdmin/AuthStatus/All/86400/10/All`
];

async function sweep() {
    console.log(`\n--- ISE MULTI-NODE MnT VALIDATION (v1.7.8) ---`);
    console.log(`Target Host: ${host}`);
    console.log(`Identity: ${identity}`);
    
    for (const endpoint of endpoints) {
        console.log(`\nTesting: ${endpoint}`);
        try {
            const result = await new Promise((resolve, reject) => {
                const options = {
                    headers: {
                        "Authorization": `Basic ${basicAuth}`,
                        "Accept": "application/xml"
                    },
                    timeout: 5000,
                    rejectUnauthorized: false
                };
                const req = https.get(endpoint, options, (res) => {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                });
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error("Request Timeout (5s)"));
                });
            });
            
            console.log(`Status: ${result.status}`);
            if (result.status === 200) {
                console.log(`SUCCESS! Node is responsive at this path.`);
                console.log(`Body snippet: ${result.body.substring(0, 500)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 100)}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- SWEEP COMPLETE ---`);
    console.log(`\nTo test another node, run: \n  node scripts/debug-ise-tacacs.js <identity> --host <hostname_or_ip>`);
}

sweep();
