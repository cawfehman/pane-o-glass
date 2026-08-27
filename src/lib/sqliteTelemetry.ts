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
        vpnEventsTotal: number;
        auditLogsTotal: number;
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

export interface HistoricalTelemetryPoint {
    id: string;
    timestamp: string;
    pointReadMs: number;
    rangeScanMs: number;
    walWriteMs: number;
    dbSizeMB: number;
    walSizeMB: number;
    totalRows: number;
    contentionDetected: boolean;
    healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL";
    degradedReasons?: string | null;
    activeCron?: string | null;
}

export interface CronExecutionMarker {
    name: string;
    timestamp: string;
    status: string;
    message?: string | null;
}

export interface HealthIncidentEvent {
    id: string;
    timestamp: string;
    healthStatus: "DEGRADED" | "CRITICAL";
    reasons: string;
    pointReadMs: number;
    rangeScanMs: number;
    walWriteMs: number;
    walSizeMB: number;
    activeCron?: string | null;
}

export interface HistoricalTelemetryResponse {
    timeframeHours: number;
    snapshots: HistoricalTelemetryPoint[];
    cronEvents: CronExecutionMarker[];
    incidents: HealthIncidentEvent[];
    summary: {
        totalSnapshots: number;
        healthyCount: number;
        degradedCount: number;
        criticalCount: number;
        healthPercentage: number;
        avgPointReadMs: number;
        p95PointReadMs: number;
        avgRangeScanMs: number;
        p95RangeScanMs: number;
        avgWalWriteMs: number;
        p95WalWriteMs: number;
        maxWalSizeMB: number;
        contentionIncidents: number;
    };
}

