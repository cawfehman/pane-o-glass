const axios = require('axios');
const https = require('https');
require('dotenv').config();

async function scanFailuresForSignal() {
    const url = process.env.ISE_PAN_URL.replace(/^"|"$/g, '');
    const user = process.env.ISE_API_USER.replace(/^"|"$/g, '');
    const pass = process.env.ISE_API_PASSWORD.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`Scanning Failure logs for new signal attributes...`);
    try {
        const endpoint = `${url}/admin/API/mnt/Failure/All`;
        const res = await axios.get(endpoint, {
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
            httpsAgent: agent,
            timeout: 30000
        });

        const xml = res.data;
        const matches = xml.match(/<failureRecord>([\s\S]*?)<\/failureRecord>/g) || [];
        console.log(`Fetched ${matches.length} failure records.`);

        let matchCount = 0;

        for (const record of matches) {
            const isCooperEmployee = record.includes('CooperEmployee');
            const apMatch = record.match(/<network_device_name>(.*?)<\/network_device_name>/);
            const apName = apMatch ? apMatch[1] : '';
            const isNonKel = apName && !apName.toUpperCase().startsWith('KEL');

            if (isCooperEmployee && isNonKel) {
                matchCount++;
                const macMatch = record.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
                const mac = macMatch ? macMatch[1] : 'Unknown';
                
                console.log(`\n--- Found Target Failure: MAC ${mac} | AP: ${apName} ---`);
                
                const rawAttrs = record.match(/<other_attr_string>(.*?)<\/other_attr_string>/)?.[1] || '';
                const lowerRecord = record.toLowerCase();
                
                const signalFound = lowerRecord.includes('signal') || lowerRecord.includes('rssi') || lowerRecord.includes('snr') || lowerRecord.includes('airespace');
                const profilingFound = lowerRecord.includes('user-agent') || lowerRecord.includes('dhcp-class-identifier');

                console.log(`  Signal Data Found: ${signalFound}`);
                console.log(`  Profiling Data Found: ${profilingFound}`);

                if (signalFound || profilingFound || matchCount <= 3) {
                    console.log(`  Relevant Attributes:`);
                    rawAttrs.split(':!:').forEach(pair => {
                        const lp = pair.toLowerCase();
                        if (lp.includes('signal') || lp.includes('rssi') || lp.includes('snr') || lp.includes('airespace') || lp.includes('user-agent') || lp.includes('dhcp-class-identifier') || lp.includes('cisco-avpair')) {
                            console.log(`    ${pair}`);
                        }
                    });
                }
                
                if (matchCount >= 10) break;
            }
        }
        
        console.log(`\nScan Complete. Found ${matchCount} matching records.`);
        
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

scanFailuresForSignal();
