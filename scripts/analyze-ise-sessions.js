const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function analyzeSessions() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log("Downloading and analyzing 14,000+ sessions (this may take a moment)...");

    try {
        const response = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 30000
        });

        const xml = response.data;
        
        // Count total sessions
        const sessionCount = (xml.match(/<activeSession>/g) || []).length;
        console.log(`Total Active Sessions found: ${sessionCount}`);

        // Sample a few to see what the 'server' and 'protocol' look like
        const psns = {};
        const psnMatches = xml.match(/<server>(.*?)<\/server>/g);
        if (psnMatches) {
            psnMatches.forEach(m => {
                const name = m.replace(/<\/?server>/g, '');
                psns[name] = (psns[name] || 0) + 1;
            });
        }

        console.log("\nSession Distribution by PSN:");
        console.table(psns);

        // Decode the first session ID to check the date
        const firstIdMatch = xml.match(/<audit_session_id>(.{8})/);
        if (firstIdMatch) {
            const hexTime = firstIdMatch[1];
            const unixTime = parseInt(hexTime, 16);
            const date = new Date(unixTime * 1000);
            console.log(`\nDetected Session Timestamp: ${date.toISOString()} (from hex: ${hexTime})`);
            
            const now = new Date();
            if (now.getFullYear() - date.getFullYear() > 1) {
                console.log("!!! WARNING: These sessions appear to be from YEARS ago (Stale/Ghost sessions) !!!");
            }
        }

    } catch (e) {
        console.error(`Analysis failed: ${e.message}`);
    }
}

analyzeSessions();
