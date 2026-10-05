import https from "https";
import axios from "axios";
import fs from "fs";
import path from "path";
import { createZipArchive, ZipFileEntry } from "./zip-util";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export interface GraylogClusterConfig {
    id: "OG_GRAYLOG" | "NEW_GRAYLOG";
    name: string;
    baseUrl: string;
    token: string;
    description: string;
}

export function getClustersConfig(): GraylogClusterConfig[] {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";

    const newUrl = (process.env.GRAYLOG_URL || "https://graylog-01.chsmail.root.cooperhealth.edu:9000").replace(/\/$/, "");
    const newToken = process.env.GRAYLOG_API_TOKEN || "";

    return [
        {
            id: "OG_GRAYLOG",
            name: "Legacy Graylog Cluster (4.2.13)",
            baseUrl: ogUrl,
            token: ogToken,
            description: "IronPort, Vectra, NetScaler, Cisco ISE, and legacy log streams",
        },
        {
            id: "NEW_GRAYLOG",
            name: "Modern Graylog Cluster (7.1.5)",
            baseUrl: newUrl,
            token: newToken,
            description: "FTD Perimeter Firewalls & Modern Infrastructure",
        },
    ];
}

export function getClusterClient(clusterId: string): { baseUrl: string; authHeader: string } {
    const clusters = getClustersConfig();
    const config = clusters.find(c => c.id === clusterId) || clusters[0];
    if (!config.token) {
        throw new Error(`API token is not configured for cluster: ${config.name}`);
    }
    const authHeader = "Basic " + Buffer.from(`${config.token}:token`).toString("base64");
    return { baseUrl: config.baseUrl, authHeader };
}

export interface GraylogStreamItem {
    id: string;
    title: string;
    description?: string;
    isDefault?: boolean;
}

export async function fetchStreamsForCluster(clusterId: string): Promise<GraylogStreamItem[]> {
    const { baseUrl, authHeader } = getClusterClient(clusterId);
    try {
        const res = await axios.get(`${baseUrl}/api/streams`, {
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
            },
            httpsAgent,
            timeout: 15000,
        });

        const rawStreams = res.data?.streams || [];
        return rawStreams.map((s: any) => ({
            id: s.id,
            title: s.title || s.id,
            description: s.description || "",
            isDefault: s.is_default || false,
        })).sort((a: any, b: any) => a.title.localeCompare(b.title));
    } catch (err: any) {
        console.error(`Failed to fetch streams for cluster ${clusterId}:`, err.message);
        return [];
    }
}

/**
 * Counts the exact hit count in a given time slice using Graylog Universal Absolute Search
 */
export async function countHits(
    clusterId: string,
    query: string,
    from: Date,
    to: Date,
    streamId?: string
): Promise<number> {
    const { baseUrl, authHeader } = getClusterClient(clusterId);
    const params: Record<string, string | number> = {
        query: query && query.trim() ? query.trim() : "*",
        from: from.toISOString(),
        to: to.toISOString(),
        limit: 1,
    };

    if (streamId && streamId !== "all") {
        params.filter = `streams:${streamId}`;
    }

    try {
        const res = await axios.get(`${baseUrl}/api/search/universal/absolute`, {
            params,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
            },
            httpsAgent,
            timeout: 20000,
        });

        return res.data?.total_results ?? 0;
    } catch (err: any) {
        const msg = err.response?.data?.message || err.message;
        throw new Error(`Graylog search query failed (${baseUrl}): ${msg}`);
    }
}

export interface ExportSlicePlan {
    sliceIndex: number;
    from: string; // ISO
    to: string;   // ISO
    estimatedHits: number;
    durationMinutes: number;
}

export interface PreflightPlanResult {
    cluster: string;
    query: string;
    streamId?: string;
    totalEvents: number;
    sliceCount: number;
    slices: ExportSlicePlan[];
    projectedUncompressedBytes: number;
    projectedCompressedBytes: number;
    freeDiskBytes: number;
    totalDiskBytes: number;
    diskWarning?: string;
    isDiskSpaceSufficient: boolean;
}

