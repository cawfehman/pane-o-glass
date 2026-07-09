const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Checking database for AuditLog records...");
    const auditCount = await prisma.auditLog.count();
    console.log("Total AuditLogs in DB:", auditCount);

    if (auditCount > 0) {
        const audits = await prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });
        console.log("Last 20 Audits:", JSON.stringify(audits, null, 2));
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
