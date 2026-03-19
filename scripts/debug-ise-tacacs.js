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
    // 1. Native TACACS Session Root (ISE 3.3 Precise Forensic)
    { url: `${host}/admin/API/mnt/TACACS/Session/All/86400/10/All`, type: 'XML' },
    
    // 2. Transposed Segmented Root
    { url: `${host}/admin/API/mnt/Session/TACACS/ActiveList`, type: 'XML' },
    
    // 3. User-Specific Segmented Root
    { url: `${host}/admin/API/mnt/Session/ActiveList/UserName/${identity}`, type: 'XML' },
    
    // 4. Root Level Service Active List
    { url: `${host}/admin/API/mnt/TACACS/ActiveList`, type: 'XML' },
    
    // 5. Control Check (The generic one that leaked RADIUS)
    { url: `${host}/admin/API/mnt/Session/ActiveList?service=TACACS`, type: 'XML' }
];

async function sweep() {
    console.log(`\n--- ISE 3.3 DISCOVERY: NATIVE FORENSIC (v1.9.3) ---`);
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
            
            console.log(`Status: ${result.status}`);
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
