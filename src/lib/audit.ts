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

        // 30 day rotating log cleanup: purge records older than 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        await db.auditLog.deleteMany({
            where: {
                createdAt: {
                    lt: thirtyDaysAgo
                }
            }
        });

    } catch (error) {
        console.error("Failed to write to audit log:", error);
    }
}
