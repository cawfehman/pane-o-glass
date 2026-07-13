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

        // Note: 30 day rotating log cleanup should be handled by a separate background job

    } catch (error) {
        console.error("Failed to write to audit log:", error);
    }
}
