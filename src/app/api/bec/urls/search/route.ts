import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { lookupDomainUmbrella, UmbrellaCategorizationResponse } from "@/lib/umbrella";

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
        const query = searchParams.get("query")?.trim() || "";
        const nodOnly = searchParams.get("nod") === "true"; // Newly Observed Domains filter
        const rareOnly = searchParams.get("rare") === "true"; // Rare / Low Frequency filter
        const maliciousOnly = searchParams.get("malicious") === "true"; // Cisco Umbrella Malicious filter
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 0;
        const limitParam = parseInt(searchParams.get("limit") || "500", 10);
        const limit = isNaN(limitParam) ? 500 : Math.min(2000, Math.max(1, limitParam));

        let urls: any[] = [];
        let totalMatches = 0;

        const hasWildcard = query.includes('*') || query.includes('%') || query.startsWith('.');
        const cleanQuery = query.replace(/^\*\.?/, '.');

        if (hasWildcard) {
            let pattern = cleanQuery.replace(/\*/g, '%');
            if (cleanQuery.startsWith('.')) {
                pattern = `%${cleanQuery}`;
            } else if (!pattern.includes('%')) {
                pattern = `%${pattern}%`;
            }

            const rawResults = await prisma.$queryRaw<any[]>`
                SELECT "id", "mid", "rfcMessageId", "subject", "sender", "recipient", "targetHost", "destUrl", "isOauth", "provider", "score", "createdAt"
                FROM "BecRawUrl"
                WHERE ("targetHost" ILIKE ${pattern}
                   OR "destUrl" ILIKE ${pattern}
                   OR "recipient" ILIKE ${pattern}
                   OR "sender" ILIKE ${pattern}
                   OR "subject" ILIKE ${pattern})
                ORDER BY "createdAt" DESC
                LIMIT ${limit}
            `;

            const countRaw = await prisma.$queryRaw<any[]>`
                SELECT COUNT(*)::int as count
                FROM "BecRawUrl"
                WHERE ("targetHost" ILIKE ${pattern}
                   OR "destUrl" ILIKE ${pattern}
                   OR "recipient" ILIKE ${pattern}
                   OR "sender" ILIKE ${pattern}
                   OR "subject" ILIKE ${pattern})
            `;

            urls = rawResults || [];
            totalMatches = countRaw[0]?.count || 0;
        } else {
            const whereConditions: any = {};
            if (rangeSeconds > 0) {
                whereConditions.createdAt = { gte: new Date(Date.now() - rangeSeconds * 1000) };
            }

            if (query) {
                const clean = query.trim().toLowerCase();
                const cleanDomain = clean.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

                whereConditions.OR = [
                    { targetHost: { contains: cleanDomain, mode: 'insensitive' } },
                    { targetHost: { contains: clean, mode: 'insensitive' } },
                    { destUrl: { contains: clean, mode: 'insensitive' } },
                    { mid: { contains: clean } },
                    { recipient: { contains: clean, mode: 'insensitive' } },
                    { sender: { contains: clean, mode: 'insensitive' } },
                    { subject: { contains: clean, mode: 'insensitive' } }
                ];
            }

            const [foundUrls, matches] = await Promise.all([
                prisma.becRawUrl.findMany({
                    where: whereConditions,
                    orderBy: { createdAt: 'desc' },
                    take: limit
                }),
                prisma.becRawUrl.count({ where: whereConditions })
            ]);

            urls = foundUrls;
            totalMatches = matches;
        }

        const totalDatabaseUrls = await prisma.becRawUrl.count().catch(() => 0);

        // 1. Enrich results with First-Seen Date AND Frequency Count
        const uniqueHosts = Array.from(new Set(urls.map(u => u.targetHost).filter(Boolean)));

        let hostStatsMap: Record<string, { firstSeen: Date; totalSeenCount: number }> = {};
        if (uniqueHosts.length > 0) {
            const statsRaw = await prisma.$queryRaw<any[]>`
                SELECT "targetHost", MIN("createdAt") as "firstSeen", COUNT(*)::int as "totalSeenCount"
                FROM "BecRawUrl"
                WHERE "targetHost" IN (${Prisma.join(uniqueHosts)})
                GROUP BY "targetHost"
            `.catch(() => []);

            for (const r of statsRaw) {
                hostStatsMap[r.targetHost] = {
                    firstSeen: r.firstSeen,
                    totalSeenCount: Number(r.totalSeenCount || 1)
                };
            }
        }

        // 2. Batch Cisco Umbrella Domain Categorization & Threat Reputation Lookup
        let umbrellaMap: Record<string, UmbrellaCategorizationResponse> = {};
        await Promise.all(
            uniqueHosts.map(async (host) => {
                const res = await lookupDomainUmbrella(host).catch(() => ({
                    status: 0,
                    categories: [],
                    securityCategories: [],
                    source: "simulated" as const
                }));
                umbrellaMap[host] = res;
            })
        );

        const now = Date.now();
        const enrichedUrls = urls.map(item => {
            const stats = hostStatsMap[item.targetHost] || { firstSeen: item.createdAt, totalSeenCount: 1 };
            const firstSeen = stats.firstSeen;
            const totalSeenCount = stats.totalSeenCount;

            const ageMs = now - new Date(firstSeen).getTime();
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

            const isNewlyObserved24h = ageMs <= 24 * 60 * 60 * 1000;
            const isNewlyObserved7d = ageMs <= 7 * 24 * 60 * 60 * 1000;
            const isRareLowFrequency = totalSeenCount <= 3; // Seen 3 times or fewer across 500k dataset

            const umbrellaData = umbrellaMap[item.targetHost] || { status: 0, categories: [], securityCategories: [], source: "simulated" };
            const umbrellaStatus = umbrellaData.status; // -1: Malicious, 0: Uncategorized, 1: Benign
            const umbrellaStatusLabel = umbrellaStatus === -1 ? "Malicious" : umbrellaStatus === 1 ? "Benign" : "Uncategorized";

            let riskCategory = "ESTABLISHED";
            if (umbrellaStatus === -1) riskCategory = "UMBRELLA_MALICIOUS";
            else if (isNewlyObserved24h) riskCategory = "NEWLY_OBSERVED_24H";
            else if (isNewlyObserved7d) riskCategory = "NEWLY_OBSERVED_7D";
            else if (isRareLowFrequency) riskCategory = "RARE_LOW_FREQUENCY";

            return {
                ...item,
                firstSeen,
                totalSeenCount,
                ageDays,
                isNewlyObserved24h,
                isNewlyObserved7d,
                isRareLowFrequency,
                umbrellaStatus,
                umbrellaStatusLabel,
                umbrellaCategories: umbrellaData.categories || [],
                umbrellaSecurityCategories: umbrellaData.securityCategories || [],
                umbrellaSource: umbrellaData.source || "simulated",
                riskCategory
            };
        });

        // Filter NOD / Rare / Malicious if requested
        let finalUrls = enrichedUrls;
        if (nodOnly) {
            finalUrls = finalUrls.filter(u => u.isNewlyObserved7d);
        }
        if (rareOnly) {
            finalUrls = finalUrls.filter(u => u.isRareLowFrequency);
        }
        if (maliciousOnly) {
            finalUrls = finalUrls.filter(u => u.umbrellaStatus === -1);
        }

        // 3. Compute Cisco Umbrella Threat Analytics Summary for Charts
        const umbrellaSummary = {
            maliciousCount: finalUrls.filter(u => u.umbrellaStatus === -1).length,
            unccategorizedCount: finalUrls.filter(u => u.umbrellaStatus === 0).length,
            benignCount: finalUrls.filter(u => u.umbrellaStatus === 1).length,
            totalEvaluated: finalUrls.length,
            securityCategoriesBreakdown: {} as Record<string, number>,
            contentCategoriesBreakdown: {} as Record<string, number>
        };

        for (const u of finalUrls) {
            for (const secCat of u.umbrellaSecurityCategories) {
                umbrellaSummary.securityCategoriesBreakdown[secCat] = (umbrellaSummary.securityCategoriesBreakdown[secCat] || 0) + 1;
            }
            for (const cat of u.umbrellaCategories) {
                umbrellaSummary.contentCategoriesBreakdown[cat] = (umbrellaSummary.contentCategoriesBreakdown[cat] || 0) + 1;
            }
        }

        const responseTimeMs = Date.now() - startTime;

        if (query) {
            const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
            await logAudit(
                "BEC_URL_DOMAIN_SEARCH",
                `Searched unwrapped URLs for query: "${query}" (Wildcard: ${hasWildcard}) - Returned ${finalUrls.length} matches with Cisco Umbrella enrichment`,
                session.user.id,
                clientIp
            ).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            query,
            hasWildcard,
            urls: finalUrls,
            umbrellaSummary,
            totalMatches,
            totalDatabaseUrls,
            returnedCount: finalUrls.length,
            responseTimeMs
        });

    } catch (err: any) {
        console.error("BEC Unwrapped URL Search Error:", err);
        return NextResponse.json({
            error: err.message || "Failed to search unwrapped URLs database"
        }, { status: 500 });
    }
}
