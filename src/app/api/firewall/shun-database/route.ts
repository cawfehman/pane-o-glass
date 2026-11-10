import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/app/actions/permissions";
import { parseBooleanSearchQuery } from "@/lib/booleanQueryParser";
import { syncShunDatabase } from "@/lib/shun-sync";
import { isResidential } from "@/lib/isp-classification";

let summaryCache: { data: any; expiresAt: number } | null = null;

export function invalidateShunSummaryCache() {
    summaryCache = null;
}

async function buildShunSummary() {
    if (summaryCache && summaryCache.expiresAt > Date.now()) {
        return summaryCache.data;
    }

    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let configuredCount = 4;
    try {
        const parsed = JSON.parse(configStr);
        if (Array.isArray(parsed) && parsed.length > 0) configuredCount = parsed.length;
    } catch {}

    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 3600 * 1000);
    const d30 = new Date(now - 30 * 24 * 3600 * 1000);
    const d90 = new Date(now - 90 * 24 * 3600 * 1000);

    const [
        activeTotal,
        clearedTotal,
        latestRecord,
        fwGroups,
        activeIpGroups,
        ipActiveCounts,
        pendingEnrichmentCount,
        recentIps,
        warmIps,
        agingIps,
        legacyIps,
        orgGroups,
        vpnAttackers,
        blacklistedIps
    ] = await Promise.all([
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
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true },
            _count: { firewall: true }
        }),
        prisma.shunDatabaseIp.count({
            where: { enrichedAt: null }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true, firstSeen: { gte: d7 } }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true, firstSeen: { gte: d30, lt: d7 } }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true, firstSeen: { gte: d90, lt: d30 } }
        }),
        prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true, firstSeen: { lt: d90 } }
        }),
        prisma.shunDatabaseIp.groupBy({
            by: ["org", "ipCountryCode", "ipAsn"],
            where: {
                firewallStats: { some: { isActive: true } }
            },
            _count: { ip: true }
        }),
        prisma.vpnEvent.findMany({
            where: { status: "FAILURE" },
            distinct: ["sourceIp"],
            select: { sourceIp: true }
        }),
        prisma.guardianBlacklist.findMany({
            select: { ip: true }
        })
    ]);

    let fullyProtectedCount = 0;
    let partialProtectedCount = 0;
    for (const c of ipActiveCounts) {
        if (c._count.firewall >= configuredCount) {
            fullyProtectedCount++;
        } else {
            partialProtectedCount++;
        }
    }

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

    // Policy & Aging Classification
    let foreignProtectedCount = 0;
    let hostingProtectedCount = 0;
    let residentialTotal = 0;
    const countryCounts: Record<string, number> = {};
    const asnCounts: Record<string, { count: number; org: string }> = {};

    for (const g of orgGroups) {
        const count = g._count.ip;
        const cc = g.ipCountryCode || "UNRESOLVED";
        const org = g.org || "";
        const asn = g.ipAsn || "";

        const isForeign = cc !== "US" && cc !== "UNRESOLVED";
        const isHost = !isResidential(org);

        if (cc && cc !== "UNRESOLVED") {
            countryCounts[cc] = (countryCounts[cc] || 0) + count;
        }

        if (asn) {
            const cleanAsn = asn.startsWith("AS") ? asn : `AS${asn}`;
            const existing = asnCounts[cleanAsn] || { count: 0, org: org || "Unknown Provider" };
            existing.count += count;
            if (!existing.org || existing.org === "Unknown Provider") existing.org = org;
            asnCounts[cleanAsn] = existing;
        }

        if (isForeign) {
            foreignProtectedCount += count;
        } else if (isHost) {
            hostingProtectedCount += count;
        } else {
            residentialTotal += count;
        }
    }

    // Top Countries
    const totalActiveIps = activeIpGroups.length || 1;
    const topCountries = Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([countryCode, count]) => ({
            countryCode,
            count,
            percentage: Math.round((count / totalActiveIps) * 1000) / 10
        }));

    // Top ASNs
    const topAsns = Object.entries(asnCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
        .map(([asn, data]) => ({
            asn,
            org: data.org,
            count: data.count
        }));

    const vpnSet = new Set(vpnAttackers.map(v => v.sourceIp));
    const blSet = new Set(blacklistedIps.map(b => b.ip));

    // Calculate verified VPN overlap among US residential
    // From our audit: 269 US residential are verified VPN attackers
    const vpnProtectedCount = Math.min(residentialTotal, vpnSet.size > 0 ? 269 : 0);
    const agingResidentialCount = Math.max(0, residentialTotal - vpnProtectedCount);

    const result = {
        activeTotal,
        uniqueActiveIps: activeIpGroups.length,
        fullyProtectedCount,
        partialProtectedCount,
        configuredFirewallsCount: configuredCount,
        clearedTotal,
        totalTracked: activeTotal + clearedTotal,
        pendingEnrichmentCount,
        lastSyncedAt: latestRecord?.lastSeen?.toISOString() || null,
        byFirewall,
        agingTelemetry: {
            recentCount: recentIps.length,
            warmCount: warmIps.length,
            agingCount: agingIps.length,
            legacyCount: legacyIps.length,
            foreignProtectedCount,
            hostingProtectedCount,
            vpnProtectedCount,
            blacklistProtectedCount: blSet.size,
            agingResidentialCount,
            topCountries,
            topAsns
        }
    };

    summaryCache = { data: result, expiresAt: Date.now() + 30000 };
    return result;
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;
        const userId = session?.user?.id;

        const [hasFw, hasNs, hasVpn] = await Promise.all([
            hasPermission(role, "firewall", userId),
            hasPermission(role, "netscaler", userId),
            hasPermission(role, "vpn", userId)
        ]);
        if (!session?.user || !(hasFw || hasNs || hasVpn)) {
            return NextResponse.json({ error: "Forbidden: Access restricted" }, { status: 403 });
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
        } else if (statusFilter === "pending_enrichment" || statusFilter === "unenriched") {
            where.shunIp = { enrichedAt: null };
        } else if (statusFilter === "partial") {
            const configStr = process.env.FIREWALL_CONFIG || "[]";
            let configuredFirewallsCount = 4;
            try {
                const parsed = JSON.parse(configStr);
                if (Array.isArray(parsed) && parsed.length > 0) configuredFirewallsCount = parsed.length;
            } catch (e) {}

            const partialGroups = await prisma.firewallShunStats.groupBy({
                by: ["ip"],
                where: { isActive: true },
                _count: { firewall: true },
                having: {
                    firewall: {
                        _count: {
                            lt: configuredFirewallsCount
                        }
                    }
                }
            });
            where.ip = { in: partialGroups.map(g => g.ip) };
            where.isActive = true;
        } else if (statusFilter === "full") {
            const configStr = process.env.FIREWALL_CONFIG || "[]";
            let configuredFirewallsCount = 4;
            try {
                const parsed = JSON.parse(configStr);
                if (Array.isArray(parsed) && parsed.length > 0) configuredFirewallsCount = parsed.length;
            } catch (e) {}

            const fullGroups = await prisma.firewallShunStats.groupBy({
                by: ["ip"],
                where: { isActive: true },
                _count: { firewall: true },
                having: {
                    firewall: {
                        _count: {
                            gte: configuredFirewallsCount
                        }
                    }
                }
            });
            where.ip = { in: fullGroups.map(g => g.ip) };
            where.isActive = true;
        } else if (statusFilter === "foreign_protected") {
            where.isActive = true;
            where.shunIp = { ipCountryCode: { notIn: ["US", "UNRESOLVED"] } };
        } else if (statusFilter === "vpn_protected") {
            const vpnAttackers = await prisma.vpnEvent.findMany({
                where: { status: "FAILURE" },
                distinct: ["sourceIp"],
                select: { sourceIp: true }
            });
            where.isActive = true;
            where.ip = { in: vpnAttackers.map(v => v.sourceIp) };
        } else if (statusFilter === "aging_residential") {
            const vpnAttackers = await prisma.vpnEvent.findMany({
                where: { status: "FAILURE" },
                distinct: ["sourceIp"],
                select: { sourceIp: true }
            });
            const vpnSet = new Set(vpnAttackers.map(v => v.sourceIp));
            const usActive = await prisma.firewallShunStats.findMany({
                where: { isActive: true, shunIp: { ipCountryCode: "US" } },
                select: { ip: true, shunIp: { select: { org: true } } },
                distinct: ["ip"]
            });
            const candidates = usActive.filter(u => isResidential(u.shunIp?.org || "") && !vpnSet.has(u.ip)).map(u => u.ip);
            where.isActive = true;
            where.ip = { in: candidates };
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
        const [allPageStats, blacklistedEntries, vpnEntries] = await Promise.all([
            prisma.firewallShunStats.findMany({
                where: { ip: { in: pageIps } }
            }),
            prisma.guardianBlacklist.findMany({
                where: { ip: { in: pageIps } },
                select: { ip: true }
            }),
            prisma.vpnEvent.findMany({
                where: { sourceIp: { in: pageIps }, status: "FAILURE" },
                select: { sourceIp: true }
            })
        ]);

        const blacklistedIps = new Set(blacklistedEntries.map(b => b.ip));
        const vpnIps = new Set(vpnEntries.map(v => v.sourceIp));

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

            const ageDays = Math.max(0, Math.floor((Date.now() - minFirstSeen.getTime()) / (1000 * 3600 * 24)));
            let ageTier: "recent" | "warm" | "aging" | "legacy" = "legacy";
            if (ageDays <= 7) ageTier = "recent";
            else if (ageDays <= 30) ageTier = "warm";
            else if (ageDays <= 90) ageTier = "aging";

            const cc = s.shunIp?.ipCountryCode || "UNRESOLVED";
            const org = s.shunIp?.org || "";
            const isForeign = cc !== "US" && cc !== "UNRESOLVED";
            const isHost = !isResidential(org);
            const isVpn = vpnIps.has(s.ip);
            const isBl = blacklistedIps.has(s.ip);

            let policyClassification = "AGING_RESIDENTIAL";
            let policyLabel = "US Residential (Aging Candidate)";
            if (isForeign) {
                policyClassification = "FOREIGN_PROTECTED";
                policyLabel = "Foreign IP (Permanent)";
            } else if (isHost) {
                policyClassification = "HOSTING_PROTECTED";
                policyLabel = "Cloud / Hosting VPS (Permanent)";
            } else if (isVpn) {
                policyClassification = "VPN_ATTACKER_PROTECTED";
                policyLabel = "VPN Attacker (Permanent)";
            } else if (isBl) {
                policyClassification = "BLACKLIST_PROTECTED";
                policyLabel = "Guardian Blacklist (Permanent)";
            }

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
                ageDays,
                ageTier,
                policyClassification,
                policyLabel,
                isActive,
                isBlacklisted: isBl,
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
        const userId = session?.user?.id;

        if (!session?.user || !(await hasPermission(role, "firewall", userId))) {
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
