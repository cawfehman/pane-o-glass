import { prisma } from "@/lib/prisma";
import { executeFirewallBulkCommands } from "@/lib/netscaler-auto-shun";
import { logAudit } from "@/lib/audit";

export interface QueueEnqueueOptions {
    ip: string;
    action: "SHUN" | "UNSHUN";
    targetHost?: string;
    reason: string;
    expiresAt?: Date | null;
    status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
}

/**
 * Calculates dynamic hold expiration timestamp based on FMC poll intervals.
 * Supports sub-hourly intervals (e.g. 15 mins, 30 mins) via FMC_POLL_INTERVAL_MINUTES.
 * Hold Time = Time to Next FMC Poll + push buffer.
 */
export function computeDynamicHoldExpiresAt(lastFmcPollDate?: Date | null): Date {
    const now = Date.now();
    const intervalMins = Math.max(5, parseInt(process.env.FMC_POLL_INTERVAL_MINUTES || "15", 10));
    const intervalMs = intervalMins * 60 * 1000;
    const pushBufferMs = Math.min(5, Math.ceil(intervalMins / 3)) * 60 * 1000; // 5 min push buffer for 15m, 10 min for 60m

    let nextPollMs: number;

    if (lastFmcPollDate && !isNaN(lastFmcPollDate.getTime())) {
        const lastPollMs = lastFmcPollDate.getTime();
        const elapsedSinceLast = now - lastPollMs;
        // Project to the upcoming poll cycle
        const cyclesPassed = Math.floor(elapsedSinceLast / intervalMs);
        nextPollMs = lastPollMs + (cyclesPassed + 1) * intervalMs;
    } else {
        // Fallback: project to the next clean interval boundary
        const date = new Date(now);
        const currentMins = date.getMinutes();
        const nextIntervalMin = Math.ceil((currentMins + 1) / intervalMins) * intervalMins;
        date.setMinutes(nextIntervalMin, 0, 0);
        nextPollMs = date.getTime();
    }

    let targetExpiryMs = nextPollMs + pushBufferMs;

    // Constrain: minimum 10 mins, maximum (interval + 15 mins)
    const minExpiryMs = now + 10 * 60 * 1000;
    const maxExpiryMs = now + (intervalMins + 15) * 60 * 1000;

    if (targetExpiryMs < minExpiryMs) targetExpiryMs = minExpiryMs;
    if (targetExpiryMs > maxExpiryMs) targetExpiryMs = maxExpiryMs;

    return new Date(targetExpiryMs);
}

/**
 * Convenience helper: automatically queries the LAST_FMC_SI_POLL timestamp from
 * the database and calculates the dynamic expiration timestamp.
 */
export async function getDynamicHoldExpiresAt(): Promise<Date> {
    try {
        const lastPollState = await prisma.netscalerCveSetting.findUnique({
            where: { key: "LAST_FMC_SI_POLL" }
        });
        const lastPoll = lastPollState?.value ? new Date(lastPollState.value) : null;
        return computeDynamicHoldExpiresAt(lastPoll);
    } catch {
        return computeDynamicHoldExpiresAt(null);
    }
}

/**
 * Enqueue a firewall shun or unshun command into the persistent command queue.
 */
export async function enqueueFirewallCommand(options: QueueEnqueueOptions) {
    const { ip, action, targetHost = "all", reason, expiresAt } = options;
    const cleanIp = ip.trim();

    // Check if an identical pending command already exists
    const existing = await prisma.firewallCommandQueue.findFirst({
        where: {
            ip: cleanIp,
            action,
            targetHost,
            status: "PENDING"
        }
    });

    if (existing) {
        return existing;
    }

    return await prisma.firewallCommandQueue.create({
        data: {
            ip: cleanIp,
            action,
            targetHost,
            reason,
            status: options.status || "PENDING",
            expiresAt: expiresAt || null
        }
    });
}

/**
 * Drain and execute pending commands in the queue inside a single batched SSH connection per firewall node.
 */
/**
 * Automatically find expired temporary bridge shuns and enqueue their UNSHUN command
 * with status 'PENDING' so they are batched together on the next planned SSH session.
 * Does NOT initiate any SSH connections to the firewalls.
 */
export async function enqueueExpiredBridgeUnshuns(limit: number = 100): Promise<number> {
    const now = new Date();
    const expiredBridges = await prisma.firewallCommandQueue.findMany({
        where: {
            action: "SHUN",
            status: "COMPLETED",
            expiresAt: { lte: now }
        },
        take: limit
    });

    for (const exp of expiredBridges) {
        await enqueueFirewallCommand({
            ip: exp.ip,
            action: "UNSHUN",
            targetHost: exp.targetHost,
            reason: `Dynamic bridge hold expired (was shunned until ${exp.expiresAt?.toISOString()})`,
            status: "PENDING"
        });

        await prisma.firewallCommandQueue.update({
            where: { id: exp.id },
            data: { expiresAt: null }
        });
    }

    return expiredBridges.length;
}

