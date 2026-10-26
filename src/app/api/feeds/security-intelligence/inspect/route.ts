import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { getSecurityIntelligenceFeed, invalidateFeedCache } from "../route";
import { executeFirewallBulkCommands } from "@/lib/netscaler-auto-shun";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const [hasFw, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall"),
        hasPermission(role, "netscaler")
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

        // 3. Single IP Lookup Mode (Instant Positive Confirmation)
        let lookupResult: any = null;
        if (targetIp) {
            const inFeed = feedIpSet.has(targetIp);

            const [residential, blacklist, cve, shunStat, pendingQueue, cache] = await Promise.all([
                prisma.residentialStrikeLedger.findUnique({ where: { ip: targetIp } }),
                prisma.guardianBlacklist.findUnique({ where: { ip: targetIp } }),
                prisma.netscalerCveShun.findUnique({ where: { ip: targetIp } }),
                prisma.firewallShunStats.findFirst({ where: { ip: targetIp, isActive: true } }),
                prisma.firewallCommandQueue.findMany({ where: { ip: targetIp, status: "PENDING" } }),
                prisma.ipLookupCache.findUnique({ where: { ip: targetIp } })
            ]);

            let activeCategory = "NONE";
            let reason = "Not present in active Security Intelligence feed";

            if (cve && cve.status === "ACTIVE") {
                activeCategory = "CVE_IOC";
                reason = `NetScaler CVE-2026 Exploit IOC (${cve.cve})`;
            } else if (blacklist) {
                activeCategory = "BLACKLIST";
                reason = `Permanent Guardian Blacklist: ${blacklist.reason || "Administrative block"}`;
            } else if (residential && (residential.status === "ENFORCED" || residential.status === "QUARANTINED" || residential.strikeCount >= 2)) {
                activeCategory = "RESIDENTIAL_STRIKE";
                reason = `Citrix Strike ${residential.strikeCount} (${residential.status}): ${residential.attemptedUsers.length} account(s) probed`;
            } else if (shunStat) {
                activeCategory = "DATACENTER_VPS";
                reason = `Perimeter Shun: Datacenter/VPS/Hosting Range (${shunStat.shunCount} previous shuns)`;
            }

            lookupResult = {
                ip: targetIp,
                inFeed,
                activeCategory,
                reason,
                details: {
                    residentialStrike: residential ? {
                        strikeCount: residential.strikeCount,
                        status: residential.status,
                        attemptedUsers: residential.attemptedUsers,
                        expiresAt: residential.expiresAt,
                        ispOrg: residential.ispOrg,
                        country: residential.country
                    } : null,
                    isBlacklisted: Boolean(blacklist),
                    blacklistReason: blacklist?.reason || null,
                    cveRecord: cve ? { cve: cve.cve, status: cve.status } : null,
                    isActivePerimeterShun: Boolean(shunStat),
                    pendingCommandsCount: pendingQueue.length,
                    geo: cache ? {
                        city: cache.city,
                        countryCode: cache.countryCode
                    } : null
                }
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

// POST: Remove target IP from SI Feed & Pardon Across Entire Perimeter
export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const { action, ip, reason } = body;
        const userId = (session.user as any)?.id || (session.user as any)?.name || "admin";

        if (action !== "REMOVE_AND_PARDON" || !ip || typeof ip !== "string") {
            return NextResponse.json({ error: "Invalid action. 'REMOVE_AND_PARDON' with target IP is required." }, { status: 400 });
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

        // 7. Execute LIVE direct "no shun" on the perimeter ASA firewalls
        const fwExec = await executeFirewallBulkCommands([`no shun ${cleanIp}`], "all");

        // 8. Log Audit
        await logAudit(
            "SOC_FEED_REMOVAL_PARDON",
            `SOC analyst ${userId} pardoned and removed ${cleanIp} from Security Intelligence Feed & Perimeter Firewalls. Reason: ${reason || "SOC manual unblock"}`,
            userId,
            cleanIp
        );

        // 9. Fetch FMC sync timing for propagation SLA
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
            perimeterShunExecuted: fwExec.success,
            firewallsUpdated: fwExec.results.map(r => ({
                node: r.target,
                success: r.success,
                status: r.success ? "UNSHUN_APPLIED" : (r.stderr || "Error")
            })),
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
