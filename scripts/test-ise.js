const dotenv = require('dotenv');
const url = require('url');

dotenv.config({ path: '.env' });

const iseUrl = process.env.ISE_PAN_URL;
const user = process.env.ISE_API_USER;
const pass = process.env.ISE_API_PASSWORD;

if (!iseUrl || !user || !pass) {
    console.error("Missing .env variables");
    process.exit(1);
}

const query = process.argv[2] || "testuser";
const searchType = "user_name";

console.log(`Testing ISE API...`);
console.log(`URL: ${iseUrl}`);
console.log(`User: ${user}`);
console.log(`Query: ${query}`);

const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
const endpoint = `${iseUrl}/admin/API/mnt/Session/UserName/${encodeURIComponent(query)}`;

console.log(`Endpoint: ${endpoint}`);

fetch(endpoint, {
    method: "GET",
    headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Accept": "application/xml"
    }
})
    .then(async res => {
        console.log(`\nStatus Code: ${res.status}`);
        console.log(`Headers:`, JSON.stringify(Object.fromEntries(res.headers.entries()), null, 2));
        const text = await res.text();
        console.log(`\nResponse Body:\n${text}`);
    })
    .catch(err => {
        console.error("Fetch Error:", err);
    });
