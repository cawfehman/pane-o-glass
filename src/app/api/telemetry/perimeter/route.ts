import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import axios from "axios";
import https from "https";
import { getAdaptiveSearchWindow } from "@/lib/graylog-backlog-guardian";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const CORPORATE_REGEX = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, "firewall"))) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rangeSeconds = parseInt(searchParams.get("range") || "86400", 10) || 86400;

        const now = Date.now();
        const sinceDate = new Date(now - rangeSeconds * 1000);

        // Determine bucket parameters for timeline
        let bucketCount = 24;
        let bucketDurationMs = (rangeSeconds * 1000) / bucketCount;
        let timeFormat = "HH:mm";

        if (rangeSeconds <= 3600) {
            bucketCount = 12; // 5-min
            bucketDurationMs = 300_000;
            timeFormat = "HH:mm";
        } else if (rangeSeconds <= 21600) {
            bucketCount = 24; // 15-min
            bucketDurationMs = 900_000;
            timeFormat = "HH:mm";
        } else if (rangeSeconds <= 86400) {
            bucketCount = 24; // 1-hour
            bucketDurationMs = 3600_000;
            timeFormat = "HH:mm";
        } else if (rangeSeconds <= 604800) {
            bucketCount = 28; // 6-hour
            bucketDurationMs = 21600_000;
            timeFormat = "MMM dd HH:mm";
        } else {
            bucketCount = 30; // 1-day
            bucketDurationMs = 86400_000;
            timeFormat = "MMM dd";
        }

        // 1. Fetch VPN events in window
        const vpnEvents = await prisma.vpnEvent.findMany({
            where: {
                status: "FAILURE",
                createdAt: { gte: sinceDate },
            },
            select: {
                sourceIp: true,
                username: true,
                vpnStream: true,
                createdAt: true,
            },
        });

        // 2. Fetch Active Ledger Strikes and pardons
        const ledgerEntries = await prisma.residentialStrikeLedger.findMany({
            select: {
                ip: true,
                strikeCount: true,
                status: true,
                ispOrg: true,
                asn: true,
                country: true,
                city: true,
                targetPlatform: true,
                attemptedUsers: true,
                distinctUserCount: true,
                lastSeen: true,
                firstSeen: true,
            },
        });
        const ledgerMap = new Map(ledgerEntries.map((l) => [l.ip, l]));

        // 3. Optional Graylog query for deduplicated Citrix numbers
        let graylogDeduplicatedFailures = 0;
        let graylogRawSyslogFailures = 0;
        try {
            const baseUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
            const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
            if (apiToken) {
                const authHeader = "Basic " + Buffer.from(`${apiToken}:token`).toString("base64");
                const adaptive = await getAdaptiveSearchWindow("OG_GRAYLOG", rangeSeconds).catch(() => ({
                    effectiveRangeSeconds: rangeSeconds,
                }));

                const [dedupRes, rawRes] = await Promise.all([
                    axios.get(`${baseUrl}/api/search/universal/relative`, {
                        params: {
                            query: "ns_action:LOGIN_FAILED",
                            range: adaptive.effectiveRangeSeconds,
                            limit: 1,
                        },
                        httpsAgent,
                        headers: { Authorization: authHeader, "X-Requested-By": "pane-o-glass" },
                        timeout: 5000,
                    }).catch(() => ({ data: { total_results: 0 } })),
                    axios.get(`${baseUrl}/api/search/universal/relative`, {
                        params: {
                            query: '(ns_action:LOGIN_FAILED OR (ns_module:(AAA OR SSLVPN OR AAATM) AND ("Failed policy" OR "denied access")))',
                            range: adaptive.effectiveRangeSeconds,
                            limit: 1,
                        },
                        httpsAgent,
                        headers: { Authorization: authHeader, "X-Requested-By": "pane-o-glass" },
                        timeout: 5000,
                    }).catch(() => ({ data: { total_results: 0 } })),
                ]);

                graylogDeduplicatedFailures = dedupRes.data?.total_results || 0;
                graylogRawSyslogFailures = rawRes.data?.total_results || 0;
            }
        } catch {
            // Non-critical fallback
        }

        // 4. Process and categorize events
        const ipStats = new Map<
            string,
            {
                ip: string;
                count: number;
                users: Set<string>;
                lastSeen: Date;
                gateways: Set<string>;
            }
        >();
        const userStats = new Map<string, { count: number; ips: Set<string> }>();
        const gatewayBreakdown: Record<string, number> = {
            "WDC-FTD": 0,
            "Kel-3140": 0,
            "NetScaler Gateway": Math.max(graylogDeduplicatedFailures, ledgerEntries.filter((l) => l.targetPlatform === "CITRIX" || l.targetPlatform === "BOTH").length),
            Other: 0,
        };

        // Bucket initialization for Timeline
        const buckets: {
            start: number;
            end: number;
            label: string;
            hostile: number;
            friction: number;
            total: number;
        }[] = [];

        const startTimestamp = now - bucketCount * bucketDurationMs;
        for (let i = 0; i < bucketCount; i++) {
            const bStart = startTimestamp + i * bucketDurationMs;
            const bEnd = bStart + bucketDurationMs;
            const d = new Date(bStart);
            const label =
                timeFormat === "HH:mm"
                    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
                    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" });

            buckets.push({
                start: bStart,
                end: bEnd,
                label,
                hostile: 0,
                friction: 0,
                total: 0,
            });
        }

        // First pass: aggregate IP & user behaviors
        for (const ev of vpnEvents) {
            const ip = ev.sourceIp || "unknown";
            const u = (ev.username || "").toLowerCase().trim();
            const gw = ev.vpnStream || "Other";

            if (gatewayBreakdown[gw] !== undefined) {
                gatewayBreakdown[gw]++;
            } else {
                gatewayBreakdown["Other"]++;
            }

            if (!ipStats.has(ip)) {
                ipStats.set(ip, {
                    ip,
                    count: 0,
                    users: new Set(),
                    lastSeen: ev.createdAt,
                    gateways: new Set(),
                });
            }
            const curIp = ipStats.get(ip)!;
            curIp.count++;
            if (ev.createdAt > curIp.lastSeen) curIp.lastSeen = ev.createdAt;
            if (gw) curIp.gateways.add(gw);
            if (u) {
                curIp.users.add(u);
                if (!userStats.has(u)) {
                    userStats.set(u, { count: 0, ips: new Set() });
                }
                const curUser = userStats.get(u)!;
                curUser.count++;
                curUser.ips.add(ip);
            }
        }

        // Classify each IP as Hostile or Friction
        let hostileFailures = 0;
        let staffFrictionFailures = 0;
        const hostileIpSet = new Set<string>();

        for (const [ip, data] of ipStats.entries()) {
            const ledger = ledgerMap.get(ip);
            const isPardoned = ledger?.status === "PARDONED";
            const isQuarantined = ledger?.status === "QUARANTINED" || (ledger?.strikeCount ?? 0) >= 3;
            const isEnforced = ledger?.status === "ENFORCED" || (ledger?.strikeCount ?? 0) === 2;

            const isMultiUser = data.users.size >= 2;
            const hasNonCorpUsername = Array.from(data.users).some((u) => !CORPORATE_REGEX.test(u));
            const isHighVolume = data.count >= 3;

            const isHostile = !isPardoned && (isQuarantined || isEnforced || isMultiUser || hasNonCorpUsername || isHighVolume);

            if (isHostile) {
                hostileFailures += data.count;
                hostileIpSet.add(ip);
            } else {
                staffFrictionFailures += data.count;
            }
        }

        // Populate Timeline buckets
        for (const ev of vpnEvents) {
            const t = ev.createdAt.getTime();
            const ip = ev.sourceIp || "unknown";
            const isHostile = hostileIpSet.has(ip);

            const b = buckets.find((b) => t >= b.start && t < b.end);
            if (b) {
                b.total++;
                if (isHostile) {
                    b.hostile++;
                } else {
                    b.friction++;
                }
            }
        }

        // If Graylog had Citrix events, distribute proportional baseline across buckets
        if (graylogDeduplicatedFailures > 0) {
            const perBucketCitrix = Math.round(graylogDeduplicatedFailures / bucketCount);
            buckets.forEach((b) => {
                b.friction += perBucketCitrix;
                b.total += perBucketCitrix;
            });
            staffFrictionFailures += graylogDeduplicatedFailures;
        }

        const totalDeduplicated = hostileFailures + staffFrictionFailures;
        const hostileRatio = totalDeduplicated > 0 ? (hostileFailures / totalDeduplicated) * 100 : 0;
        const staffFrictionRatio = totalDeduplicated > 0 ? (staffFrictionFailures / totalDeduplicated) * 100 : 0;

        // Top Hostile Attackers (merging active ledger threats and recent VPN probers)
        const allHostileCandidates = new Map<string, any>();

        // 1. From live VPN session evaluations
        for (const d of ipStats.values()) {
            if (hostileIpSet.has(d.ip)) {
                const ledger = ledgerMap.get(d.ip);
                allHostileCandidates.set(d.ip, {
                    ip: d.ip,
                    count: d.count,
                    distinctUserCount: d.users.size,
                    sampleUsers: Array.from(d.users).slice(0, 3),
                    gateways: Array.from(d.gateways),
                    strikeCount: ledger?.strikeCount || 1,
                    status: ledger?.status || "WATCHING",
                    ispOrg: ledger?.ispOrg || "Unknown ISP",
                    asn: ledger?.asn || null,
                    country: ledger?.country || "US",
                    city: ledger?.city || "Unknown",
                    lastSeen: d.lastSeen,
                });
            }
        }

        // 2. From ResidentialStrikeLedger (active in window or elevated strikes)
        for (const l of ledgerEntries) {
            if (l.status !== "PARDONED" && (l.lastSeen >= sinceDate || l.strikeCount >= 2)) {
                const existing = allHostileCandidates.get(l.ip);
                if (existing) {
                    existing.strikeCount = Math.max(existing.strikeCount, l.strikeCount);
                    if (l.status === "QUARANTINED") existing.status = "QUARANTINED";
                    if (!existing.gateways.includes(l.targetPlatform)) existing.gateways.push(l.targetPlatform);
                } else {
                    allHostileCandidates.set(l.ip, {
                        ip: l.ip,
                        count: l.distinctUserCount > 1 ? l.distinctUserCount : 1,
                        distinctUserCount: l.distinctUserCount,
                        sampleUsers: l.attemptedUsers.slice(0, 3),
                        gateways: [l.targetPlatform],
                        strikeCount: l.strikeCount,
                        status: l.status,
                        ispOrg: l.ispOrg || "Unknown ISP",
                        asn: l.asn || null,
                        country: l.country || "US",
                        city: l.city || "Unknown",
                        lastSeen: l.lastSeen,
                    });
                }
            }
        }

        const topHostileIps = Array.from(allHostileCandidates.values())
            .sort((a, b) => b.distinctUserCount - a.distinctUserCount || b.strikeCount - a.strikeCount || b.count - a.count)
            .slice(0, 15)
            .map((d) => ({
                ...d,
                lastSeen: d.lastSeen.toISOString(),
            }));

        // Aggregate all targeted users across VPN and Citrix Ledger
        const userAggMap = new Map<string, { count: number; ips: Set<string> }>();
        for (const [u, d] of userStats.entries()) {
            userAggMap.set(u, { count: d.count, ips: new Set(d.ips) });
        }
        for (const l of ledgerEntries) {
            if (l.status !== "PARDONED" && (l.lastSeen >= sinceDate || l.strikeCount >= 2)) {
                for (const u of l.attemptedUsers) {
                    if (u && u !== "anonymous") {
                        const cleanU = u.toLowerCase().trim();
                        if (!userAggMap.has(cleanU)) {
                            userAggMap.set(cleanU, { count: 0, ips: new Set() });
                        }
                        const cur = userAggMap.get(cleanU)!;
                        cur.count++;
                        cur.ips.add(l.ip);
                    }
                }
            }
        }

        const topTargetedUsers = Array.from(userAggMap.entries())
            .sort((a, b) => b[1].ips.size - a[1].ips.size || b[1].count - a[1].count)
            .slice(0, 15)
            .map(([username, data]) => ({
                username,
                attempts: data.count,
                distinctIps: data.ips.size,
                isCorporateFormat: CORPORATE_REGEX.test(username),
            }));

        // Ledger totals
        const ledgerStats = {
            quarantined: ledgerEntries.filter((l) => l.status === "QUARANTINED").length,
            enforced: ledgerEntries.filter((l) => l.status === "ENFORCED").length,
            watching: ledgerEntries.filter((l) => l.status === "WATCHING").length,
            pardoned: ledgerEntries.filter((l) => l.status === "PARDONED").length,
        };

        return NextResponse.json({
            success: true,
            timeframe: rangeSeconds,
            kpis: {
                totalDeduplicatedAuthFailures: totalDeduplicated,
                rawSyslogVolumeEstimate: vpnEvents.length + graylogRawSyslogFailures,
                hostileFailures,
                staffFrictionFailures,
                hostileRatio: Math.round(hostileRatio * 10) / 10,
                staffFrictionRatio: Math.round(staffFrictionRatio * 10) / 10,
                uniqueAttackingIps: allHostileCandidates.size,
                uniqueAccountsTargeted: userAggMap.size,
                quarantinedEntities: ledgerStats.quarantined,
                enforcedEntities: ledgerStats.enforced,
                watchingEntities: ledgerStats.watching,
                pardonedStaffIps: ledgerStats.pardoned,
            },
            timeline: buckets.map((b) => ({
                time: b.label,
                hostile: b.hostile,
                friction: b.friction,
                total: b.total,
            })),
            gateways: gatewayBreakdown,
            topHostileIps,
            topTargetedUsers,
        });
    } catch (error: any) {
        console.error("[Perimeter Telemetry API Error]:", error);
        return NextResponse.json(
            { error: "Failed to compile perimeter security telemetry", details: error.message },
            { status: 500 }
        );
    }
}
