import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'firewall'))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const url = new URL(req.url);
        const search = url.searchParams.get("search") || "";
        const asn = url.searchParams.get("asn") || "";
        const firewall = url.searchParams.get("firewall") || "";
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);

        // We will query FirewallShunStats to give the per-firewall view
        const where: any = {};

        if (search) {
            if (search.includes('*')) {
                const likeString = search.replace(/\*/g, '%');
                // Use queryRaw to perform a native SQL LIKE search to support multiple wildcards
                const matchingRows = await prisma.$queryRaw<any[]>`SELECT ip FROM "ShunDatabaseIp" WHERE ip LIKE ${likeString}`;
                const ips = matchingRows.map(r => r.ip);
                where.ip = { in: ips };
            } else {
                where.ip = { contains: search };
            }
        }
        if (asn) {
            where.shunIp = { ipAsn: { contains: asn } };
        }
        if (firewall) {
            where.firewall = { contains: firewall };
        }

        const total = await prisma.firewallShunStats.count({ where });
        const stats = await prisma.firewallShunStats.findMany({
            where,
            include: { shunIp: true },
            orderBy: [
                { isActive: 'desc' },
                { lastSeen: 'desc' }
            ],
            skip: (page - 1) * limit,
            take: limit
        });

        // Resolve blacklisted status
        const ipList = stats.map(s => s.ip);
        let blacklistedIps = new Set();
        if (ipList.length > 0) {
            const blacklisted = await prisma.guardianBlacklist.findMany({
                where: { ip: { in: ipList } },
                select: { ip: true }
            });
            blacklistedIps = new Set(blacklisted.map(b => b.ip));
        }

        const records = stats.map(s => ({
            id: s.id,
            ip: s.ip,
            firewall: s.firewall,
            firstSeen: s.firstSeen,
            lastSeen: s.lastSeen,
            daysShunned: s.daysShunned,
            isActive: s.isActive,
            isBlacklisted: blacklistedIps.has(s.ip),
            ipAsn: s.shunIp?.ipAsn,
            ipOrg: s.shunIp?.org,
            ipCountry: s.shunIp?.ipCountry,
            ipCountryCode: s.shunIp?.ipCountryCode,
            city: s.shunIp?.city,
            enrichedAt: s.shunIp?.enrichedAt
        }));

        return NextResponse.json({
            records,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (error) {
        console.error("Shun Database Fetch Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
