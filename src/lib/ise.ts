import https from 'https';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

export function parseCalledStationId(calledStationId: string, fallbackApName: string = "N/A") {
    let ssid = "N/A";
    let apName = fallbackApName;
    let siteCode = "N/A";

    if (calledStationId && calledStationId.includes(':')) {
        const parts = calledStationId.split(':');
        // Extract SSID (last part)
        ssid = parts.pop() || "N/A";
        // Remaining parts are the AP Name
        const remaining = parts.join(':');
        if (remaining) {
            apName = remaining;
        }
    }

    if (apName !== "N/A" && apName.length >= 3) {
        // Site code is first 3 chars
        siteCode = apName.substring(0, 3).toUpperCase();
    }

    return { ssid, apName, siteCode };
}

export async function fetchIseSession(query: string) {
    const rawUrl = process.env.ISE_PAN_URL;
    const rawUser = process.env.ISE_API_USER;
    const rawPass = process.env.ISE_API_PASSWORD;

    if (!rawUrl || !rawUser || !rawPass) {
        throw new Error("ISE Credentials not configured in .env");
    }

    // Quote-Resilience
    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const user = rawUser.replace(/^"|"$/g, '');
    const pass = rawPass.replace(/^"|"$/g, '');
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');
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
    }

    try {
        let sessionsArray: any[] = [];

        if (searchType === "calling_station_id") {
            const endpoint = `${url}/admin/API/mnt/Session/MACAddress/${formattedQuery}`;
            console.log(`[ISE-LIB] Fetching Surgical Session: ${endpoint}`);
            const res = await axios.get(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                httpsAgent: agent,
                timeout: 10000
            });
            const data = await parseStringPromise(res.data, { explicitArray: false });
            const node = data.sessionParameters || data.activeSession;
            if (node) sessionsArray = [node];
        } else if (searchType === "framed_ip_address") {
            const endpoint = `${url}/admin/API/mnt/Session/IPAddress/${formattedQuery}`;
            const res = await axios.get(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                httpsAgent: agent,
                timeout: 10000
            });
            const data = await parseStringPromise(res.data, { explicitArray: false });
            const node = data.sessionParameters || data.activeSession;
            if (node) sessionsArray = [node];
        } else {
            // Username - we must use ActiveList as a fallback for 3.3
            const endpoint = `${url}/admin/API/mnt/Session/ActiveList`;
            const res = await axios.get(endpoint, {
                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                httpsAgent: agent,
                timeout: 30000
            });
            const xml = res.data;
            const searchLower = formattedQuery.toLowerCase();
            
            // Regex match for the specific username in the bulk XML (Faster than full parse)
            const sessionMatches = xml.match(/<activeSession>([\s\S]*?)<\/activeSession>/g) || [];
            const userMatches = sessionMatches.filter((s: string) => s.toLowerCase().includes(`<user_name>${searchLower}</user_name>`));
            
            // For the first few matches, fetch their full details surgically
            for (const sessionXml of userMatches.slice(0, 5)) {
                const macMatch = sessionXml.match(/<calling_station_id>(.*?)<\/calling_station_id>/);
                if (macMatch) {
                    const mac = macMatch[1];
                    try {
                        const detailRes = await axios.get(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                            headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml", "X-ERS-Internal-User": "true" },
                            httpsAgent: agent,
                            timeout: 5000
                        });
                        const detailData = await parseStringPromise(detailRes.data, { explicitArray: false });
                        const node = detailData.sessionParameters || detailData.activeSession;
                        if (node) sessionsArray.push(node);
                    } catch (e) {}
                }
            }
        }

        if (sessionsArray.length === 0) {
            return { found: false, message: "No active session found for query." };
        }

        const mappedSessions = sessionsArray.map((sessionNode: any) => {
            const timestamp = sessionNode.acs_timestamp?._ || sessionNode.acs_timestamp || sessionNode.acsTimestamp || "Unknown";

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

            const calledStationId = otherAttrs['Called-Station-ID'] || sessionNode.called_station_id?._ || sessionNode.called_station_id || "";
            let extractedSsid = "N/A";
            let extractedApIdentity = sessionNode.network_device_name?._ || sessionNode.network_device_name || otherAttrs['NAS-Identifier'] || "N/A";

            if (calledStationId.includes(':')) {
                const parts = calledStationId.split(':');
                extractedSsid = parts.pop() || "N/A";
                const firstPart = parts.join(':');
                if (firstPart) extractedApIdentity = firstPart;
            }

            return {
                user_name: sessionNode.user_name?._ || sessionNode.user_name || sessionNode.userName,
                calling_station_id: sessionNode.calling_station_id?._ || sessionNode.calling_station_id || sessionNode.callingStationId,
                framed_ip_address: sessionNode.framed_ip_address?._ || sessionNode.framed_ip_address || sessionNode.framedIPAddress,
                nas_ip_address: sessionNode.nas_ip_address?._ || sessionNode.nas_ip_address || sessionNode.nasIpAddress,
                nas_port_id: sessionNode.nas_port_id?._ || sessionNode.nas_port_id || sessionNode.nasPortId,
                nas_identifier: sessionNode.nas_identifier?._ || sessionNode.nas_identifier || sessionNode.nasIdentifier || "Unknown",
                endpoint_profile: sessionNode.endpoint_profile?._ || sessionNode.endpoint_profile || sessionNode.endpointProfile || "Unknown",
                identity_group: sessionNode.identity_group?._ || sessionNode.identity_group || sessionNode.identityGroup || "Unknown",
                posture_status: sessionNode.posture_status?._ || sessionNode.posture_status || sessionNode.postureStatus || "Unknown",
                start_time: timestamp,
                authorization_rule: sessionNode.authorization_rule?._ || sessionNode.authorization_rule || sessionNode.authorizationRule || "Unknown",
                authentication_method: sessionNode.authentication_method?._ || sessionNode.authentication_method || sessionNode.authenticationMethod || "Unknown",
                authentication_protocol: sessionNode.authentication_protocol?._ || sessionNode.authentication_protocol || sessionNode.authenticationProtocol || "Unknown",
                vlan: sessionNode.vlan?._ || sessionNode.vlan || "Unknown",
                security_group: sessionNode.cisco_cts_sgt?._ || sessionNode.cisco_cts_sgt || sessionNode.ciscoCtsSgt || "Unknown",
                mdm_server_name: sessionNode.mdm_server_name?._ || sessionNode.mdm_server_name || sessionNode.mdmServerName || "N/A",
                mdm_reachable: sessionNode.mdm_reachable?._ || sessionNode.mdm_reachable || sessionNode.mdmReachable || "Unknown",
                mdm_compliant: sessionNode.mdm_compliant?._ || sessionNode.mdm_compliant || sessionNode.mdmCompliant || "Unknown",
                audit_session_id: sessionNode.audit_session_id?._ || sessionNode.audit_session_id || sessionNode.auditSessionId || "Unknown",
                acs_server: sessionNode.acs_server?._ || sessionNode.acs_server || sessionNode.acsServer || "Unknown",
                endpoint_policy: sessionNode.endpoint_policy?._ || sessionNode.endpoint_policy || sessionNode.endpointPolicy || sessionNode.endpoint_profile?._ || sessionNode.endpoint_profile || "Unknown",
                wlan_ssid: sessionNode.wlan_ssid?._ || sessionNode.wlan_ssid || sessionNode.wlanSsid || extractedSsid,
                access_point_name: extractedApIdentity,
                site_code: parseCalledStationId(calledStationId, extractedApIdentity).siteCode
            };
        });

        return {
            found: true,
            sessions: mappedSessions
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
