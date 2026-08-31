const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function checkQuota() {
    const clientId = process.env.CISCO_UMBRELLA_API_TOKEN;
    const clientSecret = process.env.CISCO_UMBRELLA_API_SECRET;

    const authHeader = "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch("https://api.umbrella.com/auth/v2/token", {
        method: "POST",
        headers: {
            "Authorization": authHeader,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "grant_type=client_credentials"
    });

    const data = await tokenRes.json();
    const testUrl = "https://api.umbrella.com/investigate/v2/domains/categorization/google.com?showLabels=true";
    const res = await fetch(testUrl, {
        headers: { "Authorization": `Bearer ${data.access_token}` }
    });

    console.log("=== ALL Cisco Umbrella Response Headers ===");
    res.headers.forEach((val, key) => {
        console.log(`${key}: ${val}`);
    });
}

checkQuota();
