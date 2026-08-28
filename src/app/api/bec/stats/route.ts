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
        const whereClause = isAllTime ? {} : { createdAt: { gte: cutoffDate } };

        // 1. Calculate true total evaluated URLs and unique message MIDs for selected timeframe
        const totalEvaluatedUrls = await prisma.becRawUrl.count({ where: whereClause }).catch(() => 0);
        
        const uniqueMsgList = await prisma.becRawUrl.findMany({
            where: whereClause,
            select: { mid: true },
            distinct: ['mid']
        }).catch(() => []);
        const totalEvaluatedMessages = uniqueMsgList.length;

        // 2. Query top 15 unwrapped destination domains for selected timeframe
        const domainGroups = await prisma.becRawUrl.groupBy({
            by: ['targetHost'],
            where: whereClause,
            _count: { targetHost: true },
            orderBy: { _count: { targetHost: 'desc' } },
            take: 15
        }).catch(() => []);

        const topUnwrappedDomains = domainGroups.map((g: any) => ({
            domain: g.targetHost || "unknown",
            count: g._count.targetHost,
            percentage: totalEvaluatedUrls > 0 ? Number(((g._count.targetHost / totalEvaluatedUrls) * 100).toFixed(1)) : 0
        }));

        // 3. Query non-Microsoft OAuth discoveries for selected timeframe
        const oauthRawItems = await prisma.becRawUrl.findMany({
            where: { ...whereClause, isOauth: true },
            select: { provider: true, destUrl: true, recipient: true }
        }).catch(() => []);

        const oauthMap: Record<string, { provider: string; count: number; links: Set<string>; inboxes: Set<string>; items: any[] }> = {};
        for (const item of oauthRawItems) {
            if (!item.provider) continue;
            if (!oauthMap[item.provider]) {
                oauthMap[item.provider] = { provider: item.provider, count: 0, links: new Set(), inboxes: new Set(), items: [] };
            }
            oauthMap[item.provider].count++;
            if (item.destUrl) oauthMap[item.provider].links.add(item.destUrl);
            if (item.recipient) oauthMap[item.provider].inboxes.add(item.recipient);
            if (oauthMap[item.provider].items.length < 50) {
                oauthMap[item.provider].items.push(item);
            }
        }

        const thirdPartyOAuthLinks = Object.values(oauthMap).map(o => ({
            provider: o.provider,
            count: o.count,
            linksCount: o.links.size,
            inboxesCount: o.inboxes.size,
            uniqueRecipientsCount: o.inboxes.size,
            sampleLinks: Array.from(o.links).slice(0, 3),
            topHosts: Array.from(o.links).slice(0, 3).map(l => {
                try { return new URL(l).hostname; } catch (e) { return l; }
            }),
            items: o.items || [],
            sharePct: totalEvaluatedUrls > 0 ? Number(((o.count / totalEvaluatedUrls) * 100).toFixed(1)) : 0,
            percentage: totalEvaluatedUrls > 0 ? `${((o.count / totalEvaluatedUrls) * 100).toFixed(1)}%` : "0%"
        }));

        // 4. Query threat incidents strictly within the selected timeframe (NO historical fallback)
        const dbIncidents = await prisma.becIncident.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            take: 100
        }).catch(() => []);

        const safeIsoString = (d: any) => {
            try {
                if (!d) return new Date().toISOString();
                if (d instanceof Date) return d.toISOString();
                return new Date(d).toISOString();
            } catch (e) {
                return new Date().toISOString();
            }
        };

        const becThreats = dbIncidents.map((inc: any) => ({
            mid: inc.mid,
            subject: inc.subject || "No Subject Header",
            sender: inc.sender || "unknown",
            recipient: inc.recipient || "unknown",
            targetHost: inc.targetHost || "",
            destUrl: inc.destUrl || "",
            threatTier: inc.threatTier || "LOW",
            threatCategory: inc.threatCategory || "SUSPICIOUS",
            impersonationBoost: inc.impersonationBoost || 0,
            timestamp: safeIsoString(inc.createdAt)
        }));

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
