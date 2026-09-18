import https from 'https';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

export function parseCalledStationId(calledStationId: string, fallbackApName: string = "N/A") {
    let ssid = "N/A";
    let apName = fallbackApName;
    let siteCode = "N/A";

    if (calledStationId && calledStationId.includes(':')) {
        const parts = calledStationId.split(':');
        
        // Heuristic: If it has 6+ parts and they look like hex, it's probably a MAC or MAC:SSID
        // In that case, we only want to extract SSID if it's definitely there.
        // But the user specifically said they reconfigured WLCs to send AP NAME:SSID.
        // AP Names usually don't look like MAC octets.
        const looksLikeMac = parts.length >= 6 && parts.slice(0, 6).every(p => /^[0-9A-Fa-f]{2}$/.test(p));

        if (!looksLikeMac) {
            ssid = parts.pop() || "N/A";
            const remaining = parts.join(':');
            if (remaining) {
                apName = remaining;
            }
        }
    }

    if (apName !== "N/A" && apName.length >= 3) {
        // Only extract site code if it doesn't look like a MAC prefix
        if (!/^[0-9A-Fa-f]{2}[:.-]/.test(apName)) {
            siteCode = apName.substring(0, 3).toUpperCase();
        }
    }

    return { ssid, apName, siteCode };
}

export function getIseUrls() {
    const rawUrl = process.env.ISE_PAN_URL;
    const rawSec = process.env.ISE_SECONDARY_PAN_URL;
    const rawUser = process.env.ISE_API_USER;
    const rawPass = process.env.ISE_API_PASSWORD;

    if (!rawUrl || !rawUser || !rawPass) {
        throw new Error("ISE Credentials not configured in .env");
    }

    const clean = (s: string) => s.replace(/^"|"$/g, '').trim().replace(/\/+$/, '');
    const primary = clean(rawUrl);

    // Auto-derive secondary if not explicitly specified
    let secondary = rawSec ? clean(rawSec) : "";
    if (!secondary) {
        if (primary.includes('ise-adm02')) {
            secondary = primary.replace('ise-adm02', 'ise-adm01');
        } else if (primary.includes('ise-adm01')) {
            secondary = primary.replace('ise-adm01', 'ise-adm02');
        }
    }

    const user = rawUser.replace(/^"|"$/g, '');
    const pass = rawPass.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

    return { primary, secondary, user, pass, basicAuth };
}

let sgtCache: { map: Record<number, string>; timestamp: number } | null = null;
const SGT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getTrustSecSgtMap(): Promise<Record<number, string>> {
    if (sgtCache && Date.now() - sgtCache.timestamp < SGT_CACHE_TTL) {
        return sgtCache.map;
    }

    const { primary, secondary, basicAuth } = getIseUrls();
    const agent = new https.Agent({ rejectUnauthorized: false });
    const targetUrls = [primary, secondary].filter(Boolean);

    for (const baseUrl of targetUrls) {
        try {
            const res = await axios.get(`${baseUrl}/api/v1/trustsec/security-group`, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                httpsAgent: agent,
                timeout: 5000
            });

            const groups = res.data?.response || [];
            const map: Record<number, string> = {};
            for (const g of groups) {
                if (typeof g.tag === 'number') {
                    map[g.tag] = g.name || `SGT-${g.tag}`;
                }
            }

            sgtCache = { map, timestamp: Date.now() };
            return map;
        } catch (e: any) {
            console.warn(`[ISE-TRUSTSEC] Failed to fetch SGT dictionary from ${baseUrl}:`, e.message);
        }
    }

    return sgtCache?.map || {};
}

export async function executeWithPanFailover<T>(requestFn: (baseUrl: string) => Promise<T>): Promise<{ data: T; activeUrl: string }> {
    const { primary, secondary } = getIseUrls();
    try {
        const data = await requestFn(primary);
        return { data, activeUrl: primary };
    } catch (primaryErr: any) {
        if (!secondary || secondary === primary) {
            throw primaryErr;
        }
        console.warn(`[ISE-FAILOVER] Primary PAN (${primary}) query failed: ${primaryErr.message}. Retrying on secondary PAN (${secondary})...`);
        try {
            const data = await requestFn(secondary);
            return { data, activeUrl: secondary };
        } catch (secondaryErr: any) {
            console.error(`[ISE-FAILOVER] Both primary and secondary PANs failed.`);
            throw primaryErr;
        }
    }
}

