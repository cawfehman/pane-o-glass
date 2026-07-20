import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const result = await prisma.auditLog.deleteMany({
            where: {
                createdAt: { lt: thirtyDaysAgo }
            }
        });
        const msg = `Audit Cleanup: Deleted ${result.count} logs older than 30 days.`;
        console.log(`[${new Date().toISOString()}] ${msg}`);
        
        await prisma.backgroundJob.upsert({
            where: { name: "Audit Log Cleanup" },
            update: { lastRun: new Date(), status: "SUCCESS", message: msg },
            create: { name: "Audit Log Cleanup", status: "SUCCESS", message: msg }
        });
    } catch (e: any) {
        console.error(`[${new Date().toISOString()}] Audit Cleanup Failed:`, e);
        try {
            await prisma.backgroundJob.upsert({
                where: { name: "Audit Log Cleanup" },
                update: { lastRun: new Date(), status: "FAILURE", message: e.message },
                create: { name: "Audit Log Cleanup", status: "FAILURE", message: e.message }
            });
        } catch (dbErr: any) {}
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
