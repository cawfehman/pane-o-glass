import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchIseSession, normalizeMacAddress, getIseUrls, executeWithPanFailover } from "@/lib/ise";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";
import { getUserDetails } from "@/lib/ldap";
import { getVectraHosts } from "@/lib/vectra";
import { fetchWlcClientTelemetry } from "@/lib/wlc";
import https from "https";
import axios from "axios";

export async function GET(request: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ise'))) {
            return new NextResponse("Forbidden: Access to this tool is restricted.", { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const query = searchParams.get("query");

        if (!query) {
            return new NextResponse("Missing query parameter", { status: 400 });
        }

        // 1. Audit the search action
        const userId = (session.user as any)?.id;
        const clientIp = request.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
        await logAudit("ISE_SESSION_SEARCH", `Searched ISE for endpoint: ${query}`, userId, clientIp);

        // 2. Perform the base ISE lookup
        const result = await fetchIseSession(query);

        if (!result.found || !result.sessions || result.sessions.length === 0) {
            // Check if query is a MAC address or normalizable to MAC
            const normalizedMac = normalizeMacAddress(query);
            if (normalizedMac) {
                // Query WLC real-time telemetry directly
                let wlcTelemetry = null;
                try {
                    wlcTelemetry = await fetchWlcClientTelemetry(normalizedMac);
                } catch (e) {
                    console.warn(`[ISE-SESSION] Direct WLC telemetry fetch failed:`, e);
                }

                if (wlcTelemetry?.found) {
                    // Endpoint profile enrichment from ERS
                    let endpointProfile = "Wireless Client";
                    let hardwareManufacturer = "";
                    let hardwareModel = "";
                    let osVersion = "";
                    let deviceType = "";

                    try {
                        const { basicAuth } = getIseUrls();
                        const agent = new https.Agent({ rejectUnauthorized: false });
                        const { data: epRes } = await executeWithPanFailover(async (baseUrl) => {
                            const res = await axios.get(`${baseUrl}/ers/config/endpoint/name/${normalizedMac}`, {
                                headers: { "Authorization": `Basic ${basicAuth}`, "Accept": "application/json" },
                                httpsAgent: agent,
                                timeout: 2500
                            });
                            return res.data;
                        });

                        const ep = epRes?.ERSEndPoint;
                        if (ep) {
                            if (ep.staticProfileAssignment || ep.profileId) {
                                endpointProfile = ep.staticProfileAssignment || ep.profileId;
                            }
                            if (ep.mfcAttributes) {
                                const mfc = ep.mfcAttributes;
                                const getStr = (val: any) => Array.isArray(val) ? val.join('') : (val || "");
                                hardwareManufacturer = getStr(mfc.mfcHardwareManufacturer);
                                hardwareModel = getStr(mfc.mfcHardwareModel);
                                osVersion = getStr(mfc.mfcOperatingSystem);
                                deviceType = getStr(mfc.mfcDeviceType);

                                const parts = [hardwareManufacturer, hardwareModel].filter(Boolean).join(' ');
                                if (parts) endpointProfile = parts;
                                else if (hardwareManufacturer || osVersion) endpointProfile = `${hardwareManufacturer || ""} ${osVersion || ""}`.trim();
                            }
                        }
                    } catch (e) {}

                    // Vectra security context
                    let vectra = null;
                    try {
                        const searchVal = (wlcTelemetry.clientIp && wlcTelemetry.clientIp !== "0.0.0.0") ? wlcTelemetry.clientIp : normalizedMac;
                        const vectraData = await getVectraHosts({ name: searchVal });
                        if (vectraData.results && vectraData.results.length > 0) {
                            const host = vectraData.results[0];
                            vectra = {
                                id: host.id,
                                threat: host.threat,
                                certainty: host.certainty,
                                t_score: host.t_score,
                                c_score: host.c_score,
                                last_seen: host.last_seen
                            };
                        }
                    } catch (e) {}

                    const syntheticSession = {
                        calling_station_id: normalizedMac,
                        framed_ip_address: (wlcTelemetry.clientIp && wlcTelemetry.clientIp !== "0.0.0.0") ? wlcTelemetry.clientIp : "Pending DHCP / No IP",
                        nas_identifier: wlcTelemetry.wlcName,
                        nas_ip_address: wlcTelemetry.wlcIp,
                        access_point_name: wlcTelemetry.apName || "N/A",
                        ap_location: wlcTelemetry.apLocation || "N/A",
                        wlan_ssid: wlcTelemetry.ssid || "N/A",
                        endpoint_profile: endpointProfile,
                        hardware_manufacturer: hardwareManufacturer,
                        hardware_model: hardwareModel,
                        os_version: osVersion,
                        device_type: deviceType,
                        status: true,
                        timestamp: new Date().toISOString(),
                        timestamp_label: "WLC ASSOCIATION",
                        network_device_name: wlcTelemetry.wlcName,
                        is_wlc_live_only: true,
                        wlcTelemetry,
                        enrichment: {
                            ad: null,
                            vectra
                        }
                    };

                    return NextResponse.json({
                        found: true,
                        sessions: [syntheticSession],
                        wlcTelemetry
                    });
                }
            }

            return NextResponse.json(result);
        }

        // 3. Enrich the sessions with AD Identity and Vectra Security Context
        const adCache = new Map<string, any>();
        const vectraCache = new Map<string, any>();

        const getCachedAd = async (user: string) => {
            if (!user || user === "Unknown") return null;
            if (adCache.has(user)) return adCache.get(user);
            try {
                const details = await getUserDetails(user);
                adCache.set(user, details);
                return details;
            } catch {
                adCache.set(user, null);
                return null;
            }
        };

        const getCachedVectra = async (val: string) => {
            if (!val) return null;
            if (vectraCache.has(val)) return vectraCache.get(val);
            try {
                const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 1500));
                const fetchPromise = (async () => {
                    const vectraData = await getVectraHosts({ name: val });
                    if (vectraData?.results && vectraData.results.length > 0) {
                        const host = vectraData.results[0];
                        return {
                            id: host.id,
                            threat: host.threat,
                            certainty: host.certainty,
                            t_score: host.t_score,
                            c_score: host.c_score,
                            last_seen: host.last_seen
                        };
                    }
                    return null;
                })();
                const res = await Promise.race([fetchPromise, timeoutPromise]);
                vectraCache.set(val, res);
                return res;
            } catch {
                vectraCache.set(val, null);
                return null;
            }
        };

        const enrichedSessions = await Promise.all(result.sessions.map(async (iseSession: any) => {
            const enrichment: any = {
                ad: null,
                vectra: null
            };

            // LDAP Enrichment (Memoized)
            if (iseSession.user_name) {
                enrichment.ad = await getCachedAd(iseSession.user_name);
            }

            // Vectra Enrichment (Search by IP or MAC, Memoized)
            const searchVal = iseSession.framed_ip_address || iseSession.calling_station_id;
            if (searchVal) {
                enrichment.vectra = await getCachedVectra(searchVal);
            }

            // WLC Real-Time Telemetry (AireOS 8540 SNMP - skip for PassiveID sessions)
            let wlcTelemetry = null;
            if (iseSession.calling_station_id && !iseSession.is_passive_identity) {
                try {
                    const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 1500));
                    wlcTelemetry = await Promise.race([
                        fetchWlcClientTelemetry(iseSession.calling_station_id),
                        timeoutPromise
                    ]);
                } catch (e) {}
            }

            const apName = (iseSession.access_point_name && iseSession.access_point_name !== "N/A") 
                ? iseSession.access_point_name 
                : (wlcTelemetry?.apName || iseSession.access_point_name || "N/A");

            const ssid = (iseSession.wlan_ssid && iseSession.wlan_ssid !== "N/A")
                ? iseSession.wlan_ssid
                : (wlcTelemetry?.ssid || iseSession.wlan_ssid || "N/A");

            return {
                ...iseSession,
                access_point_name: apName,
                wlan_ssid: ssid,
                wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null,
                enrichment
            };
        }));

        return NextResponse.json({
            ...result,
            sessions: enrichedSessions,
            wlcTelemetry: enrichedSessions.find((s: any) => s.wlcTelemetry)?.wlcTelemetry || null
        });

    } catch (error: any) {
        console.error("ISE Session API Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to query Cisco ISE" },
            { status: 500 }
        );
    }
}
