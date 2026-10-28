import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { getSecurityIntelligenceFeed, invalidateFeedCache } from "../route";
import { enqueueFirewallCommand, drainFirewallQueue } from "@/lib/firewall-queue";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const userId = session.user.id;
    const [hasFw, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall", userId),
        hasPermission(role, "netscaler", userId)
    ]);
    return Boolean(hasFw || hasNetscaler);
}

// GET: Inspect live FMC Security Intelligence Feed, search IPs, verify presence, check FMC poll heartbeat
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const targetIp = url.searchParams.get("ip")?.trim() || "";
        const search = url.searchParams.get("search")?.trim() || "";
        const categoryFilter = url.searchParams.get("category") || "ALL";
        const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "50", 10)));

        // 1. FMC Sync Heartbeat Telemetry
        const lastPollSetting = await prisma.netscalerCveSetting.findUnique({
            where: { key: "LAST_FMC_SI_POLL" }
        });

        const intervalMins = Math.max(5, parseInt(process.env.FMC_POLL_INTERVAL_MINUTES || "15", 10));
        let nextPollExpected: string | null = null;
        let secondsUntilNextPoll: number | null = null;

        if (lastPollSetting?.value) {
            const lastPollDate = new Date(lastPollSetting.value);
            const intervalMs = intervalMins * 60 * 1000;
            const elapsed = Date.now() - lastPollDate.getTime();
            const cyclesPassed = Math.max(0, Math.floor(elapsed / intervalMs));
            const nextPollMs = lastPollDate.getTime() + (cyclesPassed + 1) * intervalMs;
            nextPollExpected = new Date(nextPollMs).toISOString();
            secondsUntilNextPoll = Math.max(0, Math.round((nextPollMs - Date.now()) / 1000));
        }

        // 2. Fetch Active Feed Snapshot
        const feed = await getSecurityIntelligenceFeed("all");
        const feedIpSet = new Set(feed.ips);

        // 3. Single IP Lookup Mode (Instant Positive Confirmation & 360° Profile)
        let lookupResult: any = null;
        if (targetIp) {
            const inFeed = feedIpSet.has(targetIp);

            const [residential, blacklist, cve, allShunStats, vpnSessions, pendingQueue, cache] = await Promise.all([
                prisma.residentialStrikeLedger.findUnique({ where: { ip: targetIp } }),
                prisma.guardianBlacklist.findUnique({ where: { ip: targetIp } }),
                prisma.netscalerCveShun.findUnique({ where: { ip: targetIp } }),
                prisma.firewallShunStats.findMany({
                    where: { ip: targetIp },
                    include: { shunIp: true }
                }),
                prisma.vpnEvent.findMany({
                    where: { sourceIp: targetIp },
                    orderBy: { createdAt: "desc" },
                    take: 10,
                    select: {
                        username: true,
                        status: true,
                        failureReason: true,
                        vpnType: true,
                        vpnStream: true,
                        createdAt: true
                    }
                }),
                prisma.firewallCommandQueue.findMany({ where: { ip: targetIp, status: "PENDING" } }),
                prisma.ipLookupCache.findUnique({ where: { ip: targetIp } })
            ]);

            // Active firewall shuns
            const activeShunNodes = allShunStats.filter(s => s.isActive).map(s => s.firewall);
            const inPerimeterVpnShun = activeShunNodes.length > 0;

            // Extract ASN & Org
            let rawGeo = null;
            if (cache?.rawJson) {
                try { rawGeo = JSON.parse(cache.rawJson); } catch {}
            }

            const ispOrg = rawGeo?.company?.name || rawGeo?.asn?.name || residential?.ispOrg || allShunStats[0]?.shunIp?.org || "Unknown Provider";
            const asnStr = rawGeo?.asn?.asn ? String(rawGeo.asn.asn) : (residential?.asn || allShunStats[0]?.shunIp?.ipAsn || "Unknown");
            const countryCode = cache?.countryCode || residential?.country || allShunStats[0]?.shunIp?.ipCountryCode || "US";
            const city = cache?.city || residential?.city || allShunStats[0]?.shunIp?.city || "Unknown";

            // Check if ASN is blacklisted
            let isAsnBlacklisted = false;
            let asnBlacklistReason: string | null = null;
            if (asnStr && asnStr !== "Unknown") {
                const rawNum = asnStr.replace(/^AS/i, "");
                const asnEntry = await prisma.guardianAsnBlacklist.findFirst({
                    where: { OR: [{ asn: `AS${rawNum}` }, { asn: rawNum }] }
                });
                if (asnEntry) {
                    isAsnBlacklisted = true;
                    asnBlacklistReason = asnEntry.reason;
                }
            }

            // FMC GeoIP Rule 2/3 Evaluation
            const isUsGeo = countryCode.toUpperCase() === "US";
            const fmcGeoBlocked = !isUsGeo;

            let activeCategory = "NONE";
            let reason = "Not blocked in FMC Security Intelligence feed";

            if (cve && cve.status === "ACTIVE") {
                activeCategory = "CVE_IOC";
                reason = `NetScaler CVE-2026 Exploit IOC (${cve.cve})`;
            } else if (blacklist) {
                activeCategory = "BLACKLIST";
                reason = `Permanent Guardian Blacklist: ${blacklist.reason || "Administrative block"}`;
            } else if (residential && (residential.status === "ENFORCED" || residential.status === "QUARANTINED" || residential.strikeCount >= 2)) {
                activeCategory = "RESIDENTIAL_STRIKE";
                reason = `Citrix Strike ${residential.strikeCount} (${residential.status}): ${residential.attemptedUsers.length} account(s) probed`;
            } else if (inPerimeterVpnShun) {
                activeCategory = "PERIMETER_VPN_SHUN";
                reason = `Perimeter VPN Shun active on: ${activeShunNodes.join(", ")}`;
            } else if (fmcGeoBlocked) {
                activeCategory = "FMC_GEOIP_BLOCKED";
                reason = `Non-US Location (${countryCode}): Blocked by FMC ACP Rule 3 ('Block access to Netscaler') unless whitelisted in Rule 1`;
            }

            // Overall Block Flag
            const isCurrentlyBlocked = inFeed || inPerimeterVpnShun || isAsnBlacklisted || Boolean(blacklist) || fmcGeoBlocked || (residential && residential.strikeCount >= 2 && residential.status !== "PARDONED");

            lookupResult = {
                ip: targetIp,
                inFeed,
                isCurrentlyBlocked,
                activeCategory,
                reason,
                blockPosture: {
                    inFmcFeed: inFeed,
                    inPerimeterVpnShun,
                    activeShunNodes,
                    strikeCount: residential?.strikeCount ?? 0,
                    strikeStatus: residential?.status ?? "CLEAN",
                    isBlacklisted: Boolean(blacklist),
                    blacklistReason: blacklist?.reason || null,
                    isAsnBlacklisted,
                    asnBlacklistReason,
                    isCveExploit: Boolean(cve && cve.status === "ACTIVE"),
                    fmcGeoStatus: {
                        countryCode,
                        isUsGeo,
                        fmcGeoBlocked,
                        verdict: fmcGeoBlocked
                            ? `BLOCKED by FMC ACP Rule 3 (Non-US: ${countryCode})`
                            : "PERMITTED by FMC ACP Rule 2 (Domestic US)"
                    }
                },
                networkProfile: {
                    isp: ispOrg,
                    asn: asnStr,
                    city,
                    countryCode,
                    carrierType: rawGeo?.carrier?.name || "Broadband / Hosting"
                },
                shunHistory: {
                    hasShunHistory: allShunStats.length > 0,
                    nodes: allShunStats.map(s => ({
                        node: s.firewall,
                        isActive: s.isActive,
                        daysShunned: s.daysShunned,
                        firstSeen: s.firstSeen,
                        lastSeen: s.lastSeen
                    }))
                },
                vpnTelemetry: {
                    recentSessions: vpnSessions.map(v => ({
                        username: v.username,
                        status: v.status,
                        failureReason: v.failureReason,
                        vpnStream: v.vpnStream,
                        vpnType: v.vpnType,
                        timestamp: v.createdAt
                    }))
                },
                pendingCommandsCount: pendingQueue.length
            };
        }

        // 4. Feed Entries Filtering & Pagination
        let filteredIps = feed.ips;

        if (search) {
            const cleanSearch = search.toLowerCase();
            filteredIps = filteredIps.filter(ip => ip.toLowerCase().includes(cleanSearch));
        }

        const totalMatching = filteredIps.length;
        const totalPages = Math.ceil(totalMatching / pageSize);
        const startIndex = (page - 1) * pageSize;
        const paginatedIps = filteredIps.slice(startIndex, startIndex + pageSize);

        // Batch enrich paginated IPs for display
        const [ledgerEntries, blacklistEntries] = await Promise.all([
            prisma.residentialStrikeLedger.findMany({
                where: { ip: { in: paginatedIps } },
                select: { ip: true, strikeCount: true, status: true, ispOrg: true, country: true, attemptedUsers: true }
            }),
            prisma.guardianBlacklist.findMany({
                where: { ip: { in: paginatedIps } },
                select: { ip: true, reason: true }
            })
        ]);

        const ledgerMap = new Map(ledgerEntries.map(l => [l.ip, l]));
        const blacklistMap = new Map(blacklistEntries.map(b => [b.ip, b]));

        const entries = paginatedIps.map(ip => {
            const ledger = ledgerMap.get(ip);
            const bl = blacklistMap.get(ip);

            let cat = "HOSTING_VPS";
            let reason = "Datacenter / VPS / Cloud Hosting Network";

            if (bl) {
                cat = "BLACKLIST";
                reason = bl.reason || "Permanent Guardian Blacklist";
            } else if (ledger) {
                cat = "RESIDENTIAL";
                reason = `Strike ${ledger.strikeCount} (${ledger.status}) - ${ledger.attemptedUsers.length} user(s)`;
            }

            return {
                ip,
                category: cat,
                reason,
                isp: ledger?.ispOrg || "Cloud / Hosting Provider",
                country: ledger?.country || "US"
            };
        });

        return NextResponse.json({
            success: true,
            feedStatus: {
                totalCount: feed.metrics.total,
                md5: feed.md5,
                breakdown: {
                    cveCount: feed.metrics.cveCount,
                    blacklistCount: feed.metrics.blacklistCount,
                    residentialCount: feed.metrics.residentialCount,
                    hostingCount: feed.metrics.hostingCount
                },
                lastFmcPoll: lastPollSetting?.value || null,
                nextPollExpected,
                secondsUntilNextPoll,
                estimatedMinutesUntilNextPoll: secondsUntilNextPoll !== null ? Math.max(1, Math.round(secondsUntilNextPoll / 60)) : 15
            },
            lookup: lookupResult,
            entries,
            pagination: {
                page,
                pageSize,
                totalPages,
                totalMatching
            }
        });

    } catch (err: any) {
        console.error("Feed inspection error:", err);
        return NextResponse.json({ error: err.message || "Failed to inspect feed" }, { status: 500 });
    }
}

