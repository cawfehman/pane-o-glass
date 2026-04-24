import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession } from '@/lib/ise';
import { getUserDetails } from '@/lib/ldap';

export async function GET(req: Request) {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session?.user || !(await hasPermission(role, 'ise'))) {
        return NextResponse.json({ error: 'Forbidden: Access to this tool is restricted.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('query');

    if (!query) {
        return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

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
                const response = await fetch(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
                });

                if (!response.ok) return [];

                const xmlText = await response.text();
                const data = await parseStringPromise(xmlText, { 
                    explicitArray: false,
                    tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
                });
                
                const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
                if (!rawNodes) return [];
                const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
                
                return nodesArray.flatMap((n: any) => {
                    const elements = n.authStatusElements || n;
                    return Array.isArray(elements) ? elements : [elements];
                });
            };

            let nodes = await tryFormat(mac);
            if (nodes.length === 0) {
                const dashed = mac.replace(/:/g, "-");
                nodes = await tryFormat(dashed);
            }
            return nodes;
        };

        await logAudit(
            'ISE_DIAGNOSTICS_QUERY',
            `Searched ISE diagnostics for ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
            session.user.id,
            (session.user as any).ipAddress
        );

        if (searchType === "mac") {
            const nodes = await fetchAuthStatus(formattedQuery);
                const mappedResults = nodes.map((node: any) => {
                    const val = (v: any) => v?._ || v || "";

                    // Deep parse other_attr_string for hidden fields like SSID
                    const otherAttrs: Record<string, string> = {};
                    const rawAttrs = val(node.other_attr_string);
                    if (rawAttrs) {
                        rawAttrs.split(':!:').forEach((pair: string) => {
                            const [key, ...valParts] = pair.split('=');
                            if (key && valParts.length > 0) {
                                otherAttrs[key.trim()] = valParts.join('=').trim();
                            }
                        });
                    }

                    const calledStationId = otherAttrs['Called-Station-ID'] || val(node.called_station_id) || "";
                    let extractedSsid = "N/A";
                    let extractedApIdentity = val(node.network_device_name) || otherAttrs['NAS-Identifier'] || "N/A";

                    if (calledStationId.includes(':')) {
                        const parts = calledStationId.split(':');
                        extractedSsid = parts.pop() || "N/A";
                        const firstPart = parts.join(':');
                        if (firstPart) extractedApIdentity = firstPart;
                    }

                    let steps: any[] = [];
                    const stepsList = node.execution_steps?.step || node.steps?.step;
                    if (stepsList) {
                        const stepArr = Array.isArray(stepsList) ? stepsList : [stepsList];
                        steps = stepArr.map((s: any) => ({
                            id: val(s.id),
                            description: val(s.description)
                        }));
                    }

                    return {
                        timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || val(node.timestamp) || "Unknown",
                        user_name: val(node.user_name) || val(node.userName) || "Unknown",
                        calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || val(node.mac_address) || val(node.macAddress) || "Unknown",
                        nas_ip_address: val(node.nas_ip_address) || val(node.nasIpAddress) || "Unknown",
                        nas_port_id: val(node.nas_port_id) || val(node.nasPortId) || "Unknown",
                        failure_reason: val(node.failure_reason) || val(node.failureReason) || "Passed/Active",
                        failure_id: val(node.failure_id) || val(node.failureId) || "N/A",
                        status: val(node.passed) === "true" || node.passed === true || (!val(node.failure_reason) && val(node.passed) !== "false"),
                        authentication_method: val(node.authentication_method) || val(node.authenticationMethod) || "Unknown",
                        authentication_protocol: val(node.authentication_protocol) || val(node.authenticationProtocol) || "Unknown",
                        acs_server: val(node.acs_server) || val(node.acsServer) || "Unknown",
                        nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || "Unknown",
                        endpoint_profile: val(node.endpoint_profile) || val(node.endpointProfile) || "Unknown",
                        identity_group: val(node.identity_group) || val(node.identityGroup) || "Unknown",
                        authorization_rule: val(node.authorization_rule) || val(node.authorizationRule) || "Unknown",
                        auth_policy: val(node.authentication_policy) || val(node.authenticationPolicy) || val(node.auth_policy) || "Unknown",
                        wlan_ssid: val(node.wlan_ssid) || val(node.wlanSsid) || extractedSsid,
                        access_point_name: extractedApIdentity,
                        steps
                    };
                });
            
            const enrichedFailures = await Promise.all(mappedResults.map(async (f: any) => {
                return {
                    ...f,
                    ad: f.user_name && f.user_name !== "Unknown" ? await getUserDetails(f.user_name) : null
                };
            }));
            
            const events = enrichedFailures.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });
            return NextResponse.json({ found: events.length > 0, failures: events, searchType: "mac" });
        } 
        else {
            const macsToScan = new Set<string>();
            const userHistoryPayloads: any[] = [];
            
            const activeSessionData = await fetchIseSession(formattedQuery);
            if (activeSessionData.found && activeSessionData.sessions) {
                activeSessionData.sessions.forEach((s: any) => {
                    const mac = s.calling_station_id?._ || s.calling_station_id || s.callingStationId;
                    if (mac) macsToScan.add(mac);
                });
            }

            try {
                const endpoint = `${url}/admin/API/mnt/Session/UserName/${encodeURIComponent(formattedQuery)}`;
                const response = await fetch(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
                });
                if (response.ok) {
                    const xmlText = await response.text();
                    const data = await parseStringPromise(xmlText, { 
                        explicitArray: false,
                        tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
                    });
                    let nodes = data.sessionParameters || data.activeSession;
                    const nodesArr = Array.isArray(nodes) ? nodes : [nodes];
                    nodesArr.forEach((node: any) => {
                        const mac = node.calling_station_id?._ || node.calling_station_id || node.callingStationId;
                        if (mac) {
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
                    latestLog = userHistoryPayloads.find(p => {
                        const pMac = p.calling_station_id?._ || p.calling_station_id || p.callingStationId;
                        return pMac === mac;
                    });
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
            
            summaryArray.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });
            return NextResponse.json({ found: summaryArray.length > 0, discovery: summaryArray, searchType: "user_name" });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