export async function fetchIseSession(query: string) {
    const { basicAuth } = getIseUrls();
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Determine query type
    let searchType = "user_name";
    let formattedQuery = query;

    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(query)) {
        searchType = "framed_ip_address";
    } else if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query) || /^[0-9A-Fa-f]{12}$/.test(query)) {
        searchType = "calling_station_id"; // MAC Address
        if (query.length === 12) {
            formattedQuery = query.match(/.{1,2}/g)?.join(":") || query;
        } else {
            formattedQuery = query.replace(/-/g, ":");
        }
        formattedQuery = formattedQuery.toUpperCase();
    } else if (/^[0-9a-fA-F]{20,}$/.test(query) || query.includes('/')) {
        searchType = "session_id";
    }

    try {
        const { data: sessionsArray, activeUrl } = await executeWithPanFailover(async (targetUrl) => {
            let foundSessions: any[] = [];

            if (searchType === "calling_station_id") {
                const endpoint = `${targetUrl}/admin/API/mnt/Session/MACAddress/${formattedQuery}`;
                console.log(`[ISE-LIB] Fetching Surgical Session: ${endpoint}`);
                const res = await axios.get(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                    httpsAgent: agent,
                    timeout: 10000
                });
                const data = await parseStringPromise(res.data, { explicitArray: false });
                const node = data.sessionParameters || data.activeSession;
                if (node) foundSessions = [node];
            } else if (searchType === "session_id") {
                const endpoint = `${targetUrl}/admin/API/mnt/Session/SessionID/${formattedQuery}`;
                console.log(`[ISE-LIB] Fetching Surgical Audit: ${endpoint}`);
                const res = await axios.get(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                    httpsAgent: agent,
                    timeout: 10000
                });
                const data = await parseStringPromise(res.data, { explicitArray: false });
                const node = data.sessionParameters || data.activeSession;
                if (node) foundSessions = [node];
            } else if (searchType === "framed_ip_address") {
                const endpoint = `${targetUrl}/admin/API/mnt/Session/IPAddress/${formattedQuery}`;
                const res = await axios.get(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                    httpsAgent: agent,
                    timeout: 10000
                });
                const data = await parseStringPromise(res.data, { explicitArray: false });
                const node = data.sessionParameters || data.activeSession;
                if (node) foundSessions = [node];
            } else {
                // Username - active sessions search
                const endpoint = `${targetUrl}/admin/API/mnt/Session/ActiveList`;
                const res = await axios.get(endpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                    httpsAgent: agent,
                    timeout: 30000
                });
                const xml = res.data;
                const searchLower = formattedQuery.toLowerCase();
                
                const sessionMatches = xml.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
                const userMatches = sessionMatches.filter((s: string) => s.toLowerCase().includes(`<user_name>${searchLower}</user_name>`));
                
                for (const sessionXml of userMatches.slice(0, 5)) {
                    const macMatch = sessionXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
                    if (macMatch) {
                        const mac = macMatch[1];
                        try {
                            const detailRes = await axios.get(`${targetUrl}/admin/API/mnt/Session/MACAddress/${mac}`, {
                                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                                httpsAgent: agent,
                                timeout: 5000
                            });
                            const detailData = await parseStringPromise(detailRes.data, { explicitArray: false });
                            const node = detailData.sessionParameters || detailData.activeSession;
                            if (node) foundSessions.push(node);
                        } catch (e) {}
                    }
                }
            }

            return foundSessions;
        });

        if (sessionsArray.length === 0) {
            return { found: false, message: "No active session found for query." };
        }

        const sgtMap = await getTrustSecSgtMap();

        const mappedSessions = sessionsArray.map((sessionNode: any) => {
            let timestamp = "Unknown";
            let timestampLabel = "EVENT TIME";

            if (sessionNode.auth_acs_timestamp?._ || sessionNode.auth_acs_timestamp) {
                timestamp = sessionNode.auth_acs_timestamp?._ || sessionNode.auth_acs_timestamp;
                timestampLabel = "AUTH TIME";
            } else if (sessionNode.acct_acs_timestamp?._ || sessionNode.acct_acs_timestamp) {
                timestamp = sessionNode.acct_acs_timestamp?._ || sessionNode.acct_acs_timestamp;
                timestampLabel = "ACCT TIME";
            } else if (sessionNode.event_timestamp?._ || sessionNode.event_timestamp) {
                timestamp = sessionNode.event_timestamp?._ || sessionNode.event_timestamp;
                timestampLabel = "EVENT TIME";
            } else if (sessionNode.acs_timestamp?._ || sessionNode.acs_timestamp || sessionNode.acsTimestamp) {
                timestamp = sessionNode.acs_timestamp?._ || sessionNode.acs_timestamp || sessionNode.acsTimestamp;
                timestampLabel = "SESSION TIME";
            }

            // Deep parse other_attr_string for hidden fields like SSID
            const otherAttrs: Record<string, string> = {};
            const rawAttrs = sessionNode.other_attr_string?._ || sessionNode.other_attr_string || "";
            if (rawAttrs) {
                rawAttrs.split(':!:').forEach((pair: string) => {
                    const [key, ...valParts] = pair.split('=');
                    if (key && valParts.length > 0) {
                        otherAttrs[key.trim()] = valParts.join('=').trim();
                    }
                });
            }

            const callingStationId = otherAttrs['Called-Station-ID'] || sessionNode.calling_station_id?._ || sessionNode.calling_station_id || "";
            let extractedSsid = "N/A";
            let extractedApIdentity = sessionNode.network_device_name?._ || sessionNode.network_device_name || otherAttrs['NAS-Identifier'] || "N/A";

            const { ssid: parseSsid, apName: parseApName, siteCode: parseSiteCode } = parseCalledStationId(callingStationId, extractedApIdentity);
            extractedSsid = parseSsid;
            extractedApIdentity = parseApName;

            const rawSgt = sessionNode.cisco_cts_sgt?._ || sessionNode.cisco_cts_sgt || sessionNode.ciscoCtsSgt || otherAttrs['CTS-Security-Group-Tag'] || "Unknown";
            let sgtName = "Unknown";
            let formattedSgt = rawSgt;

            if (rawSgt !== "Unknown") {
                const numSgt = parseInt(String(rawSgt).trim(), 10);
                if (!isNaN(numSgt) && sgtMap[numSgt]) {
                    sgtName = sgtMap[numSgt];
                    formattedSgt = `${sgtMap[numSgt]} (${numSgt})`;
                }
            }

            return {
                user_name: sessionNode.user_name?._ || sessionNode.user_name || sessionNode.userName,
                calling_station_id: sessionNode.calling_station_id?._ || sessionNode.calling_station_id || sessionNode.callingStationId,
                framed_ip_address: sessionNode.framed_ip_address?._ || sessionNode.framed_ip_address || sessionNode.framedIPAddress,
                nas_ip_address: sessionNode.nas_ip_address?._ || sessionNode.nas_ip_address || sessionNode.nasIpAddress,
                nas_port_id: sessionNode.nas_port_id?._ || sessionNode.nas_port_id || sessionNode.nasPortId,
                nas_identifier: sessionNode.nas_identifier?._ || sessionNode.nas_identifier || sessionNode.nasIdentifier || sessionNode.network_device_name?._ || sessionNode.network_device_name || otherAttrs['NAS-Identifier'] || "Unknown",
                endpoint_profile: otherAttrs['EndPointProfilerProfile'] || otherAttrs['EndPointProfile'] || sessionNode.endpoint_profile?._ || sessionNode.endpoint_profile || sessionNode.endpointProfile || "Unknown",
                identity_group: sessionNode.identity_group?._ || sessionNode.identity_group || sessionNode.identityGroup || "Unknown",
                posture_status: sessionNode.posture_status?._ || sessionNode.posture_status || sessionNode.postureStatus || "Unknown",
                timestamp: timestamp,
                timestamp_label: timestampLabel,
                authorization_rule: sessionNode.authorization_rule?._ || sessionNode.authorization_rule || sessionNode.authorizationRule || "Unknown",
                authentication_method: sessionNode.authentication_method?._ || sessionNode.authentication_method || sessionNode.authenticationMethod || "Unknown",
                authentication_protocol: sessionNode.authentication_protocol?._ || sessionNode.authentication_protocol || sessionNode.authenticationProtocol || "Unknown",
                vlan: sessionNode.vlan?._ || sessionNode.vlan || "Unknown",
                security_group: formattedSgt,
                sgt_name: sgtName,
                mdm_server_name: sessionNode.mdm_server_name?._ || sessionNode.mdm_server_name || sessionNode.mdmServerName || "N/A",
                mdm_reachable: sessionNode.mdm_reachable?._ || sessionNode.mdm_reachable || sessionNode.mdmReachable || "Unknown",
                mdm_compliant: sessionNode.mdm_compliant?._ || sessionNode.mdm_compliant || sessionNode.mdmCompliant || "Unknown",
                audit_session_id: sessionNode.audit_session_id?._ || sessionNode.audit_session_id || sessionNode.auditSessionId || "Unknown",
                acs_server: sessionNode.acs_server?._ || sessionNode.acs_server || sessionNode.acsServer || "Unknown",
                endpoint_policy: sessionNode.endpoint_policy?._ || sessionNode.endpoint_policy || sessionNode.endpointPolicy || sessionNode.endpoint_profile?._ || sessionNode.endpoint_profile || "Unknown",
                wlan_ssid: sessionNode.wlan_ssid?._ || sessionNode.wlan_ssid || sessionNode.wlanSsid || extractedSsid,
                access_point_name: extractedApIdentity,
                site_code: parseSiteCode,
                rssi: otherAttrs['Airespace-RSSI'] || otherAttrs['RSSI'] || otherAttrs['Signal-Strength'] || "N/A",
                user_agent: otherAttrs['User-Agent'] || otherAttrs['UserAgent'] || otherAttrs['device-sensor-user-agent'] || "N/A",
                hardware_manufacturer: "",
                hardware_model: "",
                os_version: "",
                device_type: ""
            };
        });

        // Parallel Surgical ERS Profiling over API Gateway Port 443
        const enrichedSessions = await Promise.all(mappedSessions.map(async (session: any) => {
            try {
                const ersEndpoint = `${activeUrl}/ers/config/endpoint/name/${session.calling_station_id}`;
                const ersRes = await axios.get(ersEndpoint, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                    httpsAgent: agent,
                    timeout: 3000
                });

                const ep = ersRes.data?.ERSEndPoint;
                if (ep && ep.mfcAttributes) {
                    const mfc = ep.mfcAttributes;
                    const getStr = (val: any) => Array.isArray(val) ? val.join('') : (val || "");
                    const manufacturer = getStr(mfc.mfcHardwareManufacturer);
                    const model = getStr(mfc.mfcHardwareModel);
                    const os = getStr(mfc.mfcOperatingSystem);
                    const devType = getStr(mfc.mfcDeviceType);

                    if (manufacturer) session.hardware_manufacturer = manufacturer;
                    if (model) session.hardware_model = model;
                    if (os) session.os_version = os;
                    if (devType) session.device_type = devType;

                    const parts = [manufacturer, model].filter(Boolean).join(' ');
                    if (parts) {
                        session.endpoint_profile = parts;
                    } else if (manufacturer || os) {
                        session.endpoint_profile = `${manufacturer || ""} ${os || ""}`.trim();
                    }
                }
            } catch (e) {
                // Ignore ERS errors, fallback to MnT data
            }
            return session;
        }));

        return {
            found: true,
            sessions: enrichedSessions
        };

    } catch (e: any) {
        console.error("ISE fetch error:", e);
        throw new Error(e.message || "Failed to communicate with Cisco ISE MnT API");
    }
}

