import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isIsePsn } from "@/lib/account-lockout";
import { syncAccountLifecycleAndLockouts } from "@/lib/account-lifecycle-sync";

async function buildLockoutMetrics(rangeHours: number) {
    const now = new Date();
    const since = new Date(now.getTime() - rangeHours * 3600 * 1000);
    // Look back an extra 72h before `since` for password changes to correlate post-change lockouts
    const pwdCorrelationSince = new Date(since.getTime() - 72 * 3600 * 1000);

    const [events, priorPwdEvents, syncJob] = await Promise.all([
        prisma.accountLifecycleEvent.findMany({
            where: {
                timestamp: { gte: since },
                eventId: { in: ["4740", "4767", "4723", "4724"] }
            },
            orderBy: { timestamp: "desc" }
        }),
        prisma.accountLifecycleEvent.findMany({
            where: {
                timestamp: { gte: pwdCorrelationSince, lt: since },
                eventId: { in: ["4723", "4724"] },
                status: "SUCCESS"
            },
            orderBy: { timestamp: "desc" }
        }),
        prisma.backgroundJob.findUnique({
            where: { name: "AD Lifecycle & Password Sync" }
        }).catch(() => null)
    ]);

    const lockoutEvents = events.filter(e => e.eventId === "4740");
    const unlockEvents = events.filter(e => e.eventId === "4767");
    const pwdEventsInWindow = events.filter(e => e.eventId === "4723" || e.eventId === "4724");
    const userPwdChanges = pwdEventsInWindow.filter(e => e.eventId === "4723").length;
    const adminPwdResets = pwdEventsInWindow.filter(e => e.eventId === "4724").length;

    // Index all password changes (in-window + 72h prior) by lowercase targetUsername
    const pwdByUser = new Map<string, Array<{ timestamp: Date; eventId: string; status: string }>>();
    for (const pe of [...pwdEventsInWindow, ...priorPwdEvents]) {
        const key = pe.targetUsername.toLowerCase();
        const list = pwdByUser.get(key) || [];
        list.push({ timestamp: pe.timestamp, eventId: pe.eventId, status: pe.status });
        pwdByUser.set(key, list);
    }

    // Index unlocks in window by lowercase targetUsername
    const unlocksByUser = new Map<string, Date[]>();
    for (const ue of unlockEvents) {
        const key = ue.targetUsername.toLowerCase();
        const list = unlocksByUser.get(key) || [];
        list.push(ue.timestamp);
        unlocksByUser.set(key, list);
    }

    // Per-user lockout aggregation
    interface UserAgg {
        username: string;
        targetUsername: string;
        lockoutCount: number;
        wirelessCount: number;
        workstationCount: number;
        callerCounts: Map<string, number>;
        dcs: Set<string>;
        firstLockoutAt: Date;
        latestLockoutAt: Date;
        lockoutTimestamps: Date[];
    }

    const userMap = new Map<string, UserAgg>();
    const callerMap = new Map<string, {
        caller: string;
        isIsePsn: boolean;
        lockoutCount: number;
        users: Set<string>;
        latestAt: Date;
    }>();
    const dcMap = new Map<string, number>();
    const iseNodeMap = new Map<string, { node: string; count: number; users: Set<string> }>();

    let wirelessLockouts = 0;
    let workstationLockouts = 0;
    let unknownCallerLockouts = 0;

    for (const ev of lockoutEvents) {
        const userKey = ev.targetUsername.toLowerCase();
        const callerRaw = (ev.callerComputer || "").trim();
        const caller = callerRaw && callerRaw !== "-" && callerRaw !== "Unknown Caller" ? callerRaw : "Unknown Caller";
        const callerIsIse = isIsePsn(caller);

        if (callerIsIse) {
            wirelessLockouts++;
            const normNode = caller.toLowerCase().split(".")[0];
            const nodeEntry = iseNodeMap.get(normNode) || { node: normNode, count: 0, users: new Set<string>() };
            nodeEntry.count++;
            nodeEntry.users.add(userKey);
            iseNodeMap.set(normNode, nodeEntry);
        } else if (caller !== "Unknown Caller") {
            workstationLockouts++;
        } else {
            unknownCallerLockouts++;
        }

        // Caller aggregation
        const callerKey = caller.toUpperCase();
        const existingCaller = callerMap.get(callerKey);
        if (existingCaller) {
            existingCaller.lockoutCount++;
            existingCaller.users.add(ev.canonicalUsername || ev.targetUsername);
            if (ev.timestamp > existingCaller.latestAt) existingCaller.latestAt = ev.timestamp;
        } else {
            callerMap.set(callerKey, {
                caller,
                isIsePsn: callerIsIse,
                lockoutCount: 1,
                users: new Set([ev.canonicalUsername || ev.targetUsername]),
                latestAt: ev.timestamp
            });
        }

        // DC aggregation
        if (ev.domainController) {
            const dcName = ev.domainController.split(".")[0].toUpperCase();
            dcMap.set(dcName, (dcMap.get(dcName) || 0) + 1);
        }

        // User aggregation
        const existingUser = userMap.get(userKey);
        if (existingUser) {
            existingUser.lockoutCount++;
            if (callerIsIse) existingUser.wirelessCount++;
            else if (caller !== "Unknown Caller") existingUser.workstationCount++;
            existingUser.callerCounts.set(caller, (existingUser.callerCounts.get(caller) || 0) + 1);
            if (ev.domainController) existingUser.dcs.add(ev.domainController.split(".")[0].toUpperCase());
            if (ev.timestamp < existingUser.firstLockoutAt) existingUser.firstLockoutAt = ev.timestamp;
            if (ev.timestamp > existingUser.latestLockoutAt) existingUser.latestLockoutAt = ev.timestamp;
            existingUser.lockoutTimestamps.push(ev.timestamp);
        } else {
            const callerCounts = new Map<string, number>();
            callerCounts.set(caller, 1);
            const dcs = new Set<string>();
            if (ev.domainController) dcs.add(ev.domainController.split(".")[0].toUpperCase());
            userMap.set(userKey, {
                username: ev.canonicalUsername || ev.targetUsername,
                targetUsername: ev.targetUsername,
                lockoutCount: 1,
                wirelessCount: callerIsIse ? 1 : 0,
                workstationCount: !callerIsIse && caller !== "Unknown Caller" ? 1 : 0,
                callerCounts,
                dcs,
                firstLockoutAt: ev.timestamp,
                latestLockoutAt: ev.timestamp,
                lockoutTimestamps: [ev.timestamp]
            });
        }
    }

    let repeatLoopUsers = 0;
    let activeRelockLoops = 0;
    let usersLockedAfterPwdChange = 0;

    const topUsers = Array.from(userMap.values()).map(u => {
        const userKey = u.targetUsername.toLowerCase();
        const userUnlocks = unlocksByUser.get(userKey) || [];
        const unlockCount = userUnlocks.length;

        // Check if any lockout occurred after an unlock in the window
        let relockedAfterUnlock = false;
        if (userUnlocks.length > 0) {
            const earliestUnlockMs = Math.min(...userUnlocks.map(d => d.getTime()));
            relockedAfterUnlock = u.lockoutTimestamps.some(t => t.getTime() > earliestUnlockMs);
        }

        const isRepeatLoop = relockedAfterUnlock || u.lockoutCount >= 2;
        if (isRepeatLoop) repeatLoopUsers++;
        if (relockedAfterUnlock) activeRelockLoops++;

        // Check if a password change occurred within 72h prior to their latest lockout
        const userPwds = pwdByUser.get(userKey) || [];
        const latestLockoutMs = u.latestLockoutAt.getTime();
        const priorPwd = userPwds.find(p => {
            const diffMs = latestLockoutMs - p.timestamp.getTime();
            return diffMs >= -60000 && diffMs <= 72 * 3600 * 1000;
        });

        if (priorPwd) {
            usersLockedAfterPwdChange++;
        }

        // Determine top caller and primary source
        const sortedCallers = Array.from(u.callerCounts.entries()).sort((a, b) => b[1] - a[1]);
        const topCaller = sortedCallers[0]?.[0] || "Unknown Caller";
        let primarySource: "ISE_WIRELESS" | "WORKSTATION" | "MIXED" | "UNKNOWN" = "UNKNOWN";
        if (u.wirelessCount > 0 && u.workstationCount > 0) primarySource = "MIXED";
        else if (u.wirelessCount > 0) primarySource = "ISE_WIRELESS";
        else if (u.workstationCount > 0) primarySource = "WORKSTATION";

        return {
            username: u.username,
            targetUsername: u.targetUsername,
            lockoutCount: u.lockoutCount,
            unlockCount,
            isRepeatLoop,
            relockedAfterUnlock,
            hadRecentPwdChange: Boolean(priorPwd),
            pwdChangeType: priorPwd ? (priorPwd.eventId === "4723" ? "USER_CHANGE" : "ADMIN_RESET") : null,
            pwdChangeAt: priorPwd ? priorPwd.timestamp.toISOString() : null,
            primarySource,
            topCaller,
            callers: sortedCallers.map(([c]) => c),
            domainControllers: Array.from(u.dcs),
            firstLockoutAt: u.firstLockoutAt.toISOString(),
            latestLockoutAt: u.latestLockoutAt.toISOString()
        };
    }).sort((a, b) => {
        if (b.lockoutCount !== a.lockoutCount) return b.lockoutCount - a.lockoutCount;
        return new Date(b.latestLockoutAt).getTime() - new Date(a.latestLockoutAt).getTime();
    });

    // Build time buckets for trend chart
    const bucketSizeMs =
        rangeHours <= 48 ? 3600 * 1000 :
        rangeHours <= 168 ? 4 * 3600 * 1000 :
        24 * 3600 * 1000;

    const bucketCount = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / bucketSizeMs));
    const alignedStartMs = Math.floor(since.getTime() / bucketSizeMs) * bucketSizeMs;

    const buckets = new Map<number, {
        timestamp: number;
        time: string;
        lockouts: number;
        wirelessLockouts: number;
        workstationLockouts: number;
        usersSet: Set<string>;
        unlocks: number;
        passwordChanges: number;
    }>();

    for (let i = 0; i <= bucketCount; i++) {
        const ts = alignedStartMs + i * bucketSizeMs;
        if (ts > now.getTime() + bucketSizeMs) break;
        const d = new Date(ts);
        const label = rangeHours <= 48
            ? d.toLocaleTimeString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : rangeHours <= 168
            ? d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit" })
            : d.toLocaleDateString([], { month: "short", day: "numeric" });

        buckets.set(ts, {
            timestamp: ts,
            time: label,
            lockouts: 0,
            wirelessLockouts: 0,
            workstationLockouts: 0,
            usersSet: new Set<string>(),
            unlocks: 0,
            passwordChanges: 0
        });
    }

    for (const ev of events) {
        const ts = Math.floor(ev.timestamp.getTime() / bucketSizeMs) * bucketSizeMs;
        const b = buckets.get(ts);
        if (!b) continue;
        if (ev.eventId === "4740") {
            b.lockouts++;
            b.usersSet.add(ev.targetUsername.toLowerCase());
            if (isIsePsn(ev.callerComputer)) b.wirelessLockouts++;
            else b.workstationLockouts++;
        } else if (ev.eventId === "4767") {
            b.unlocks++;
        } else if (ev.eventId === "4723" || ev.eventId === "4724") {
            b.passwordChanges++;
        }
    }

    const timeline = Array.from(buckets.values()).map(b => ({
        timestamp: b.timestamp,
        time: b.time,
        lockouts: b.lockouts,
        wirelessLockouts: b.wirelessLockouts,
        workstationLockouts: b.workstationLockouts,
        uniqueUsers: b.usersSet.size,
        unlocks: b.unlocks,
        passwordChanges: b.passwordChanges
    }));

    const topCallers = Array.from(callerMap.values())
        .map(c => ({
            caller: c.caller,
            isIsePsn: c.isIsePsn,
            lockoutCount: c.lockoutCount,
            uniqueUsers: c.users.size,
            latestAt: c.latestAt.toISOString(),
            sampleUsers: Array.from(c.users).slice(0, 5)
        }))
        .sort((a, b) => b.lockoutCount - a.lockoutCount)
        .slice(0, 20);

    const isePsnBreakdown = ["ise-psn01", "ise-psn02", "ise-psn03", "ise-psn04"].map(node => {
        const entry = iseNodeMap.get(node);
        return {
            node,
            count: entry ? entry.count : 0,
            uniqueUsers: entry ? entry.users.size : 0
        };
    });

    const topDomainControllers = Array.from(dcMap.entries())
        .map(([dc, count]) => ({ dc, count }))
        .sort((a, b) => b.count - a.count);

    const recentLockouts = lockoutEvents.slice(0, 30).map(e => ({
        id: e.id,
        timestamp: e.timestamp.toISOString(),
        username: e.canonicalUsername || e.targetUsername,
        callerComputer: e.callerComputer || "Unknown Caller",
        isIsePsn: isIsePsn(e.callerComputer),
        domainController: e.domainController || "Domain Controller"
    }));

    const totalLockouts = lockoutEvents.length;
    const wirelessPct = totalLockouts > 0 ? Math.round((wirelessLockouts / totalLockouts) * 100) : 0;
    const workstationPct = totalLockouts > 0 ? Math.round((workstationLockouts / totalLockouts) * 100) : 0;

    return {
        rangeHours,
        summary: {
            totalLockouts,
            uniqueLockedUsers: userMap.size,
            repeatLoopUsers,
            activeRelockLoops,
            wirelessLockouts,
            workstationLockouts,
            unknownCallerLockouts,
            wirelessPct,
            workstationPct,
            totalUnlocks: unlockEvents.length,
            totalPasswordChanges: pwdEventsInWindow.length,
            userPwdChanges,
            adminPwdResets,
            usersLockedAfterPwdChange,
            lastSyncedAt: syncJob?.lastRun?.toISOString() || events[0]?.timestamp?.toISOString() || null,
            syncStatus: syncJob?.status || "IDLE"
        },
        timeline,
        topUsers: topUsers.slice(0, 50),
        sourceBreakdown: {
            wirelessLockouts,
            workstationLockouts,
            unknownCallerLockouts,
            isePsnBreakdown,
            topCallers,
            topDomainControllers
        },
        recentLockouts
    };
}

