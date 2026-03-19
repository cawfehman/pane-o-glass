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

const redundantEndpoints = [
    // 1. Redundant Prefix (seen in some 3.x deployments)
    { url: `${host}/admin/API/mnt/TACACS/TacacsAuthStatus/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/TacacsAuthorizationStatus/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/TacacsAuthenticationStatus/All/86400/10/All`, type: 'XML' },

    // 2. Singular Redundant
    { url: `${host}/admin/API/mnt/TACACS/AuthorizationStatus/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/AuthenticationStatus/All/86400/10/All`, type: 'XML' },

    // 3. Combined Forensic Entity
    { url: `${host}/admin/API/mnt/TACACS/DeviceAdmin/All/86400/10/All`, type: 'XML' },
    { url: `${host}/admin/API/mnt/TACACS/DeviceAdminSession/All/86400/10/All`, type: 'XML' },

    // 4. OpenAPI Monitoring (Redux with Segment)
    { url: `${host}/api/v1/monitoring/tacacs-reports/tacacs-authentication-logs`, type: 'JSON' },
    { url: `${host}/api/v1/monitoring/tacacs-reports/tacacs-authorization-logs`, type: 'JSON' }
];

async function runRedundant() {
    console.log(`\n--- ISE 3.3 REDUNDANT SEMANTIC SHOTGUN (v2.2.0) ---`);
    console.log(`Host: ${host}`);
    
    for (const ep of redundantEndpoints) {
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
                console.log(`🎯 BREAKTHROUGH! REDUNDANT MATCH FOUND!`);
                console.log(`Body snippet: ${result.body.substring(0, 500)}`);
            } else {
                console.log(`Response: ${result.status} - ${result.body.substring(0, 50) || "Empty"}`);
            }
        } catch (e) {
            console.log(`Failed: ${e.message}`);
        }
    }
    console.log(`\n--- REDUNDANT COMPLETE ---`);
}

runRedundant();
