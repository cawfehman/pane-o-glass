import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { parseBooleanSearchQuery } from "@/lib/booleanQueryParser";
import { syncShunDatabase } from "@/lib/shun-sync";

async function buildShunSummary() {
    const [activeTotal, clearedTotal, latestRecord, fwGroups, activeIpGroups] = await Promise.all([
        prisma.firewallShunStats.count({ where: { isActive: true } }),
        prisma.firewallShunStats.count({ where: { isActive: false } }),
        prisma.firewallShunStats.findFirst({
            orderBy: { lastSeen: "desc" },
            select: { lastSeen: true }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["firewall", "isActive"],
            _count: { _all: true }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true }
        })
    ]);

    const fwMap = new Map<string, { firewall: string; activeCount: number; clearedCount: number; totalCount: number }>();
    for (const row of fwGroups) {
        const entry = fwMap.get(row.firewall) || {
            firewall: row.firewall,
            activeCount: 0,
            clearedCount: 0,
            totalCount: 0
        };
        if (row.isActive) {
            entry.activeCount += row._count._all;
        } else {
            entry.clearedCount += row._count._all;
        }
        entry.totalCount += row._count._all;
        fwMap.set(row.firewall, entry);
    }

    const byFirewall = Array.from(fwMap.values()).sort((a, b) => a.firewall.localeCompare(b.firewall));

    return {
        activeTotal,
        uniqueActiveIps: activeIpGroups.length,
        clearedTotal,
        totalTracked: activeTotal + clearedTotal,
        lastSyncedAt: latestRecord?.lastSeen?.toISOString() || null,
        byFirewall
    };
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "firewall"))) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const url = new URL(req.url);
        const search = url.searchParams.get("search") || "";
        const statusFilter = url.searchParams.get("status") || "all"; // "all" | "active" | "cleared"
        const timeframe = url.searchParams.get("timeframe") || "all"; // "1h" | "4h" | "12h" | "24h" | "7d" | "30d" | "all"
        const timeField = url.searchParams.get("timeField") || "lastSeen"; // "lastSeen" | "firstSeen"
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);

        const sortField = url.searchParams.get("sortField") || "lastSeen";
        const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

        const where: any = {};

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

        const orderBy: any = [];
        if (sortField === "ipAsn" || sortField === "org" || sortField === "ipCountry" || sortField === "city") {
            orderBy.push({ shunIp: { [sortField]: sortDir } });
        } else {
            orderBy.push({ [sortField]: sortDir });
        }

        // Ensure consistent tie-breaking by IP
        orderBy.push({ ip: "asc" });

        // Query distinct IPs so analysts see exactly 1 aggregated row per IP
        const [groupCount, distinctStats, summary] = await Promise.all([
            prisma.firewallShunStats.groupBy({
                by: ["ip"],
                where
            }),
            prisma.firewallShunStats.findMany({
                where,
                distinct: ["ip"],
                include: { shunIp: true },
                orderBy,
                skip: (page - 1) * limit,
                take: limit
            }),
            buildShunSummary()
        ]);

        const total = groupCount.length;
        const pageIps = distinctStats.map(s => s.ip);

        // Fetch all firewall nodes for these page IPs to know full perimeter coverage
        const [allPageStats, blacklistedEntries] = await Promise.all([
            prisma.firewallShunStats.findMany({
                where: { ip: { in: pageIps } }
            }),
            prisma.guardianBlacklist.findMany({
                where: { ip: { in: pageIps } },
                select: { ip: true }
            })
        ]);

        const blacklistedIps = new Set(blacklistedEntries.map(b => b.ip));

        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let configuredFirewallsCount = 4;
        try {
            const parsed = JSON.parse(configStr);
            if (Array.isArray(parsed) && parsed.length > 0) configuredFirewallsCount = parsed.length;
        } catch (e) {}

        const records = distinctStats.map(s => {
            const ipStats = allPageStats.filter(st => st.ip === s.ip);
            const activeFirewalls = ipStats.filter(st => st.isActive).map(st => st.firewall);
            const clearedFirewalls = ipStats.filter(st => !st.isActive).map(st => st.firewall);
            const activeCount = activeFirewalls.length;
            const isShunnedAll = activeCount >= configuredFirewallsCount;
            const isActive = activeCount > 0;

            const firstSeenDates = ipStats.map(st => new Date(st.firstSeen).getTime());
            const lastSeenDates = ipStats.map(st => new Date(st.lastSeen).getTime());
            const minFirstSeen = firstSeenDates.length > 0 ? new Date(Math.min(...firstSeenDates)) : s.firstSeen;
            const maxLastSeen = lastSeenDates.length > 0 ? new Date(Math.max(...lastSeenDates)) : s.lastSeen;
            const maxDaysShunned = ipStats.length > 0 ? Math.max(...ipStats.map(st => st.daysShunned)) : s.daysShunned;

            return {
                id: s.id,
                ip: s.ip,
                firewall: isShunnedAll
                    ? `All ${configuredFirewallsCount} Firewalls`
                    : activeCount > 0
                        ? `${activeCount}/${configuredFirewallsCount} FWs (${activeFirewalls.join(", ")})`
                        : "Cleared",
                activeFirewalls,
                clearedFirewalls,
                activeCount,
                configuredFirewallsCount,
                isShunnedAll,
                allFirewalls: ipStats.map(st => ({
                    firewall: st.firewall,
                    isActive: st.isActive,
                    firstSeen: st.firstSeen,
                    lastSeen: st.lastSeen,
                    daysShunned: st.daysShunned
                })),
                firstSeen: minFirstSeen,
                lastSeen: maxLastSeen,
                daysShunned: maxDaysShunned,
                isActive,
                isBlacklisted: blacklistedIps.has(s.ip),
                ipAsn: s.shunIp?.ipAsn,
                ipOrg: s.shunIp?.org,
                ipCountry: s.shunIp?.ipCountry,
                ipCountryCode: s.shunIp?.ipCountryCode,
                city: s.shunIp?.city,
                enrichedAt: s.shunIp?.enrichedAt
            };
        });

        return NextResponse.json({
            records,
            summary,
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

export async function POST(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "firewall"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "internal";

        const syncResult = await syncShunDatabase({
            triggeredByUserId: session.user.id,
            clientIp,
            inlinePublicEnrichLimit: 25
        });

        const summary = await buildShunSummary();

        return NextResponse.json({
            ...syncResult,
            summary
        });
    } catch (error: any) {
        console.error("Manual Shun Database Sync Error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to synchronize Shun Database from firewalls." },
            { status: 500 }
        );
    }
}
