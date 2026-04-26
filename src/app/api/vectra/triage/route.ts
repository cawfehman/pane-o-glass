import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getVectraHosts, getVectraAccounts, getVectraDetections } from "@/lib/vectra";
import { hasPermission } from "@/app/actions/permissions";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = (session.user as any).role;
    const canAccess = await hasPermission(role, 'vectra');
    if (!canAccess && role !== 'ADMIN') {
        return NextResponse.json({ error: "Access Denied" }, { status: 403 });
    }

    try {
        // Perform parallel fetching for the triage dashboard
        const [hRes, aRes, dRes] = await Promise.allSettled([
            getVectraHosts({ highRiskOnly: true, ordering: '-t_score' }),
            getVectraAccounts({ ordering: '-t_score' }),
            getVectraDetections({ ordering: '-last_timestamp' })
        ]);

        const hData = hRes.status === 'fulfilled' ? hRes.value : { results: [], count: 0 };
        const aData = aRes.status === 'fulfilled' ? aRes.value : { results: [], count: 0 };
        const dData = dRes.status === 'fulfilled' ? dRes.value : { results: [], count: 0 };

        const hResults = hData.results || [];
        const aResults = aData.results || [];
        const dResults = dData.results || [];

        // Aggregate Detection Categories for the distribution bar
        const dist: Record<string, number> = {};
        dResults.forEach((det: any) => {
            const cat = det.category || det.detection_type || 'Unknown';
            dist[cat] = (dist[cat] || 0) + 1;
        });

        const topCat = Object.entries(dist).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None';

        // Forensic Audit Logging
        console.log(`[FORENSIC AUDIT] User: ${session.user?.email} | Action: Vectra_Triage_Dashboard`);

        return NextResponse.json({
            hosts: hResults.slice(0, 10),
            accounts: aResults.slice(0, 10),
            stats: {
                criticalHosts: hResults.filter((h: any) => (h.threat || h.t_score) > 50 && (h.certainty || h.c_score) > 50).length,
                criticalAccounts: aResults.filter((a: any) => (a.threat || a.t_score) > 50 && (a.certainty || a.c_score) > 50).length,
                topCategory: topCat,
                totalHosts: hData.count || hResults.length,
                totalAccounts: aData.count || aResults.length,
                totalDetections: dData.count || dResults.length
            },
            detectionDistribution: dist
        });
    } catch (error: any) {
        console.error("[VECTRA TRIAGE ERROR]:", error);
        return NextResponse.json({ error: "Vectra Triage Synchronization Failure" }, { status: 500 });
    }
}
