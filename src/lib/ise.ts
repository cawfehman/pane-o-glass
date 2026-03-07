export async function fetchIseSession(query: string) {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        throw new Error("ISE Credentials not configured in .env");
    }

    // Determine query type (IP vs MAC vs Username)
    let filterProp = "user-name";
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(query)) {
        filterProp = "framed_ip_address";
    } else if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query) || /^[0-9A-Fa-f]{12}$/.test(query)) {
        filterProp = "calling_station_id";
        // Normalize MAC to XX:XX:XX:XX:XX:XX which ISE usually prefers
        if (query.length === 12) {
            query = query.match(/.{1,2}/g)?.join(":") || query;
        } else {
            query = query.replace(/-/g, ":");
        }
    }

    // ISE ERS API uses Basic Auth
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

    // Endpoint: /ers/config/session?filter={property}.EQ.{value}
    const endpoint = `${url}/ers/config/session?filter=${filterProp}.EQ.${query}`;

    try {
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/json",
            },
            // ISE typically uses a self-signed cert on the management interface, NextJS needs this if not behind proxy
            // NOTE: fetch natively in Node 18+ might still reject self-signed certs. 
            // Setting NODE_TLS_REJECT_UNAUTHORIZED="0" in .env might be required if self-signed.
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error("ISE Authentication Failed (401)");
            if (response.status === 403) throw new Error("ISE Authorization Failed - Check ERS Admin role (403)");
            throw new Error(`ISE API HTTP Error: ${response.status}`);
        }

        const data = await response.json();

        // ERS API returns SearchResult
        if (!data.SearchResult || !data.SearchResult.resources || data.SearchResult.resources.length === 0) {
            return { found: false, message: "No active session found for query." };
        }

        // Fetch detailed session for the first result
        const sessionId = data.SearchResult.resources[0].id;
        const detailsEndpoint = `${url}/ers/config/session/${sessionId}`;

        const detailsRes = await fetch(detailsEndpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/json",
            }
        });

        if (!detailsRes.ok) {
            throw new Error("Failed to fetch session details after ID lookup");
        }

        const sessionDetails = await detailsRes.json();
        return {
            found: true,
            session: sessionDetails.Session
        };

    } catch (e: any) {
        console.error("ISE fetch error:", e);
        throw new Error(e.message || "Failed to communicate with Cisco ISE");
    }
}
