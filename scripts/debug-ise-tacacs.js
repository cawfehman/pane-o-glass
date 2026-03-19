const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

function debugTacacs() {
    const urlStr = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!urlStr || !user || !pass) {
        console.error("ERROR: ISE Credentials not found in .env");
        process.exit(1);
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    
    // Test the "All" endpoint
    const endpoint = `${urlStr}/admin/API/mnt/TACACS/AuthStatus/All/604800/10/All`;
    
    console.log(`\n--- ISE MnT DEBUG DIAGNOSTIC (STABILIZATION v1.6.9) ---`);
    console.log(`Targeting Endpoint: ${endpoint}`);
    
    const options = {
        headers: {
            "Authorization": `Basic ${basicAuth}`,
            "Accept": "application/xml"
        },
        rejectUnauthorized: false // MnT certificates are often self-signed
    };

    https.get(endpoint, options, (res) => {
        console.log(`Response Status: ${res.statusCode} ${res.statusMessage}`);
        
        let xml = '';
        res.on('data', (chunk) => { xml += chunk; });
        res.on('end', () => {
            console.log(`Response Payload Length: ${xml.length} bytes`);
            console.log(`\n--- RAW XML PAYLOAD ---`);
            console.log(xml.substring(0, 10000));
            console.log(`\n--- END OF PAYLOAD ---`);
        });
    }).on('error', (e) => {
        console.error(`\nFATAL NETWORK ERROR: ${e.message}`);
    });
}

debugTacacs();
