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
    // 1. Modern OpenAPI Monitoring TACACS (ISE 3.3 Precise)
    { url: `${host}/api/v1/monitoring/tacacs/authentication-logs`, type: 'JSON' },
    { url: `${host}/api/v1/monitoring/tacacs/authorization-logs`, type: 'JSON' },
    
    // 2. Monitoring AuthStatus Generic (JSON variant)
    { url: `${host}/api/v1/monitoring/auth-status/user/${identity}`, type: 'JSON' },
    
    // 3. Alternative Modern Roots
    { url: `${host}/ise/mnt/api/AuthStatus/MACAddress/All/86400/5/All`, type: 'XML' },
    
    // 4. Fallback (RADIUS path that we know works - used as Connectivity Control)
    { url: `${host}/admin/API/mnt/AuthStatus/MACAddress/All/86400/5/All`, type: 'XML' }
];

async function sweep() {
    console.log(`\n--- ISE 3.3 DISCOVERY: REFINED OpenAPI (v1.8.1) ---`);
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
                    res.on('end', () => resolve({ status: res.statusCode, body, location: res.headers.location }));
                });
                req.on('error', reject);
                req.on('timeout', () => { req.destroy(); reject(new Error("Request Timeout (5s)")); });
            });
            
            if (result.status === 302 || result.status === 301) {
                console.log(`REDIRECT DETECTED (302/301) -> ${result.location}`);
                console.log(`!!! WARNING: This node is forcing a UI login. It means ERS or OpenAPI is likely DISABLED.`);
                console.log(`!!! FIX: Go to Administration > System > Settings > API Settings and enable 'ERS' and 'OpenAPI'.`);
            } else if (result.status === 200) {
                console.log(`SUCCESS [200 OK]! Found data or service response.`);
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
