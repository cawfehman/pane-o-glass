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

        // Check for any mention of RADIUS vs PassiveID
        // In the ActiveList, we look for tags that indicate the method
        const hasRadius = xml.includes('RADIUS') || xml.includes('Dot1x');
        const hasPassive = xml.includes('PassiveID') || xml.includes('Passive');
        
        console.log(`\nEvidence of RADIUS: ${hasRadius}`);
        console.log(`Evidence of PassiveID: ${hasPassive}`);

    } catch (e) {
        console.error(`Analysis failed: ${e.message}`);
    }
}

analyzeSessions();
