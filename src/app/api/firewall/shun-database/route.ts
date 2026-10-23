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
        const page = parseInt(url.searchParams.get("page") || "1", 10);
        const limit = parseInt(url.searchParams.get("limit") || "50", 10);

        const sortField = url.searchParams.get("sortField") || "isActive";
        const sortDir = url.searchParams.get("sortDir") === "asc" ? "asc" : "desc";

        const where: any = {};

        if (statusFilter === "active") {
            where.isActive = true;
        } else if (statusFilter === "cleared") {
            where.isActive = false;
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

        // Ensure consistent tie-breaking
        if (sortField !== "lastSeen") {
            orderBy.push({ lastSeen: "desc" });
        }

        const [total, stats, summary] = await Promise.all([
            prisma.firewallShunStats.count({ where }),
            prisma.firewallShunStats.findMany({
                where,
                include: { shunIp: true },
                orderBy,
                skip: (page - 1) * limit,
                take: limit
            }),
            buildShunSummary()
        ]);

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
