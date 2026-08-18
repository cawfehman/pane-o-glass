import { prisma } from "./prisma";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

export interface PercentileMetric {
    avg: number;
    p95: number;
    peak: number;
    min: number;
    samples: number;
}

export interface SqliteTelemetryData {
    storage: {
        dbPath: string;
        dbSizeBytes: number;
        dbSizeFormatted: string;
        walSizeBytes: number;
        walSizeFormatted: string;
        journalMode: string;
        busyTimeoutMs: number;
        pageSizeBytes: number;
        pageCount: number;
        freelistCount: number;
        fragmentationPct: number;
        integrity: string;
    };
    tables: {
        name: string;
        count: number;
        sharePct: number;
    }[];
    totalRows: number;
    ingestion: {
        vpnEventsLast24h: number;
        vpnEventsLast7d: number;
        auditLogsLast24h: number;
    };
    benchmarks: {
        pointRead: PercentileMetric;
        indexRangeScan: PercentileMetric;
        walWriteCommit: PercentileMetric;
        contentionDetected: boolean;
        benchmarkDurationMs: number;
    };
    healthStatus: "EXCELLENT" | "GOOD" | "DEGRADED" | "ATTENTION_NEEDED";
    healthRecommendations: string[];
}

function calculatePercentiles(samples: number[]): PercentileMetric {
    if (!samples || samples.length === 0) {
        return { avg: 0, p95: 0, peak: 0, min: 0, samples: 0 };
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const avg = Number((sum / sorted.length).toFixed(2));
    const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    const p95 = Number(sorted[p95Index].toFixed(2));
    const peak = Number(sorted[sorted.length - 1].toFixed(2));
    const min = Number(sorted[0].toFixed(2));
    return { avg, p95, peak, min, samples: samples.length };
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export async function getSqliteTelemetry(): Promise<SqliteTelemetryData> {
    const startTime = performance.now();

    // 1. Locate physical SQLite and WAL database files
    const candidates = [
        path.resolve(process.cwd(), "prisma/dev.db"),
        path.resolve(process.cwd(), "prisma/prisma/dev.db"),
        path.resolve(process.cwd(), "dev.db")
    ];
    const dbPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
    const walPath = `${dbPath}-wal`;

    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const walSizeBytes = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    // 2. Query engine PRAGMA settings
    let journalMode = "unknown";
    let busyTimeoutMs = 0;
    let pageCount = 0;
    let pageSizeBytes = 4096;
    let freelistCount = 0;
    let integrity = "ok";

    try {
        const journalRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA journal_mode;");
        if (journalRes && journalRes[0]) {
            journalMode = String(journalRes[0].journal_mode || "unknown").toLowerCase();
        }

        const busyRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA busy_timeout;");
        if (busyRes && busyRes[0]) {
            busyTimeoutMs = Number(busyRes[0].timeout || 0);
        }

        const pageCountRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA page_count;");
        if (pageCountRes && pageCountRes[0]) {
            pageCount = Number(pageCountRes[0].page_count || 0);
        }

        const pageSizeRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA page_size;");
        if (pageSizeRes && pageSizeRes[0]) {
            pageSizeBytes = Number(pageSizeRes[0].page_size || 4096);
        }

        const freelistRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA freelist_count;");
        if (freelistRes && freelistRes[0]) {
            freelistCount = Number(freelistRes[0].freelist_count || 0);
        }

        const integrityRes = await prisma.$queryRawUnsafe<any[]>("PRAGMA integrity_check(1);");
        if (integrityRes && integrityRes[0]) {
            integrity = String(integrityRes[0].integrity_check || "ok");
        }
    } catch (e) {
        console.error("[SqliteTelemetry] Error reading PRAGMA stats:", e);
    }

    const fragmentationPct = pageCount > 0 ? Number(((freelistCount / pageCount) * 100).toFixed(2)) : 0;

    // 3. Table row counts & volume distribution
    const [
        vpnCount,
        auditCount,
        ipCacheCount,
        shunIpCount,
        campaignRecipientCount,
        campaignCount,
        queryHistoryCount,
        userCount
    ] = await Promise.all([
        prisma.vpnEvent.count().catch(() => 0),
        prisma.auditLog.count().catch(() => 0),
        prisma.ipLookupCache.count().catch(() => 0),
        prisma.shunDatabaseIp.count().catch(() => 0),
        prisma.campaignRecipient.count().catch(() => 0),
        prisma.notificationCampaign.count().catch(() => 0),
        prisma.firewallQueryHistory.count().catch(() => 0),
        prisma.user.count().catch(() => 0)
    ]);

    const totalRows = vpnCount + auditCount + ipCacheCount + shunIpCount + campaignRecipientCount + campaignCount + queryHistoryCount + userCount;

    const rawTables = [
        { name: "VpnEvent (VPN Logs)", count: vpnCount },
        { name: "AuditLog (Security Audits)", count: auditCount },
        { name: "IpLookupCache (Geolocation)", count: ipCacheCount },
        { name: "ShunDatabaseIp (Firewall Shuns)", count: shunIpCount },
        { name: "CampaignRecipient (Breach Mail)", count: campaignRecipientCount },
        { name: "FirewallQueryHistory (Queries)", count: queryHistoryCount },
        { name: "User (Accounts)", count: userCount },
        { name: "NotificationCampaign (Campaigns)", count: campaignCount }
    ];

    const tables = rawTables.map(t => ({
        name: t.name,
        count: t.count,
        sharePct: totalRows > 0 ? Number(((t.count / totalRows) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.count - a.count);

    // 4. Time-series Ingestion Velocity
    const now = Date.now();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [vpn24h, vpn7d, audit24h] = await Promise.all([
        prisma.vpnEvent.count({ where: { createdAt: { gte: last24h } } }).catch(() => 0),
        prisma.vpnEvent.count({ where: { createdAt: { gte: last7d } } }).catch(() => 0),
        prisma.auditLog.count({ where: { createdAt: { gte: last24h } } }).catch(() => 0)
    ]);

    // 5. Micro-Benchmarks (Point Read, Index Range Scan, WAL Write Commit)
    // Benchmark A: Point Read (15 samples)
    const pointReadSamples: number[] = [];
    for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        await prisma.user.findFirst({ select: { id: true, username: true } });
        pointReadSamples.push(performance.now() - t0);
    }
    const pointRead = calculatePercentiles(pointReadSamples);

    // Benchmark B: Index Range Scan (10 samples over latest VpnEvents)
    const rangeScanSamples: number[] = [];
    for (let i = 0; i < 10; i++) {
        const t0 = performance.now();
        await prisma.vpnEvent.findMany({
            take: 50,
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true, createdAt: true }
        });
        rangeScanSamples.push(performance.now() - t0);
    }
    const indexRangeScan = calculatePercentiles(rangeScanSamples);

    // Benchmark C: WAL Write & Commit (5 samples using HealthProbe probe table)
    const writeSamples: number[] = [];
    let contentionDetected = false;
    for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        try {
            await prisma.healthProbe.create({
                data: { ipAddress: "127.0.0.1" }
            });
            const elapsed = performance.now() - t0;
            writeSamples.push(elapsed);
            if (elapsed > 1000) {
                contentionDetected = true; // Took over 1 second to write, indicating lock wait
            }
        } catch (e: any) {
            if (String(e?.message).includes("database is locked") || String(e?.message).includes("SQLITE_BUSY")) {
                contentionDetected = true;
            }
        }
    }
    const walWriteCommit = calculatePercentiles(writeSamples);

    const benchmarkDurationMs = Number((performance.now() - startTime).toFixed(2));

    // 6. Health Diagnosis & Recommendations
    const healthRecommendations: string[] = [];
    let healthStatus: "EXCELLENT" | "GOOD" | "DEGRADED" | "ATTENTION_NEEDED" = "EXCELLENT";

    if (journalMode !== "wal") {
        healthStatus = "ATTENTION_NEEDED";
        healthRecommendations.push("Database is currently running in rollback mode ('" + journalMode + "'). Enable WAL mode ('PRAGMA journal_mode = WAL;') to allow simultaneous reads and writes.");
    }

    if (walSizeBytes > 100 * 1024 * 1024) {
        if (healthStatus !== "ATTENTION_NEEDED") healthStatus = "DEGRADED";
        healthRecommendations.push(`WAL file is elevated (${formatBytes(walSizeBytes)}). A checkpoint ('PRAGMA wal_checkpoint(TRUNCATE);') is recommended.`);
    }

    if (contentionDetected || walWriteCommit.p95 > 500) {
        if (healthStatus !== "ATTENTION_NEEDED") healthStatus = "DEGRADED";
        healthRecommendations.push(`Elevated write latency (p95: ${walWriteCommit.p95}ms) or lock contention detected. Crons and web dispatches may be contending for the write lock.`);
    }

    if (totalRows > 1_500_000) {
        if (healthStatus === "EXCELLENT") healthStatus = "GOOD";
        healthRecommendations.push(`Total database rows (${totalRows.toLocaleString()}) have crossed 1.5M. Consider implementing a 90-day VPN retention prune or prioritizing PostgreSQL migration.`);
    }

    if (fragmentationPct > 20) {
        if (healthStatus === "EXCELLENT") healthStatus = "GOOD";
        healthRecommendations.push(`Database fragmentation is ${fragmentationPct}%. Running 'VACUUM;' during maintenance will reclaim unused disk pages.`);
    }

    return {
        storage: {
            dbPath,
            dbSizeBytes,
            dbSizeFormatted: formatBytes(dbSizeBytes),
            walSizeBytes,
            walSizeFormatted: formatBytes(walSizeBytes),
            journalMode,
            busyTimeoutMs,
            pageSizeBytes,
            pageCount,
            freelistCount,
            fragmentationPct,
            integrity
        },
        tables,
        totalRows,
        ingestion: {
            vpnEventsLast24h: vpn24h,
            vpnEventsLast7d: vpn7d,
            auditLogsLast24h: audit24h
        },
        benchmarks: {
            pointRead,
            indexRangeScan,
            walWriteCommit,
            contentionDetected,
            benchmarkDurationMs
        },
        healthStatus,
        healthRecommendations
    };
}
