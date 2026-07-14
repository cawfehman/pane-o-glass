const { PrismaClient } = require('@prisma/client');
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
        console.log(`[${new Date().toISOString()}] Audit Cleanup: Deleted ${result.count} logs older than 30 days.`);
    } catch (e) {
        console.error(`[${new Date().toISOString()}] Audit Cleanup Failed:`, e);
    } finally {
        await prisma.$disconnect();
    }
}

cleanup();
