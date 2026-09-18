import axios from 'axios';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

async function probeIse35() {
    const rawUrl = process.env.ISE_PAN_URL;
    const rawUser = process.env.ISE_API_USER;
    const rawPass = process.env.ISE_API_PASSWORD;

    if (!rawUrl || !rawUser || !rawPass) {
        console.error("Missing ISE credentials in .env");
        return;
    }

    const baseUrl = rawUrl.replace(/^"|"$/g, '').replace(/\/+$/, '');
    const user = rawUser.replace(/^"|"$/g, '');
    const pass = rawPass.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
    const agent = new https.Agent({ rejectUnauthorized: false });

    console.log(`=======================================================`);
    console.log(`Cisco ISE 3.5 Patch 4 Non-Destructive Probe`);
    console.log(`Target: ${baseUrl} (PAN: ise-adm02)`);
    console.log(`User:   ${user}`);
    console.log(`=======================================================\n`);

    const tests = [
        {
            name: "1. MnT API Version (/admin/API/mnt/Version)",
            url: `${baseUrl}/admin/API/mnt/Version`,
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
        },
        {
            name: "2. OpenAPI Swagger UI (/api/swagger-ui/index.html)",
            url: `${baseUrl}/api/swagger-ui/index.html`,
            headers: { "Accept": "text/html" }
        },
        {
            name: "3. ERS over API Gateway Port 443 (/ers/config/node)",
            url: `${baseUrl}/ers/config/node`,
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" }
        },
        {
            name: "4. ERS over Legacy Port 9060 (:9060/ers/config/node)",
            url: `${baseUrl.replace(':8443', '')}:9060/ers/config/node`,
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" }
        },
        {
            name: "5. ERS Endpoints Query over Port 443 (/ers/config/endpoint?size=2)",
            url: `${baseUrl}/ers/config/endpoint?size=2`,
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" }
        },
        {
            name: "6. MnT Active Sessions Quick Check (/admin/API/mnt/Session/ActiveList)",
            url: `${baseUrl}/admin/API/mnt/Session/ActiveList`,
            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" }
        }
    ];

    for (const test of tests) {
        console.log(`--> Testing: ${test.name}`);
        console.log(`    URL: ${test.url}`);
        const t0 = Date.now();
        try {
            const res = await axios.get(test.url, {
                headers: test.headers,
                httpsAgent: agent,
                timeout: 15000
            });
            const elapsed = Date.now() - t0;
            console.log(`    [SUCCESS] Status: ${res.status} (${elapsed}ms)`);

            let snippet = "";
            if (typeof res.data === 'string') {
                snippet = res.data.substring(0, 200).replace(/\s+/g, ' ');
            } else if (typeof res.data === 'object') {
                snippet = JSON.stringify(res.data).substring(0, 200);
            }
            console.log(`    Preview: ${snippet}...\n`);
        } catch (err: any) {
            const elapsed = Date.now() - t0;
            const status = err.response?.status || "ERROR";
            console.log(`    [FAILED] Status: ${status} (${elapsed}ms) - ${err.message}`);
            if (err.response?.data) {
                const errSnippet = typeof err.response.data === 'string'
                    ? err.response.data.substring(0, 200).replace(/\s+/g, ' ')
                    : JSON.stringify(err.response.data).substring(0, 200);
                console.log(`    Response: ${errSnippet}`);
            }
            console.log("");
        }
    }

    console.log(`=======================================================`);
    console.log(`Probe Complete`);
    console.log(`=======================================================`);
}

probeIse35().catch(console.error);
