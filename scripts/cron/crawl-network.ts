import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { ensureSitesExistFromDevices } from "@/lib/sites";

const execFileAsync = promisify(execFile);

// Load environment variables for standalone script execution
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();

async function resolvePythonCommand(): Promise<string> {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            await execFileAsync(cmd, ["--version"]);
            return cmd;
        } catch {
            // continue probe
        }
    }
    return process.platform === "win32" ? "python" : "python3";
}

function normalizeHost(host: string): string {
    return host.split(".")[0].trim();
}

function correlateLinks(devices: any[]): any[] {
    const deviceMap = new Map<string, any>();
    const deviceByIp = new Map<string, any>();
    for (const d of devices) {
        deviceMap.set(d.hostname, d);
        deviceMap.set(d.hostname.toLowerCase(), d);
        if (d.ip_address) deviceByIp.set(d.ip_address, d);
        if (Array.isArray(d.alias_ips)) {
            for (const a of d.alias_ips) deviceByIp.set(a, d);
        }
        if (d.interfaces) {
            for (const intf of Object.values(d.interfaces)) {
                if ((intf as any)?.ip_address) deviceByIp.set((intf as any).ip_address, d);
            }
        }
    }

    const seenPairs = new Set<string>();
    const links: any[] = [];

    for (const dev of devices) {
        if (dev.status !== "REACHABLE") continue;

        for (const cdp of (dev.cdp_neighbors || [])) {
            if (cdp.is_ap) continue;

            const remoteHost = normalizeHost(cdp.destination_host);
            const localIntf = cdp.local_interface;
            const remoteIntf = cdp.remote_interface;

            const pairItems = [
                `${dev.hostname}:${localIntf}`,
                `${remoteHost}:${remoteIntf}`
            ].sort();
            const pairKey = pairItems.join(" <-> ");

            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const srcIntf = dev.interfaces?.[localIntf];
            const remoteDev = deviceMap.get(remoteHost) || deviceMap.get(remoteHost.toLowerCase());
            const dstIntf = remoteDev?.interfaces?.[remoteIntf];

            let linkType = "L2_TRUNK";
            const isPo = localIntf.toLowerCase().startsWith("po") || remoteIntf.toLowerCase().startsWith("po");
            if (isPo) {
                linkType = "PORT_CHANNEL";
            } else if (srcIntf?.is_trunk) {
                linkType = "L2_TRUNK";
            } else if (srcIntf?.ip_address || dstIntf?.ip_address) {
                linkType = "L3_ROUTED";
            } else if (dev.role === "Router" || remoteDev?.role === "Router") {
                linkType = "L3_ROUTED";
            }

            let status = "UP";
            if (remoteDev?.status === "UNVERIFIED") {
                status = "UNVERIFIED";
            } else if (remoteDev && remoteDev.status !== "REACHABLE") {
                status = "DOWN";
            }

            links.push({
                sourceDevice: dev.hostname,
                sourceInterface: localIntf,
                sourceIp: srcIntf?.ip_address || null,
                targetDevice: remoteHost,
                targetInterface: remoteIntf,
                targetIp: dstIntf?.ip_address || null,
                linkType,
                status
            });
        }

        for (const eigrp of (dev.eigrp_neighbors || [])) {
            const peerIp = eigrp.peer_ip;
            if (!peerIp) continue;
            const remoteDev = deviceByIp.get(peerIp);
            if (!remoteDev) continue;

            const remoteHost = normalizeHost(remoteDev.hostname);
            const localIntf = eigrp.local_interface;
            let remoteIntf = "unknown";
            if (remoteDev.interfaces) {
                for (const [rName, rIntf] of Object.entries(remoteDev.interfaces)) {
                    if ((rIntf as any)?.ip_address === peerIp) {
                        remoteIntf = rName;
                        break;
                    }
                }
            }

            const pairItems = [
                `${dev.hostname}:${localIntf}`,
                `${remoteHost}:${remoteIntf}`
            ].sort();
            const pairKey = pairItems.join(" <-> ");

            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const srcIntf = dev.interfaces?.[localIntf];
            const dstIntf = remoteDev.interfaces?.[remoteIntf];

            let status = "UP";
            if (remoteDev.status === "UNVERIFIED") {
                status = "UNVERIFIED";
            } else if (remoteDev.status !== "REACHABLE") {
                status = "DOWN";
            }

            links.push({
                sourceDevice: dev.hostname,
                sourceInterface: localIntf,
                sourceIp: srcIntf?.ip_address || dev.ip_address,
                targetDevice: remoteHost,
                targetInterface: remoteIntf,
                targetIp: dstIntf?.ip_address || peerIp,
                linkType: "L3_ROUTED",
                status
            });
        }
    }

    return links;
}

