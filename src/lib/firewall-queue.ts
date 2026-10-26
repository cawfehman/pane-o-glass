import { prisma } from "@/lib/prisma";
import { executeFirewallBulkCommands } from "@/lib/netscaler-auto-shun";
import { logAudit } from "@/lib/audit";

export interface QueueEnqueueOptions {
    ip: string;
    action: "SHUN" | "UNSHUN";
    targetHost?: string;
    reason: string;
    expiresAt?: Date | null;
}

/**
 * Calculates dynamic hold expiration timestamp based on FMC hourly poll intervals.
 * Next Poll = Last Poll + 60 mins.
 * Hold Time = Time to Next Poll + 10 min FMC push buffer.
 * Minimum: 15 minutes, Maximum: 70 minutes.
 */
export function computeDynamicHoldExpiresAt(lastFmcPollDate?: Date | null): Date {
    const now = Date.now();
    let nextPollMs: number;

    if (lastFmcPollDate && !isNaN(lastFmcPollDate.getTime())) {
        const lastPollMs = lastFmcPollDate.getTime();
        const elapsedSinceLast = now - lastPollMs;
        const hourMs = 60 * 60 * 1000;
        // Project to the upcoming hourly cycle
        const cyclesPassed = Math.floor(elapsedSinceLast / hourMs);
        nextPollMs = lastPollMs + (cyclesPassed + 1) * hourMs;
    } else {
        // Fallback: assume top of the hour
        const date = new Date(now);
        date.setMinutes(0, 0, 0);
        date.setHours(date.getHours() + 1);
        nextPollMs = date.getTime();
    }

    const pushBufferMs = 10 * 60 * 1000; // 10 minutes FMC compile and deployment buffer
    let targetExpiryMs = nextPollMs + pushBufferMs;

    // Constrain: minimum 15 mins from now, maximum 70 mins from now
    const minExpiryMs = now + 15 * 60 * 1000;
    const maxExpiryMs = now + 70 * 60 * 1000;

    if (targetExpiryMs < minExpiryMs) targetExpiryMs = minExpiryMs;
    if (targetExpiryMs > maxExpiryMs) targetExpiryMs = maxExpiryMs;

    return new Date(targetExpiryMs);
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
            status: "PENDING",
            expiresAt: expiresAt || null
        }
    });
}

/**
 * Drain and execute pending commands in the queue inside a single batched SSH connection per firewall node.
 */
export async function drainFirewallQueue(batchLimit: number = 50) {
    // 1. Check for expired bridge shuns and enqueue their UNSHUN automatically
    const now = new Date();
    const expiredBridges = await prisma.firewallCommandQueue.findMany({
        where: {
            action: "SHUN",
            status: "COMPLETED",
            expiresAt: { lte: now }
        },
        take: 100
    });

    for (const exp of expiredBridges) {
        // Enqueue UNSHUN
        await enqueueFirewallCommand({
            ip: exp.ip,
            action: "UNSHUN",
            targetHost: exp.targetHost,
            reason: `Dynamic bridge hold expired (was shunned until ${exp.expiresAt?.toISOString()})`
        });

        // Clear expiresAt so we don't re-trigger
        await prisma.firewallCommandQueue.update({
            where: { id: exp.id },
            data: { expiresAt: null }
        });
    }

    // 2. Fetch pending items to execute
    const pendingItems = await prisma.firewallCommandQueue.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: batchLimit
    });

    if (pendingItems.length === 0) {
        return { executed: 0, successes: 0, failures: 0, pendingRemaining: 0 };
    }

    // Mark as PROCESSING
    const ids = pendingItems.map(p => p.id);
    await prisma.firewallCommandQueue.updateMany({
        where: { id: { in: ids } },
        data: { status: "PROCESSING", attempts: { increment: 1 } }
    });

    // Group by targetHost
    const byTarget: Record<string, typeof pendingItems> = {};
    for (const item of pendingItems) {
        if (!byTarget[item.targetHost]) byTarget[item.targetHost] = [];
        byTarget[item.targetHost].push(item);
    }

    let successes = 0;
    let failures = 0;

    for (const [targetHost, items] of Object.entries(byTarget)) {
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
        executed: pendingItems.length,
        successes,
        failures,
        pendingRemaining: remaining
    };
}
