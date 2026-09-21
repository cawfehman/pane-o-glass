import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession, getFailureInsight, getIseFailureCatalog, parseCalledStationId, getTrustSecSgtMap, getIseUrls, executeWithPanFailover } from '@/lib/ise';
import { getUserDetails } from '@/lib/ldap';
import { fetchWlcClientTelemetry } from '@/lib/wlc';
import https from 'https';
import axios from 'axios';

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
        const { basicAuth } = getIseUrls();
        const agent = new https.Agent({ rejectUnauthorized: false });

        const fetchAuthStatus = async (mac: string) => {
            const queryIseAuth = async (formattedMac: string, seconds: number) => {
                try {
                    const { data: xmlText } = await executeWithPanFailover(async (baseUrl) => {
                        const endpoint = `${baseUrl}/admin/API/mnt/AuthStatus/MACAddress/${formattedMac}/${seconds}/50/All`;
                        console.log(`[ISE-HISTORY] Querying ${seconds}s window: ${endpoint}`);
                        const response = await axios.get(endpoint, {
                            headers: { 
                                "Authorization": `Basic ${basicAuth}`, 
                                "Accept": "application/xml",
                                "X-ERS-Internal-User": "true"
                            },
                            httpsAgent: agent,
                            timeout: 8000
                        });
                        return response.data;
                    });

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
                    console.warn(`[ISE-HISTORY] Fetch with ${seconds}s for ${formattedMac} failed:`, err.message);
                    return [];
                }
            };

            const tryFormat = async (targetMac: string) => {
                // Try standard 7 Days (604800s - Cisco ISE maximum AuthStatus window)
                let nodes = await queryIseAuth(targetMac, 604800);
                // Graceful fallback to 1 Day (86400s) if 7-day query returned empty or was rejected
                if (nodes.length === 0) {
                    nodes = await queryIseAuth(targetMac, 86400);
                }
                return nodes;
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
            `Searched ISE History (7-Day) for ${searchType === "mac" ? "MAC" : "User"}: ${formattedQuery}`,
            session.user.id,
            (session.user as any).ipAddress
        );

        const failureCatalog = await getIseFailureCatalog();

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

                // Determine true pass/fail status
                const rawPassed = val(node.passed);
                const rawFailed = val(node.failed);
                const isFail = rawPassed === "false" || rawFailed === "true" || Boolean(val(node.failure_reason));
                const isPassed = !isFail;

                // Extract Failure ID from failure_reason (e.g. "12953 Received EAP packet...") or message_code (e.g. "5400")
                const rawReason = val(node.failure_reason) || val(node.failureReason) || "";
                const rawMsgCode = val(node.message_code) || "";
                let failureId = val(node.failure_id) || val(node.failureId) || "";

                if (!failureId && rawReason) {
                    const idMatch = rawReason.match(/^(\d{4,6})\b/);
                    if (idMatch) failureId = idMatch[1];
                }
                if (!failureId && rawMsgCode) {
                    failureId = rawMsgCode;
                }

                // Parse execution steps
                let steps: any[] = [];
                const rawSteps = val(node.execution_steps) || val(node.steps);
                if (typeof rawSteps === 'string' && rawSteps.includes(',')) {
                    steps = rawSteps.split(',').map(id => id.trim()).filter(Boolean).map(id => {
                        const info = failureCatalog[id];
                        return {
                            id,
                            description: info?.code || `Step Code ${id}`
                        };
                    });
                    if (!failureId && isFail && steps.length > 0) {
                        failureId = steps[steps.length - 1].id;
                    }
                } else {
                    const stepsList = node.execution_steps?.step || node.steps?.step;
                    if (stepsList) {
                        const stepArr = Array.isArray(stepsList) ? stepsList : [stepsList];
                        steps = stepArr.map((s: any) => ({
                            id: val(s.id),
                            description: val(s.description) || failureCatalog[val(s.id)]?.code || `Step ${val(s.id)}`
                        }));
                    }
                }

                // Look up in Failure Catalog or fallback to built-in dictionary
                let insight = getFailureInsight(failureId);
                if (failureCatalog[failureId]) {
                    const catEntry = failureCatalog[failureId];
                    insight = {
                        cause: catEntry.cause || insight.cause,
                        suggestion: catEntry.resolution || insight.suggestion
                    };
                }

                return {
                    timestamp: val(node.acs_timestamp) || val(node.acsTimestamp) || val(node.timestamp) || "Unknown",
                    timestamp_label: isFail ? "FAILURE TIME" : "AUTH TIME",
                    user_name: val(node.user_name) || val(node.userName) || "Unknown",
                    calling_station_id: val(node.calling_station_id) || val(node.callingStationId) || val(node.mac_address) || val(node.macAddress) || "Unknown",
                    nas_ip_address: val(node.nas_ip_address) || val(node.nasIpAddress) || "Unknown",
                    nas_port_id: val(node.nas_port_id) || val(node.nasPortId) || "Unknown",
                    failure_reason: val(node.failure_reason) || val(node.failureReason) || (isPassed ? "Passed/Active" : "Authentication Failed"),
                    failure_id: failureId,
                    insight,
                    status: isPassed,
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

            // Parallel Surgical ERS Enrichment for History over API Gateway Port 443 with Failover
            const sgtMap = await getTrustSecSgtMap();
            const enrichedResults = await Promise.all(mappedResults.map(async (f: any) => {
                let profile = f.endpoint_profile;
                let hardware_manufacturer = "";
                let hardware_model = "";
                let os_version = "";
                let device_type = "";

                try {
                    const { data: epRes } = await executeWithPanFailover(async (baseUrl) => {
                        const ersRes = await axios.get(`${baseUrl}/ers/config/endpoint/name/${f.calling_station_id}`, {
                            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                            httpsAgent: agent,
                            timeout: 2000 
                        });
                        return ersRes.data;
                    });

                    const ep = epRes?.ERSEndPoint;
                    if (ep && ep.mfcAttributes) {
                        const mfc = ep.mfcAttributes;
                        const getStr = (val: any) => Array.isArray(val) ? val.join('') : (val || "");
                        hardware_manufacturer = getStr(mfc.mfcHardwareManufacturer);
                        hardware_model = getStr(mfc.mfcHardwareModel);
                        os_version = getStr(mfc.mfcOperatingSystem);
                        device_type = getStr(mfc.mfcDeviceType);

                        const parts = [hardware_manufacturer, hardware_model].filter(Boolean).join(' ');
                        if (parts) {
                            profile = parts;
                        } else if (hardware_manufacturer || os_version) {
                            profile = `${hardware_manufacturer || ""} ${os_version || ""}`.trim();
                        }
                    }
                } catch (e) {}

                return {
                    ...f,
                    endpoint_profile: profile,
                    hardware_manufacturer,
                    hardware_model,
                    os_version,
                    device_type,
                    ad: f.user_name && f.user_name !== "Unknown" ? await getUserDetails(f.user_name) : null
                };
            }));
            
            // Query WLC for real-time state of this MAC
            let wlcTelemetry = null;
            try {
                wlcTelemetry = await fetchWlcClientTelemetry(formattedQuery);
            } catch (e) {}

            const events = enrichedResults.sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });
            return NextResponse.json({ 
                found: events.length > 0, 
                failures: events, 
                searchType: "mac",
                wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null
            });
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
                const { data: xmlText } = await executeWithPanFailover(async (baseUrl) => {
                    const endpoint = `${baseUrl}/admin/API/mnt/Session/UserName/${encodeURIComponent(formattedQuery)}`;
                    const response = await axios.get(endpoint, {
                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                        httpsAgent: agent,
                        timeout: 5000
                    });
                    return response.data;
                });
                const data = await parseStringPromise(xmlText, { 
                    explicitArray: false,
                    tagNameProcessors: [ (name: string) => name.split(':').pop() || name ]
                });
                let nodes = data.sessionParameters || data.activeSession;
                const nodesArr = Array.isArray(nodes) ? nodes : [nodes];
                nodesArr.forEach((node: any) => {
                    const mac = node.calling_station_id?._ || node.calling_station_id || node.callingStationId;
                    if (mac && !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(mac)) {
                         macsToScan.add(mac);
                         userHistoryPayloads.push(node);
                    }
                });
            } catch (e) { }

            // If no MACs found or only IP was returned (e.g. TACACS/VPN session), scan ActiveList for client hardware MACs
            if (macsToScan.size === 0) {
                try {
                    const { data: activeListXml } = await executeWithPanFailover(async (baseUrl) => {
                        const response = await axios.get(`${baseUrl}/admin/API/mnt/Session/ActiveList`, {
                            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                            httpsAgent: agent,
                            timeout: 8000
                        });
                        return response.data;
                    });
                    const re = new RegExp('<activeSession>[\\s\\S]*?<user_name>' + formattedQuery + '<\\/user_name>[\\s\\S]*?<\\/activeSession>', 'gi');
                    const matches = activeListXml.match(re) || [];
                    for (const m of matches) {
                        const macMatch = m.match(/<calling_station_id>(.*?)<\/calling_station_id>/i);
                        if (macMatch && macMatch[1]) {
                            const foundMac = macMatch[1].trim().toUpperCase();
                            if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(foundMac)) {
                                macsToScan.add(foundMac);
                            }
                        }
                    }
                } catch (e) {}
            }

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

                // Analyze failure frequency and lockout risk across the 7-day window
                let failCount = 0;
                let badPasswordCount = 0;
                let lastFailReason = "";
                let lastFailTime = "";

                logs.forEach((l: any) => {
                    const passed = l.passed?._ || l.passed;
                    const reason = l.failure_reason?._ || l.failure_reason;
                    const fId = l.failure_id?._ || l.failure_id || l.failureId;
                    const ts = l.acs_timestamp?._ || l.acs_timestamp || l.timestamp;

                    if (passed === "false" || reason) {
                        failCount++;
                        if (!lastFailReason) {
                            lastFailReason = reason || "Failed";
                            lastFailTime = ts || "";
                        }
                        if (fId === "24408" || fId === "22040" || fId === "24204" || (reason && reason.toLowerCase().includes("password"))) {
                            badPasswordCount++;
                        }
                    }
                });

                // Pull Cloud MFC attributes for this MAC
                let hardware_manufacturer = "";
                let hardware_model = "";
                let endpoint_profile = latestLog?.endpoint_profile?._ || latestLog?.endpoint_profile || "Unknown";
                try {
                    const { data: epRes } = await executeWithPanFailover(async (baseUrl) => {
                        const ersRes = await axios.get(`${baseUrl}/ers/config/endpoint/name/${mac}`, {
                            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                            httpsAgent: agent,
                            timeout: 2000
                        });
                        return ersRes.data;
                    });
                    const ep = epRes?.ERSEndPoint;
                    if (ep?.mfcAttributes) {
                        const mfc = ep.mfcAttributes;
                        const getStr = (val: any) => Array.isArray(val) ? val.join('') : (val || "");
                        hardware_manufacturer = getStr(mfc.mfcHardwareManufacturer);
                        hardware_model = getStr(mfc.mfcHardwareModel);
                        const parts = [hardware_manufacturer, hardware_model].filter(Boolean).join(' ');
                        if (parts) endpoint_profile = parts;
                    }
                } catch (e) {}

                // Pull WLC status
                let wlcTelemetry = null;
                try {
                    wlcTelemetry = await fetchWlcClientTelemetry(mac);
                } catch (e) {}

                const val = (v: any) => v?._ || v || "";
                const rawOther = val(latestLog?.other_attr_string);
                const otherAttrs: Record<string, string> = {};
                if (rawOther) {
                    rawOther.split(':!:').forEach((pair: string) => {
                        const [key, ...valParts] = pair.split('=');
                        if (key && valParts.length > 0) otherAttrs[key.trim()] = valParts.join('=').trim();
                    });
                }
                const calledStationId = otherAttrs['Called-Station-ID'] || val(latestLog?.calling_station_id) || "";
                const { ssid, apName, siteCode } = parseCalledStationId(calledStationId, val(latestLog?.network_device_name) || "N/A");

                summaryArray.push({
                    calling_station_id: mac,
                    timestamp: val(latestLog?.acs_timestamp) || val(latestLog?.last_accounting_update) || "Unknown",
                    nas_identifier: val(latestLog?.nas_identifier) || "Unknown",
                    endpoint_profile,
                    hardware_manufacturer,
                    hardware_model,
                    framed_ip_address: val(latestLog?.framed_ip_address) || "N/A",
                    wlan_ssid: val(latestLog?.wlan_ssid) || ssid,
                    access_point_name: apName,
                    site_code: siteCode,
                    fail_count: failCount,
                    bad_password_count: badPasswordCount,
                    last_failure_reason: lastFailReason,
                    last_failure_time: lastFailTime,
                    is_lockout_culprit: badPasswordCount >= 2 || failCount >= 5,
                    wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null
                });
            }));
            
            // Sort by lockout risk first (culprits first), then failure count, then timestamp
            summaryArray.sort((a, b) => {
                if (a.is_lockout_culprit && !b.is_lockout_culprit) return -1;
                if (!a.is_lockout_culprit && b.is_lockout_culprit) return 1;
                if (b.bad_password_count !== a.bad_password_count) return b.bad_password_count - a.bad_password_count;
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });

            return NextResponse.json({ 
                found: summaryArray.length > 0, 
                sessions: summaryArray, 
                searchType: "user_name",
                totalMacs: summaryArray.length,
                potentialCulprits: summaryArray.filter(s => s.is_lockout_culprit).length
            });
        }

    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to communicate with Cisco ISE API" }, { status: 500 });
    }
}