export async function GET(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any)?.role || "USER";
        const allowed = await hasPermission(role, "account-lockout", session.user.id);
        if (!allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const rawHours = parseInt(searchParams.get("rangeHours") || "24", 10);
        const allowedRanges = [1, 4, 12, 24, 72, 168, 336, 720];
        const rangeHours = allowedRanges.includes(rawHours) ? rawHours : 24;

        // Auto-backfill if no 4740 events have ever been synced into AccountLifecycleEvent yet
        const existingLockoutTotal = await prisma.accountLifecycleEvent.count({
            where: { eventId: "4740" }
        });
        if (existingLockoutTotal === 0) {
            try {
                await syncAccountLifecycleAndLockouts(Math.max(rangeHours * 3600, 86400));
            } catch (syncErr: any) {
                console.warn("[Account-Lockout-Metrics] Initial auto-sync warning:", syncErr?.message || syncErr);
            }
        }

        const data = await buildLockoutMetrics(rangeHours);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[API] Account Lockout Metrics GET error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to load account lockout metrics." },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any)?.role || "USER";
        const allowed = await hasPermission(role, "account-lockout", session.user.id);
        if (!allowed) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const rawHours = parseInt(String(body.rangeHours || "24"), 10);
        const allowedRanges = [1, 4, 12, 24, 72, 168, 336, 720];
        const rangeHours = allowedRanges.includes(rawHours) ? rawHours : 24;

        const syncResult = await syncAccountLifecycleAndLockouts(rangeHours * 3600);

        const forwardedFor = req.headers.get("x-forwarded-for");
        const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "internal";

        await logAudit(
            "ACCOUNT_LOCKOUT_METRICS_SYNC",
            `Manual AD Lockout & Lifecycle sync completed for ${rangeHours}h window (${syncResult.totalInserted} new events inserted, ${syncResult.lockoutsFetched} lockouts evaluated in ${syncResult.durationMs}ms)`,
            session.user.id,
            clientIp
        ).catch(() => {});

        const data = await buildLockoutMetrics(rangeHours);

        return NextResponse.json({
            ...data,
            syncResult
        });
    } catch (error: any) {
        console.error("[API] Account Lockout Metrics POST sync error:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to sync account lockout events from Graylog." },
            { status: 500 }
        );
    }
}
