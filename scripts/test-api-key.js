const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function verify() {
    const testIp = "8.8.8.8"; // Google DNS
    const apiKey = process.env.IPLOCATE_API_KEY;
    console.log("Checking API Key: ", apiKey ? "Configured" : "NOT CONFIGURED");
    
    if (!apiKey) {
        console.error("Error: IPLOCATE_API_KEY is not set in the .env file.");
        return;
    }

    const url = `https://iplocate.io/api/lookup/${testIp}?apikey=${apiKey}`;
    console.log(`Sending real query for ${testIp} to iplocate.io/api/lookup...`);

    try {
        const response = await fetch(url);
        console.log("Response Status:", response.status);
        if (response.ok) {
            const data = await response.json();
            console.log("\n✅ API Key verified successfully! Response Details:");
            console.log("-----------------------------------------");
            console.log("IP Address:   ", data.ip);
            console.log("Country:      ", data.country, `(${data.country_code})`);
            console.log("City:         ", data.city);
            console.log("Region/State: ", data.subdivision);
            console.log("Organization: ", data.org);
            console.log("Latitude:     ", data.latitude);
            console.log("Longitude:    ", data.longitude);
            console.log("Timezone:     ", data.time_zone);
            console.log("-----------------------------------------");
        } else {
            const text = await response.text();
            console.log("\n❌ Failed to resolve IP. API Error:", text);
        }
    } catch (e) {
        console.error("\n❌ Network error occurred:", e);
    }
}

verify();
