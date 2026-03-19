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
    console.log(`\n--- ISE TOPOLOGY DISCOVERY (v1.8.6) ---`);
    console.log(`Querying Primary Node: ${urlStr}`);
    
    // ERS Node API
    const endpoint = `${urlStr}/ers/config/node`;
    
    const options = {
        headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Accept": "application/json"
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
                
                console.log(`\nFound ${nodes.length} nodes in deployment.`);
                
                if (nodes.length > 0) {
                    console.log(`\n--- RAW SCHEMA CAPTURE (Node 1) ---`);
                    const nodeRef = nodes[0];
                    await new Promise((resolve) => {
                        https.get(nodeRef.link.href, options, (nodeRes) => {
                            let nodeBody = '';
                            nodeRes.on('data', d => nodeBody += d);
                            nodeRes.on('end', () => {
                                console.log(JSON.stringify(JSON.parse(nodeBody), null, 2));
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
