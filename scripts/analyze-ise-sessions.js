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
        // Format is: [IP Prefix (8 chars)][Unique/Time (8 chars)][...]
        const allIds = xml.match(/<audit_session_id>(.{16})/g) || [];
        let newest = 0;
        let oldest = Infinity;

        allIds.forEach(m => {
            const hex = m.replace('<audit_session_id>', '').substring(8, 16);
            const time = parseInt(hex, 16);
            if (time > newest) newest = time;
            if (time < oldest) oldest = time;
        });

        if (newest > 0) {
            console.log(`\nDeployment Timeline Check (Raw Counters):`);
            console.log(`  Oldest Counter: ${oldest}`);
            console.log(`  Newest Counter: ${newest}`);
            
            // In ISE, this counter is often 'seconds since service start' or a sequence
            const diff = newest - oldest;
            console.log(`  Span of sessions: ${diff} units (Seconds or Sequence)`);
            
            if (diff === 0 && allIds.length > 100) {
                console.log("\n!!! WARNING: All 14,000 sessions have the SAME timestamp. Database might be frozen. !!!");
            }
        }

    } catch (e) {
        console.error(`Analysis failed: ${e.message}`);
    }
}

analyzeSessions();
