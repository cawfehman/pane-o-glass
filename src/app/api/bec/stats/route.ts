import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    const startTime = Date.now();
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'ironport'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 3600;
        const isAllTime = rangeSeconds === 0;
        const cutoffDate = isAllTime ? new Date(0) : new Date(Date.now() - rangeSeconds * 1000);

        // 1. Query dynamic raw URL counts and domain aggregations from BecRawUrl for cutoffDate
        const rawUrls = isAllTime
            ? await (prisma as any).becRawUrl.findMany({ take: 10000, orderBy: { createdAt: "desc" } }).catch(() => [])
            : await (prisma as any).becRawUrl.findMany({ where: { createdAt: { gte: cutoffDate } }, take: 10000, orderBy: { createdAt: "desc" } }).catch(() => []);

        let topUnwrappedDomains: any[] = [];
        let thirdPartyOAuthLinks: any[] = [];
        let totalEvaluatedUrls = rawUrls.length;
        let totalEvaluatedMessages = 0;

        if (rawUrls.length > 0) {
            const domainCounts: Record<string, number> = {};
            const oauthMap: Record<string, { provider: string; count: number; links: Set<string>; inboxes: Set<string> }> = {};
            const uniqueMsgs = new Set<string>();

            for (const r of rawUrls) {
                if (r.mid) uniqueMsgs.add(r.mid);
                if (r.targetHost) {
                    domainCounts[r.targetHost] = (domainCounts[r.targetHost] || 0) + 1;
                }
                if (r.isOauth && r.provider) {
                    if (!oauthMap[r.provider]) {
                        oauthMap[r.provider] = { provider: r.provider, count: 0, links: new Set(), inboxes: new Set() };
                    }
                    oauthMap[r.provider].count++;
                    if (r.destUrl) oauthMap[r.provider].links.add(r.destUrl);
                    if (r.recipient) oauthMap[r.provider].inboxes.add(r.recipient);
                }
            }

            totalEvaluatedMessages = uniqueMsgs.size;

            topUnwrappedDomains = Object.entries(domainCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([domain, count]) => ({
                    domain,
                    count,
                    percentage: totalEvaluatedUrls > 0 ? Number(((count / totalEvaluatedUrls) * 100).toFixed(1)) : 0
                }));

            thirdPartyOAuthLinks = Object.values(oauthMap).map(o => ({
                provider: o.provider,
                count: o.count,
                linksCount: o.links.size,
                inboxesCount: o.inboxes.size,
                sampleLinks: Array.from(o.links).slice(0, 3),
                sharePct: totalEvaluatedUrls > 0 ? Number(((o.count / totalEvaluatedUrls) * 100).toFixed(1)) : 0
            }));
        }

        // 2. Query ALL logged threat incidents from BecIncident table for cutoffDate
        const dbIncidents = isAllTime ? 
            await (prisma as any).becIncident.findMany({
                orderBy: { createdAt: "desc" }
            }).catch(() => []) :
            await (prisma as any).becIncident.findMany({
                where: { createdAt: { gte: cutoffDate } },
                orderBy: { createdAt: "desc" }
            }).catch(() => []);

        // Map DB incidents to Threat Feed items
        const dbBecThreats = dbIncidents.map((inc: any) => ({
            mid: inc.mid,
            subject: inc.subject || "No Subject Header",
            sender: inc.sender || "unknown",
            recipient: inc.recipient || "unknown",
            targetHost: inc.targetHost,
            destUrl: inc.destUrl,
            threatTier: inc.threatTier,
            threatCategory: inc.threatCategory,
            impersonationBoost: inc.impersonationBoost,
            timestamp: inc.createdAt.toISOString()
        }));

        // Deduplicate and combine DB incidents + Cache threats (DB incidents take priority)
        const combinedThreatsMap = new Map<string, any>();
        cacheBecThreats.forEach((t: any) => {
            if (t.mid) combinedThreatsMap.set(t.mid, t);
        });
        dbBecThreats.forEach((t: any) => {
            if (t.mid) combinedThreatsMap.set(t.mid, t);
        });

        // If no incidents found within cutoff date, fallback to all recent incidents in DB up to 100
        if (combinedThreatsMap.size === 0) {
            const allRecentIncidents = await (prisma as any).becIncident.findMany({
                take: 100,
                orderBy: { createdAt: "desc" }
            }).catch(() => []);

            allRecentIncidents.forEach((inc: any) => {
                combinedThreatsMap.set(inc.mid, {
                    mid: inc.mid,
                    subject: inc.subject || "No Subject Header",
                    sender: inc.sender || "unknown",
                    recipient: inc.recipient || "unknown",
                    targetHost: inc.targetHost,
                    destUrl: inc.destUrl,
                    threatTier: inc.threatTier,
                    threatCategory: inc.threatCategory,
                    impersonationBoost: inc.impersonationBoost,
                    timestamp: inc.createdAt.toISOString()
                });
            });
        }

        const becThreats = Array.from(combinedThreatsMap.values());
        const responseTimeMs = Date.now() - startTime;

        return NextResponse.json({
            rangeSeconds,
            isAllTime,
            responseTimeMs,
            totalEvaluatedUrls,
            totalEvaluatedMessages,
            becThreats,
            topUnwrappedDomains: Array.isArray(topUnwrappedDomains) ? topUnwrappedDomains : [],
            thirdPartyOAuthLinks: Array.isArray(thirdPartyOAuthLinks) ? thirdPartyOAuthLinks : [],
            fromLocalDb: true
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            }
        });

    } catch (error: any) {
        console.error("BEC Local DB Stats API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch BEC stats from local DB", details: error.message },
            { status: 500 }
        );
    }
}
