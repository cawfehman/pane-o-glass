import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function cleanupExpiredGraylogExports() {
    console.log(`[${new Date().toISOString()}] Starting Graylog export retention cleanup...`);
    try {
        const now = new Date();
        const basePath = path.join(process.cwd(), "exports", "graylog");

        const expiredJobs = await prisma.graylogExportJob.findMany({
            where: {
                expiresAt: { lte: now },
                status: { not: "EXPIRED" },
            },
        });

        let freedBytes = 0;
        let deletedCount = 0;

        for (const job of expiredJobs) {
            const jobDir = path.join(basePath, job.id);
            if (fs.existsSync(jobDir)) {
                try {
                    const stats = fs.statSync(jobDir);
                    freedBytes += (job.compressedBytes || 0) + (job.uncompressedBytes || 0);
                    fs.rmSync(jobDir, { recursive: true, force: true });
                    console.log(`Deleted expired export files for job ${job.id} ("${job.title}")`);
                } catch (rmErr: any) {
                    console.error(`Failed to delete directory ${jobDir}:`, rmErr.message);
                }
            }

            await prisma.graylogExportJob.update({
                where: { id: job.id },
                data: { status: "EXPIRED" },
            });

            deletedCount++;
        }

        // Also clean up any orphan directories older than 7 days that might not have DB entries
        if (fs.existsSync(basePath)) {
            const dirs = fs.readdirSync(basePath);
            const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
            for (const d of dirs) {
                const fullP = path.join(basePath, d);
                try {
                    const stat = fs.statSync(fullP);
                    if (stat.isDirectory() && stat.mtimeMs < sevenDaysAgoMs) {
                        fs.rmSync(fullP, { recursive: true, force: true });
                        console.log(`Purged orphan export directory: ${d}`);
                    }
                } catch {}
            }
        }

        const msg = `Graylog Export Retention Cleanup: Purged ${deletedCount} expired exports (~${(freedBytes / (1024 * 1024)).toFixed(2)} MB freed).`;
        console.log(`[${new Date().toISOString()}] ${msg}`);

        await prisma.backgroundJob.upsert({
            where: { name: "Graylog Export Cleanup" },
            update: { lastRun: new Date(), status: "SUCCESS", message: msg },
            create: { name: "Graylog Export Cleanup", status: "SUCCESS", message: msg },
        });
    } catch (err: any) {
        console.error(`[${new Date().toISOString()}] Export cleanup failed:`, err);
        try {
            await prisma.backgroundJob.upsert({
                where: { name: "Graylog Export Cleanup" },
                update: { lastRun: new Date(), status: "FAILURE", message: err.message },
                create: { name: "Graylog Export Cleanup", status: "FAILURE", message: err.message },
            });
        } catch {}
    } finally {
        await prisma.$disconnect();
    }
}

cleanupExpiredGraylogExports();
