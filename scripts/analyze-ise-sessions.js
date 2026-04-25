const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function analyzeSessions() {
    const url = process.argv[2] || process.env.ISE_PAN_URL;
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

        // Scan ALL sessions to find the Newest and Oldest
        const allIds = xml.match(/<audit_session_id>(.{8})/g) || [];
        let newest = 0;
        let oldest = Infinity;

        allIds.forEach(m => {
            const hex = m.replace('<audit_session_id>', '');
            const time = parseInt(hex, 16);
            if (time > newest) newest = time;
            if (time < oldest) oldest = time;
        });

        if (newest > 0) {
            const newestDate = new Date(newest * 1000);
            const oldestDate = new Date(oldest * 1000);
            console.log(`\nDeployment Timeline Check:`);
            console.log(`  Oldest Active Session: ${oldestDate.toISOString()}`);
            console.log(`  Newest Active Session: ${newestDate.toISOString()}`);
            
            const now = new Date();
            const diffDays = Math.floor((now - newestDate) / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
                console.log(`\n!!! CRITICAL: The "Newest" session is ${diffDays} days old !!!`);
                console.log(`    This means ISE has not recorded a new session since ${newestDate.toDateString()}.`);
            } else {
                console.log(`\nSuccess: Found sessions from today!`);
            }
        }

    } catch (e) {
        console.error(`Analysis failed: ${e.message}`);
    }
}

analyzeSessions();
