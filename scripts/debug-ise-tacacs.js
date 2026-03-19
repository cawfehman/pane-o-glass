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

async function scrubSessions() {
    console.log(`\n--- ISE 3.3 SESSION SCRUBBER (v1.9.2) ---`);
    console.log(`Querying: ${urlStr}`);
    
    const endpoint = `${urlStr}/admin/API/mnt/Session/ActiveList?service=TACACS`;
    
    const options = {
        headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Accept": "application/xml"
        },
        timeout: 10000,
        rejectUnauthorized: false
    };

    https.get(endpoint, options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            if (res.statusCode === 200) {
                // We want the RAW XML to find the protocol tags
                console.log("\n--- RAW XML PREVIEW (FIRST 2000 chars) ---");
                console.log(body.substring(0, 2000));
                
                console.log("\n--- TAG DISCOVERY ---");
                const tags = ["protocol", "service", "auth_type", "nas_port_type", "network_device_name"];
                tags.forEach(tag => {
                    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
                    const matches = [...body.matchAll(regex)];
                    if (matches.length > 0) {
                        console.log(`Found <${tag}>: ${matches[0][1]} (Example from first match)`);
                    }
                });
            } else {
                console.log(`Error Response: ${body}`);
            }
        });
    }).on('error', (e) => {
        console.error(`Fatal Network Error: ${e.message}`);
    });
}

scrubSessions();
