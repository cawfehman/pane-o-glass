import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { hasPermission } from "@/app/actions/permissions";
import { parseStringPromise } from 'xml2js';
import { fetchIseSession, getFailureInsight, getIseFailureCatalog, parseCalledStationId, getTrustSecSgtMap, getIseUrls, executeWithPanFailover, normalizeMacAddress } from '@/lib/ise';
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
    const rawQuery = searchParams.get('query');
    const query = (rawQuery || "").trim();

    if (!query) {
        return NextResponse.json({ error: 'Missing query parameter' }, { status: 400 });
    }

    let searchType = "user_name";
    let formattedQuery = query;
    const normalizedMac = normalizeMacAddress(query);
    if (normalizedMac) {
        searchType = "mac";
        formattedQuery = normalizedMac;
    }

    try {
        const { basicAuth } = getIseUrls();
        const agent = new https.Agent({ rejectUnauthorized: false });

        const fetchAuthStatus = async (mac: string) => {
            const queryIseAuth = async (formattedMac: string) => {
                try {
                    const { data: xmlText } = await executeWithPanFailover(async (baseUrl) => {
                        const endpoint = `${baseUrl}/admin/API/mnt/AuthStatus/MACAddress/${formattedMac}/604800/250/All`;
                        const response = await axios.get(endpoint, {
                            headers: { 
                                "Authorization": `Basic ${basicAuth}`, 
                                "Accept": "application/xml",
                                "X-ERS-Internal-User": "true"
                            },
                            httpsAgent: agent,
                            timeout: 4000
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
                        if (!n.authStatusElements) return [];
                        return Array.isArray(n.authStatusElements) ? n.authStatusElements : [n.authStatusElements];
                    });

                    return flattened;
                } catch (err: any) {
                    return [];
                }
            };

            let nodes = await queryIseAuth(mac);
            if (nodes.length === 0) {
                const alt = mac.includes(':') ? mac.replace(/:/g, "-") : mac.replace(/-/g, ":");
                nodes = await queryIseAuth(alt);
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
            const [nodes, activeSessionData] = await Promise.all([
                fetchAuthStatus(formattedQuery),
                fetchIseSession(formattedQuery).catch(() => null)
            ]);
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
            
            // Extract active sessions from ISE (if device is currently authenticated)
            const activeEvents: any[] = [];
            if (activeSessionData?.found && activeSessionData?.sessions) {
                activeSessionData.sessions.forEach((s: any) => {
                    if (!s.is_wlc_live_only) {
                        activeEvents.push({
                            timestamp: s.auth_acs_timestamp || s.timestamp || new Date().toISOString(),
                            timestamp_label: "ACTIVE SESSION",
                            user_name: s.user_name || "Unknown",
                            calling_station_id: s.calling_station_id || formattedQuery,
                            nas_ip_address: s.nas_ip_address || "Unknown",
                            nas_port_id: s.nas_port_id || "Unknown",
                            failure_reason: "Active 802.1X Session (Authenticated)",
                            failure_id: "",
                            insight: { 
                                cause: "Active 802.1X RADIUS Session", 
                                suggestion: "Endpoint is actively authenticated and connected." 
                            },
                            status: true,
                            authentication_method: s.authentication_method || "dot1x",
                            authentication_protocol: s.authentication_protocol || "PEAP (EAP-MSCHAPv2)",
                            acs_server: s.acs_server || "ise-psn",
                            nas_identifier: s.nas_identifier || "Unknown",
                            endpoint_profile: s.endpoint_profile || "Unknown",
                            hardware_manufacturer: s.hardware_manufacturer || "",
                            hardware_model: s.hardware_model || "",
                            os_version: s.os_version || "",
                            device_type: s.device_type || "",
                            identity_group: s.identity_group || "Unknown",
                            authorization_rule: s.authorization_rule || "Unknown",
                            auth_policy: s.auth_policy || "Unknown",
                            wlan_ssid: s.wlan_ssid || "N/A",
                            access_point_name: s.access_point_name || "N/A",
                            site_code: s.site_code || "N/A",
                            steps: s.steps || [],
                            ad: s.enrichment?.ad || s.ad || null
                        });
                    }
                });
            }

            // Combine active session event with historical logs (deduplicating if the same attempt is in both)
            const combinedResults = [...activeEvents, ...enrichedResults];
            const seenKeys = new Set<string>();
            const deduplicatedResults = combinedResults.filter((ev: any) => {
                const ts = ev.timestamp ? new Date(ev.timestamp).getTime() : 0;
                const timeBucket = Math.floor(ts / 30000);
                const key = `${timeBucket}_${ev.calling_station_id}_${ev.user_name}`;
                if (seenKeys.has(key)) return false;
                seenKeys.add(key);
                return true;
            });

            // Query WLC for real-time state of this MAC
            let wlcTelemetry = null;
            try {
                wlcTelemetry = await fetchWlcClientTelemetry(formattedQuery);
            } catch (e) {}

            const events = deduplicatedResults.map((ev: any) => {
                if (wlcTelemetry?.found) {
                    if ((!ev.access_point_name || ev.access_point_name === "N/A") && wlcTelemetry.apName) {
                        ev.access_point_name = wlcTelemetry.apName;
                    }
                    if ((!ev.wlan_ssid || ev.wlan_ssid === "N/A") && wlcTelemetry.ssid) {
                        ev.wlan_ssid = wlcTelemetry.ssid;
                    }
                }
                return ev;
            }).sort((a, b) => {
                const timeA = new Date(a.timestamp).getTime();
                const timeB = new Date(b.timestamp).getTime();
                return isNaN(timeB) ? -1 : (isNaN(timeA) ? 1 : timeB - timeA);
            });

            return NextResponse.json({ 
                found: events.length > 0 || Boolean(wlcTelemetry?.found), 
                failures: events, 
                searchType: "mac",
                wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null
            });
        } 
        else {
            const macsToScan = new Set<string>();
            const userHistoryPayloads: any[] = [];
            const passiveSessions: any[] = [];
            
            const activeSessionData = await fetchIseSession(formattedQuery).catch(() => ({ found: false, sessions: [] }));
            if (activeSessionData.found && activeSessionData.sessions) {
                activeSessionData.sessions.forEach((s: any) => {
                    if (s.is_passive_identity) {
                        passiveSessions.push(s);
                    } else {
                        const mac = s.calling_station_id?._ || s.calling_station_id || s.callingStationId;
                        if (mac && !/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(mac)) {
                            const cleanMac = normalizeMacAddress(mac) || mac.trim().toUpperCase();
                            macsToScan.add(cleanMac);
                            userHistoryPayloads.push(s);
                        }
                    }
                });
            }

            // If activeSessionData didn't find sessions, try direct UserName endpoint
            if (macsToScan.size === 0 && passiveSessions.length === 0) {
                try {
                    const { data: xmlText } = await executeWithPanFailover(async (baseUrl) => {
                        const endpoint = `${baseUrl}/admin/API/mnt/Session/UserName/${encodeURIComponent(formattedQuery)}`;
                        const response = await axios.get(endpoint, {
                            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" },
                            httpsAgent: agent,
                            timeout: 4000
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
                             const cleanMac = normalizeMacAddress(mac) || mac.trim().toUpperCase();
                             macsToScan.add(cleanMac);
                             userHistoryPayloads.push(node);
                        }
                    });
                } catch (e) { }
            }

            if (macsToScan.size === 0 && passiveSessions.length === 0) {
                return NextResponse.json({ found: false, failures: [], sessions: [] });
            }

            const macList = Array.from(macsToScan).slice(0, 15);
            const summaryArray: any[] = [];

            // Concurrency pool (limit 3) for fast, non-blocking telemetry enrichment
            const poolLimit = 3;
            let currentIdx = 0;
            const workers = new Array(Math.min(poolLimit, macList.length)).fill(0).map(async () => {
                while (currentIdx < macList.length) {
                    const mac = macList[currentIdx++];
                    try {
                        const logs = await fetchAuthStatus(mac);
                        let latestLog = logs.length > 0 ? logs[0] : null;
                        
                        if (!latestLog) {
                            latestLog = userHistoryPayloads.find((p: any) => {
                                const pMac = p.calling_station_id?._ || p.calling_station_id || p.callingStationId;
                                return (normalizeMacAddress(pMac) || pMac) === mac;
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

                        // Reuse existing hardware info from active session if present; else lightweight ERS query
                        let hardware_manufacturer = latestLog?.hardware_manufacturer || "";
                        let hardware_model = latestLog?.hardware_model || "";
                        let endpoint_profile = latestLog?.endpoint_profile?._ || latestLog?.endpoint_profile || "Unknown";

                        if (!hardware_manufacturer && mac) {
                            try {
                                const { data: epRes } = await executeWithPanFailover(async (baseUrl) => {
                                    const ersRes = await axios.get(`${baseUrl}/ers/config/endpoint/name/${mac}`, {
                                        headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                                        httpsAgent: agent,
                                        timeout: 1500
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
                        }

                        // Quick WLC status check with 1s timeout
                        let wlcTelemetry = null;
                        try {
                            const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 1000));
                            wlcTelemetry = await Promise.race([
                                fetchWlcClientTelemetry(mac),
                                timeoutPromise
                            ]);
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
                            timestamp: val(latestLog?.acs_timestamp) || val(latestLog?.last_accounting_update) || val(latestLog?.timestamp) || "Unknown",
                            nas_identifier: val(latestLog?.nas_identifier) || "Unknown",
                            endpoint_profile,
                            hardware_manufacturer,
                            hardware_model,
                            framed_ip_address: val(latestLog?.framed_ip_address) || "N/A",
                            wlan_ssid: val(latestLog?.wlan_ssid) || ssid,
                            access_point_name: (wlcTelemetry?.apName) || apName,
                            site_code: siteCode,
                            fail_count: failCount,
                            bad_password_count: badPasswordCount,
                            last_failure_reason: lastFailReason,
                            last_failure_time: lastFailTime,
                            is_lockout_culprit: badPasswordCount >= 2 || failCount >= 5,
                            wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null
                        });
                    } catch (err) {}
                }
            });
            await Promise.all(workers);

            // Add any Passive Identity sessions for this user
            passiveSessions.forEach((ps: any) => {
                summaryArray.push({
                    calling_station_id: ps.workstation_ip || ps.calling_station_id,
                    timestamp: ps.timestamp || "Unknown",
                    timestamp_label: "LOGON TIME (AD EVENT)",
                    nas_identifier: ps.nas_identifier || "Active Directory DC",
                    endpoint_profile: ps.endpoint_profile || "Domain Workstation",
                    hardware_manufacturer: ps.hardware_manufacturer || "Microsoft Active Directory",
                    hardware_model: ps.machine_name || ps.hardware_model || "Domain Computer",
                    framed_ip_address: ps.workstation_ip || ps.framed_ip_address,
                    workstation_ip: ps.workstation_ip,
                    hostname: ps.hostname,
                    machine_name: ps.machine_name,
                    is_passive_identity: true,
                    session_type: "PASSIVE_ID",
                    wlan_ssid: "N/A (PassiveID)",
                    access_point_name: "N/A (Domain Controller)",
                    site_code: ps.site_code || "REM",
                    fail_count: 0,
                    bad_password_count: 0,
                    last_failure_reason: "Active PassiveID Session (AD DC Event 4624)",
                    last_failure_time: ps.timestamp || "",
                    is_lockout_culprit: false,
                    wlcTelemetry: null,
                    ad: ps.enrichment?.ad || null
                });
            });
            
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
