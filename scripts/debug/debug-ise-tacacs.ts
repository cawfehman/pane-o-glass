import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

async function debugTacacs() {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        console.error("ERROR: ISE Credentials not found in .env");
        process.exit(1);
    }

    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    
    // Test the "All" endpoint
    const endpoint = `${url}/admin/API/mnt/TACACS/AuthStatus/All/604800/10/All`;
    
    console.log(`\n--- ISE MnT DEBUG DIAGNOSTIC ---`);
    console.log(`Targeting Endpoint: ${endpoint}`);
    console.log(`Authorization: Basic [REDACTED]`);
    
    try {
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/xml"
            }
        });

        console.log(`Response Status: ${response.status} ${response.statusText}`);
        
        const xml = await response.text();
        console.log(`Response Payload Length: ${xml.length} bytes`);
        
        console.log(`\n--- RAW XML PAYLOAD (First 5000 chars) ---`);
        console.log(xml.substring(0, 5000));
        console.log(`\n--- END OF PAYLOAD ---`);

        if (xml.length < 200) {
            console.log("\nWARNING: Payload looks surprisingly small. Check if TACACS is enabled in MnT.");
        }

    } catch (e: any) {
        console.error(`\nFATAL NETWORK ERROR: ${e.message}`);
        console.error(e);
    }
}

debugTacacs();
