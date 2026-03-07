import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseStringPromise } from 'xml2js';

export async function GET(req: Request) {
    const session = await auth(req as any, {} as any);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

    // Determine query type
    let searchType = "user_name";
    let formattedQuery = query;
    if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query) || /^[0-9A-Fa-f]{12}$/.test(query)) {
        searchType = "mac";
        if (query.length === 12) {
            formattedQuery = query.match(/.{1,2}/g)?.join(":") || query;
        } else {
            formattedQuery = query.replace(/-/g, ":");
        }
        formattedQuery = formattedQuery.toUpperCase();
    }

    try {
        const url = process.env.ISE_PAN_URL;
        const user = process.env.ISE_API_USER;
        const pass = process.env.ISE_API_PASSWORD;

        if (!url || !user || !pass) {
            throw new Error("ISE Credentials not configured in .env");
        }

        const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
        let endpoint = "";

        if (searchType === "mac") {
            // MnT API call for AuthStatus by MAC. 86400s = 24 hours. Max 50 records.
            endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${formattedQuery}/86400/50/All`;
        } else {
            // ISE's AuthStatus endpoint is primarily MAC-driven for comprehensive failure logs.
            return NextResponse.json({ error: 'Authentication failure lookups require the MAC Address of the failing endpoint.' }, { status: 400 });
        }

        await logAudit(
            'ISE_FAILURES_QUERY',
            `Searched ISE for Auth Failures associated with MAC: ${formattedQuery}`,
            session.user.id,
            (session.user as any).ipAddress
        );

        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/xml"
            }
        });

        if (!response.ok) {
            if (response.status === 404 || response.status === 500) {
                return NextResponse.json({ found: false, failures: [] });
            }
            if (response.status === 401) throw new Error("ISE Authentication Failed (401)");
            throw new Error(`ISE API returned ${response.status}`);
        }

        const xmlText = await response.text();
        const data = await parseStringPromise(xmlText, { explicitArray: false });

        let authNodes = data.authStatusList?.authStatus || data.authStatus;
        if (!authNodes) {
            return NextResponse.json({ found: false, failures: [] });
        }

        const authArray = Array.isArray(authNodes) ? authNodes : [authNodes];

        // Filter for failures (passed = false)
        const failedAuths = authArray.filter((node: any) => {
            const passed = node.passed?._ || node.passed;
            return passed === "false" || passed === false || node.failure_reason;
        });

        const mappedFailures = failedAuths.map((node: any) => ({
            timestamp: node.acs_timestamp?._ || node.acs_timestamp || "Unknown",
            user_name: node.user_name?._ || node.user_name || "Unknown",
            calling_station_id: node.calling_station_id?._ || node.calling_station_id || "Unknown",
            nas_ip_address: node.nas_ip_address?._ || node.nas_ip_address || "Unknown",
            nas_port_id: node.nas_port_id?._ || node.nas_port_id || "Unknown",
            failure_reason: node.failure_reason?._ || node.failure_reason || "Unknown",
            authentication_method: node.authentication_method?._ || node.authentication_method || "Unknown",
            authentication_protocol: node.authentication_protocol?._ || node.authentication_protocol || "Unknown",
            acs_server: node.acs_server?._ || node.acs_server || "Unknown",
            nas_identifier: node.nas_identifier?._ || node.nas_identifier || "Unknown",
        }));

        // Sort by timestamp desc (most recent first) if they are valid dates
        mappedFailures.sort((a, b) => {
            if (a.timestamp === "Unknown" || b.timestamp === "Unknown") return 0;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        return NextResponse.json({ found: mappedFailures.length > 0, failures: mappedFailures });

    } catch (e: any) {
        console.error("ISE Failures API error:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
