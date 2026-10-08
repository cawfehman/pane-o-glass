import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { parseBooleanSearchQuery } from "@/lib/booleanQueryParser";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const search = searchParams.get("search")?.trim() || "";
        const action = searchParams.get("action")?.trim() || "";
        const limitParam = searchParams.get("limit")?.trim() || "500";

        const whereClause: any = {};

        if (action) {
            whereClause.action = action;
        }

        if (search) {
            const parsedWhere = parseBooleanSearchQuery(search, (term) => ({
                OR: [
                    { ip: { contains: term, mode: 'insensitive' } },
                    { companyName: { contains: term, mode: 'insensitive' } },
                    { companyType: { contains: term, mode: 'insensitive' } },
                    { cidr: { contains: term, mode: 'insensitive' } },
                    { asn: { contains: term, mode: 'insensitive' } },
                    { details: { contains: term, mode: 'insensitive' } }
                ]
            }));
            if (parsedWhere) {
                if (parsedWhere.AND) whereClause.AND = parsedWhere.AND;
                else if (parsedWhere.OR) whereClause.OR = parsedWhere.OR;
                else Object.assign(whereClause, parsedWhere);
            }
        }

        const take = limitParam === "all" ? 10000 : Math.min(10000, Math.max(1, parseInt(limitParam, 10) || 500));

        const [events, totalInDb] = await Promise.all([
            prisma.guardianEvent.findMany({
                where: whereClause,
                orderBy: { createdAt: "desc" },
                take
            }),
            prisma.guardianEvent.count()
        ]);

        const uniqueIps = Array.from(new Set(events.map(e => e.ip)));

        const successfulVpnIps = await prisma.vpnEvent.findMany({
            where: {
                sourceIp: { in: uniqueIps },
                status: "SUCCESS"
            },
            select: { sourceIp: true }
        });

        const vpnHistorySet = new Set(successfulVpnIps.map(v => v.sourceIp));

        const enriched = events.map(event => ({
            ...event,
            hasVpnHistory: vpnHistorySet.has(event.ip)
        }));

        return NextResponse.json({
            success: true,
            events: enriched,
            totalReturned: enriched.length,
            totalInDb
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to load Guardian events" }, { status: 500 });
    }
}
