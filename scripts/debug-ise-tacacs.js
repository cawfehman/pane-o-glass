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

async function profileSessions() {
    console.log(`\n--- ISE 3.3 SESSION PROFILER (v1.9.5) ---`);
    console.log(`Target: ${urlStr}`);
    
    const endpoint = `${urlStr}/admin/API/mnt/Session/ActiveList?service=TACACS`;
    
    const options = {
        headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Accept": "application/xml"
        },
        timeout: 15000,
        rejectUnauthorized: false
    };

    https.get(endpoint, options, (res) => {
        let body = '';
        res.on('data', d => body += d);
        res.on('end', () => {
            console.log(`Status: ${res.statusCode}`);
            if (res.statusCode === 200) {
                console.log(`\nAnalyzing ${body.length} bytes of session data...`);
                
                // Aggregation by Server
                const serverCounts = {};
                const serverRegex = /<server>(.*?)<\/server>/g;
                let match;
                while ((match = serverRegex.exec(body)) !== null) {
                    const server = match[1];
                    serverCounts[server] = (serverCounts[server] || 0) + 1;
                }
                
                console.log("\n--- CLUSTER LOAD DISTRIBUTION ---");
                Object.entries(serverCounts)
                    .sort(([,a], [,b]) => b - a)
                    .forEach(([server, count]) => {
                        console.log(`[${server}]: ${count} active sessions`);
                    });
                
                // Detailed Sample extraction for PSN03/04
                console.log("\n--- NATIVE TACACS NODE SAMPLES ---");
                const sessionRegex = /<activeSession>(.*?)<\/activeSession>/gs;
                let sessionMatch;
                let samplesFound = 0;
                
                while ((sessionMatch = sessionRegex.exec(body)) !== null && samplesFound < 5) {
                    const sessionXml = sessionMatch[1];
                    if (sessionXml.toLowerCase().includes('psn03') || sessionXml.toLowerCase().includes('psn04')) {
                        console.log(`\n[SAMPLE #${++samplesFound}]`);
                        console.log(sessionXml.trim());
                    }
                }
                
                if (samplesFound === 0) {
                    console.log("No sessions found on PSN03 or PSN04 in the current ActiveList.");
                }

            } else {
                console.log(`Error Response: ${body.substring(0, 500)}`);
            }
        });
    }).on('error', (e) => {
        console.error(`Fatal Network Error: ${e.message}`);
    });
}

profileSessions();
