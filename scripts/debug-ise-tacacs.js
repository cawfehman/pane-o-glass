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
    // 1. "Clean" OpenAPI TACACS (No monitoring/reports segments)
    { url: `${host}/api/v1/tacacs/authentication-logs`, type: 'JSON' },
    { url: `${host}/api/v1/tacacs/authorization-logs`, type: 'JSON' },
    
    // 2. All-Lowercase Legacy (Common in some 3.x builds)
    { url: `${host}/admin/api/mnt/tacacs/authstatus/all/86400/10/all`, type: 'XML' },
    { url: `${host}/admin/api/mnt/tacacs/authstatus/user/${identity}/86400/10/all`, type: 'XML' },
    
    // 3. Parametric Extraction (Testing the service-type parameter on working root)
    { url: `${host}/admin/API/mnt/AuthStatus/All/86400/10/All?service=TACACS`, type: 'XML' },
    { url: `${host}/admin/API/mnt/AuthStatus/All/86400/10/All?type=TACACS`, type: 'XML' },
    
    // 4. Forensics Check
    { url: `${host}/admin/API/mnt/Forensics/All/86400/10/All`, type: 'XML' },
    
    // 5. Control Check (The one working path)
    { url: `${host}/admin/API/mnt/AuthStatus/MACAddress/All/86400/5/All`, type: 'XML' }
];

async function sweep() {
    console.log(`\n--- ISE 3.3 DISCOVERY: "CLEAN" OpenAPI (v1.8.3) ---`);
    console.log(`Target Host: ${host}`);
    console.log(`Identity: ${identity}`);
    
    for (const ep of endpoints) {
        console.log(`\nTesting: ${ep.url}`);
        try {
            const result = await new Promise((resolve, reject) => {
                const options = {
                    headers: {
                        "Authorization": `Basic ${basicAuth}`,
                        "Accept": ep.type === 'JSON' ? 'application/json' : 'application/xml'
                    },
                    timeout: 5000,
                    rejectUnauthorized: false
                };
                const req = https.get(ep.url, options, (res) => {
                    let body = '';
                    res.on('data', d => body += d);
                    res.on('end', () => resolve({ status: res.statusCode, body }));
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error("Request Timeout (5s)")); });
            });
            
            console.log(`Status: ${result.status} [${ep.type}]`);
            if (result.status === 200) {
                console.log(`SUCCESS! Found data or service response.`);
                console.log(`Body snippet: ${result.body.substring(0, 500)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 100)}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- SWEEP COMPLETE ---`);
}

sweep();
