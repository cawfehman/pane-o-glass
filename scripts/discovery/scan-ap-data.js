const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function scanApData() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Use the main KEL WLC
    const nasIp = '172.18.163.99'; 

    console.log(`Fetching all sessions for NAS IP ${nasIp}...`);
    try {
        const wlcRes = await axios.get(`${url}/admin/API/mnt/Session/NASIPAddress/${nasIp}`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            maxContentLength: Infinity,
            timeout: 60000
        });
        
        const wlcXml = wlcRes.data;
        const wlcSessions = wlcXml.match(/<sessionParameters>([\s\S]*?)<\/sessionParameters>/g) || [];
        console.log(`Found ${wlcSessions.length} sessions on this WLC.`);
        
        let matchCount = 0;
        let signalMatches = 0;

        for (const s of wlcSessions) {
            const rawAttrs = s.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
            let calledStationId = '';
            rawAttrs.split(':!:').forEach(pair => {
                if (pair.startsWith('Called-Station-ID=')) {
                    calledStationId = pair.substring(18);
                }
            });

            // Parse AP Name
            let apName = calledStationId;
            let ssid = '';
            if (calledStationId.includes(':')) {
                const parts = calledStationId.split(':');
                if (parts.length >= 2 && !calledStationId.match(/^([0-9A-Fa-f]{2}[:-]){5}/)) {
                    apName = parts[0];
                    ssid = parts.slice(1).join(':');
                }
            }

            const isCooperEmployee = ssid === 'CooperEmployee' || s.includes('<wlan_ssid>CooperEmployee</wlan_ssid>');
            const isNonKelAp = apName && !apName.toUpperCase().startsWith('KEL');

            if (isCooperEmployee && isNonKelAp) {
                matchCount++;
                const lowerS = s.toLowerCase();
                const signalFound = lowerS.includes('signal') || lowerS.includes('rssi') || lowerS.includes('snr') || lowerS.includes('airespace');
                const profilingFound = lowerS.includes('user-agent') || lowerS.includes('dhcp-class-identifier');
                
                if (signalFound || profilingFound || matchCount <= 2) {
                    console.log(`\n--- Found Session ${matchCount}: AP ${apName} ---`);
                    console.log(`  Signal Data: ${signalFound}, Profiling: ${profilingFound}`);
                    if (signalFound || profilingFound) {
                        signalMatches++;
                        console.log(`  Attributes:`);
                        rawAttrs.split(':!:').forEach(pair => {
                            const lp = pair.toLowerCase();
                            if (lp.includes('signal') || lp.includes('rssi') || lp.includes('snr') || lp.includes('airespace') || lp.includes('user-agent') || lp.includes('dhcp-class-identifier') || lp.includes('cisco-avpair')) {
                                console.log(`    ${pair}`);
                            }
                        });
                    }
                }
            }
        }
        console.log(`\nScan Complete. Checked ${matchCount} CooperEmployee sessions on NON-KEL APs.`);
        console.log(`Found signal/profiling data in ${signalMatches} sessions.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

scanApData();
