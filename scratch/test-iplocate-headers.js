const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function checkHeaders() {
    const apiKey = process.env.IPLOCATE_API_KEY;
    console.log("Checking iplocate.io headers with API Key:", apiKey ? "Configured" : "None");

    try {
        const res = await axios.get("https://www.iplocate.io/api/lookup/8.8.8.8", {
            headers: apiKey ? { "X-API-KEY": apiKey } : {},
            timeout: 5000
        });

        console.log("\nResponse Headers:");
        console.log(res.headers);
        console.log("\nResponse Data:");
        console.log(res.data);
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) {
            console.log("Status:", e.response.status);
            console.log("Headers:", e.response.headers);
        }
    }
}

checkHeaders();