export const ISE_FAILURE_MAP: Record<string, { cause: string; suggestion: string }> = {
    "11001": { cause: "User not found in Active Directory", suggestion: "Verify the username spelling or check if the account exists in the target AD domain." },
    "11006": { cause: "AD Connectivity Error", suggestion: "ISE is having trouble talking to the Domain Controller. Check AD Join status." },
    "11507": { cause: "Password Expired", suggestion: "The user's password has expired in AD. They must reset it before they can connect." },
    "12313": { cause: "No Client Certificate Found", suggestion: "The device did not present a certificate. Verify that the computer/user certificate is installed." },
    "12511": { cause: "Untrusted Certificate", suggestion: "The certificate presented by the client is not trusted by ISE. Check the Root CA chain." },
    "22040": { cause: "Wrong Password", suggestion: "The user entered an incorrect password." },
    "22056": { cause: "Account Disabled", suggestion: "The user's account is disabled in Active Directory." },
    "22058": { cause: "Account Locked", suggestion: "The user's account is locked in AD due to too many failed attempts." },
    "22061": { cause: "Account Expired", suggestion: "The user's account has reached its expiration date in AD." },
    "5400": { cause: "RADIUS Timeout", suggestion: "The client stopped responding to RADIUS requests. Often caused by poor wireless signal." }
};

export function getFailureInsight(id: string) {
    return ISE_FAILURE_MAP[id] || { cause: "Unknown Policy/System Failure", suggestion: "Review the technical execution steps for more details." };
}
