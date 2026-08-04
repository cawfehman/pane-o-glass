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
        const sortField = url.searchParams.get("sortField") || "isActive";
        const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

        const where: any = {};

        if (search) {
            const orClauses = [];
            
            const isExact = search.startsWith('"') && search.endsWith('"') && search.length > 1;
            const searchTerm = isExact ? search.slice(1, -1) : search;
            
            if (isExact) {
                // For exact match, we want it to be case-insensitive. Prisma's equals is case-sensitive in SQLite.
                // SQLite's LIKE without wildcards performs a case-insensitive exact match.
                const matchingRows = await prisma.$queryRaw<any[]>`
                    SELECT DISTINCT ip FROM "ShunDatabaseIp"
                    WHERE ip LIKE ${searchTerm}
                       OR ipAsn LIKE ${searchTerm}
                       OR org LIKE ${searchTerm}
                       OR ipCountry LIKE ${searchTerm}
                       OR EXISTS (
                           SELECT 1 FROM "FirewallShunStats"
                           WHERE "FirewallShunStats".ip = "ShunDatabaseIp".ip
                             AND firewall LIKE ${searchTerm}
                       )
                `;
                const ips = matchingRows.map(r => r.ip);
                if (ips.length > 0) {
                    orClauses.push({ ip: { in: ips } });
                } else {
                    orClauses.push({ ip: 'NO_MATCH_WILDCARD' });
                }
            } else if (searchTerm.includes('*')) {
                const likeString = searchTerm.replace(/\*/g, '%');
                const matchingRows = await prisma.$queryRaw<any[]>`SELECT ip FROM "ShunDatabaseIp" WHERE ip LIKE ${likeString}`;
                const ips = matchingRows.map(r => r.ip);
                if (ips.length > 0) {
                    orClauses.push({ ip: { in: ips } });
                } else {
                    orClauses.push({ ip: 'NO_MATCH_WILDCARD' });
                }
            } else {
                orClauses.push({ ip: { contains: searchTerm } });
                orClauses.push({ firewall: { contains: searchTerm } });
                orClauses.push({ shunIp: { ipAsn: { contains: searchTerm } } });
                orClauses.push({ shunIp: { org: { contains: searchTerm } } });
                orClauses.push({ shunIp: { ipCountry: { contains: searchTerm } } });
            }
            
            where.OR = orClauses;
        }

        let orderBy: any = [];
        if (sortField === 'ipAsn' || sortField === 'org' || sortField === 'ipCountry' || sortField === 'city') {
            orderBy.push({ shunIp: { [sortField]: sortDir } });
        } else {
            orderBy.push({ [sortField]: sortDir });
        }
        
        if (sortField !== 'lastSeen') {
            orderBy.push({ lastSeen: 'desc' });
        }

        const stats = await prisma.firewallShunStats.findMany({
            where,
            include: { shunIp: true },
            orderBy
        });

        const ipList = stats.map(s => s.ip);
        let blacklistedIps = new Set();
        if (ipList.length > 0) {
            const blacklisted = await prisma.guardianBlacklist.findMany({
                where: { ip: { in: ipList } },
                select: { ip: true }
            });
            blacklistedIps = new Set(blacklisted.map(b => b.ip));
        }

        const header = ["IP", "Firewall", "Status", "Blacklisted", "Days Shunned", "First Seen", "Last Seen", "ASN", "Organization", "Country", "City", "Enriched At"];
        
        const rows = stats.map(s => {
            return [
                s.ip,
                s.firewall,
                s.isActive ? "Active" : "Cleared",
                blacklistedIps.has(s.ip) ? "Yes" : "No",
                s.daysShunned,
                s.firstSeen.toISOString(),
                s.lastSeen.toISOString(),
                s.shunIp?.ipAsn || "",
                `"${(s.shunIp?.org || "").replace(/"/g, '""')}"`,
                `"${(s.shunIp?.ipCountry || "").replace(/"/g, '""')}"`,
                `"${(s.shunIp?.city || "").replace(/"/g, '""')}"`,
                s.shunIp?.enrichedAt?.toISOString() || ""
            ].join(",");
        });

        const csv = [header.join(","), ...rows].join("\n");

        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="shun-database-export-${new Date().toISOString().split('T')[0]}.csv"`
            }
        });

    } catch (error) {
        console.error("Shun Database Export Error:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
