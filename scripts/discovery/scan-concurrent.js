const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function scanConcurrent() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Scanning ActiveList...`);
    try {
        const res = await axios.get(`${url}/admin/API/mnt/Session/ActiveList`, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 20000
        });

        const activeXml = res.data;
        const macMatches = activeXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/g) || [];
        
        let macs = macMatches.map(m => m.match(/>(.*?)<\//)[1]).filter(m => m.includes(':') || m.includes('-'));
        // Shuffle the MACs to get a random sample across all PSNs/WLCs
        macs = macs.sort(() => 0.5 - Math.random()).slice(0, 2000);

        console.log(`Checking a random sample of ${macs.length} sessions...`);
        let matchCount = 0;
        let signalMatches = 0;
        let checked = 0;

        // Process in batches of 20
        for (let i = 0; i < macs.length; i += 20) {
            const batch = macs.slice(i, i + 20);
            await Promise.allSettled(batch.map(async (mac) => {
                try {
                    const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                        httpsAgent: agent,
                        timeout: 5000
                    });

                    const xml = detailRes.data;
                    const rawAttrs = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                    
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
                    
                    const isCooperEmployee = ssid === 'CooperEmployee' || xml.includes('<wlan_ssid>CooperEmployee</wlan_ssid>');
                    const isNonKel = apName && !apName.toUpperCase().startsWith('KEL');

                    if (isCooperEmployee && isNonKel) {
                        matchCount++;
                        console.log(`\n--- Found Target Session: MAC ${mac} | AP: ${apName} ---`);
                        
                        const lowerXml = xml.toLowerCase();
                        const signalFound = lowerXml.includes('signal') || lowerXml.includes('rssi') || lowerXml.includes('snr') || lowerXml.includes('airespace');
                        const profilingFound = lowerXml.includes('user-agent') || lowerXml.includes('dhcp-class-identifier');

                        console.log(`  Signal Data Found: ${signalFound}`);
                        console.log(`  Profiling Data Found: ${profilingFound}`);

                        if (signalFound || profilingFound || matchCount <= 3) {
                            const rawAttrs = xml.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                            console.log(`  Relevant Attributes:`);
                            rawAttrs.split(':!:').forEach(pair => {
                                const lp = pair.toLowerCase();
                                if (lp.includes('signal') || lp.includes('rssi') || lp.includes('snr') || lp.includes('airespace') || lp.includes('user-agent') || lp.includes('dhcp-class-identifier') || lp.includes('cisco-avpair')) {
                                    console.log(`    ${pair}`);
                                }
                            });
                        }
                    }
                } catch (e) {
                    // Ignore
                }
                checked++;
            }));
            process.stdout.write(`\rChecked ${checked}/${macs.length}... Found ${matchCount}`);
            if (matchCount >= 10) break;
        }
        
        console.log(`\nScan Complete.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

scanConcurrent();
