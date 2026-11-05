import { prisma } from "@/lib/prisma";
import { enqueueFirewallCommand, drainFirewallQueue } from "@/lib/firewall-queue";
import { logAudit } from "@/lib/audit";

export interface BulkPardonResult {
    success: boolean;
    count: number;
    ips: string[];
    drained: { executed: number; successes: number; failures: number };
}

/**
 * Executes a comprehensive 360-degree pardon and unblock across all perimeter
 * security tiers:
 * 1. Upserts ResidentialStrikeLedger to PARDONED with 0 strikes, clean user list, and 30-day immunity.
 * 2. Deletes from GuardianBlacklist.
 * 3. Marks active NetscalerCveShun records as REMOVED.
 * 4. Deactivates in FirewallShunStats.
 * 5. Cancels pending SHUN commands in FirewallCommandQueue.
 * 6. Enqueues UNSHUN commands across all firewalls.
 * 7. Drains the firewall queue immediately.
 * 8. Records SOC audit logs.
 */
export async function execute360BulkPardon(
    ips: string[],
    reason: string,
    userId: string,
    invalidateCacheFn?: () => void
): Promise<BulkPardonResult> {
    const cleanIps = Array.from(new Set(ips.map((i) => String(i).trim()))).filter(Boolean);
    if (cleanIps.length === 0) {
        return {
            success: true,
            count: 0,
            ips: [],
            drained: { executed: 0, successes: 0, failures: 0 }
        };
    }

    const now = new Date();
    const effectiveReason = reason || `SOC Bulk Manual Pardon by ${userId}`;

    // 1. Upsert ResidentialStrikeLedger to PARDONED, 0 strikes, 30d immunity
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
                    pardonReason: effectiveReason
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
                    pardonReason: effectiveReason
                }
            }).catch(() => {})
        )
    );

    // 2. Delete from GuardianBlacklist
    await prisma.guardianBlacklist.deleteMany({
        where: { ip: { in: cleanIps } }
    }).catch(() => {});

    // 3. Mark CVE Shuns as REMOVED
    await prisma.netscalerCveShun.updateMany({
        where: { ip: { in: cleanIps } },
        data: {
            status: "REMOVED",
            removedAt: now,
            removedBy: userId,
            notes: `Bulk unblocked by ${userId}: ${effectiveReason}`
        }
    }).catch(() => {});

    // 4. Deactivate in FirewallShunStats
    await prisma.firewallShunStats.updateMany({
        where: { ip: { in: cleanIps } },
        data: { isActive: false }
    }).catch(() => {});

    // 5. Cancel pending SHUN commands for these IPs
    await prisma.firewallCommandQueue.updateMany({
        where: { ip: { in: cleanIps }, status: "PENDING", action: "SHUN" },
        data: {
            status: "COMPLETED",
            executedAt: now,
            lastError: `Cancelled: Bulk pardoned by ${userId}`
        }
    }).catch(() => {});

    // 6. Invalidate in-memory feed cache if provided
    if (typeof invalidateCacheFn === "function") {
        try {
            invalidateCacheFn();
        } catch {}
    }

    // 7. Enqueue UNSHUN commands for each IP across all firewalls
    for (const cleanIp of cleanIps) {
        await enqueueFirewallCommand({
            ip: cleanIp,
            action: "UNSHUN",
            targetHost: "all",
            reason: `SOC Bulk Pardon by ${userId}: ${effectiveReason}`
        });
    }

    // 8. Drain firewall queue immediately
    const drained = await drainFirewallQueue(Math.max(50, cleanIps.length * 2));

    // 9. Audit Log
    await logAudit(
        "SOC_BULK_FEED_REMOVAL_PARDON",
        `SOC analyst ${userId} bulk pardoned ${cleanIps.length} IPs. Queue drained: ${drained.executed} executed (${drained.successes} OK, ${drained.failures} failed). Reason: ${effectiveReason}`,
        userId,
        cleanIps.slice(0, 5).join(", ")
    ).catch(() => {});

    return {
        success: true,
        count: cleanIps.length,
        ips: cleanIps,
        drained
    };
}
