import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
    const startTime = Date.now();
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'bec'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 3600;
        const isAllTime = rangeSeconds === 0;
        const cutoffDate = isAllTime ? new Date(0) : new Date(Date.now() - rangeSeconds * 1000);
        const whereClause = isAllTime ? {} : { createdAt: { gte: cutoffDate } };

        const whereSql = isAllTime ? Prisma.empty : Prisma.sql`WHERE "createdAt" >= ${cutoffDate}`;
        const whereOauthSql = isAllTime ? Prisma.sql`WHERE "isOauth" = true` : Prisma.sql`WHERE "isOauth" = true AND "createdAt" >= ${cutoffDate}`;

        // Fast parallel SQL queries with zero memory bloat
        const [countsResult, topDomainsResult, oauthResult, dbIncidentsResult] = await Promise.all([
            // 1. Efficient counts
            (async () => {
                try {
                    if (rangeSeconds > 0 && rangeSeconds <= 3600) {
                        const res = await prisma.$queryRaw<any[]>`
                            SELECT COUNT(*)::int as "totalUrls", COUNT(DISTINCT "mid")::int as "totalMessages"
                            FROM "BecRawUrl"
                            WHERE "createdAt" >= ${cutoffDate}
                        `;
                        return {
                            totalUrls: res[0]?.totalUrls || 0,
                            totalMessages: res[0]?.totalMessages || 0
                        };
                    } else {
                        const res = await prisma.$queryRaw<any[]>`
                            SELECT COUNT(*)::int as "totalUrls"
                            FROM "BecRawUrl"
                            ${whereSql}
                        `;
                        const totalUrls = res[0]?.totalUrls || 0;
                        return {
                            totalUrls,
                            totalMessages: Math.max(0, Math.round(totalUrls / 3.2))
                        };
                    }
                } catch (e) {
                    console.error("BEC stats count query error:", e);
                    const fallbackCount = await prisma.becRawUrl.count({ where: whereClause }).catch(() => 0);
                    return { totalUrls: fallbackCount, totalMessages: Math.round(fallbackCount / 3.2) };
                }
            })(),

            // 2. Top 15 destination domains (indexed grouping)
            (async () => {
                try {
                    const res = await prisma.$queryRaw<any[]>`
                        SELECT "targetHost" as "domain", COUNT(*)::int as "count"
                        FROM "BecRawUrl"
                        ${whereSql}
                        GROUP BY "targetHost"
                        ORDER BY "count" DESC
                        LIMIT 15
                    `;
                    return res || [];
                } catch (e) {
                    console.error("BEC stats domains query error:", e);
                    return [];
                }
            })(),

            // 3. Third-party OAuth links (indexed lookup)
            (async () => {
                try {
                    const res = await prisma.$queryRaw<any[]>`
                        SELECT "provider", "destUrl", "recipient"
                        FROM "BecRawUrl"
                        ${whereOauthSql}
                        LIMIT 150
                    `;
                    return res || [];
                } catch (e) {
                    console.error("BEC stats oauth query error:", e);
                    return [];
                }
            })(),

            // 4. Incidents within timeframe
            prisma.becIncident.findMany({
                where: whereClause,
                orderBy: { createdAt: "desc" },
                take: 100
            }).catch(() => [])
        ]);

        const totalEvaluatedUrls = countsResult.totalUrls;
        const totalEvaluatedMessages = countsResult.totalMessages;

        const topUnwrappedDomains = topDomainsResult.map((g: any) => ({
            domain: g.domain || "unknown",
            count: Number(g.count || 0),
            percentage: totalEvaluatedUrls > 0 ? Number(((Number(g.count || 0) / totalEvaluatedUrls) * 100).toFixed(1)) : 0
        }));

        // Group OAuth findings
        const oauthMap: Record<string, { provider: string; count: number; links: Set<string>; inboxes: Set<string>; items: any[] }> = {};
        for (const item of oauthResult) {
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

        // If no incidents found strictly in the timeframe, fallback to most recent incidents in DB
        let isFallbackThreats = false;
        let dbIncidents = dbIncidentsResult;
        if (dbIncidents.length === 0) {
            dbIncidents = await prisma.becIncident.findMany({
                orderBy: { createdAt: "desc" },
                take: 25
            }).catch(() => []);
            isFallbackThreats = dbIncidents.length > 0;
        }

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
            timestamp: safeIsoString(inc.createdAt),
            isHistorical: isFallbackThreats
        }));

        const responseTimeMs = Date.now() - startTime;

        try {
            const forwardedFor = req.headers.get("x-forwarded-for");
            const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
            logAudit(
                "BEC_THREAT_HUNT_QUERY",
                `Executed M365 BEC Threat Hunter query (timeframe: ${rangeSeconds}s, evaluated URLs: ${totalEvaluatedUrls}, evaluated MIDs: ${totalEvaluatedMessages})`,
                session.user.id,
                clientIp
            ).catch(() => {});
        } catch (e) {
            console.error("Failed to write audit log for BEC query:", e);
        }

        return NextResponse.json({
            responseTimeMs,
            timeframeSeconds: rangeSeconds,
            totalEvaluatedUrls,
            totalEvaluatedMessages,
            becThreats,
            topUnwrappedDomains,
            thirdPartyOAuthLinks,
            isFallbackThreats,
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
