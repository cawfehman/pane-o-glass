import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

async function probeOpenApi() {
    const rawUrl = process.env.ISE_PAN_URL;
    const rawUser = process.env.ISE_API_USER;
    const rawPass = process.env.ISE_API_PASSWORD;

    const baseUrl = rawUrl!.replace(/^"|"$/g, '').replace(/\/+$/, '');
    const user = rawUser!.replace(/^"|"$/g, '');
    const pass = rawPass!.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log("Checking OpenAPI endpoints with Basic Auth...");

    const endpoints = [
        "/api/swagger-ui/index.html",
        "/api/v1/endpoint",
        "/api/v1/deployment/node",
        "/api/v1/trustsec/security-group",
        "/api/v1/profiler/profile"
    ];

    for (const ep of endpoints) {
        try {
            const res = await axios.get(`${baseUrl}${ep}`, {
                headers: { 
                    "Authorization": `Basic ${basicAuth}`, 
                    "Accept": "application/json" 
                },
                httpsAgent: agent,
                timeout: 10000
            });
            console.log(`[SUCCESS] ${ep} -> Status ${res.status}`);
            const dataStr = typeof res.data === 'string' ? res.data.substring(0, 150) : JSON.stringify(res.data).substring(0, 150);
            console.log(`  Data: ${dataStr}`);
        } catch (err: any) {
            console.log(`[FAILED] ${ep} -> Status ${err.response?.status || 'ERR'} (${err.message})`);
            if (err.response?.data) {
                const errStr = typeof err.response.data === 'string' ? err.response.data.substring(0, 150) : JSON.stringify(err.response.data).substring(0, 150);
                console.log(`  Err: ${errStr}`);
            }
        }
    }
}

probeOpenApi().catch(console.error);