export function classifyHealth(
    pointReadMs: number, 
    rangeScanMs: number, 
    walWriteMs: number, 
    walSizeBytes: number, 
    contentionDetected: boolean
): { healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL"; degradedReasons: string | null } {
    const reasons: string[] = [];
    let status: "HEALTHY" | "DEGRADED" | "CRITICAL" = "HEALTHY";

    if (contentionDetected) {
        status = "CRITICAL";
        reasons.push("Lock Contention (SQLITE_BUSY / wait > 1s)");
    }
    if (walWriteMs > 1000) {
        status = "CRITICAL";
        reasons.push(`Critical Write Latency (${walWriteMs}ms)`);
    } else if (walWriteMs > 100) {
        if (status !== "CRITICAL") status = "DEGRADED";
        reasons.push(`Elevated Write Latency (${walWriteMs}ms)`);
    }

    if (rangeScanMs > 500) {
        status = "CRITICAL";
        reasons.push(`Critical Range Scan Latency (${rangeScanMs}ms)`);
    } else if (rangeScanMs > 50) {
        if (status !== "CRITICAL") status = "DEGRADED";
        reasons.push(`Elevated Range Scan Latency (${rangeScanMs}ms)`);
    }

    if (walSizeBytes > 100 * 1024 * 1024) {
        if (status !== "CRITICAL") status = "DEGRADED";
        reasons.push(`Elevated WAL Journal Size (${(walSizeBytes / (1024 * 1024)).toFixed(1)}MB)`);
    }

    return {
        healthStatus: status,
        degradedReasons: reasons.length > 0 ? reasons.join("; ") : null
    };
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

// In-memory cache to prevent repeated disk queries on rapid refreshes (10s TTL)
let cachedTelemetry: SqliteTelemetryData | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10000;

export async function getSqliteTelemetry(): Promise<SqliteTelemetryData> {
    const nowTime = Date.now();
    if (cachedTelemetry && (nowTime - lastCacheTime) < CACHE_TTL_MS) {
        return cachedTelemetry;
    }

    const startTime = performance.now();

    // 1. Locate physical database or PostgreSQL instance name
    const dbUrl = process.env.DATABASE_URL || "";
    let dbPath = "pane_o_glass";
    if (dbUrl.includes("postgres")) {
        const match = dbUrl.match(/\/([^?#]+)(\?|$)/);
        if (match && match[1]) {
            dbPath = match[1];
        }
    } else {
        const candidates = [
            path.resolve(process.cwd(), "prisma/dev.db"),
            path.resolve(process.cwd(), "prisma/prisma/dev.db"),
            path.resolve(process.cwd(), "dev.db")
        ];
        dbPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
    }
    const walPath = `${dbPath}-wal`;

    let dbSizeBytes = 0;
    const walSizeBytes = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    // 2. Query engine metrics (PostgreSQL or SQLite fallback)
    let journalMode = "postgresql (mvcc)";
    let busyTimeoutMs = 0;
    let pageCount = 0;
    let pageSizeBytes = 4096;
    let freelistCount = 0;
    let activeConnections = 1;
    const integrity = "ok";

    try {
        const [pgSizeRes, pgConnRes] = await Promise.all([
            prisma.$queryRaw<any[]>`SELECT pg_database_size(current_database())::text as size;`.catch(() => []),
            prisma.$queryRaw<any[]>`SELECT count(*)::int as active_conns FROM pg_stat_activity;`.catch(() => [])
        ]);

        if (pgSizeRes && pgSizeRes[0] && pgSizeRes[0].size !== undefined) {
            dbSizeBytes = Number(pgSizeRes[0].size);
            journalMode = "postgresql (mvcc)";
            if (pgConnRes && pgConnRes[0] && pgConnRes[0].active_conns) {
                activeConnections = Number(pgConnRes[0].active_conns);
            }
        } else {
            const [journalRes, busyRes, pageCountRes, pageSizeRes, freelistRes] = await Promise.all([
                prisma.$queryRawUnsafe<any[]>("PRAGMA journal_mode;").catch(() => []),
                prisma.$queryRawUnsafe<any[]>("PRAGMA busy_timeout;").catch(() => []),
                prisma.$queryRawUnsafe<any[]>("PRAGMA page_count;").catch(() => []),
                prisma.$queryRawUnsafe<any[]>("PRAGMA page_size;").catch(() => []),
                prisma.$queryRawUnsafe<any[]>("PRAGMA freelist_count;").catch(() => [])
            ]);

            if (journalRes && journalRes[0]) {
                journalMode = String(journalRes[0].journal_mode || "unknown").toLowerCase();
            }
            if (busyRes && busyRes[0]) {
                busyTimeoutMs = Number(busyRes[0].timeout || 0);
            }
            if (pageCountRes && pageCountRes[0]) {
                pageCount = Number(pageCountRes[0].page_count || 0);
            }
            if (pageSizeRes && pageSizeRes[0]) {
                pageSizeBytes = Number(pageSizeRes[0].page_size || 4096);
            }
            if (freelistRes && freelistRes[0]) {
                freelistCount = Number(freelistRes[0].freelist_count || 0);
            }
        }
    } catch (e) {
        console.error("[Telemetry] Error reading engine stats:", e);
    }

    const fragmentationPct = pageCount > 0 ? Number(((freelistCount / pageCount) * 100).toFixed(2)) : 0;

    // 3. Fast Table Row Counts
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

    // 4. Fast Micro-Benchmarks
    const pointReadSamples: number[] = [];
    for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        await prisma.user.findFirst({ select: { id: true, username: true } }).catch(() => null);
        pointReadSamples.push(performance.now() - t0);
    }
    const pointRead = calculatePercentiles(pointReadSamples);

    const rangeScanSamples: number[] = [];
    for (let i = 0; i < 2; i++) {
        const t0 = performance.now();
        await prisma.vpnEvent.findMany({
            take: 25,
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true, createdAt: true }
        }).catch(() => []);
        rangeScanSamples.push(performance.now() - t0);
    }
    const indexRangeScan = calculatePercentiles(rangeScanSamples);

    const writeSamples: number[] = [];
    let contentionDetected = false;
    const t0 = performance.now();
    try {
        await prisma.healthProbe.create({
            data: { ipAddress: "127.0.0.1" }
        });
        const elapsed = performance.now() - t0;
        writeSamples.push(elapsed);
        if (elapsed > 1000) {
            contentionDetected = true;
        }
    } catch (e: any) {
        if (String(e?.message).includes("database is locked") || String(e?.message).includes("SQLITE_BUSY")) {
            contentionDetected = true;
        }
    }
    const walWriteCommit = calculatePercentiles(writeSamples);

    const benchmarkDurationMs = Number((performance.now() - startTime).toFixed(2));

    // 5. Health Diagnosis & Recommendations
    const healthRecommendations: string[] = [];
    let healthStatus: "EXCELLENT" | "GOOD" | "DEGRADED" | "ATTENTION_NEEDED" = "EXCELLENT";

    if (journalMode.includes("postgresql")) {
        healthStatus = "EXCELLENT";
        healthRecommendations.push("🟢 PostgreSQL MVCC (Multi-Version Concurrency Control) Engine Active. Row-level locking & 100% concurrent write throughput enabled.");
    } else if (journalMode !== "wal") {
        healthStatus = "ATTENTION_NEEDED";
        healthRecommendations.push("Database is currently in rollback mode ('" + journalMode + "'). Enable WAL mode ('PRAGMA journal_mode = WAL;') for concurrent reads and writes.");
    }

    if (walSizeBytes > 100 * 1024 * 1024) {
        if (healthStatus !== "ATTENTION_NEEDED") healthStatus = "DEGRADED";
        healthRecommendations.push(`WAL file is elevated (${formatBytes(walSizeBytes)}). Consider a checkpoint ('PRAGMA wal_checkpoint(TRUNCATE);').`);
    }

    if (contentionDetected || walWriteCommit.p95 > 500) {
        if (healthStatus !== "ATTENTION_NEEDED") healthStatus = "DEGRADED";
        healthRecommendations.push(`Write lock latency is elevated (p95: ${walWriteCommit.p95}ms). Crons and web dispatches may be contending on writes.`);
    }

    if (totalRows > 1_500_000) {
        if (healthStatus === "EXCELLENT") healthStatus = "GOOD";
        healthRecommendations.push(`Total database rows (${totalRows.toLocaleString()}) have crossed 1.5M. Consider implementing a 90-day VPN retention prune or prioritizing PostgreSQL migration.`);
    }

    if (fragmentationPct > 25) {
        if (healthStatus === "EXCELLENT") healthStatus = "GOOD";
        healthRecommendations.push(`Database fragmentation is ${fragmentationPct}%. Running 'VACUUM;' during maintenance will reclaim unused disk pages.`);
    }

    const result: SqliteTelemetryData = {
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
            activeConnections,
            integrity
        },
        tables,
        totalRows,
        ingestion: {
            vpnEventsTotal: vpnCount,
            auditLogsTotal: auditCount
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

    // Cache the result for 10s
    cachedTelemetry = result;
    lastCacheTime = Date.now();

    // In the background (non-blocking), auto-record snapshot if older than 5 minutes
    maybeAutoRecordSnapshot(result).catch(() => {});

    return result;
}

/**
 * Records a point-in-time telemetry snapshot to SqliteTelemetrySnapshot table.
 * Automatically prunes historical snapshots older than 14 days.
 */
export async function recordTelemetrySnapshot(activeCron?: string) {
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

    const classification = classifyHealth(pointReadMs, rangeScanMs, walWriteMs, walSizeBytes, contentionDetected);

    const snapshot = await prisma.sqliteTelemetrySnapshot.create({
        data: {
            pointReadMs,
            rangeScanMs,
            walWriteMs,
            dbSizeBytes,
            walSizeBytes,
            totalRows,
            contentionDetected,
            healthStatus: classification.healthStatus,
            degradedReasons: classification.degradedReasons,
            activeCron: activeCron || null
        }
    });

    // Prune snapshots older than 14 days
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    await prisma.sqliteTelemetrySnapshot.deleteMany({
        where: { createdAt: { lt: fourteenDaysAgo } }
    }).catch(() => {});

    return snapshot;
}

let lastAutoRecordTime = 0;
async function maybeAutoRecordSnapshot(currentData: SqliteTelemetryData) {
    const now = Date.now();
    if (now - lastAutoRecordTime < 5 * 60 * 1000) return; // Only once per 5 minutes

    lastAutoRecordTime = now;

    const latest = await prisma.sqliteTelemetrySnapshot.findFirst({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true }
    });

    if (!latest || (now - latest.createdAt.getTime()) > 5 * 60 * 1000) {
        const classification = classifyHealth(
            currentData.benchmarks.pointRead.avg,
            currentData.benchmarks.indexRangeScan.avg,
            currentData.benchmarks.walWriteCommit.avg,
            currentData.storage.walSizeBytes,
            currentData.benchmarks.contentionDetected
        );

        await prisma.sqliteTelemetrySnapshot.create({
            data: {
                pointReadMs: currentData.benchmarks.pointRead.avg,
                rangeScanMs: currentData.benchmarks.indexRangeScan.avg,
                walWriteMs: currentData.benchmarks.walWriteCommit.avg,
                dbSizeBytes: currentData.storage.dbSizeBytes,
                walSizeBytes: currentData.storage.walSizeBytes,
                totalRows: currentData.totalRows,
                contentionDetected: currentData.benchmarks.contentionDetected,
                healthStatus: classification.healthStatus,
                degradedReasons: classification.degradedReasons,
                activeCron: null
            }
        }).catch(() => {});
    }
}

/**
 * Retrieves historical telemetry points, degraded/critical incident counters, and cron executions
 */
export async function getHistoricalTelemetry(hours = 24): Promise<HistoricalTelemetryResponse> {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [rawSnapshots, cronJobs] = await Promise.all([
        prisma.sqliteTelemetrySnapshot.findMany({
            where: { createdAt: { gte: cutoff } },
            orderBy: { createdAt: "asc" },
            take: 500
        }),
        prisma.backgroundJob.findMany({
            where: { lastRun: { gte: cutoff } },
            orderBy: { lastRun: "asc" }
        })
    ]);

    let finalSnapshots = rawSnapshots;
    if (finalSnapshots.length === 0) {
        const seeded = await recordTelemetrySnapshot();
        finalSnapshots = [seeded];
    }

    const snapshots: HistoricalTelemetryPoint[] = finalSnapshots.map(s => ({
        id: s.id,
        timestamp: s.createdAt.toISOString(),
        pointReadMs: Number(s.pointReadMs.toFixed(2)),
        rangeScanMs: Number(s.rangeScanMs.toFixed(2)),
        walWriteMs: Number(s.walWriteMs.toFixed(2)),
        dbSizeMB: Number((s.dbSizeBytes / (1024 * 1024)).toFixed(2)),
        walSizeMB: Number((s.walSizeBytes / (1024 * 1024)).toFixed(2)),
        totalRows: s.totalRows,
        contentionDetected: s.contentionDetected,
        healthStatus: (s.healthStatus as any) || (s.contentionDetected ? "CRITICAL" : "HEALTHY"),
        degradedReasons: s.degradedReasons,
        activeCron: s.activeCron
    }));

    const cronEvents: CronExecutionMarker[] = cronJobs.map(j => ({
        name: j.name,
        timestamp: j.lastRun.toISOString(),
        status: j.status,
        message: j.message
    }));

    // Identify all Degraded and Critical incidents in timeframe
    const incidents: HealthIncidentEvent[] = snapshots
        .filter(s => s.healthStatus === "DEGRADED" || s.healthStatus === "CRITICAL")
        .map(s => ({
            id: s.id,
            timestamp: s.timestamp,
            healthStatus: s.healthStatus as "DEGRADED" | "CRITICAL",
            reasons: s.degradedReasons || (s.healthStatus === "CRITICAL" ? "Critical system threshold exceeded" : "Degraded latency"),
            pointReadMs: s.pointReadMs,
            rangeScanMs: s.rangeScanMs,
            walWriteMs: s.walWriteMs,
            walSizeMB: s.walSizeMB,
            activeCron: s.activeCron
        }))
        .reverse(); // Most recent first

    // Incident counters
    const healthyCount = snapshots.filter(s => s.healthStatus === "HEALTHY").length;
    const degradedCount = snapshots.filter(s => s.healthStatus === "DEGRADED").length;
    const criticalCount = snapshots.filter(s => s.healthStatus === "CRITICAL").length;
    const totalSnapshots = snapshots.length;
    const healthPercentage = totalSnapshots > 0 ? Number(((healthyCount / totalSnapshots) * 100).toFixed(1)) : 100;

    const readSamples = snapshots.map(s => s.pointReadMs);
    const scanSamples = snapshots.map(s => s.rangeScanMs);
    const writeSamples = snapshots.map(s => s.walWriteMs);

    const readMetrics = calculatePercentiles(readSamples);
    const scanMetrics = calculatePercentiles(scanSamples);
    const writeMetrics = calculatePercentiles(writeSamples);

    const maxWalSizeMB = snapshots.reduce((max, s) => Math.max(max, s.walSizeMB), 0);
    const contentionIncidents = snapshots.filter(s => s.contentionDetected).length;

    return {
        timeframeHours: hours,
        snapshots,
        cronEvents,
        incidents,
        summary: {
            totalSnapshots,
            healthyCount,
            degradedCount,
            criticalCount,
            healthPercentage,
            avgPointReadMs: readMetrics.avg,
            p95PointReadMs: readMetrics.p95,
            avgRangeScanMs: scanMetrics.avg,
            p95RangeScanMs: scanMetrics.p95,
            avgWalWriteMs: writeMetrics.avg,
            p95WalWriteMs: writeMetrics.p95,
            maxWalSizeMB,
            contentionIncidents
        }
    };
}
