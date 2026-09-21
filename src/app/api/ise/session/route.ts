import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchIseSession } from "@/lib/ise";
import { logAudit } from "@/lib/audit";
import { hasPermission } from "@/app/actions/permissions";
import { getUserDetails } from "@/lib/ldap";
import { getVectraHosts } from "@/lib/vectra";
import { fetchWlcClientTelemetry } from "@/lib/wlc";

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

        if (!result.found || !result.sessions) {
            return NextResponse.json(result);
        }

        // 3. Enrich the sessions with AD Identity and Vectra Security Context
        const enrichedSessions = await Promise.all(result.sessions.map(async (iseSession: any) => {
            const enrichment: any = {
                ad: null,
                vectra: null
            };

            // LDAP Enrichment
            if (iseSession.user_name) {
                enrichment.ad = await getUserDetails(iseSession.user_name);
            }

            // Vectra Enrichment (Search by IP or MAC)
            try {
                const searchVal = iseSession.framed_ip_address || iseSession.calling_station_id;
                if (searchVal) {
                    const vectraData = await getVectraHosts({ name: searchVal });
                    if (vectraData.results && vectraData.results.length > 0) {
                        const host = vectraData.results[0];
                        enrichment.vectra = {
                            id: host.id,
                            threat: host.threat,
                            certainty: host.certainty,
                            t_score: host.t_score,
                            c_score: host.c_score,
                            last_seen: host.last_seen
                        };
                    }
                }
            } catch (e) {
                console.error("Vectra Enrichment Error:", e);
            }

            // WLC Real-Time Telemetry (AireOS 8540 SNMP - skip for PassiveID sessions)
            let wlcTelemetry = null;
            if (iseSession.calling_station_id && !iseSession.is_passive_identity) {
                try {
                    wlcTelemetry = await fetchWlcClientTelemetry(iseSession.calling_station_id);
                } catch (e) {}
            }

            return {
                ...iseSession,
                wlcTelemetry: wlcTelemetry?.found ? wlcTelemetry : null,
                enrichment
            };
        }));

        return NextResponse.json({
            ...result,
            sessions: enrichedSessions
        });

    } catch (error: any) {
        console.error("ISE Session API Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to query Cisco ISE" },
            { status: 500 }
        );
    }
}
