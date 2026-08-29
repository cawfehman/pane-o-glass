import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
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
        const query = searchParams.get("query")?.trim() || "";
        const nodOnly = searchParams.get("nod") === "true"; // Newly Observed Domains filter
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 0;
        const limitParam = parseInt(searchParams.get("limit") || "500", 10);
        const limit = isNaN(limitParam) ? 500 : Math.min(2000, Math.max(1, limitParam));

        let urls: any[] = [];
        let totalMatches = 0;

        const hasWildcard = query.includes('*') || query.includes('%') || query.startsWith('.');
        const cleanQuery = query.replace(/^\*\.?/, '.'); // e.g. *.claims -> .claims

        if (hasWildcard) {
            // Wildcard search using PostgreSQL ILIKE
            let pattern = cleanQuery.replace(/\*/g, '%');
            if (cleanQuery.startsWith('.')) {
                pattern = `%${cleanQuery}`; // e.g. .claims -> %.claims
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
            // Standard Prisma contains search
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

        // 4. Enrich results with First-Seen Domain Intelligence & Newly Observed Domain (NOD) status
        const uniqueHosts = Array.from(new Set(urls.map(u => u.targetHost).filter(Boolean)));

        let firstSeenMap: Record<string, Date> = {};
        if (uniqueHosts.length > 0) {
            const firstSeenRaw = await prisma.$queryRaw<any[]>`
                SELECT "targetHost", MIN("createdAt") as "firstSeen"
                FROM "BecRawUrl"
                WHERE "targetHost" IN (${prisma.join(uniqueHosts)})
                GROUP BY "targetHost"
            `.catch(() => []);

            for (const r of firstSeenRaw) {
                firstSeenMap[r.targetHost] = r.firstSeen;
            }
        }

        const now = Date.now();
        const enrichedUrls = urls.map(item => {
            const firstSeen = firstSeenMap[item.targetHost] || item.createdAt;
            const ageMs = now - new Date(firstSeen).getTime();
            const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
            const isNewlyObserved24h = ageMs <= 24 * 60 * 60 * 1000;
            const isNewlyObserved7d = ageMs <= 7 * 24 * 60 * 60 * 1000;

            return {
                ...item,
                firstSeen,
                ageDays,
                isNewlyObserved24h,
                isNewlyObserved7d
            };
        });

        // Filter NOD if requested
        const finalUrls = nodOnly 
            ? enrichedUrls.filter(u => u.isNewlyObserved7d)
            : enrichedUrls;

        const responseTimeMs = Date.now() - startTime;

        if (query) {
            const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
            await logAudit(
                "BEC_URL_DOMAIN_SEARCH",
                `Searched unwrapped URLs for query: "${query}" (Wildcard: ${hasWildcard}) - Returned ${finalUrls.length} matches`,
                session.user.id,
                clientIp
            ).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            query,
            hasWildcard,
            urls: finalUrls,
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
