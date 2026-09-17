import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
    try {
        // 1. Audit Logs (30 days retention)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const auditResult = await prisma.auditLog.deleteMany({
            where: { createdAt: { lt: thirtyDaysAgo } }
        });

        // 2. BEC Raw URLs (14 days retention - prevents table bloat)
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const becResult = await prisma.becRawUrl.deleteMany({
            where: { createdAt: { lt: fourteenDaysAgo } }
        });

        // 3. Health Probes (30 days retention)
        const healthResult = await prisma.healthProbe.deleteMany({
            where: { timestamp: { lt: thirtyDaysAgo } }
        });

        // 4. Firewall Shun Snapshots (90 days retention)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const shunSnapshotResult = await prisma.firewallShunSnapshot.deleteMany({
            where: { createdAt: { lt: ninetyDaysAgo } }
        });

        const msg = `System Retention Cleanup: Deleted ${auditResult.count} audit logs (30d), ${becResult.count} BEC raw URLs (14d), ${healthResult.count} health probes (30d), ${shunSnapshotResult.count} shun snapshots (90d).`;
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
