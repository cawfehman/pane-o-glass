import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission, logSystemEvent } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession } from '@/lib/ise';

export async function GET(req: Request) {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session?.user || !(await hasPermission(role, 'ise-failures'))) {
        return NextResponse.json({ error: 'Forbidden: Access to this tool is restricted.' }, { status: 403 });
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
            const tryFormat = async (formattedMac: string) => {
                const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${formattedMac}/86400/50/All`;
                await logSystemEvent(`[ISE-DEBUG] Querying: ${endpoint}`);
                const response = await fetch(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
                });
                await logSystemEvent(`[ISE-DEBUG] Response Status: ${response.status}`);
                if (!response.ok) {
                    const errText = await response.text();
                    await logSystemEvent(`[ISE-DEBUG] API error: ${errText}`);
                    return [];
                }
                const xmlText = await response.text();
                await logSystemEvent(`[ISE-DEBUG] Raw XML Length: ${xmlText.length}`);
                await logSystemEvent(`[ISE-DEBUG] XML Snippet: ${xmlText.substring(0, 500).replace(/</g, "&lt;").replace(/>/g, "&gt;")}`);
                
                const data = await parseStringPromise(xmlText, { 
                    explicitArray: false,
                    tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
                });
                
                // The snippet shows authStatusOutputList -> authStatusList -> authStatusElements
                let rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList?.authStatus || data.authStatus;
                
                if (!rawNodes) return [];
                const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
                
                // Map to the actual data payloads (authStatusElements)
                const processedNodes = nodesArray.map(n => n.authStatusElements || n);
                await logSystemEvent(`[ISE-DEBUG] Found Nodes: ${processedNodes.length}`);
                return processedNodes;
            };

            // Try Colons first
            let nodes = await tryFormat(mac);
            
            // If nothing found, try Dashes
            if (nodes.length === 0) {
                const dashed = mac.replace(/:/g, "-");
                await logSystemEvent(`[ISE-DEBUG] Colons returned 0. Retrying with Dashes: ${dashed}`);
                nodes = await tryFormat(dashed);
            }

            return nodes;
        };

        await logSystemEvent(`[ISE-DEBUG] Starting ${searchType} search for: ${formattedQuery}`);
        await logAudit(
            'ISE_DIAGNOSTICS_QUERY',
            `Searched ISE diagnostics for ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
            session.user.id,
            (session.user as any).ipAddress
        );

        if (searchType === "mac") {
            const nodes = await fetchAuthStatus(formattedQuery);
            const mappedResults = nodes.map((node: any) => {
                // Parse steps if they exist
                let steps: any[] = [];
                const stepsList = node.steps?.step;
                if (stepsList) {
                    const stepArr = Array.isArray(stepsList) ? stepsList : [stepsList];
                    steps = stepArr.map((s: any) => ({
                        id: s.id?._ || s.id || "Unknown",
                        description: s.description?._ || s.description || "Unknown"
                    }));
                }

                return {
                    timestamp: node.acs_timestamp?._ || node.acs_timestamp || node.acsTimestamp || "Unknown",
                    user_name: node.user_name?._ || node.user_name || node.userName || "Unknown",
                    calling_station_id: node.calling_station_id?._ || node.calling_station_id || node.callingStationId || "Unknown",
                    nas_ip_address: node.nas_ip_address?._ || node.nas_ip_address || node.nasIpAddress || "Unknown",
                    nas_port_id: node.nas_port_id?._ || node.nas_port_id || node.nasPortId || "Unknown",
                    failure_reason: node.failure_reason?._ || node.failure_reason || node.failureReason || "Passed/Active",
                    failure_id: node.failure_id?._ || node.failure_id || node.failureId || "N/A",
                    status: node.passed?._ === "true" || node.passed === "true" || node.passed === true || (!node.failure_reason && node.passed !== "false" && node.passed !== false),
                    authentication_method: node.authentication_method?._ || node.authentication_method || node.authenticationMethod || "Unknown",
                    authentication_protocol: node.authentication_protocol?._ || node.authentication_protocol || node.authenticationProtocol || "Unknown",
                    acs_server: node.acs_server?._ || node.acs_server || node.acsServer || "Unknown",
                    nas_identifier: node.nas_identifier?._ || node.nas_identifier || node.nasIdentifier || "Unknown",
                    endpoint_profile: node.endpoint_profile?._ || node.endpoint_profile || node.endpointProfile || "Unknown",
                    identity_group: node.identity_group?._ || node.identity_group || node.identityGroup || "Unknown",
                    authorization_rule: node.authorization_rule?._ || node.authorization_rule || node.authorizationRule || "Unknown",
                    auth_policy: node.authentication_policy?._ || node.authentication_policy || node.authenticationPolicy || "Unknown",
                    steps
                };
            });
            
            const events = mappedResults.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            return NextResponse.json({ found: events.length > 0, failures: events, searchType: "mac" });
        } 
        else {
            // User Workflow
            const macsToScan = new Set<string>();
            const userHistoryPayloads: any[] = [];
            
            const activeSessionData = await fetchIseSession(formattedQuery);
            if (activeSessionData.found && activeSessionData.sessions) {
                activeSessionData.sessions.forEach((s: any) => {
                    if (s.calling_station_id) macsToScan.add(s.calling_station_id);
                });
            }

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

            const summaryArray: any[] = [];
            
            await Promise.allSettled(Array.from(macsToScan).map(async (mac) => {
                const logs = await fetchAuthStatus(mac);
                let latestLog = logs.length > 0 ? logs[0] : null;
                
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
            
            summaryArray.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return NextResponse.json({ found: summaryArray.length > 0, discovery: summaryArray, searchType: "user_name" });
        }

    } catch (e: any) {
        await logSystemEvent(`ISE-DEBUG-FATAL: ${e.message}`);
        console.error("ISE-DEBUG-FATAL:", e);
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