// POST: Batch Inspect, Bulk Remove & Pardon, or Single IP Pardon
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { action, ip, ips, targets, reason } = body;
        const userId = (session.user as any)?.id || (session.user as any)?.name || "admin";

        // ==============================================================
        // 1. BATCH INSPECT MODE (Query multiple IPs at once)
        // ==============================================================
        if (action === "BATCH_INSPECT") {
            let targetList: string[] = [];

            if (Array.isArray(targets)) {
                targetList = targets.map(t => String(t).trim()).filter(Boolean);
            } else if (typeof targets === "string") {
                const matches = targets.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/g);
                targetList = matches ? Array.from(new Set(matches)) : [];
            }

            // Cap at 100 IPs per inspection
            const cleanIps = Array.from(new Set(targetList)).slice(0, 100);

            if (cleanIps.length === 0) {
                return NextResponse.json({ error: "No valid IPv4 addresses provided for batch inspection." }, { status: 400 });
            }

            // Fetch live feed snapshot
            const feed = await getSecurityIntelligenceFeed("all");
            const feedIpSet = new Set(feed.ips);

            // Fetch all DB records in bulk
            const [residentialList, blacklistList, cveList, allShunStats, allCache, allAsnBlacklist, pendingCommands] = await Promise.all([
                prisma.residentialStrikeLedger.findMany({ where: { ip: { in: cleanIps } } }),
                prisma.guardianBlacklist.findMany({ where: { ip: { in: cleanIps } } }),
                prisma.netscalerCveShun.findMany({ where: { ip: { in: cleanIps } } }),
                prisma.firewallShunStats.findMany({
                    where: { ip: { in: cleanIps } },
                    include: { shunIp: true }
                }),
                prisma.ipLookupCache.findMany({ where: { ip: { in: cleanIps } } }),
                prisma.guardianAsnBlacklist.findMany(),
                prisma.firewallCommandQueue.findMany({ where: { ip: { in: cleanIps }, status: "PENDING" } })
            ]);

            const resMap = new Map(residentialList.map(r => [r.ip, r]));
            const blMap = new Map(blacklistList.map(b => [b.ip, b]));
            const cveMap = new Map(cveList.map(c => [c.ip, c]));
            const cacheMap = new Map(allCache.map(c => [c.ip, c]));
            const pendingMap = new Map<string, number>();
            for (const p of pendingCommands) {
                pendingMap.set(p.ip, (pendingMap.get(p.ip) || 0) + 1);
            }

            const shunStatsMap = new Map<string, typeof allShunStats>();
            for (const s of allShunStats) {
                if (!shunStatsMap.has(s.ip)) shunStatsMap.set(s.ip, []);
                shunStatsMap.get(s.ip)!.push(s);
            }

            const asnBlacklistSet = new Set(allAsnBlacklist.map(a => a.asn.toUpperCase().replace(/^AS/, '')));

            const results = cleanIps.map(currIp => {
                const inFeed = feedIpSet.has(currIp);
                const residential = resMap.get(currIp);
                const blacklist = blMap.get(currIp);
                const cve = cveMap.get(currIp);
                const shunStats = shunStatsMap.get(currIp) || [];
                const cache = cacheMap.get(currIp);

                const activeShunNodes = shunStats.filter(s => s.isActive).map(s => s.firewall);
                const inPerimeterVpnShun = activeShunNodes.length > 0;

                let rawGeo = null;
                if (cache?.rawJson) {
                    try { rawGeo = JSON.parse(cache.rawJson); } catch {}
                }

                const ispOrg = rawGeo?.company?.name || rawGeo?.asn?.name || residential?.ispOrg || shunStats[0]?.shunIp?.org || "Unknown";
                const asnStr = rawGeo?.asn?.asn ? String(rawGeo.asn.asn) : (residential?.asn || shunStats[0]?.shunIp?.ipAsn || "Unknown");
                const countryCode = cache?.countryCode || residential?.country || shunStats[0]?.shunIp?.ipCountryCode || "US";
                const city = cache?.city || residential?.city || shunStats[0]?.shunIp?.city || "Unknown";

                const rawAsnNum = asnStr.replace(/^AS/i, "");
                const isAsnBlacklisted = asnBlacklistSet.has(rawAsnNum.toUpperCase());

                const isUsGeo = countryCode.toUpperCase() === "US";
                const fmcGeoBlocked = !isUsGeo;

                let activeCategory = "NONE";
                let reason = "Clean / Not blocked in SI feed";

                if (cve && cve.status === "ACTIVE") {
                    activeCategory = "CVE_IOC";
                    reason = `CVE-2026 Exploit IOC (${cve.cve})`;
                } else if (blacklist) {
                    activeCategory = "BLACKLIST";
                    reason = `Permanent Blacklist: ${blacklist.reason || "Administrative block"}`;
                } else if (residential && (residential.status === "ENFORCED" || residential.status === "QUARANTINED" || residential.strikeCount >= 2)) {
                    activeCategory = "RESIDENTIAL_STRIKE";
                    reason = `Strike ${residential.strikeCount} (${residential.status}): ${residential.attemptedUsers.length} account(s)`;
                } else if (inPerimeterVpnShun) {
                    activeCategory = "PERIMETER_VPN_SHUN";
                    reason = `Active VPN Shun on ${activeShunNodes.join(", ")}`;
                } else if (fmcGeoBlocked) {
                    activeCategory = "FMC_GEOIP_BLOCKED";
                    reason = `Non-US Location (${countryCode}): Blocked by FMC ACP Rule 3`;
                }

                const isCurrentlyBlocked = inFeed || inPerimeterVpnShun || isAsnBlacklisted || Boolean(blacklist) || fmcGeoBlocked || (residential && residential.strikeCount >= 2 && residential.status !== "PARDONED");

                return {
                    ip: currIp,
                    inFeed,
                    isCurrentlyBlocked,
                    activeCategory,
                    reason,
                    blockPosture: {
                        inFmcFeed: inFeed,
                        inPerimeterVpnShun,
                        activeShunNodes,
                        strikeCount: residential?.strikeCount ?? 0,
                        strikeStatus: residential?.status ?? "CLEAN",
                        isBlacklisted: Boolean(blacklist),
                        isAsnBlacklisted,
                        isCveExploit: Boolean(cve && cve.status === "ACTIVE"),
                        fmcGeoStatus: {
                            countryCode,
                            isUsGeo,
                            fmcGeoBlocked,
                            verdict: fmcGeoBlocked ? `BLOCKED by ACP Rule 3 (${countryCode})` : "PERMITTED by Rule 2 (US)"
                        }
                    },
                    networkProfile: {
                        isp: ispOrg,
                        asn: asnStr,
                        city,
                        countryCode
                    },
                    pendingCommandsCount: pendingMap.get(currIp) || 0
                };
            });

            return NextResponse.json({
                success: true,
                count: results.length,
                totalBlocked: results.filter(r => r.isCurrentlyBlocked).length,
                results
            });
        }

        // ==============================================================
        // 2. BATCH REMOVE & PARDON MODE (Unblock multiple IPs at once)
        // ==============================================================
        if (action === "BATCH_REMOVE_AND_PARDON") {
            const targetIps: string[] = Array.isArray(ips) ? ips : (typeof ips === "string" ? [ips] : []);
            const cleanIps = Array.from(new Set(targetIps.map(i => String(i).trim()))).filter(Boolean);

            if (cleanIps.length === 0) {
                return NextResponse.json({ error: "No target IPs provided for bulk removal and pardon." }, { status: 400 });
            }

            // 1. Reset in ResidentialStrikeLedger
            await prisma.residentialStrikeLedger.updateMany({
                where: { ip: { in: cleanIps } },
                data: {
                    status: "PARDONED",
                    strikeCount: 0,
                    pardonReason: reason || `SOC Bulk Manual Pardon by ${userId}`
                }
            });

            // 2. Delete from GuardianBlacklist
            await prisma.guardianBlacklist.deleteMany({
                where: { ip: { in: cleanIps } }
            });

            // 3. Mark CVE Shuns as REMOVED
            await prisma.netscalerCveShun.updateMany({
                where: { ip: { in: cleanIps } },
                data: {
                    status: "REMOVED",
                    removedAt: new Date(),
                    removedBy: userId,
                    notes: `Bulk unblocked by ${userId}`
                }
            });

            // 4. Deactivate in FirewallShunStats
            await prisma.firewallShunStats.updateMany({
                where: { ip: { in: cleanIps } },
                data: { isActive: false }
            });

            // 5. Cancel any pending SHUN commands for these IPs
            await prisma.firewallCommandQueue.updateMany({
                where: { ip: { in: cleanIps }, status: "PENDING", action: "SHUN" },
                data: {
                    status: "COMPLETED",
                    executedAt: new Date(),
                    lastError: `Cancelled: Bulk pardoned by ${userId}`
                }
            });

            // 6. Invalidate in-memory feed cache
            invalidateFeedCache();

            // 7. Enqueue UNSHUN commands for each IP
            for (const cleanIp of cleanIps) {
                await enqueueFirewallCommand({
                    ip: cleanIp,
                    action: "UNSHUN",
                    targetHost: "all",
                    reason: `SOC Bulk Pardon by ${userId}: ${reason || "Batch analyst unblock"}`
                });
            }

            // 8. Drain queue immediately across firewalls
            const drainResult = await drainFirewallQueue(Math.max(50, cleanIps.length * 2));

            // 9. Log Audit
            await logAudit(
                "SOC_BULK_FEED_REMOVAL_PARDON",
                `SOC analyst ${userId} bulk pardoned ${cleanIps.length} IPs. Queue drained: ${drainResult.executed} executed. Reason: ${reason || "Batch unblock"}`,
                userId,
                cleanIps.slice(0, 5).join(", ")
            );

            // 10. Fetch FMC sync timing
            const lastPollSetting = await prisma.netscalerCveSetting.findUnique({
                where: { key: "LAST_FMC_SI_POLL" }
            });
            const intervalMins = Math.max(5, parseInt(process.env.FMC_POLL_INTERVAL_MINUTES || "15", 10));
            let secondsUntilNextPoll: number | null = null;
            let nextPollExpected: string | null = null;

            if (lastPollSetting?.value) {
                const lastPollDate = new Date(lastPollSetting.value);
                const intervalMs = intervalMins * 60 * 1000;
                const elapsed = Date.now() - lastPollDate.getTime();
                const cyclesPassed = Math.max(0, Math.floor(elapsed / intervalMs));
                const nextPollMs = lastPollDate.getTime() + (cyclesPassed + 1) * intervalMs;
                nextPollExpected = new Date(nextPollMs).toISOString();
                secondsUntilNextPoll = Math.max(0, Math.round((nextPollMs - Date.now()) / 1000));
            }

            return NextResponse.json({
                success: true,
                totalRequested: cleanIps.length,
                databaseResetCount: cleanIps.length,
                removedFromFeed: true,
                perimeterShunExecuted: drainResult.successes > 0 || drainResult.executed > 0,
                drainResult,
                fmcSync: {
                    lastPoll: lastPollSetting?.value || null,
                    nextPollExpected,
                    secondsUntilNextPoll,
                    estimatedMinutes: secondsUntilNextPoll !== null ? Math.max(1, Math.round(secondsUntilNextPoll / 60)) : 15
                }
            });
        }

        // ==============================================================
        // 3. SINGLE IP REMOVE & PARDON MODE
        // ==============================================================
        if (action !== "REMOVE_AND_PARDON" || !ip || typeof ip !== "string") {
            return NextResponse.json({ error: "Invalid action. Supported: 'REMOVE_AND_PARDON', 'BATCH_INSPECT', 'BATCH_REMOVE_AND_PARDON'." }, { status: 400 });
        }

        const cleanIp = ip.trim();

        // 1. Reset in ResidentialStrikeLedger
        await prisma.residentialStrikeLedger.updateMany({
            where: { ip: cleanIp },
            data: {
                status: "PARDONED",
                strikeCount: 0,
                pardonReason: reason || `SOC manual pardon & feed removal by ${userId}`
            }
        });

        // 2. Remove from GuardianBlacklist
        await prisma.guardianBlacklist.deleteMany({
            where: { ip: cleanIp }
        });

        // 3. Mark CVE Shuns as REMOVED
        await prisma.netscalerCveShun.updateMany({
            where: { ip: cleanIp },
            data: {
                status: "REMOVED",
                removedAt: new Date(),
                removedBy: userId,
                notes: `Removed via Feed Inspector Pardon by ${userId}`
            }
        });

        // 4. Deactivate in FirewallShunStats
        await prisma.firewallShunStats.updateMany({
            where: { ip: cleanIp },
            data: { isActive: false }
        });

        // 5. Cancel any pending SHUNs in command queue
        await prisma.firewallCommandQueue.updateMany({
            where: { ip: cleanIp, status: "PENDING", action: "SHUN" },
            data: {
                status: "COMPLETED",
                executedAt: new Date(),
                lastError: `Cancelled: Removed & pardoned by ${userId}`
            }
        });

        // 6. Invalidate in-memory feed cache so subsequent downloads reflect removal instantly
        invalidateFeedCache();

        // 7. Enqueue UNSHUN into FirewallCommandQueue (ensures proper auditing, deduping & lifecycle)
        await enqueueFirewallCommand({
            ip: cleanIp,
            action: "UNSHUN",
            targetHost: "all",
            reason: `SOC Manual Pardon & Feed Removal by ${userId}: ${reason || "User unblock request"}`
        });

        // 8. Drain the queue immediately so the analyst gets instant execution across the firewalls
        const drainResult = await drainFirewallQueue(25);

        // 9. Log Audit
        await logAudit(
            "SOC_FEED_REMOVAL_PARDON",
            `SOC analyst ${userId} pardoned and queued unblock for ${cleanIp}. Queue execution: ${drainResult.executed} executed (${drainResult.successes} OK, ${drainResult.failures} failed). Reason: ${reason || "SOC manual unblock"}`,
            userId,
            cleanIp
        );

        // 10. Fetch FMC sync timing for propagation SLA
        const lastPollSetting = await prisma.netscalerCveSetting.findUnique({
            where: { key: "LAST_FMC_SI_POLL" }
        });
        const intervalMins = Math.max(5, parseInt(process.env.FMC_POLL_INTERVAL_MINUTES || "15", 10));
        let secondsUntilNextPoll: number | null = null;
        let nextPollExpected: string | null = null;

        if (lastPollSetting?.value) {
            const lastPollDate = new Date(lastPollSetting.value);
            const intervalMs = intervalMins * 60 * 1000;
            const elapsed = Date.now() - lastPollDate.getTime();
            const cyclesPassed = Math.max(0, Math.floor(elapsed / intervalMs));
            const nextPollMs = lastPollDate.getTime() + (cyclesPassed + 1) * intervalMs;
            nextPollExpected = new Date(nextPollMs).toISOString();
            secondsUntilNextPoll = Math.max(0, Math.round((nextPollMs - Date.now()) / 1000));
        }

        return NextResponse.json({
            success: true,
            ip: cleanIp,
            databaseReset: true,
            removedFromFeed: true,
            perimeterShunExecuted: drainResult.successes > 0 || drainResult.executed > 0,
            drainResult,
            fmcSync: {
                lastPoll: lastPollSetting?.value || null,
                nextPollExpected,
                secondsUntilNextPoll,
                estimatedMinutes: secondsUntilNextPoll !== null ? Math.max(1, Math.round(secondsUntilNextPoll / 60)) : 15
            }
        });

    } catch (err: any) {
        console.error("Feed removal error:", err);
        return NextResponse.json({ error: err.message || "Failed to remove and pardon target IP" }, { status: 500 });
    }
}
