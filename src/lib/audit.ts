import { prisma as db } from "./prisma";

export async function logAudit(
    action: string,
    details: string,
    userId?: string,
    ipAddress?: string
) {
    try {
        await db.auditLog.create({
            data: {
                action,
                details,
                userId,
                ipAddress
            }
        });

        // Note: 180 day rotating log cleanup is handled by scripts/cron/audit-cleanup.ts

    } catch (error) {
        console.error("Failed to write to audit log:", error);
    }
}
