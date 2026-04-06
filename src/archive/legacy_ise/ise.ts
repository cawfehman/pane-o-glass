import { parseStringPromise } from 'xml2js';

export async function fetchIseSession(query: string) {
    const url = process.env.ISE_PAN_URL;
    const user = process.env.ISE_API_USER;
    const pass = process.env.ISE_API_PASSWORD;

    if (!url || !user || !pass) {
        throw new Error("ISE Credentials not configured in .env");
    }

    // Determine query type
    let searchType = "user_name";
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(query)) {
        searchType = "framed_ip_address";
    } else if (/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(query) || /^[0-9A-Fa-f]{12}$/.test(query)) {
        searchType = "calling_station_id"; // MAC Address
        if (query.length === 12) {
            query = query.match(/.{1,2}/g)?.join(":") || query;
        } else {
            query = query.replace(/-/g, ":");
        }
        query = query.toUpperCase(); // ISE MnT often expects uppercase MAC
    }

    // MnT API uses Basic Auth
    const basicAuth = Buffer.from(`${user}:${pass}`).toString('base64');

    // The MnT API for a specific session by MAC: /admin/API/mnt/Session/MACAddress/{mac}
    // For Username or IP, we must query the ActiveList and filter it out.
    // To ensure broad compatibility and not crash on 404s, we will grab the /admin/API/mnt/Session/ActiveList
    // which returns ALL sessions, and filter it locally if it's small, OR we can use the specific endpoints.

    let endpoint = "";
    let localFilter = false;

    if (searchType === "calling_station_id") {
        endpoint = `${url}/admin/API/mnt/Session/MACAddress/${query}`;
    } else if (searchType === "framed_ip_address") {
        endpoint = `${url}/admin/API/mnt/Session/IPAddress/${query}`;
    } else if (searchType === "user_name") {
        // Cisco's UserName endpoint explicitly caps returns to the *single latest* session.
        // To return ALL active devices for a user, we must parse the entire ActiveList locally.
        endpoint = `${url}/admin/API/mnt/Session/ActiveList`;
        localFilter = true;
    }

    try {
        const response = await fetch(endpoint, {
            headers: {
                "Authorization": `Basic ${basicAuth}`,
                "Accept": "application/xml" // MnT API strictly returns XML
            }
        });

        if (!response.ok) {
            // MnT specifically throws 404/500 if the session just isn't found
            if (response.status === 404 || response.status === 500) {
                return { found: false, message: "No active session found for query." };
            }
            if (response.status === 401) throw new Error("ISE Authentication Failed (401)");
            throw new Error(`ISE MnT API HTTP Error: ${response.status}`);
        }

        const xmlText = await response.text();
        const data = await parseStringPromise(xmlText, { explicitArray: false });

        // Parse XML response
        let sessionNodes = data.sessionParameters || data.activeSession;
        if (!sessionNodes && data.activeList && data.activeList.activeSession) {
            sessionNodes = data.activeList.activeSession;
        }

        if (!sessionNodes) {
            return { found: false, message: "Session data empty." };
        }

        // Normalize to array
        let sessionsArray = Array.isArray(sessionNodes) ? sessionNodes : [sessionNodes];

        if (localFilter && searchType === "user_name") {
            const searchLower = query.toLowerCase();
            sessionsArray = sessionsArray.filter((s: any) => {
                const u = s.user_name?._ || s.user_name || s.userName;
                return u && typeof u === 'string' && u.toLowerCase() === searchLower;
            });

            if (sessionsArray.length === 0) {
                return { found: false, message: "No active sessions found for this username." };
            }
        }

        // Run secondary lookups to get rich data (like timestamp) that the ActiveList strips out
        const detailedSessions = await Promise.all(sessionsArray.map(async (basicNode: any) => {
            const mac = basicNode.calling_station_id?._ || basicNode.calling_station_id || basicNode.callingStationId;
            if (!mac) return basicNode; // Fallback to basic node

            try {
                const macEnrichRes = await fetch(`${url}/admin/API/mnt/Session/MACAddress/${mac}`, {
                    headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/xml" }
                });
                if (macEnrichRes.ok) {
                    const macXml = await macEnrichRes.text();
                    const macData = await parseStringPromise(macXml, { explicitArray: false });
                    return macData.sessionParameters || macData.activeSession || basicNode;
                }
                return basicNode;
            } catch (e) {
                return basicNode;
            }
        }));

        const mappedSessions = detailedSessions.map((sessionNode: any) => {
            const timestamp = sessionNode.acs_timestamp?._ || sessionNode.acs_timestamp || sessionNode.acsTimestamp || "Unknown";

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
                endpoint_policy: sessionNode.endpoint_policy?._ || sessionNode.endpoint_policy || sessionNode.endpointPolicy || sessionNode.endpoint_profile?._ || sessionNode.endpoint_profile || "Unknown"
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
