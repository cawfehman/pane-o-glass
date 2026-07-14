const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function analyzeAuthHistory(mac) {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Analyzing Auth History for MAC: ${mac}...`);
    try {
        const ep = `/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/50/All`;
        const res = await axios.get(`${url}${ep}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 10000
        });

        const xml = res.data;
        const regex = /<authStatusElements>([\s\S]*?)<\/authStatusElements>/g;
        const matches = xml.match(regex) || [];
        
        console.log(`Found ${matches.length} authentication events in the last 24h.`);
        
        for (const m of matches) {
            const time = m.match(/<acs_timestamp>(.*?)<\/acs_timestamp>/)?.[1];
            // Check for both possible formats of the passed tag
            const passed = m.includes('<passed>true</passed>') || m.includes('passed="true"') || m.includes('>passed<') === false; 
            const reason = m.match(/<failure_reason>(.*?)<\/failure_reason>/)?.[1] || "N/A";
            const server = m.match(/<acs_server>(.*?)<\/acs_server>/)?.[1];
            const userName = m.match(/<user_name>(.*?)<\/user_name>/)?.[1];
            
            console.log(`- [${time}] Passed: ${passed} | User: ${userName} | Server: ${server} | Reason: ${reason}`);
            if (m.includes('<failure_reason>')) {
                console.log(`  FULL REASON: ${reason}`);
            }
        }
    } catch (e) {
        console.log(`Failed: ${e.message}`);
    }
}

analyzeAuthHistory("76:AB:0A:71:DD:0A");
