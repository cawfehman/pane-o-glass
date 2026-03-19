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

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && args[i+1]) {
        host = args[i+1];
        if (!host.startsWith('http')) host = `https://${host}`;
        i++;
    }
}

const reduxEndpoints = [
    // 1. Semantic Redux: AuditStatus vs AuthStatus
    { url: `${host}/admin/API/mnt/TACACS/AuditStatus/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/AuthStatus/All/86400/10/All`, type: 'XML' },

    // 2. Pluralization Redux: Log vs Logs
    { url: `${host}/admin/API/mnt/TACACS/Log/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/Logs/All/86400/10/All`, type: 'XML' },

    // 3. Entity Redux: Audit vs Activity
    { url: `${host}/admin/API/mnt/TACACS/Audit/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/Activity/All/86400/10/All`, type: 'XML' },

    // 4. Case-Sensitive Redux (all lowercase)
    { url: `${host}/admin/api/mnt/tacacs/auditstatus/all/86400/10/all`, type: 'XML' },
    { url: `${host}/admin/api/mnt/tacacs/authstatus/all/86400/10/all`, type: 'XML' }
];

async function redux() {
    console.log(`\n--- ISE 3.3 FORENSIC REDUX (v2.1.0) ---`);
    console.log(`Host: ${host}`);
    
    for (const ep of reduxEndpoints) {
        console.log(`\nTesting: ${ep.url}`);
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
                console.log(`🎯 BREAKTHROUGH! SEMANTIC MATCH FOUND!`);
                console.log(`Body snippet: ${result.body.substring(0, 500)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 50) || "Empty"}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- REDUX COMPLETE ---`);
}

redux();
