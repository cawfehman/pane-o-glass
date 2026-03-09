import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseStringPromise } from 'xml2js';
import { fetchIseSession } from '@/lib/ise';

export async function GET(req: Request) {
    const session = await auth();
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
        const fetchAuthStatus = async (mac: string) => {
            const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${mac}/86400/50/All`;
            const response = await fetch(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
            });
            if (!response.ok) return [];
            const xmlText = await response.text();
            const data = await parseStringPromise(xmlText, { explicitArray: false });
            let nodes = data.authStatusList?.authStatus || data.authStatus;
            if (!nodes) return [];
            return Array.isArray(nodes) ? nodes : [nodes];
        };

        await logAudit(
            'ISE_FAILURES_QUERY',
            `Searched ISE for Auth Failures associated with ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
            session.user.id,
            (session.user as any).ipAddress
        );

        if (searchType === "mac") {
            const nodes = await fetchAuthStatus(formattedQuery);
            const mappedResults = nodes.map((node: any) => ({
                timestamp: node.acs_timestamp?._ || node.acs_timestamp || "Unknown",
                user_name: node.user_name?._ || node.user_name || "Unknown",
                calling_station_id: node.calling_station_id?._ || node.calling_station_id || "Unknown",
                nas_ip_address: node.nas_ip_address?._ || node.nas_ip_address || "Unknown",
                nas_port_id: node.nas_port_id?._ || node.nas_port_id || "Unknown",
                failure_reason: node.failure_reason?._ || node.failure_reason || "Passed/Active",
                status: node.passed?._ || node.passed || (node.failure_reason ? "failed" : "passed"),
                authentication_method: node.authentication_method?._ || node.authentication_method || "Unknown",
                authentication_protocol: node.authentication_protocol?._ || node.authentication_protocol || "Unknown",
                acs_server: node.acs_server?._ || node.acs_server || "Unknown",
                nas_identifier: node.nas_identifier?._ || node.nas_identifier || "Unknown",
            }));
            
            const failures = mappedResults.filter(r => r.status === "false" || r.status === false || r.failure_reason !== "Passed/Active");
            failures.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return NextResponse.json({ found: failures.length > 0, failures, searchType: "mac" });
        } 
        else {
            // User Workflow - Discover ALL associated MAC addresses
            const macsToScan = new Set<string>();
            const userHistoryPayloads: any[] = [];
            
            // 1. Pull the massive ActiveList locally (what we did for Live Sessions)
            const activeSessionData = await fetchIseSession(formattedQuery);
            if (activeSessionData.found && activeSessionData.sessions) {
                activeSessionData.sessions.forEach((s: any) => {
                    if (s.calling_station_id) macsToScan.add(s.calling_station_id);
                });
            }

            // 2. Query the direct Session/UserName endpoint just in case the endpoint failed entirely and is disconnected
            try {
                const endpoint = `${url}/admin/API/mnt/Session/UserName/${encodeURIComponent(formattedQuery)}`;
                const response = await fetch(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
                });
                if (response.ok) {
                    const xmlText = await response.text();
                    const data = await parseStringPromise(xmlText, { explicitArray: false });
                    let nodes = data.sessionParameters || data.activeSession;
                    const nodesArr = Array.isArray(nodes) ? nodes : [nodes];
                    nodesArr.forEach((node: any) => {
                        if (node && (node.calling_station_id?._ || node.calling_station_id || node.callingStationId)) {
                             const mac = node.calling_station_id?._ || node.calling_station_id || node.callingStationId;
                             macsToScan.add(mac);
                             userHistoryPayloads.push(node);
                        }
                    });
                }
            } catch (e) { }

            if (macsToScan.size === 0) {
                return NextResponse.json({ found: false, failures: [], sessions: [] });
            }

            // Generate Discovery array showing summary of each MAC
            // We pull the AuthStatus for each harvested MAC so we can show the last seen time & connection properly!
            const summaryArray: any[] = [];
            
            await Promise.allSettled(Array.from(macsToScan).map(async (mac) => {
                const logs = await fetchAuthStatus(mac);
                let latestLog = logs.length > 0 ? logs[0] : null;
                
                // If the AuthStatus log doesn't exist but we harvested it from Username, use fallback
                if (!latestLog) {
                    latestLog = userHistoryPayloads.find(p => (p.calling_station_id?._ || p.calling_station_id || p.callingStationId) === mac);
                }

                if (latestLog) {
                    summaryArray.push({
                        mac,
                        timestamp: latestLog.acs_timestamp?._ || latestLog.acs_timestamp || latestLog.last_accounting_update?._ || latestLog.last_accounting_update || "Unknown",
                        nas_identifier: latestLog.nas_identifier?._ || latestLog.nas_identifier || "Unknown",
                    });
                } else {
                    summaryArray.push({ mac, timestamp: "Unknown", nas_identifier: "Unknown" });
                }
            }));
            
            // Sort summary newest first
            summaryArray.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return NextResponse.json({ found: summaryArray.length > 0, discovery: summaryArray, searchType: "user_name" });
        }

    } catch (e: any) {
        console.error("ISE Failures API error:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
