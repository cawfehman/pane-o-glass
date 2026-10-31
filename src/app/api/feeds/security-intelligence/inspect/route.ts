import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { getSecurityIntelligenceFeed, invalidateFeedCache } from "../route";
import { enqueueFirewallCommand, drainFirewallQueue } from "@/lib/firewall-queue";
import { evaluateSingleIpPosture, evaluateBatchIpPosture } from "@/lib/perimeter-posture";

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
            const [evaluated, vpnSessions, pendingQueue] = await Promise.all([
                evaluateSingleIpPosture(targetIp, {
                    inFeed: feedIpSet.has(targetIp),
                    enrichIfMissing: true
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
                prisma.firewallCommandQueue.findMany({ where: { ip: targetIp, status: "PENDING" } })
            ]);

            if (evaluated) {
                lookupResult = {
                    ...evaluated,
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

            // Fetch live feed snapshot and evaluate batch posture through single shared engine
            const feed = await getSecurityIntelligenceFeed("all");
            const feedIpSet = new Set(feed.ips);
            const results = await evaluateBatchIpPosture(cleanIps, feedIpSet);

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

            // 1. Upsert in ResidentialStrikeLedger so pardoned IPs have verified success immunity and clean user state
            const now = new Date();
            const bulkReason = reason || `SOC Bulk Manual Pardon by ${userId}`;
            await Promise.all(
                cleanIps.map((cIp) =>
                    prisma.residentialStrikeLedger.upsert({
                        where: { ip: cIp },
                        update: {
                            status: "PARDONED",
                            strikeCount: 0,
                            isSpraySuspect: false,
                            attemptedUsers: [],
                            distinctUserCount: 0,
                            hasCitrixSuccess: true,
                            lastSuccessAt: now,
                            pardonReason: bulkReason
                        },
                        create: {
                            ip: cIp,
                            status: "PARDONED",
                            strikeCount: 0,
                            targetPlatform: "CITRIX",
                            isSpraySuspect: false,
                            attemptedUsers: [],
                            distinctUserCount: 0,
                            hasCitrixSuccess: true,
                            lastSuccessAt: now,
                            firstSeen: now,
                            lastSeen: now,
                            expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
                            pardonReason: bulkReason
                        }
                    }).catch(() => {})
                )
            );

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
        const now = new Date();
        const singleReason = reason || `SOC manual pardon & feed removal by ${userId}`;

        // 1. Upsert in ResidentialStrikeLedger so pardoned IP has verified success immunity and clean user state
        await prisma.residentialStrikeLedger.upsert({
            where: { ip: cleanIp },
            update: {
                status: "PARDONED",
                strikeCount: 0,
                isSpraySuspect: false,
                attemptedUsers: [],
                distinctUserCount: 0,
                hasCitrixSuccess: true,
                lastSuccessAt: now,
                pardonReason: singleReason
            },
            create: {
                ip: cleanIp,
                status: "PARDONED",
                strikeCount: 0,
                targetPlatform: "CITRIX",
                isSpraySuspect: false,
                attemptedUsers: [],
                distinctUserCount: 0,
                hasCitrixSuccess: true,
                lastSuccessAt: now,
                firstSeen: now,
                lastSeen: now,
                expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
                pardonReason: singleReason
            }
        }).catch(() => {});

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