export function getStorageBasePath(): string {
    const basePath = path.join(process.cwd(), "exports", "graylog");
    if (!fs.existsSync(basePath)) {
        fs.mkdirSync(basePath, { recursive: true });
    }
    return basePath;
}

export function checkDiskSpace(targetPath?: string): { freeBytes: number; totalBytes: number; availableBytes: number } {
    try {
        const checkDir = targetPath || getStorageBasePath();
        if (!fs.existsSync(checkDir)) {
            fs.mkdirSync(checkDir, { recursive: true });
        }
        const stats = fs.statfsSync(checkDir);
        const bsize = stats.bsize || 4096;
        const freeBytes = Number(stats.bfree) * bsize;
        const totalBytes = Number(stats.blocks) * bsize;
        const availableBytes = Number(stats.bavail) * bsize;

        return { freeBytes, totalBytes, availableBytes };
    } catch (e) {
        // Fallback safe estimate: 50GB free
        return {
            freeBytes: 50 * 1024 * 1024 * 1024,
            totalBytes: 100 * 1024 * 1024 * 1024,
            availableBytes: 50 * 1024 * 1024 * 1024,
        };
    }
}

function createConcurrencyLimiter(limit: number) {
    let running = 0;
    const queue: (() => void)[] = [];

    const next = () => {
        running--;
        if (queue.length > 0) {
            const resolve = queue.shift();
            if (resolve) resolve();
        }
    };

    return async function run<T>(fn: () => Promise<T>): Promise<T> {
        if (running >= limit) {
            await new Promise<void>(resolve => queue.push(resolve));
        }
        running++;
        try {
            return await fn();
        } finally {
            next();
        }
    };
}

/**
 * Adaptive recursive time-bisection planner.
 * Dynamically subdivides time windows until every slice contains <= 10,000 events.
 */
export async function planExportSlices(params: {
    cluster: string;
    query: string;
    from: Date;
    to: Date;
    streamId?: string;
}): Promise<PreflightPlanResult> {
    const { cluster, query, from, to, streamId } = params;

    if (from >= to) {
        throw new Error("Start time ('from') must be earlier than end time ('to').");
    }

    const maxPerSlice = 9800; // conservative buffer below 10,000 hard limit
    const rawSlices: { from: Date; to: Date; hits: number }[] = [];
    const limiter = createConcurrencyLimiter(4);

    async function bisectWindow(windowFrom: Date, windowTo: Date, depth: number) {
        const hits = await limiter(() => countHits(cluster, query, windowFrom, windowTo, streamId));

        const durationMs = windowTo.getTime() - windowFrom.getTime();

        // If hits <= limit or window cannot be halved further (1 second min interval)
        if (hits <= maxPerSlice || durationMs <= 1000 || depth >= 16) {
            rawSlices.push({
                from: windowFrom,
                to: windowTo,
                hits,
            });
            return;
        }

        // Subdivide window in half
        const midTime = windowFrom.getTime() + Math.floor(durationMs / 2);
        const midDate = new Date(midTime);

        await Promise.all([
            bisectWindow(windowFrom, midDate, depth + 1),
            bisectWindow(midDate, windowTo, depth + 1)
        ]);
    }

    await bisectWindow(from, to, 0);

    // Sort slices chronologically
    rawSlices.sort((a, b) => a.from.getTime() - b.from.getTime());

    let totalEvents = 0;
    const slices: ExportSlicePlan[] = rawSlices.map((s, index) => {
        totalEvents += s.hits;
        const durMinutes = Math.max(0.1, (s.to.getTime() - s.from.getTime()) / (1000 * 60));
        return {
            sliceIndex: index + 1,
            from: s.from.toISOString(),
            to: s.to.toISOString(),
            estimatedHits: s.hits,
            durationMinutes: parseFloat(durMinutes.toFixed(2)),
        };
    });

    // Sizing projections (assuming average 400 bytes per raw syslog CSV row)
    const projectedUncompressedBytes = Math.max(1024, totalEvents * 420);
    // Compressed ZIP ratio typically 15-20%
    const projectedCompressedBytes = Math.max(512, Math.round(projectedUncompressedBytes * 0.18));

    const disk = checkDiskSpace();
    const requiredBytes = projectedUncompressedBytes + projectedCompressedBytes + 500 * 1024 * 1024; // 500MB safety buffer
    const isDiskSpaceSufficient = disk.availableBytes > requiredBytes;

    let diskWarning: string | undefined;
    if (!isDiskSpaceSufficient) {
        diskWarning = `Insufficient disk space: Projected requirement is ${(requiredBytes / (1024 * 1024)).toFixed(1)} MB, but available free space is only ${(disk.availableBytes / (1024 * 1024)).toFixed(1)} MB.`;
    } else if (disk.availableBytes < 5 * 1024 * 1024 * 1024) {
        diskWarning = `Low disk space notice: Available space is ${(disk.availableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB.`;
    }

    return {
        cluster,
        query,
        streamId,
        totalEvents,
        sliceCount: slices.length,
        slices,
        projectedUncompressedBytes,
        projectedCompressedBytes,
        freeDiskBytes: disk.availableBytes,
        totalDiskBytes: disk.totalBytes,
        diskWarning,
        isDiskSpaceSufficient,
    };
}

