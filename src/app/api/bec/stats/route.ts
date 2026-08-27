import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { OgGraylogClient } from "@/lib/og-graylog";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
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

        // 1. Fetch pre-computed stats snapshot from BecStatsCache in local SQLite DB for exact rangeSeconds
        let becCache = isAllTime ? null : await (prisma as any).becStatsCache.findUnique({
            where: { rangeSeconds }
        }).catch(() => null);

        const isCacheStale = !isAllTime && (!becCache || 
            (becCache.totalEvaluatedUrls === 0) || 
            ((Date.now() - new Date(becCache.updatedAt).getTime()) > 300000));

        let topUnwrappedDomains: any[] = [];
        let thirdPartyOAuthLinks: any[] = [];
        let totalEvaluatedUrls = 0;
        let totalEvaluatedMessages = 0;
        let cacheBecThreats: any[] = [];

        if (isCacheStale && rangeSeconds > 0) {
            // Hydrate live from Graylog for this exact timeframe window if cache is cold/empty
            try {
                const client = new OgGraylogClient();
                const becRes = await client.getM365BecThreatAggregations(rangeSeconds, 20);
                
                totalEvaluatedUrls = becRes.totalEvaluatedUrls || 0;
                totalEvaluatedMessages = becRes.totalEvaluatedMessages || 0;
                topUnwrappedDomains = becRes.topUnwrappedDomains || [];
                thirdPartyOAuthLinks = becRes.thirdPartyOAuthLinks || [];
                cacheBecThreats = becRes.becThreats || [];

                // Persist snapshot to SQLite BecStatsCache for instant subsequent loads
                await (prisma as any).becStatsCache.upsert({
                    where: { rangeSeconds },
                    create: {
                        rangeSeconds,
                        totalEvaluatedMessages,
                        totalEvaluatedUrls,
                        becThreatsJson: JSON.stringify(cacheBecThreats),
                        topDomainsJson: JSON.stringify(topUnwrappedDomains),
                        oauthLinksJson: JSON.stringify(thirdPartyOAuthLinks)
                    },
                    update: {
                        totalEvaluatedMessages,
                        totalEvaluatedUrls,
                        becThreatsJson: JSON.stringify(cacheBecThreats),
                        topDomainsJson: JSON.stringify(topUnwrappedDomains),
                        oauthLinksJson: JSON.stringify(thirdPartyOAuthLinks)
                    }
                });
            } catch (graylogErr: any) {
                console.error(`[BEC Stats API] Live Graylog hydration error for ${rangeSeconds}s:`, graylogErr.message || graylogErr);
            }
        } else if (becCache) {
            try {
                cacheBecThreats = JSON.parse(becCache.becThreatsJson || "[]");
                topUnwrappedDomains = JSON.parse(becCache.topDomainsJson || "[]");
                thirdPartyOAuthLinks = JSON.parse(becCache.oauthLinksJson || "[]");
                totalEvaluatedUrls = becCache.totalEvaluatedUrls || 0;
                totalEvaluatedMessages = becCache.totalEvaluatedMessages || 0;
            } catch (e) {}
        } else if (isAllTime) {
            // Fallback for All Time: query largest available cache snapshot for macro domain counts
            const maxCache = await (prisma as any).becStatsCache.findFirst({
                orderBy: { rangeSeconds: "desc" }
            }).catch(() => null);

            if (maxCache) {
                try {
                    topUnwrappedDomains = JSON.parse(maxCache.topDomainsJson || "[]");
                    thirdPartyOAuthLinks = JSON.parse(maxCache.oauthLinksJson || "[]");
                    totalEvaluatedUrls = maxCache.totalEvaluatedUrls || 0;
                    totalEvaluatedMessages = maxCache.totalEvaluatedMessages || 0;
                } catch (e) {}
            }
        }

        // 2. Query ALL logged threat incidents from the BecIncident DB table based on cutoffDate or All Time
        const dbIncidents = isAllTime ? 
            await (prisma as any).becIncident.findMany({
                orderBy: { createdAt: "desc" }
            }).catch(() => []) :
            await (prisma as any).becIncident.findMany({
                where: {
                    createdAt: { gte: cutoffDate }
                },
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

        // If no incidents found within cutoff, pull all recent incidents in DB up to 100
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

        return NextResponse.json({
            rangeSeconds,
            isAllTime,
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