async function run() {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [CRON] Starting Nightly Scheduled Network Crawler...`);

    const crawlerDir = path.join(process.cwd(), "services", "crawler");
    const pythonBin = await resolvePythonCommand();

    // Configuration resolution: CLI args > env vars > defaults
    const rawSeeds = process.env.NETCRAWL_SEEDS || "10.100.1.1";
    const seeds = rawSeeds.split(",").map(s => s.trim()).filter(Boolean);
    const profile = (process.env.NETCRAWL_PROFILE || "intensive").toLowerCase();
    const maxHops = Math.min(Math.max(Number(process.env.NETCRAWL_MAX_HOPS || 2), 1), 10);
    const workers = Number(process.env.NETCRAWL_WORKERS || 15);
    const useMock = process.env.NETCRAWL_MOCK === "true";

    console.log(`[${timestamp}] [CONFIG] Seeds: [${seeds.join(", ")}] | Profile: ${profile.toUpperCase()} | Max Hops: ${maxHops} | Python: ${pythonBin}`);

    const args = ["main.py", "crawl"];
    if (useMock) {
        args.push("--mock");
    } else {
        args.push("--seeds", seeds.join(","), "--workers", String(workers));
    }
    args.push("--profile", profile, "--max-hops", String(maxHops));

    const startTime = Date.now();

    try {
        await new Promise<void>((resolve, reject) => {
            const proc = spawn(pythonBin, args, {
                cwd: crawlerDir,
                env: {
                    ...process.env,
                    PYTHONPATH: crawlerDir,
                    PYTHONUNBUFFERED: "1",
                    PYTHONIOENCODING: "utf-8",
                    NO_COLOR: "1",
                    NETCRAWL_DISABLE_SQLITE: "1"
                }
            });

            proc.stdout.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                for (const line of text.split(/\r?\n/).filter(l => l.trim().length > 0)) {
                    console.log(`  [CRAWLER] ${line.trim()}`);
                }
            });

            proc.stderr.on("data", (chunk: Buffer) => {
                const text = chunk.toString("utf-8");
                for (const line of text.split(/\r?\n/).filter(l => l.trim().length > 0)) {
                    console.error(`  [STDERR] ${line.trim()}`);
                }
            });

            proc.on("error", (err) => reject(new Error(`Failed to spawn crawler process: ${err.message}`)));

            proc.on("close", (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Crawler process exited with error code ${code}`));
            });
        });

        // Locate latest generated snapshot JSON
        const snapshotsDir = path.join(crawlerDir, "snapshots");
        const files = fs.readdirSync(snapshotsDir)
            .filter(f => f.startsWith("snapshot_") && f.endsWith(".json"))
            .map(f => ({ name: f, time: fs.statSync(path.join(snapshotsDir, f)).mtimeMs }))
            .sort((a, b) => b.time - a.time);

        if (files.length === 0) {
            throw new Error("No snapshot file was generated by the crawler worker.");
        }

        const latestSnapshotFile = path.join(snapshotsDir, files[0].name);
        const snapshotData = JSON.parse(fs.readFileSync(latestSnapshotFile, "utf-8"));
        const meta = snapshotData.metadata || snapshotData.meta || {};
        const rawDevices = Array.isArray(snapshotData.devices) ? snapshotData.devices : [];

        const lastSnap = await prisma.crawlSnapshot.findFirst({
            orderBy: { snapshotNumber: "desc" },
            select: { snapshotNumber: true }
        });
        const nextSnapshotNumber = (lastSnap?.snapshotNumber || 0) + 1;

        let snapDate = new Date();
        if (meta.timestamp) {
            try {
                const parsed = new Date(typeof meta.timestamp === "string" ? meta.timestamp.replace(" ", "T") : meta.timestamp);
                if (!isNaN(parsed.getTime())) snapDate = parsed;
            } catch {}
        }

        const durationSeconds = (Date.now() - startTime) / 1000;

        const newSnapshot = await prisma.crawlSnapshot.create({
            data: {
                snapshotNumber: nextSnapshotNumber,
                timestamp: snapDate,
                seedDevices: seeds,
                totalDiscovered: rawDevices.length,
                totalReachable: meta.total_reachable ?? rawDevices.filter((d: any) => d.status === "REACHABLE").length,
                totalUnreachable: meta.total_unreachable ?? rawDevices.filter((d: any) => d.status !== "REACHABLE" && d.status !== "UNVERIFIED").length,
                durationSeconds: meta.duration_seconds ?? durationSeconds,
                crawlProfile: profile.toUpperCase(),
                maxHops,
                reseedFrontier: meta.reseed_points || [],
            }
        });

        const overrides = await prisma.crawlerDeviceOverride.findMany().catch(() => []);
        const overrideMap = new Map<string, any>();
        for (const ov of overrides) {
            if (ov.hostname) overrideMap.set(ov.hostname.toLowerCase(), ov);
        }

        for (const dev of rawDevices) {
            const shortHost = dev.hostname ? dev.hostname.split(".")[0].trim() : "";
            const fallbackSite = shortHost.length >= 3 ? shortHost.slice(0, 3).toUpperCase() : null;
            let fallbackIdf = "MDF";
            if (shortHost.includes("-")) {
                const parts = shortHost.split("-");
                if (parts.length > 1 && parts[1]) {
                    fallbackIdf = parts[1].slice(0, 3).toUpperCase();
                }
            }

            const canon = (dev.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
            const ov = overrideMap.get(canon) || (dev.ip_address ? overrideMap.get(dev.ip_address.toLowerCase()) : null);

            const resolvedSite = ov?.siteOverride ? String(ov.siteOverride).toUpperCase() : (dev.site_info?.site ? dev.site_info.site.toUpperCase() : fallbackSite);
            const resolvedIdf = ov?.idfOverride ? String(ov.idfOverride).toUpperCase() : (dev.site_info?.idf ? dev.site_info.idf.toUpperCase() : fallbackIdf);
            const resolvedRole = ov?.roleOverride || dev.role;

            await prisma.crawlDevice.create({
                data: {
                    snapshotId: newSnapshot.id,
                    hostname: dev.hostname,
                    ipAddress: dev.ip_address,
                    platform: dev.platform,
                    osVersion: dev.os_version,
                    serialNumber: dev.serial_number,
                    role: resolvedRole,
                    status: dev.status,
                    failureReason: dev.failure_reason,
                    discoveredVia: dev.discovered_via,
                    credentialUsed: dev.credential_used || null,
                    authTimeMs: dev.auth_time_ms ?? null,
                    hopDistance: dev.hop_distance ?? 0,
                    isReseedFrontier: Boolean(dev.is_reseed_frontier),
                    boundaryNeighbors: dev.boundary_neighbors || [],
                    site: resolvedSite,
                    idf: resolvedIdf,
                    roleCode: dev.site_info?.role_code || null,
                    iterator: dev.site_info?.iterator || null,
                    interfaces: dev.interfaces || {},
                    routes: dev.routes || [],
                    vlans: dev.vlans || [],
                    cdpNeighbors: dev.cdp_neighbors || [],
                    arpTable: dev.arp_table || []
                }
            });
        }

        const links = correlateLinks(rawDevices);
        for (const link of links) {
            await prisma.crawlLink.create({
                data: {
                    snapshotId: newSnapshot.id,
                    sourceDevice: link.sourceDevice,
                    sourceInterface: link.sourceInterface,
                    sourceIp: link.sourceIp,
                    targetDevice: link.targetDevice,
                    targetInterface: link.targetInterface,
                    targetIp: link.targetIp,
                    linkType: link.linkType,
                    status: link.status
                }
            });
        }

        try {
            await ensureSitesExistFromDevices(rawDevices);
        } catch (e) {
            console.error("Failed auto-registering sites:", e);
        }

        // Update BackgroundJob status for System Health dashboard
        const summaryMsg = `Snapshot #${newSnapshot.snapshotNumber}: Discovered ${rawDevices.length} devices (${newSnapshot.totalReachable} reachable, ${newSnapshot.totalUnreachable} unreachable) in ${durationSeconds.toFixed(1)}s.`;
        await prisma.backgroundJob.upsert({
            where: { name: "Network Crawler" },
            create: {
                name: "Network Crawler",
                lastRun: new Date(),
                status: "SUCCESS",
                message: summaryMsg
            },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: summaryMsg
            }
        });

        // Audit Log entry
        await prisma.auditLog.create({
            data: {
                action: "CRAWLER_TRIGGER",
                details: `Nightly Scheduled Network Crawl. Created Baseline Snapshot #${newSnapshot.snapshotNumber} (${rawDevices.length} devices discovered, ${newSnapshot.totalReachable} verified).`,
                userId: undefined,
                ipAddress: "127.0.0.1"
            }
        });

        console.log(`[${new Date().toISOString()}] [SUCCESS] ${summaryMsg}`);
        process.exit(0);

    } catch (err: any) {
        console.error(`[${new Date().toISOString()}] [ERROR] Nightly crawl failed:`, err);
        await prisma.backgroundJob.upsert({
            where: { name: "Network Crawler" },
            create: {
                name: "Network Crawler",
                lastRun: new Date(),
                status: "FAILURE",
                message: err.message || "Nightly network crawl execution failed"
            },
            update: {
                lastRun: new Date(),
                status: "FAILURE",
                message: err.message || "Nightly network crawl execution failed"
            }
        }).catch(() => {});
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

run();
