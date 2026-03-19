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
    }
}

const shotgunEndpoints = [
    // 1. Precise Forensic Roots (Pluralized)
    { url: `${host}/admin/API/mnt/TACACS/TacacsAuthorization/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/TacacsAuthentication/All/86400/10/All`, type: 'XML' },

    // 2. Singular Logistic Roots
    { url: `${host}/admin/API/mnt/TACACS/Audit/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/Authorization/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/Authentication/All/86400/10/All`, type: 'XML' },

    // 3. Alternative "Log" Namespace
    { url: `${host}/admin/API/mnt/Log/TACACS/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/Log/TacacsAuthorization/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/Log/TacacsAuthentication/All/86400/10/All`, type: 'XML' },

    // 4. Combined Identifier Roots
    { url: `${host}/admin/API/mnt/TACACSAudit/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACSSession/All/86400/10/All`, type: 'XML' },

    // 5. Native Reports (Absolute Last Resort)
    { url: `${host}/admin/API/mnt/TACACS/Reports/Latest/86400/10/All`, type: 'XML' }
];

async function shotgun() {
    console.log(`\n--- ISE 3.3 FORENSIC SHOTGUN (v2.0.0) ---`);
    console.log(`Host: ${host}`);
    
    for (const ep of shotgunEndpoints) {
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
                console.log(`🎯 BREAKTHROUGH! FOUND THE DATABASE!`);
                console.log(`Body snippet: ${result.body.substring(0, 500)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 50) || "Empty"}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- SHOTGUN COMPLETE ---`);
}

shotgun();
