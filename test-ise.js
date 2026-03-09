const fs = require('fs');
const envStr = fs.readFileSync('.env', 'utf8').replace(/\r/g, '');
const env = envStr.split('\n').reduce((acc, line) => {
    const match = line.match(/^([^=]+)="?(.*?)"?$/);
    if (match) acc[match[1]] = match[2].trim();
    return acc;
}, {});

const url = env.ISE_PAN_URL;
const user = env.ISE_API_USER;
const pass = env.ISE_API_PASSWORD;

async function test() {
    console.log("URL:", url);
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    
    // We want to pull down the list of MAC addresses
    // What if we pull the ActiveList?
    const endpoint = `${url}/admin/API/mnt/Session/ActiveList`;
    
    console.log(`\nHitting ${endpoint}...`);
    try {
        const res = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/xml"
            }
        });
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response Snippet:", text.substring(0, 300));
    } catch (e) {
        console.error(e.message);
    }
}

test();
