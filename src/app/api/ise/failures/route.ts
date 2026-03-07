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
            // New logic: Search for recent sessions by Username to discover MACs
            endpoint = `${url}/admin/API/mnt/Session/UserName/${encodeURIComponent(formattedQuery)}`;
        }

        await logAudit(
            'ISE_FAILURES_QUERY',
            `Searched ISE for Auth Failures associated with ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
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
                return NextResponse.json({ found: false, failures: [], sessions: [] });
            }
            if (response.status === 401) throw new Error("ISE Authentication Failed (401)");
            throw new Error(`ISE API returned ${response.status}`);
        }

        const xmlText = await response.text();
        const data = await parseStringPromise(xmlText, { explicitArray: false });

        let nodes = data.authStatusList?.authStatus || data.authStatus || data.sessionParameters || data.activeSession;
        if (!nodes && data.activeList && data.activeList.activeSession) {
            nodes = data.activeList.activeSession;
        }

        if (!nodes) {
            return NextResponse.json({ found: false, failures: [], sessions: [] });
        }

        const nodesArray = Array.isArray(nodes) ? nodes : [nodes];

        const mappedResults = nodesArray.map((node: any) => ({
            timestamp: node.acs_timestamp?._ || node.acs_timestamp || node.last_accounting_update?._ || node.last_accounting_update || "Unknown",
            user_name: node.user_name?._ || node.user_name || node.userName || "Unknown",
            calling_station_id: node.calling_station_id?._ || node.calling_station_id || node.callingStationId || "Unknown",
            nas_ip_address: node.nas_ip_address?._ || node.nas_ip_address || node.nasIpAddress || "Unknown",
            nas_port_id: node.nas_port_id?._ || node.nas_port_id || node.nasPortId || "Unknown",
            failure_reason: node.failure_reason?._ || node.failure_reason || "Passed/Active",
            status: node.passed?._ || node.passed || (node.failure_reason ? "failed" : "passed"),
            authentication_method: node.authentication_method?._ || node.authentication_method || "Unknown",
            authentication_protocol: node.authentication_protocol?._ || node.authentication_protocol || "Unknown",
            acs_server: node.acs_server?._ || node.acs_server || "Unknown",
            nas_identifier: node.nas_identifier?._ || node.nas_identifier || "Unknown",
        }));

        // Sort by timestamp desc
        mappedResults.sort((a, b) => {
            if (a.timestamp === "Unknown" || b.timestamp === "Unknown") return 0;
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        });

        // For MAC searches, we strictly return "failures" (passed=false)
        // For USER searches, we return everything as "sessions" for discovery
        if (searchType === "mac") {
            const failures = mappedResults.filter(r => r.status === "false" || r.status === false || r.failure_reason !== "Passed/Active");
            return NextResponse.json({ found: failures.length > 0, failures, searchType: "mac" });
        } else {
            // Deduplicate MACs for the user discovery view
            const uniqueMacs = Array.from(new Set(mappedResults.map(r => r.calling_station_id)));
            const summary = uniqueMacs.map(mac => {
                const latest = mappedResults.find(r => r.calling_station_id === mac);
                return { ...latest, mac };
            });
            return NextResponse.json({ found: summary.length > 0, discovery: summary, searchType: "user_name" });
        }

    } catch (e: any) {
        console.error("ISE Failures API error:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
