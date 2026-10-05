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
            where: { createdAt: { lt: thirtyDaysAgo } }
        });

        // 4. Firewall Shun Snapshots (90 days retention)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const shunSnapshotResult = await prisma.firewallShunSnapshot.deleteMany({
            where: { snapshotDate: { lt: ninetyDaysAgo } }
        });

        // 5. Expired Graylog Exports Retention Cleanup
        const fs = await import("fs");
        const path = await import("path");
        const exportsBasePath = path.join(process.cwd(), "exports", "graylog");
        let expiredExportsDeleted = 0;

        const expiredJobs = await prisma.graylogExportJob.findMany({
            where: {
                expiresAt: { lte: new Date() },
                status: { not: "EXPIRED" }
            }
        });

        for (const job of expiredJobs) {
            const jobDir = path.join(exportsBasePath, job.id);
            if (fs.existsSync(jobDir)) {
                try {
                    fs.rmSync(jobDir, { recursive: true, force: true });
                } catch {}
            }
            await prisma.graylogExportJob.update({
                where: { id: job.id },
                data: { status: "EXPIRED" }
            });
            expiredExportsDeleted++;
        }

        const msg = `System Retention Cleanup: Deleted ${auditResult.count} audit logs (30d), ${becResult.count} BEC raw URLs (14d), ${healthResult.count} health probes (30d), ${shunSnapshotResult.count} shun snapshots (90d), ${expiredExportsDeleted} expired Graylog export bundles.`;
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