export async function drainFirewallQueue(batchLimit: number = 250) {
    // 1. Check for expired bridge shuns and enqueue their UNSHUN commands first
    await enqueueExpiredBridgeUnshuns(250);

    // 2. Fetch pending items to execute
    const rawPending = await prisma.firewallCommandQueue.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: batchLimit
    });

    if (rawPending.length === 0) {
        return { executed: 0, successes: 0, failures: 0, pendingRemaining: 0 };
    }

    // 3. Mark as PROCESSING
    const rawIds = rawPending.map(p => p.id);
    await prisma.firewallCommandQueue.updateMany({
        where: { id: { in: rawIds } },
        data: { status: "PROCESSING", attempts: { increment: 1 } }
    });

    // 4. Deduplicate / Reconcile by IP + targetHost within this batch:
    // If the same IP appears multiple times, only keep the latest one for execution.
    // Older entries are marked COMPLETED with note "Superseded by newer queue command".
    const latestByIpTarget = new Map<string, typeof rawPending[0]>();
    const supersededIds: string[] = [];

    for (const item of rawPending) {
        const key = `${item.ip}_${item.targetHost}`;
        if (latestByIpTarget.has(key)) {
            const older = latestByIpTarget.get(key)!;
            supersededIds.push(older.id);
        }
        latestByIpTarget.set(key, item);
    }

    if (supersededIds.length > 0) {
        await prisma.firewallCommandQueue.updateMany({
            where: { id: { in: supersededIds } },
            data: {
                status: "COMPLETED",
                executedAt: new Date(),
                lastError: "Superseded by newer queue command"
            }
        });
    }

    const itemsToEvaluate = Array.from(latestByIpTarget.values());

    // 5. Corporate / Protected User Shield:
    // For pending SHUN commands, verify against ResidentialStrikeLedger.
    // If an employee was pardoned, restored to WATCHING, or has strikeCount < 3,
    // cancel the SHUN to prevent collateral damage.
    const ipsToLookup = itemsToEvaluate.filter(i => i.action === "SHUN").map(i => i.ip);
    const protectedIps = new Set<string>();

    if (ipsToLookup.length > 0) {
        const ledgers = await prisma.residentialStrikeLedger.findMany({
            where: { ip: { in: ipsToLookup } },
            select: { ip: true, status: true, strikeCount: true }
        });
        for (const l of ledgers) {
            if (l.status === "PARDONED" || l.status === "WATCHING" || l.strikeCount < 3) {
                protectedIps.add(l.ip);
            }
        }
    }

    const cancelledIds: string[] = [];
    const itemsToExecute: typeof rawPending = [];

    for (const item of itemsToEvaluate) {
        if (item.action === "SHUN" && protectedIps.has(item.ip)) {
            cancelledIds.push(item.id);
        } else {
            itemsToExecute.push(item);
        }
    }

    if (cancelledIds.length > 0) {
        await prisma.firewallCommandQueue.updateMany({
            where: { id: { in: cancelledIds } },
            data: {
                status: "COMPLETED",
                executedAt: new Date(),
                lastError: "Cancelled: IP is pardoned or protected corporate employee"
            }
        });
    }

    // 6. Group by targetHost and execute commands
    const byTarget: Record<string, typeof rawPending> = {};
    for (const item of itemsToExecute) {
        if (!byTarget[item.targetHost]) byTarget[item.targetHost] = [];
        byTarget[item.targetHost].push(item);
    }

    let successes = supersededIds.length + cancelledIds.length;
    let failures = 0;

    for (const [targetHost, items] of Object.entries(byTarget)) {
        if (items.length === 0) continue;

        const commands = items.map(item => {
            return item.action === "SHUN" ? `shun ${item.ip}` : `no shun ${item.ip}`;
        });

        try {
            const execResult = await executeFirewallBulkCommands(commands, targetHost);

            const hasErr = !execResult.success || execResult.results.some(r => !r.success);

            for (const item of items) {
                if (!hasErr) {
                    await prisma.firewallCommandQueue.update({
                        where: { id: item.id },
                        data: {
                            status: "COMPLETED",
                            executedAt: new Date(),
                            lastError: null
                        }
                    });
                    successes++;

                    // Log audit
                    await logAudit(
                        item.action === "SHUN" ? "FW_QUEUE_SHUN_EXECUTED" : "FW_QUEUE_UNSHUN_EXECUTED",
                        `Firewall Queue executed ${item.action} on ${item.ip} (${targetHost}). Reason: ${item.reason}`,
                        "SYSTEM_QUEUE",
                        item.ip
                    ).catch(() => {});
                } else {
                    const errSummary = execResult.results.map(r => `${r.target}: ${r.stderr || "Error"}`).join("; ");
                    await prisma.firewallCommandQueue.update({
                        where: { id: item.id },
                        data: {
                            status: item.attempts >= 3 ? "FAILED" : "PENDING",
                            lastError: errSummary
                        }
                    });
                    failures++;
                }
            }
        } catch (err: any) {
            for (const item of items) {
                await prisma.firewallCommandQueue.update({
                    where: { id: item.id },
                    data: {
                        status: item.attempts >= 3 ? "FAILED" : "PENDING",
                        lastError: err.message || "Execution exception"
                    }
                });
                failures++;
            }
        }
    }

    const remaining = await prisma.firewallCommandQueue.count({
        where: { status: "PENDING" }
    });

    return {
        executed: rawPending.length,
        successes,
        failures,
        pendingRemaining: remaining
    };
}
