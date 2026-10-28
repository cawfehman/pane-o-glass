import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { parseBooleanSearchQuery } from "@/lib/booleanQueryParser";

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, 'firewall', userId))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const url = new URL(req.url);
        const search = url.searchParams.get("search") || "";
        const statusFilter = url.searchParams.get("status") || "all";
        const timeframe = url.searchParams.get("timeframe") || "all";
        const timeField = url.searchParams.get("timeField") || "lastSeen";
        const sortField = url.searchParams.get("sortField") || "lastSeen";
        const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";
        const ipsParam = url.searchParams.get("ips") || "";

        const where: any = {};

        if (ipsParam) {
            const list = ipsParam.split(",").map(i => i.trim()).filter(Boolean);
            if (list.length > 0) {
                where.ip = { in: list };
            }
        }

        if (statusFilter === "active") {
            where.isActive = true;
        } else if (statusFilter === "cleared") {
            where.isActive = false;
        }

        // Timeframe filtering
        let cutoffDate: Date | null = null;
        if (timeframe && timeframe !== "all") {
            const match = timeframe.match(/^(\d+)([hd])$/);
            if (match) {
                const num = parseInt(match[1], 10);
                const unit = match[2];
                const ms = unit === "h" ? num * 3600 * 1000 : num * 24 * 3600 * 1000;
                cutoffDate = new Date(Date.now() - ms);
            }
        }
        if (cutoffDate) {
            const targetDateField = timeField === "firstSeen" ? "firstSeen" : "lastSeen";
            where[targetDateField] = { gte: cutoffDate };
        }

        if (search) {
            const parsedWhere = parseBooleanSearchQuery(search, (term) => ({
                OR: [
                    { ip: { contains: term } },
                    { firewall: { contains: term } },
                    { shunIp: { ipAsn: { contains: term } } },
                    { shunIp: { org: { contains: term } } },
                    { shunIp: { ipCountry: { contains: term } } }
                ]
            }));
            if (parsedWhere) {
                if (parsedWhere.AND) where.AND = parsedWhere.AND;
                else if (parsedWhere.OR) where.OR = parsedWhere.OR;
                else Object.assign(where, parsedWhere);
            }
        }

        let orderBy: any = [];
        if (sortField === 'ipAsn' || sortField === 'org' || sortField === 'ipCountry' || sortField === 'city') {
            orderBy.push({ shunIp: { [sortField]: sortDir } });
        } else {
            orderBy.push({ [sortField]: sortDir });
        }
        orderBy.push({ ip: 'asc' });

        // Query distinct IPs so export contains 1 row per unique IP
        const distinctStats = await prisma.firewallShunStats.findMany({
            where,
            distinct: ["ip"],
            include: { shunIp: true },
            orderBy
        });

        const ipList = distinctStats.map(s => s.ip);
        const [allStats, blacklisted] = await Promise.all([
            prisma.firewallShunStats.findMany({
                where: { ip: { in: ipList } }
            }),
            prisma.guardianBlacklist.findMany({
                where: { ip: { in: ipList } },
                select: { ip: true }
            })
        ]);

        const blacklistedIps = new Set(blacklisted.map(b => b.ip));

        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let configuredCount = 4;
        try {
            const parsed = JSON.parse(configStr);
            if (Array.isArray(parsed) && parsed.length > 0) configuredCount = parsed.length;
        } catch (e) {}

        const header = ["IP", "Firewall Coverage", "Active Count", "All 4 FWs Active", "Status", "Blacklisted", "Days Shunned", "First Seen", "Last Seen", "ASN", "Organization", "Country", "City", "Enriched At"];
        
        const rows = distinctStats.map(s => {
            const ipStats = allStats.filter(st => st.ip === s.ip);
            const activeFirewalls = ipStats.filter(st => st.isActive).map(st => st.firewall);
            const activeCount = activeFirewalls.length;
            const isShunnedAll = activeCount >= configuredCount;
            const isActive = activeCount > 0;

            const firstSeenDates = ipStats.map(st => new Date(st.firstSeen).getTime());
            const lastSeenDates = ipStats.map(st => new Date(st.lastSeen).getTime());
            const minFirstSeen = firstSeenDates.length > 0 ? new Date(Math.min(...firstSeenDates)) : s.firstSeen;
            const maxLastSeen = lastSeenDates.length > 0 ? new Date(Math.max(...lastSeenDates)) : s.lastSeen;
            const maxDaysShunned = ipStats.length > 0 ? Math.max(...ipStats.map(st => st.daysShunned)) : s.daysShunned;

            return [
                s.ip,
                `"${(isShunnedAll ? `All ${configuredCount} Firewalls` : activeFirewalls.join("; ")).replace(/"/g, '""')}"`,
                activeCount,
                isShunnedAll ? "Yes" : "No",
                isActive ? "Active" : "Cleared",
                blacklistedIps.has(s.ip) ? "Yes" : "No",
                maxDaysShunned,
                minFirstSeen.toISOString(),
                maxLastSeen.toISOString(),
                s.shunIp?.ipAsn || "",
                `"${(s.shunIp?.org || "").replace(/"/g, '""')}"`,
                `"${(s.shunIp?.ipCountry || "").replace(/"/g, '""')}"`,
                `"${(s.shunIp?.city || "").replace(/"/g, '""')}"`,
                s.shunIp?.enrichedAt?.toISOString() || ""
            ].join(",");
        });

        const csv = [header.join(","), ...rows].join("\n");
        const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "internal";

        await logAudit(
            "FIREWALL_SHUN_EXPORT",
            `Exported ${rows.length} firewall shun database entries to CSV${search ? ` (Filter: "${search}")` : ""}${statusFilter !== "all" ? ` (Status: ${statusFilter})` : ""}`,
            session.user?.id,
            clientIp
        );

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
