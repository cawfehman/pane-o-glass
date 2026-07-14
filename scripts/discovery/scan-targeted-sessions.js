const axios = require('axios');
const https = require('https');
const { parseStringPromise } = require('xml2js');
require('dotenv').config();

async function scanTargetedSessions() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Scanning ActiveList for Targeted Sessions (CooperEmployee, Non-KEL)...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const activeXml = res.data;
        const macMatches = activeXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/g) || [];
        
        let checkedCount = 0;
        let matchCount = 0;

        for (const macTag of macMatches) {
            if (checkedCount >= 2000) break; // Increased limit to 2000
            
            const mac = macTag.match(/>(.*?)<\//)[1];
            if (!mac.includes(':') && !mac.includes('-')) continue; // Skip if not a MAC

            try {
                const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 5000
                });

                const xml = detailRes.data;
                const rawAttrs = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                const apNameMatch = xml.match(/<network_device_name>(.*?)<\/network_device_name>/)?.[1] || '';
                
                // Parse other_attr_string to get Called-Station-ID
                let calledStationId = '';
                rawAttrs.split(':!:').forEach(pair => {
                    if (pair.startsWith('Called-Station-ID=')) {
                        calledStationId = pair.substring(18);
                    }
                });

                // Check criteria: CooperEmployee and NOT KEL
                const isCooperEmployee = calledStationId.includes('CooperEmployee') || xml.includes('<wlan_ssid>CooperEmployee</wlan_ssid>');
                const isNonKel = apNameMatch && !apNameMatch.toUpperCase().startsWith('KEL');

                if (isCooperEmployee && isNonKel) {
                    matchCount++;
                    console.log(`\n--- Found CooperEmployee Session: MAC ${mac} | AP: ${apNameMatch} ---`);
                    
                    const lowerXml = xml.toLowerCase();
                    const signalFound = lowerXml.includes('signal') || lowerXml.includes('rssi') || lowerXml.includes('snr') || lowerXml.includes('airespace');
                    const profilingFound = lowerXml.includes('user-agent') || lowerXml.includes('dhcp-class-identifier');

                    console.log(`  Signal Data Found: ${signalFound}`);
                    console.log(`  Profiling Data Found: ${profilingFound}`);

                    if (signalFound || profilingFound || true) { // Always print some context for the first few
                        console.log(`  Relevant Attributes extracted from other_attr_string:`);
                        rawAttrs.split(':!:').forEach(pair => {
                            const lowerPair = pair.toLowerCase();
                            if (lowerPair.includes('signal') || lowerPair.includes('rssi') || lowerPair.includes('snr') || lowerPair.includes('airespace') || lowerPair.includes('user-agent') || lowerPair.includes('dhcp-class-identifier') || lowerPair.includes('cisco-avpair')) {
                                console.log(`    ${pair}`);
                            }
                        });
                    }
                    if (matchCount >= 10) break; // Get up to 10 examples
                }
            } catch (e) {
                // Ignore individual fetch errors
            }
            checkedCount++;
        }
        
        console.log(`\nScan Complete. Checked ${checkedCount} active sessions. Found ${matchCount} matching targeted criteria.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

scanTargetedSessions();
