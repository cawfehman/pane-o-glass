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
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);
        
        const sortField = url.searchParams.get("sortField") || "isActive";
        const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

        const where: any = {};

        if (search) {
            const orClauses = [];
            
            const isExact = search.startsWith('"') && search.endsWith('"') && search.length > 1;
            const searchTerm = isExact ? search.slice(1, -1) : search;
            
            if (!isExact && searchTerm.includes('*')) {
                const likeString = searchTerm.replace(/\*/g, '%');
                const matchingRows = await prisma.$queryRaw<any[]>`SELECT ip FROM "ShunDatabaseIp" WHERE ip LIKE ${likeString}`;
                const ips = matchingRows.map(r => r.ip);
                if (ips.length > 0) {
                    orClauses.push({ ip: { in: ips } });
                } else {
                    orClauses.push({ ip: 'NO_MATCH_WILDCARD' });
                }
            } else {
                orClauses.push({ ip: isExact ? searchTerm : { contains: searchTerm } });
            }
            
            orClauses.push({ firewall: isExact ? searchTerm : { contains: searchTerm } });
            orClauses.push({ shunIp: { ipAsn: isExact ? searchTerm : { contains: searchTerm } } });
            orClauses.push({ shunIp: { org: isExact ? searchTerm : { contains: searchTerm } } });
            orClauses.push({ shunIp: { ipCountry: isExact ? searchTerm : { contains: searchTerm } } });
            
            where.OR = orClauses;
        }

        let orderBy: any = [];
        if (sortField === 'ipAsn' || sortField === 'org' || sortField === 'ipCountry' || sortField === 'city') {
            orderBy.push({ shunIp: { [sortField]: sortDir } });
        } else {
            orderBy.push({ [sortField]: sortDir });
        }
        
        // Ensure consistent tie-breaking
        if (sortField !== 'lastSeen') {
            orderBy.push({ lastSeen: 'desc' });
        }

        const total = await prisma.firewallShunStats.count({ where });
        const stats = await prisma.firewallShunStats.findMany({
            where,
            include: { shunIp: true },
            orderBy,
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
