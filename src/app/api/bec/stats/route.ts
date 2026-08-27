import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";

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
        const rangeSeconds = rangeParam ? parseInt(rangeParam, 10) : 3600;

        // 1. Fetch pre-computed stats snapshot from BecStatsCache in local SQLite DB
        const cacheRecord = await (prisma as any).becStatsCache.findUnique({
            where: { rangeSeconds }
        }).catch(() => null);

        // Fallback to latest cache record if exact timeframe entry is missing
        const becCache = cacheRecord || await (prisma as any).becStatsCache.findFirst({
            orderBy: { updatedAt: "desc" }
        }).catch(() => null);

        let becThreats: any[] = [];
        let topUnwrappedDomains: any[] = [];
        let thirdPartyOAuthLinks: any[] = [];
        let totalEvaluatedUrls = 0;
        let totalEvaluatedMessages = 0;

        if (becCache) {
            try {
                becThreats = JSON.parse(becCache.becThreatsJson || "[]");
                topUnwrappedDomains = JSON.parse(becCache.topDomainsJson || "[]");
                thirdPartyOAuthLinks = JSON.parse(becCache.oauthLinksJson || "[]");
                totalEvaluatedUrls = becCache.totalEvaluatedUrls || 0;
                totalEvaluatedMessages = becCache.totalEvaluatedMessages || 0;
            } catch (e) {}
        }

        // 2. Fetch logged incidents from BecIncident table for additional context if needed
        const incidents = await (prisma as any).becIncident.findMany({
            take: 100,
            orderBy: { createdAt: "desc" }
        }).catch(() => []);

        // Combine any fresh incidents if becThreats array is empty
        if (becThreats.length === 0 && incidents.length > 0) {
            becThreats = incidents.map((inc: any) => ({
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
        }

        return NextResponse.json({
            rangeSeconds,
            totalEvaluatedUrls,
            totalEvaluatedMessages,
            becThreats: Array.isArray(becThreats) ? becThreats : [],
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