/**
 * Excel DDE formula injection sanitization.
 * Prevents execution of malicious formulas (=, +, -, @) when exported CSV is opened in Excel.
 */
export function sanitizeCsvLine(line: string): string {
    if (!line) return "";
    // Check if line contains comma-separated values
    // Matches field start or quoted field start: e.g. =cmd or "=cmd
    return line.replace(/(^|,)"?([=+\-@][^",\r\n]*)/g, (match, prefix, content) => {
        // If already quoted and prepended with ', leave it
        if (content.startsWith("'")) return match;
        // Prepend safe single quote inside quotes
        return `${prefix}"'${content.replace(/"/g, '""')}"`;
    });
}

// In-memory registry of active cancellation tokens
const activeCancellations = new Set<string>();

export function requestExportCancellation(jobId: string) {
    activeCancellations.add(jobId);
}

/**
 * Asynchronous background worker that executes the sliced export job.
 */
export async function executeExportJob(jobId: string) {
    const job = await prisma.graylogExportJob.findUnique({ where: { id: jobId } });
    if (!job) {
        console.error(`Export job ${jobId} not found.`);
        return;
    }

    const jobDir = path.join(getStorageBasePath(), jobId);
    if (!fs.existsSync(jobDir)) {
        fs.mkdirSync(jobDir, { recursive: true });
    }

    try {
        await prisma.graylogExportJob.update({
            where: { id: jobId },
            data: { status: "RUNNING", progress: 2 },
        });

        // 1. Generate the slice plan
        const plan = await planExportSlices({
            cluster: job.cluster,
            query: job.query,
            from: job.from,
            to: job.to,
            streamId: job.streamId || undefined,
        });

        await prisma.graylogExportJob.update({
            where: { id: jobId },
            data: {
                totalSlices: plan.sliceCount,
                totalEvents: plan.totalEvents,
                progress: 5,
            },
        });

        const { baseUrl, authHeader } = getClusterClient(job.cluster);
        let fieldsArray: string[] = ["timestamp", "source", "message"];
        try {
            if (job.fields) {
                const parsed = JSON.parse(job.fields);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    fieldsArray = parsed;
                }
            }
        } catch {}

        const fieldsParam = fieldsArray.join(",");
        const ext = job.format === "ndjson" ? "ndjson" : "csv";
        const masterFilePath = path.join(jobDir, `master_export.${ext}`);
        const masterWriteStream = fs.createWriteStream(masterFilePath, { encoding: "utf8" });

        let writtenEvents = 0;
        let isMasterHeaderWritten = false;
        let totalUncompressedBytes = 0;

        // Concurrency throttle: Process max 2 parallel slices at a time
        const CONCURRENCY_LIMIT = 2;
        const sliceResults: { sliceIndex: number; filename: string; rows: number; sizeBytes: number }[] = [];

        for (let i = 0; i < plan.slices.length; i += CONCURRENCY_LIMIT) {
            if (activeCancellations.has(jobId)) {
                activeCancellations.delete(jobId);
                await prisma.graylogExportJob.update({
                    where: { id: jobId },
                    data: { status: "CANCELLED", progress: 100 },
                });
                masterWriteStream.end();
                return;
            }

            const batch = plan.slices.slice(i, i + CONCURRENCY_LIMIT);
            const batchPromises = batch.map(async (slice) => {
                const sliceFileName = `slice_${String(slice.sliceIndex).padStart(3, "0")}_${slice.from.replace(/[:.]/g, "-")}.${ext}`;
                const sliceFilePath = path.join(jobDir, sliceFileName);

                if (job.format === "ndjson") {
                    // Fetch JSON messages
                    const params: Record<string, any> = {
                        query: job.query && job.query.trim() ? job.query.trim() : "*",
                        from: slice.from,
                        to: slice.to,
                        limit: 10000,
                        fields: fieldsParam,
                    };
                    if (job.streamId && job.streamId !== "all") {
                        params.filter = `streams:${job.streamId}`;
                    }

                    const res = await axios.get(`${baseUrl}/api/search/universal/absolute`, {
                        params,
                        headers: { Authorization: authHeader, Accept: "application/json" },
                        httpsAgent,
                        timeout: 60000,
                    });

                    const messages = res.data?.messages || [];
                    const ndjsonLines = messages.map((m: any) => JSON.stringify(m.message || m)).join("\n") + (messages.length ? "\n" : "");
                    fs.writeFileSync(sliceFilePath, ndjsonLines, "utf8");
                    const sizeBytes = Buffer.byteLength(ndjsonLines, "utf8");

                    return {
                        sliceIndex: slice.sliceIndex,
                        filename: sliceFileName,
                        rows: messages.length,
                        sizeBytes,
                        rawContent: ndjsonLines,
                        hasHeader: false,
                    };
                } else {
                    // Fetch CSV export
                    const params: Record<string, any> = {
                        query: job.query && job.query.trim() ? job.query.trim() : "*",
                        from: slice.from,
                        to: slice.to,
                        fields: fieldsParam,
                    };
                    if (job.streamId && job.streamId !== "all") {
                        params.filter = `streams:${job.streamId}`;
                    }

                    const res = await axios.get(`${baseUrl}/api/search/universal/absolute/export`, {
                        params,
                        headers: { Authorization: authHeader, Accept: "text/csv" },
                        httpsAgent,
                        timeout: 60000,
                        responseType: "text",
                    });

                    const rawCsv = typeof res.data === "string" ? res.data : "";
                    const rawLines = rawCsv.split(/\r?\n/).filter(l => l.trim().length > 0);

                    // Sanitize Excel DDE formulas
                    const sanitizedLines = rawLines.map(line => sanitizeCsvLine(line));
                    const sanitizedContent = sanitizedLines.join("\n") + (sanitizedLines.length ? "\n" : "");
                    fs.writeFileSync(sliceFilePath, sanitizedContent, "utf8");

                    const sizeBytes = Buffer.byteLength(sanitizedContent, "utf8");
                    const dataRows = Math.max(0, sanitizedLines.length - 1); // exclude header

                    return {
                        sliceIndex: slice.sliceIndex,
                        filename: sliceFileName,
                        rows: dataRows,
                        sizeBytes,
                        headerLine: sanitizedLines[0] || "",
                        dataLines: sanitizedLines.slice(1),
                        hasHeader: true,
                    };
                }
            });

            const completedBatch = await Promise.all(batchPromises);

            for (const item of completedBatch) {
                sliceResults.push({
                    sliceIndex: item.sliceIndex,
                    filename: item.filename,
                    rows: item.rows,
                    sizeBytes: item.sizeBytes,
                });

                writtenEvents += item.rows;
                totalUncompressedBytes += item.sizeBytes;

                if (job.format === "ndjson") {
                    masterWriteStream.write((item as any).rawContent);
                } else {
                    const csvItem = item as any;
                    if (!isMasterHeaderWritten && csvItem.headerLine) {
                        masterWriteStream.write(csvItem.headerLine + "\n");
                        isMasterHeaderWritten = true;
                    }
                    if (csvItem.dataLines && csvItem.dataLines.length > 0) {
                        masterWriteStream.write(csvItem.dataLines.join("\n") + "\n");
                    }
                }
            }

            const processedCount = sliceResults.length;
            const progressPct = Math.min(88, Math.round(5 + (processedCount / plan.slices.length) * 80));
            await prisma.graylogExportJob.update({
                where: { id: jobId },
                data: {
                    processedSlices: processedCount,
                    totalEvents: writtenEvents,
                    progress: progressPct,
                },
            });
        }

        masterWriteStream.end();
        await new Promise((resolve) => masterWriteStream.on("finish", resolve));

        // 2. Generate export manifest
        const manifest = {
            exportId: job.id,
            title: job.title,
            cluster: job.cluster,
            streamId: job.streamId,
            streamName: job.streamName,
            query: job.query,
            timeRange: {
                from: job.from.toISOString(),
                to: job.to.toISOString(),
            },
            fields: fieldsArray,
            format: job.format,
            totalEvents: writtenEvents,
            sliceCount: sliceResults.length,
            slices: sliceResults,
            masterFile: `master_export.${ext}`,
            retentionHours: job.retentionHours,
            expiresAt: job.expiresAt.toISOString(),
            createdBy: job.createdBy,
            createdAt: job.createdAt.toISOString(),
            completedAt: new Date().toISOString(),
        };

        const manifestPath = path.join(jobDir, "export_manifest.json");
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        totalUncompressedBytes += fs.statSync(manifestPath).size;
        totalUncompressedBytes += fs.statSync(masterFilePath).size;

        // 3. Package all-in-one ZIP archive
        await prisma.graylogExportJob.update({
            where: { id: jobId },
            data: { progress: 90 },
        });

        const zipFileName = `all_in_one_${job.id}.zip`;
        const zipFilePath = path.join(jobDir, zipFileName);

        const zipEntries: ZipFileEntry[] = [
            { name: "export_manifest.json", filePath: manifestPath },
            { name: `master_export.${ext}`, filePath: masterFilePath },
        ];

        for (const slice of sliceResults) {
            const sPath = path.join(jobDir, slice.filename);
            if (fs.existsSync(sPath)) {
                zipEntries.push({ name: `slices/${slice.filename}`, filePath: sPath });
            }
        }

        const { compressedBytes } = await createZipArchive(zipEntries, zipFilePath);

        // 4. Mark job COMPLETED
        await prisma.graylogExportJob.update({
            where: { id: jobId },
            data: {
                status: "COMPLETED",
                progress: 100,
                completedAt: new Date(),
                totalEvents: writtenEvents,
                uncompressedBytes: totalUncompressedBytes,
                compressedBytes,
                zipFileName,
            },
        });

        console.log(`[Export Job ${jobId}] Completed successfully: ${writtenEvents} events in ${sliceResults.length} slices. ZIP size: ${(compressedBytes / (1024 * 1024)).toFixed(2)} MB`);
    } catch (err: any) {
        console.error(`[Export Job ${jobId}] Failed:`, err);
        await prisma.graylogExportJob.update({
            where: { id: jobId },
            data: {
                status: "FAILED",
                progress: 0,
                errorMessage: err.message || "Unknown export error occurred",
            },
        });
    }
}

/**
 * Cleans up expired exports from disk and updates DB records
 */
export async function cleanupExpiredExports(): Promise<{ deletedCount: number; freedBytes: number }> {
    const now = new Date();
    const expiredJobs = await prisma.graylogExportJob.findMany({
        where: {
            expiresAt: { lte: now },
            status: { not: "EXPIRED" },
        },
    });

    let freedBytes = 0;
    let deletedCount = 0;

    for (const job of expiredJobs) {
        const jobDir = path.join(getStorageBasePath(), job.id);
        if (fs.existsSync(jobDir)) {
            try {
                freedBytes += job.compressedBytes + job.uncompressedBytes;
                fs.rmSync(jobDir, { recursive: true, force: true });
            } catch (e: any) {
                console.error(`Failed to delete export directory ${jobDir}:`, e.message);
            }
        }

        await prisma.graylogExportJob.update({
            where: { id: job.id },
            data: { status: "EXPIRED" },
        });

        deletedCount++;
    }

    return { deletedCount, freedBytes };
}
