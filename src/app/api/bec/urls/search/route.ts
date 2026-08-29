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
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 0; // Default to All Time for domain search
        const limitParam = parseInt(searchParams.get("limit") || "500", 10);
        const limit = isNaN(limitParam) ? 500 : Math.min(2000, Math.max(1, limitParam));

        const whereConditions: any = {};

        // 1. Timeframe boundary if specified
        if (rangeSeconds > 0) {
            whereConditions.createdAt = { gte: new Date(Date.now() - rangeSeconds * 1000) };
        }

        // 2. Query search across targetHost (domain), destUrl, MID, recipient, sender, subject
        if (query) {
            const clean = query.trim().toLowerCase();

            // Strip protocol if user pasted a full URL to extract domain or search string
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

        // 3. Query PostgreSQL database
        const [urls, totalMatches, totalDatabaseUrls] = await Promise.all([
            prisma.becRawUrl.findMany({
                where: whereConditions,
                orderBy: { createdAt: 'desc' },
                take: limit
            }),
            prisma.becRawUrl.count({ where: whereConditions }),
            prisma.becRawUrl.count()
        ]);

        const responseTimeMs = Date.now() - startTime;

        // Log audit for domain searches if query was provided
        if (query) {
            const clientIp = req.headers.get("x-forwarded-for")?.split(',')[0] || 'internal';
            await logAudit(
                "BEC_URL_DOMAIN_SEARCH",
                `Searched unwrapped URLs database for query: "${query}" (Returned ${urls.length} of ${totalMatches} matches)`,
                session.user.id,
                clientIp
            ).catch(() => {});
        }

        return NextResponse.json({
            success: true,
            query,
            urls,
            totalMatches,
            totalDatabaseUrls,
            returnedCount: urls.length,
            responseTimeMs
        });

    } catch (err: any) {
        console.error("BEC Unwrapped URL Search Error:", err);
        return NextResponse.json({
            error: err.message || "Failed to search unwrapped URLs database"
        }, { status: 500 });
    }
}
