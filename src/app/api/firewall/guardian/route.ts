import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";

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

        const whereClause: any = {};

        if (action) {
            whereClause.action = action;
        }

        if (search) {
            whereClause.OR = [
                { ip: { contains: search } },
                { companyName: { contains: search } },
                { companyType: { contains: search } },
                { cidr: { contains: search } },
                { asn: { contains: search } },
                { details: { contains: search } }
            ];
        }

        const events = await prisma.guardianEvent.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            take: 100 // Return the last 100 entries
        });

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

        return NextResponse.json(enriched);
    } catch (err: any) {
        return NextResponse.json({ error: err.message || "Failed to load Guardian events" }, { status: 500 });
    }
}
