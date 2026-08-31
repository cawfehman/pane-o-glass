const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testBatchPost() {
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
    console.log("Acquired token! Testing POST batch categorization for 5 domains in 1 HTTP call...");

    const domains = ["google.com", "ebgaffiliates.com", "fonts.gstatic.com", "phishing-test-site.xyz", "microsoft.com"];

    const batchRes = await fetch("https://api.umbrella.com/investigate/v2/domains/categorization?showLabels=true", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${data.access_token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(domains)
    });

    console.log("Batch POST Status:", batchRes.status);
    if (batchRes.ok) {
        const batchData = await batchRes.json();
        console.log("Batch Result Keys returned:", Object.keys(batchData));
        console.log("Sample Data:", JSON.stringify(batchData, null, 2));
    } else {
        console.error("Batch POST Error:", await batchRes.text());
    }
}

testBatchPost();
