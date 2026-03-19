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

async function discoverNodes() {
    console.log(`\n--- ISE TOPOLOGY DISCOVERY (v1.7.7) ---`);
    console.log(`Querying Primary Node: ${urlStr}`);
    
    // ERS Node API: returns all nodes in the deployment
    const endpoint = `${urlStr}/ers/config/node`;
    
    const options = {
        headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Accept": "application/json" // Use JSON for easier parsing than XML
        },
        rejectUnauthorized: false
    };

    https.get(endpoint, options, (res) => {
        if (res.statusCode !== 200) {
            console.error(`ERS API Error: ${res.statusCode} ${res.statusMessage}`);
            return;
        }

        let body = '';
        res.on('data', d => body += d);
        res.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const nodes = data.SearchResult.resources || [];
                
                console.log(`\nFound ${nodes.length} nodes in deployment:`);
                
                for (const nodeRef of nodes) {
                    // Fetch full detail for each node to see roles
                    await new Promise((resolve) => {
                        https.get(nodeRef.link.href, options, (nodeRes) => {
                            let nodeBody = '';
                            nodeRes.on('data', d => nodeBody += d);
                            nodeRes.on('end', () => {
                                const nodeDetail = JSON.parse(nodeBody).Node;
                                const name = nodeDetail.name;
                                const ip = nodeDetail.ipAddress;
                                const roles = nodeDetail.roles || [];
                                
                                const isMnt = roles.includes('Monitoring');
                                const isPan = roles.includes('Administration');
                                const isPsn = roles.includes('PolicyService');
                                
                                let roleStr = [
                                    isPan ? 'PAN (Admin)' : '',
                                    isMnt ? 'MnT (Monitoring)' : '',
                                    isPsn ? 'PSN (Policy)' : ''
                                ].filter(Boolean).join(', ');

                                console.log(`- [${name}] IP: ${ip} | Roles: ${roleStr}`);
                                if (isMnt) {
                                    console.log(`  >>> THIS IS A MONITORING NODE! Use this IP for TACACS logs if ADM01 fails.`);
                                }
                                resolve();
                            });
                        });
                    });
                }
                console.log(`\n--- DISCOVERY COMPLETE ---`);
            } catch (err) {
                console.error("Failed to parse ERS response:", err.message);
            }
        });
    }).on('error', (e) => {
        console.error(`Fatal Network Error: ${e.message}`);
    });
}

discoverNodes();
