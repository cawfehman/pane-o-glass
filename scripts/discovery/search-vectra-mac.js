const axios = require('axios');
require('dotenv').config();

async function searchVectra(mac) {
    const url = process.env.VECTRA_URL.replace(/^"|"$/g, '');
    const token = process.env.VECTRA_API_TOKEN.replace(/^"|"$/g, '');

    console.log(`Searching Vectra for MAC: ${mac}...`);
    try {
        const res = await axios.get(`${url}/api/v2.2/hosts`, {
            params: { name: mac },
            headers: { "Authorization": `Token ${token}` }
        });
        
        console.log(`Success! Status: ${res.status}`);
        console.log(`Found ${res.data.results.length} results.`);
        if (res.data.results.length > 0) {
            console.log(JSON.stringify(res.data.results[0], null, 2));
        }
    } catch (e) {
        console.error(`Vectra search failed: ${e.message}`);
    }
}

searchVectra("12:f0:4f:1a:ed:d2");
