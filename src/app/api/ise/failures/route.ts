import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession, getFailureInsight } from '@/lib/ise';
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
        
        const agent = new https.Agent({ rejectUnauthorized: false });
        const fetchAuthStatus = async (mac: string) => {
            const tryFormat = async (formattedMac: string) => {
                // Expanded to 30 Days (2592000 seconds) for Service Account visibility
                const endpoint = `${url}/admin/API/mnt/AuthStatus/MACAddress/${formattedMac}/2592000/50/All`;
                console.log(`[ISE-HISTORY] Fetching 30-Day Logs: ${endpoint}`);
                
                try {
                    const response = await axios.get(endpoint, {
                        headers: { 
                            "Authorization": `Basic ${basicAuth}`, 
                            "Accept": "application/xml",
                            "X-ERS-Internal-User": "true"
                        },
                        httpsAgent: agent,
                        timeout: 15000 // Increased timeout for deep history
                    });

                    const xmlText = response.data;
                    const data = await parseStringPromise(xmlText, { 
                        explicitArray: false,
                        tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
                    });
                    
                    const rawNodes = data.authStatusOutputList?.authStatusList || data.authStatusList || data.authStatus;
                    if (!rawNodes) return [];
                    const nodesArray = Array.isArray(rawNodes) ? rawNodes : [rawNodes];
                    
                    const flattened = nodesArray.flatMap((n: any) => {
                        const elements = n.authStatusElements || n;
                        return Array.isArray(elements) ? elements : [elements];
                    });

                    return flattened;
                } catch (err: any) {
                    console.error(`[ISE-HISTORY] Surgical fetch failed:`, err.message);
                    return [];
                }
            };

            let nodes = await tryFormat(mac);
            if (nodes.length === 0) {
                const dashed = mac.replace(/:/g, "-");
                nodes = await tryFormat(dashed);
            }
            return nodes;
        };

        await logAudit(
            'ISE_HISTORY_QUERY',
            `Searched ISE History (30-Day) for ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
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

                const callingStationId = otherAttrs['Called-Station-ID'] || val(node.calling_station_id) || "";
                const { ssid, apName, siteCode } = parseCalledStationId(callingStationId, val(node.network_device_name) || otherAttrs['NAS-Identifier'] || "N/A");

                const failureId = val(node.failure_id) || val(node.failureId) || "";
                const insight = getFailureInsight(failureId);

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
                    timestamp_label: val(node.failure_reason) ? "FAILURE TIME" : "AUTH TIME",
                    user_name: val(node.user_name) || val(node.userName) || "Unknown",
                    calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || val(node.mac_address) || val(node.macAddress) || "Unknown",
                    nas_ip_address: val(node.nas_ip_address) || val(node.nasIpAddress) || "Unknown",
                    nas_port_id: val(node.nas_port_id) || val(node.nasPortId) || "Unknown",
                    failure_reason: val(node.failure_reason) || val(node.failureReason) || "Passed/Active",
                    failure_id: failureId,
                    insight,
                    status: val(node.passed) === "true" || node.passed === true || (!val(node.failure_reason) && val(node.passed) !== "false"),
                    authentication_method: val(node.authentication_method) || val(node.authenticationMethod) || "Unknown",
                    authentication_protocol: val(node.authentication_protocol) || val(node.authenticationProtocol) || "Unknown",
                    acs_server: val(node.acs_server) || val(node.acsServer) || "Unknown",
                    nas_identifier: val(node.nas_identifier) || val(node.nasIdentifier) || val(node.network_device_name) || "Unknown",
                    endpoint_profile: otherAttrs['EndPointProfilerProfile'] || otherAttrs['EndPointProfile'] || val(node.endpoint_profile) || val(node.endpointProfile) || "Unknown",
                    identity_group: val(node.identity_group) || val(node.identityGroup) || "Unknown",
                    authorization_rule: otherAttrs['AuthorizationPolicyMatchedRule'] || val(node.authorization_rule) || val(node.authorizationRule) || "Unknown",
                    auth_policy: otherAttrs['IdentityPolicyMatchedRule'] || val(node.authentication_policy) || val(node.authenticationPolicy) || val(node.auth_policy) || "Unknown",
                    wlan_ssid: val(node.wlan_ssid) || val(node.wlanSsid) || ssid,
                    access_point_name: apName,
                    site_code: siteCode,
                    steps
                };
            });

            // Parallel Surgical ERS Enrichment for History
            const enrichedResults = await Promise.all(mappedResults.map(async (f: any) => {
                let profile = f.endpoint_profile;
                try {
                    const ersUrl = url.replace(':8443', ':9060');
                    const ersRes = await axios.get(`${ersUrl}/ers/config/endpoint/name/${f.calling_station_id}`, {
                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                        httpsAgent: agent,
                        timeout: 1200 
                    });

                    const ep = ersRes.data.ERSEndPoint;
                    if (ep && ep.mfcAttributes) {
                        const mfc = ep.mfcAttributes;
                        const manufacturer = Array.isArray(mfc.mfcHardwareManufacturer) ? mfc.mfcHardwareManufacturer.join('') : mfc.mfcHardwareManufacturer;
                        const os = Array.isArray(mfc.mfcOperatingSystem) ? mfc.mfcOperatingSystem.join('') : mfc.mfcOperatingSystem;
                        
                        if (manufacturer || os) {
                            profile = `${manufacturer || ""} ${os || ""}`.trim() || profile;
                        }
                    }
                } catch (e) {}

                return {
                    ...f,
                    endpoint_profile: profile,
                    ad: f.user_name && f.user_name !== "Unknown" ? await getUserDetails(f.user_name) : null
                };
            }));
            
            const events = enrichedResults.sort((a, b) => {
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
                const response = await axios.get(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                    httpsAgent: agent,
                    timeout: 5000
                });
                const xmlText = response.data;
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
                        calling_station_id: mac,
                        timestamp: latestLog.acs_timestamp?._ || latestLog.acs_timestamp || latestLog.last_accounting_update?._ || latestLog.last_accounting_update || "Unknown",
                        nas_identifier: latestLog.nas_identifier?._ || latestLog.nas_identifier || "Unknown",
                        endpoint_profile: latestLog.endpoint_profile?._ || latestLog.endpoint_profile || "Unknown",
                        framed_ip_address: latestLog.framed_ip_address?._ || latestLog.framed_ip_address || "N/A"
                    });
                } else {
                    summaryArray.push({ calling_station_id: mac, timestamp: "Unknown", nas_identifier: "Unknown", endpoint_profile: "Unknown" });
                }
            }));
            
            summaryArray.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });
            return NextResponse.json({ found: summaryArray.length > 0, sessions: summaryArray, searchType: "user_name" });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
