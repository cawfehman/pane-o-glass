import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { ensureSitesExistFromDevices } from "@/lib/sites";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);

/**
 * Automatically resolve the correct Python executable on the host system.
 * Handles RHEL/Linux (where it is 'python3') and Windows/Virtualenv (where it is 'python').
 */
async function resolvePythonCommand(): Promise<string> {
    if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
    const candidates = process.platform === "win32" ? ["python", "python3", "py"] : ["python3", "python"];
    for (const cmd of candidates) {
        try {
            await execFileAsync(cmd, ["--version"]);
            return cmd;
        } catch {
            // continue candidate probe
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

        // Correlate EIGRP L3 routed links across WAN/boundaries
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

export interface HopSiteBreakdown {
    site: string;
    total: number;
    verified: number;
    sshErrors: number;
    timeouts: number;
    unverifiedBoundary: number;
    devices: Array<{
        hostname: string;
        ip: string;
        status: string;
        failureReason?: string;
    }>;
}

export interface HopBreakdown {
    hop: number;
    label: string;
    totalDevices: number;
    sites: HopSiteBreakdown[];
}

export function buildHopBreakdown(rawDevices: any[], overrides?: Map<string, any>): { breakdown: HopBreakdown[]; textSummary: string[] } {
    const hopMap = new Map<number, any[]>();
    for (const d of rawDevices) {
        const hop = d.hop_distance !== undefined && d.hop_distance !== null ? Number(d.hop_distance) : 0;
        if (!hopMap.has(hop)) hopMap.set(hop, []);
        hopMap.get(hop)!.push(d);
    }

    const sortedHops = Array.from(hopMap.keys()).sort((a, b) => a - b);
    const breakdown: HopBreakdown[] = [];
    const textLines: string[] = [
        "============================================================",
        "  POST-CRAWL DISCOVERY BREAKDOWN BY HOP & SITE",
        "============================================================"
    ];

    for (const hop of sortedHops) {
        const devs = hopMap.get(hop)!;
        const hopLabel = hop === 0 ? "Hop 0 (Seed Devices)" : `Hop ${hop}`;
        const siteGroupMap = new Map<string, any[]>();

        for (const d of devs) {
            const canon = (d.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
            const ov = overrides?.get(canon) || (d.ip_address ? overrides?.get(d.ip_address.toLowerCase()) : null);
            let s = ov?.siteOverride || d.site_info?.site || d.site;
            if (!s && d.hostname) {
                const parts = d.hostname.split(".")[0].trim();
                s = parts.length >= 3 ? parts.slice(0, 3).toUpperCase() : "UNK";
            }
            s = (s || "UNKNOWN").toUpperCase();

            if (!siteGroupMap.has(s)) siteGroupMap.set(s, []);
            siteGroupMap.get(s)!.push(d);
        }

        const sites: HopSiteBreakdown[] = [];
        textLines.push(`\n[${hopLabel}] - ${devs.length} device(s) across ${siteGroupMap.size} site(s):`);

        const sortedSiteKeys = Array.from(siteGroupMap.keys()).sort();
        for (const sKey of sortedSiteKeys) {
            const sDevs = siteGroupMap.get(sKey)!;
            let verified = 0;
            let sshErrors = 0;
            let timeouts = 0;
            let unverifiedBoundary = 0;

            const devDetails = sDevs.map(d => {
                const status = (d.status || "").toUpperCase();
                const reason = d.failure_reason || d.error || "";
                if (status === "REACHABLE") {
                    verified++;
                } else if (status === "UNVERIFIED") {
                    unverifiedBoundary++;
                } else if (status === "TIMEOUT" || reason.toLowerCase().includes("timeout")) {
                    timeouts++;
                } else {
                    sshErrors++;
                }

                return {
                    hostname: d.hostname || d.ip_address || "unknown",
                    ip: d.ip_address || "",
                    status,
                    failureReason: reason || undefined
                };
            });

            sites.push({
                site: sKey,
                total: sDevs.length,
                verified,
                sshErrors,
                timeouts,
                unverifiedBoundary,
                devices: devDetails
            });

            const summaryBadges: string[] = [];
            if (verified > 0) summaryBadges.push(`${verified} verified`);
            if (sshErrors > 0) summaryBadges.push(`${sshErrors} SSH error(s)`);
            if (timeouts > 0) summaryBadges.push(`${timeouts} timeout(s)`);
            if (unverifiedBoundary > 0) summaryBadges.push(`${unverifiedBoundary} unverified (hop limit)`);

            textLines.push(`  • Site ${sKey}: ${sDevs.length} device(s) [${summaryBadges.join(", ")}]`);
            for (const d of devDetails) {
                let statusDetail = d.status;
                if (d.status === "UNVERIFIED") statusDetail = "UNVERIFIED (Hop limit reached)";
                else if (d.failureReason) statusDetail = `${d.status} (${d.failureReason})`;
                textLines.push(`    - ${d.hostname} (${d.ip}): ${statusDetail}`);
            }
        }

        breakdown.push({
            hop,
            label: hopLabel,
            totalDevices: devs.length,
            sites
        });
    }

    textLines.push("============================================================\n");
    return { breakdown, textSummary: textLines };
}

async function persistLatestSnapshot(
    crawlerDir: string,
    seeds: string[],
    profile: string,
    maxHops: number,
    label: string,
    useMock: boolean,
    session: any
) {
    const snapshotsDir = path.join(crawlerDir, "snapshots");
    const files = fs.readdirSync(snapshotsDir)
        .filter(f => f.startsWith("snapshot_") && f.endsWith(".json"))
        .map(f => ({
            name: f,
            time: fs.statSync(path.join(snapshotsDir, f)).mtimeMs
        }))
        .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
        throw new Error("No snapshot file was generated by the crawler worker.");
    }

    const latestSnapshotFile = path.join(snapshotsDir, files[0].name);
    const rawContent = fs.readFileSync(latestSnapshotFile, "utf-8");
    const snapshotData = JSON.parse(rawContent);
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
            const rawTs = typeof meta.timestamp === "string" ? meta.timestamp.replace(" ", "T") : meta.timestamp;
            const parsed = new Date(rawTs);
            if (!isNaN(parsed.getTime())) snapDate = parsed;
        } catch {
            snapDate = new Date();
        }
    }

    const newSnapshot = await prisma.crawlSnapshot.create({
        data: {
            snapshotNumber: nextSnapshotNumber,
            timestamp: snapDate,
            seedDevices: meta.seed_devices || seeds,
            totalDiscovered: meta.total_discovered ?? rawDevices.length,
            totalReachable: meta.total_reachable ?? rawDevices.filter((d: any) => d.status === "REACHABLE").length,
            totalUnreachable: meta.total_unreachable ?? rawDevices.filter((d: any) => d.status !== "REACHABLE" && d.status !== "UNVERIFIED").length,
            durationSeconds: meta.duration_seconds ?? 1.5,
            crawlProfile: (meta.crawl_profile || profile).toUpperCase(),
            maxHops: meta.max_hops ?? maxHops,
            reseedFrontier: meta.reseed_points || [],
        }
    });

    // Load overrides so device records and hop breakdown reflect authoritative site overrides
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

    await logAudit(
        'CRAWLER_TRIGGER',
        `Executed ${useMock ? 'Virtual Mock Lab' : 'Live SSH'} Network Crawl. Created Snapshot #${newSnapshot.snapshotNumber} with ${rawDevices.length} devices.`,
        (session?.user as any)?.id,
        (session?.user as any)?.ipAddress
    );

    // Auto-register any new sites discovered from fully verified reachable devices into the authoritative Site Directory
    try {
        await ensureSitesExistFromDevices(rawDevices, session?.user as any);
    } catch (siteErr) {
        console.error("[CRAWLER] Failed auto-registering discovered sites in Site Directory:", siteErr);
    }

    const { breakdown: hopBreakdown, textSummary: hopTextSummary } = buildHopBreakdown(rawDevices, overrideMap);

    return {
        snapshot: newSnapshot,
        hopBreakdown,
        hopTextSummary
    };
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const body = await request.json().catch(() => ({}));
        const useMock = body.useMock !== false;
        const seeds = Array.isArray(body.seeds) && body.seeds.length > 0 ? body.seeds : ["10.100.1.1"];
        const workers = body.workers || 10;
        const profile = typeof body.profile === "string" ? body.profile.toLowerCase() : "intensive";
        const rawHops = body.maxHops !== undefined && body.maxHops !== null ? Number(body.maxHops) : 1;
        const maxHops = Math.min(Math.max(isNaN(rawHops) ? 1 : rawHops, 1), 10);
        const enableLldp = Boolean(body.enableLldp);
        const enableEigrp = body.enableEigrp !== false;

        const crawlerDir = path.join(process.cwd(), "services", "crawler");
        const pythonBin = await resolvePythonCommand();

        const args = ["main.py", "crawl"];
        if (useMock) {
            args.push("--mock");
        } else {
            args.push("--seeds", seeds.join(","), "--workers", String(workers));
        }

        args.push("--profile", profile);
        args.push("--max-hops", String(maxHops));
        if (enableLldp) {
            args.push("--enable-lldp");
        }
        if (!enableEigrp) {
            args.push("--no-eigrp");
        }

        const customEnv: Record<string, string> = {
            PYTHONPATH: crawlerDir,
            PYTHONUNBUFFERED: "1",
            PYTHONIOENCODING: "utf-8",
            NO_COLOR: "1", // Disable ANSI escape sequences for pure clean streaming logs
            NETCRAWL_DISABLE_SQLITE: "1" // Rely 100% on PostgreSQL, avoid redundant SQLite disk writes during web crawls
        };
        if (body.username) customEnv.NETCRAWL_USER = String(body.username).trim();
        if (body.password) customEnv.NETCRAWL_PASS = String(body.password);
        if (body.secret) customEnv.NETCRAWL_SECRET = String(body.secret);
        if (Array.isArray(body.fallbackCredentials) && body.fallbackCredentials.length > 0) {
            customEnv.NETCRAWL_FALLBACK_JSON = JSON.stringify(body.fallbackCredentials);
        }

        console.log(`[CRAWLER-TRIGGER] Using python: ${pythonBin} | args: ${args.join(" ")} in ${crawlerDir}`);

        const runsDir = path.join(crawlerDir, "logs", "runs");
        if (!fs.existsSync(runsDir)) {
            try { fs.mkdirSync(runsDir, { recursive: true }); } catch {}
        }

        // Prune logs older than 7 days
        try {
            const now = Date.now();
            const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
            if (fs.existsSync(runsDir)) {
                for (const file of fs.readdirSync(runsDir)) {
                    if (!file.endsWith(".log")) continue;
                    const fullPath = path.join(runsDir, file);
                    const stat = fs.statSync(fullPath);
                    if (now - stat.mtimeMs > maxAgeMs) {
                        try { fs.unlinkSync(fullPath); } catch {}
                    }
                }
            }
        } catch (e) {
            console.error("Failed to prune old crawler run logs:", e);
        }

        const runLogLines: string[] = [
            `============================================================`,
            `  NETCRAWL EXECUTION AUDIT LOG`,
            `============================================================`,
            `Timestamp:    ${new Date().toISOString()}`,
            `Seed Devices: ${seeds.join(", ")}`,
            `Profile:      ${profile.toUpperCase()}`,
            `Max Hops:     ${maxHops}`,
            `Mode:         ${useMock ? "VIRTUAL LAB SIMULATION" : "LIVE CISCO SSH"}`,
            `Primary User: ${body.username || "server-default"}`,
            `Fallbacks:    ${Array.isArray(body.fallbackCredentials) && body.fallbackCredentials.length > 0 ? body.fallbackCredentials.map((f: any) => f.username).join(", ") : "None configured"}`,
            `Python Exec:  ${pythonBin}`,
            `============================================================\n`
        ];

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const sendEvent = (obj: any) => {
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
                    } catch {
                        // stream might be closed by client
                    }
                };

                const logAndSend = (type: string, message: string) => {
                    const stamped = `[${new Date().toISOString().substring(11, 19)}] [${type.toUpperCase()}] ${message}`;
                    runLogLines.push(stamped);
                    sendEvent({ type, [type === "log" || type === "stderr" ? "line" : "message"]: message });
                };

                logAndSend("status", `[INIT] Resolved Python: ${pythonBin} | Profile: ${profile.toUpperCase()} | Depth: ${maxHops} Hop(s)`);

                if (!useMock) {
                    const fallbackCount = Array.isArray(body.fallbackCredentials) ? body.fallbackCredentials.length : 0;
                    logAndSend("status", `[SSH] Connecting to seed(s): ${seeds.join(", ")} (User: ${body.username || "server-default"}, ${fallbackCount} fallback(s))...`);
                }

                const proc = spawn(pythonBin, args, {
                    cwd: crawlerDir,
                    env: {
                        ...process.env,
                        ...customEnv
                    }
                });

                // Abort process if client disconnects
                request.signal.addEventListener("abort", () => {
                    try {
                        proc.kill();
                    } catch {
                        // ignore
                    }
                });

                proc.stdout.on("data", (chunk: Buffer) => {
                    const text = chunk.toString("utf-8");
                    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                    for (const line of lines) {
                        const cleanLine = line.trim();
                        runLogLines.push(`[${new Date().toISOString().substring(11, 19)}] ${cleanLine}`);
                        sendEvent({ type: "log", line: cleanLine });
                    }
                });

                proc.stderr.on("data", (chunk: Buffer) => {
                    const text = chunk.toString("utf-8");
                    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                    for (const line of lines) {
                        const cleanLine = line.trim();
                        runLogLines.push(`[${new Date().toISOString().substring(11, 19)}] [STDERR] ${cleanLine}`);
                        sendEvent({ type: "stderr", line: cleanLine });
                    }
                });

                proc.on("error", (err) => {
                    const errMsg = `Failed to spawn crawler binary (${pythonBin}): ${err.message}`;
                    runLogLines.push(`[ERROR] ${errMsg}`);
                    sendEvent({ type: "error", error: errMsg });
                    try {
                        const errLogFile = path.join(runsDir, `crawl_error_${Date.now()}.log`);
                        fs.writeFileSync(errLogFile, runLogLines.join("\n"), "utf-8");
                    } catch {}
                    try { controller.close(); } catch {}
                });

                proc.on("close", async (code) => {
                    runLogLines.push(`\n[EXIT] Process exited with return code: ${code}`);

                    if (code !== 0) {
                        const errMsg = `Crawler process exited with error code ${code}. Review logs above for details.`;
                        sendEvent({ type: "error", error: errMsg });
                        try {
                            const errLogFile = path.join(runsDir, `crawl_error_${Date.now()}.log`);
                            fs.writeFileSync(errLogFile, runLogLines.join("\n"), "utf-8");
                        } catch {}
                        try { controller.close(); } catch {}
                        return;
                    }

                    try {
                        sendEvent({ type: "status", message: `[DB] Parsing crawler snapshot and persisting to PostgreSQL...` });
                        const { snapshot: newSnapshot, hopBreakdown, hopTextSummary } = await persistLatestSnapshot(
                            crawlerDir,
                            seeds,
                            profile,
                            maxHops,
                            body.name || "Crawl Snapshot",
                            useMock,
                            session
                        );

                        // Stream structured hop breakdown lines into console and run audit log
                        for (const line of hopTextSummary) {
                            runLogLines.push(line);
                            sendEvent({ type: "log", line });
                        }

                        // Save run log file named after snapshot for easy retrieval
                        const snapLogFile = path.join(runsDir, `crawl_snapshot_${newSnapshot.id}.log`);
                        fs.writeFileSync(snapLogFile, runLogLines.join("\n"), "utf-8");

                        sendEvent({
                            type: "done",
                            snapshotId: newSnapshot.id,
                            snapshotNumber: newSnapshot.snapshotNumber,
                            totalDiscovered: newSnapshot.totalDiscovered,
                            totalReachable: newSnapshot.totalReachable,
                            totalUnreachable: newSnapshot.totalUnreachable,
                            logFile: `crawl_snapshot_${newSnapshot.id}.log`,
                            hopBreakdown
                        });
                    } catch (persistErr: any) {
                        const saveErrMsg = `Failed saving snapshot to database: ${persistErr.message}`;
                        runLogLines.push(`[ERROR] ${saveErrMsg}`);
                        sendEvent({ type: "error", error: saveErrMsg });
                        try {
                            const fallbackLogFile = path.join(runsDir, `crawl_run_${Date.now()}.log`);
                            fs.writeFileSync(fallbackLogFile, runLogLines.join("\n"), "utf-8");
                        } catch {}
                    } finally {
                        try { controller.close(); } catch {}
                    }
                });
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive"
            }
        });
    } catch (error: any) {
        console.error("Failed to execute network crawl:", error);
        return NextResponse.json({
            error: `Crawl execution failed: ${error.message || String(error)}`
        }, { status: 500 });
    }
}
