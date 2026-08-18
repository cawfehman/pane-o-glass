import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { performance } from 'perf_hooks';

// Load environment variables for standalone script execution
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function run() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting SQLite Telemetry Snapshot Collector...`);
    
    try {
        const candidates = [
            path.resolve(process.cwd(), "prisma/dev.db"),
            path.resolve(process.cwd(), "prisma/prisma/dev.db"),
            path.resolve(process.cwd(), "dev.db")
        ];
        const dbPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
        const walPath = `${dbPath}-wal`;

        const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
        const walSizeBytes = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

        // Point Read Probe
        const t0Read = performance.now();
        await prisma.user.findFirst({ select: { id: true } }).catch(() => null);
        const pointReadMs = Number((performance.now() - t0Read).toFixed(2));

        // Range Scan Probe
        const t0Scan = performance.now();
        await prisma.vpnEvent.findMany({
            take: 25,
            orderBy: { createdAt: "desc" },
            select: { id: true }
        }).catch(() => []);
        const rangeScanMs = Number((performance.now() - t0Scan).toFixed(2));

        // Write Probe
        const t0Write = performance.now();
        let contentionDetected = false;
        try {
            await prisma.healthProbe.create({
                data: { ipAddress: "127.0.0.1" }
            });
            const elapsed = performance.now() - t0Write;
            if (elapsed > 1000) contentionDetected = true;
        } catch (e: any) {
            if (String(e?.message).includes("database is locked") || String(e?.message).includes("SQLITE_BUSY")) {
                contentionDetected = true;
            }
        }
        const walWriteMs = Number((performance.now() - t0Write).toFixed(2));

        const totalRows = await prisma.vpnEvent.count().catch(() => 0);

        // Record snapshot
        const snapshot = await prisma.sqliteTelemetrySnapshot.create({
            data: {
                pointReadMs,
                rangeScanMs,
                walWriteMs,
                dbSizeBytes,
                walSizeBytes,
                totalRows,
                contentionDetected,
                activeCron: null
            }
        });

        // Prune snapshots older than 14 days
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const deleted = await prisma.sqliteTelemetrySnapshot.deleteMany({
            where: { createdAt: { lt: fourteenDaysAgo } }
        });

        // Update BackgroundJob status
        await prisma.backgroundJob.upsert({
            where: { name: "Telemetry Collector" },
            create: {
                name: "Telemetry Collector",
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Read: ${pointReadMs}ms | Scan: ${rangeScanMs}ms | Write: ${walWriteMs}ms | DB: ${(dbSizeBytes/(1024*1024)).toFixed(1)}MB | WAL: ${(walSizeBytes/(1024*1024)).toFixed(1)}MB`
            },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Read: ${pointReadMs}ms | Scan: ${rangeScanMs}ms | Write: ${walWriteMs}ms | DB: ${(dbSizeBytes/(1024*1024)).toFixed(1)}MB | WAL: ${(walSizeBytes/(1024*1024)).toFixed(1)}MB`
            }
        });

        console.log(`[${timestamp}] Snapshot recorded successfully: Read ${pointReadMs}ms, Scan ${rangeScanMs}ms, Write ${walWriteMs}ms. Pruned ${deleted.count} old snapshots.`);
        process.exit(0);

    } catch (err: any) {
        console.error(`[${timestamp}] Failed to record telemetry snapshot:`, err);
        await prisma.backgroundJob.upsert({
            where: { name: "Telemetry Collector" },
            create: {
                name: "Telemetry Collector",
                lastRun: new Date(),
                status: "FAILURE",
                message: err.message || "Failed to collect telemetry snapshot"
            },
            update: {
                lastRun: new Date(),
                status: "FAILURE",
                message: err.message || "Failed to collect telemetry snapshot"
            }
        }).catch(() => {});
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

run();
