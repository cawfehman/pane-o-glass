import { NodeSSH } from "node-ssh";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isPrivateIp } from "@/lib/iplocate";
import { recordShunActionLog, ShunNodeVerification } from "@/lib/shun-logger";
import { isResidential } from "@/lib/isp-classification";

export interface FirewallNodeConfig {
    id: string;
    name: string;
    ip: string;
    user: string;
    pass: string;
}

export interface IpFleetCoverage {
    ip: string;
    configuredCount: number;
    activeCount: number;
    isFullyProtected: boolean;
    isPartiallyShunned: boolean;
    isCleared: boolean;
    activeFirewalls: string[];
    missingFirewalls: FirewallNodeConfig[];
    blacklisted: boolean;
}

export interface ReplicateResult {
    success: boolean;
    ip: string;
    targetNodes: string[];
    successfulNodes: string[];
    failedNodes: { node: string; error: string }[];
    isNowFullyProtected: boolean;
}

export interface BatchUniversalizeResult {
    success: boolean;
    mode: "specific" | "blacklist" | "all_partial";
    totalIpsProcessed: number;
    totalShunCommandsSent: number;
    replicatedByFirewall: Record<string, number>;
    errors: string[];
    durationMs: number;
}

/**
 * Returns the parsed firewall array from FIREWALL_CONFIG
 */
export function getFleetFirewalls(): FirewallNodeConfig[] {
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    try {
        const parsed = JSON.parse(configStr);
        if (Array.isArray(parsed)) {
            return parsed.map((fw: any, idx: number) => ({
                id: fw.id || `fw-${idx + 1}`,
                name: fw.name || fw.id || fw.ip,
                ip: fw.ip,
                user: fw.user,
                pass: fw.pass
            }));
        }
    } catch {
        // Fallback
    }
    return [];
}

/**
 * Inspects coverage across all fleet firewalls for a list of IPs.
 */
export async function getFleetShunCoverage(ips: string[]): Promise<Map<string, IpFleetCoverage>> {
    const fleet = getFleetFirewalls();
    const result = new Map<string, IpFleetCoverage>();
    if (ips.length === 0) return result;

    const stats: any[] = [];
    for (let i = 0; i < ips.length; i += 1000) {
        const slice = ips.slice(i, i + 1000);
        const chunk = await prisma.firewallShunStats.findMany({
            where: { ip: { in: slice } }
        });
        stats.push(...chunk);
    }

    const blacklists = await prisma.guardianBlacklist.findMany({
        select: { ip: true }
    });

    const blacklistSet = new Set(blacklists.map(b => b.ip));
    const statsByIp = new Map<string, typeof stats>();
    for (const s of stats) {
        if (!statsByIp.has(s.ip)) statsByIp.set(s.ip, []);
        statsByIp.get(s.ip)!.push(s);
    }

    for (const ip of ips) {
        const ipStats = statsByIp.get(ip) || [];
        const activeFwNames = new Set<string>(ipStats.filter(s => s.isActive).map(s => s.firewall));
        const activeCount = activeFwNames.size;
        const missingFirewalls = fleet.filter(fw => !activeFwNames.has(fw.name));
        const isFullyProtected = fleet.length > 0 && activeCount >= fleet.length;
        const isPartiallyShunned = activeCount > 0 && activeCount < fleet.length;
        const isCleared = activeCount === 0;

        result.set(ip, {
            ip,
            configuredCount: fleet.length,
            activeCount,
            isFullyProtected,
            isPartiallyShunned,
            isCleared,
            activeFirewalls: Array.from(activeFwNames),
            missingFirewalls,
            blacklisted: blacklistSet.has(ip)
        });
    }

    return result;
}

/**
 * Executes a list of CLI commands inside a single SSH session per firewall.
 * Chunks commands in batches of 25 with prompt detection to avoid ASA/FTD buffer exhaustion.
 */
async function executeBatchOnFirewall(
    fw: FirewallNodeConfig,
    commands: string[],
    chunkSize = 25
): Promise<{ success: boolean; executedCount: number; error?: string; output: string }> {
    if (!fw.ip || !fw.user || !fw.pass) {
        return { success: false, executedCount: 0, error: "Missing SSH credentials or IP in FIREWALL_CONFIG", output: "" };
    }

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: fw.ip,
            username: fw.user,
            password: fw.pass,
            readyTimeout: 12000
        });

        return new Promise((resolve) => {
            ssh.requestShell().then((stream) => {
                let buffer = "";
                let fullLog = "";
                let hasError = false;

                stream.on("data", (d: any) => {
                    const chunk = d.toString();
                    buffer += chunk;
                    fullLog += chunk;
                });

                stream.stderr.on("data", (d: any) => {
                    hasError = true;
                    fullLog += d.toString();
                });

                const waitForPrompt = (timeoutMs = 12000) => {
                    return new Promise((res) => {
                        const start = Date.now();
                        const check = () => {
                            const trimmed = buffer.trim();
                            if (trimmed.endsWith(">") || trimmed.endsWith("#")) {
                                res(true);
                            } else if (Date.now() - start > timeoutMs) {
                                res(false);
                            } else {
                                setTimeout(check, 80);
                            }
                        };
                        check();
                    });
                };

                const run = async () => {
                    try {
                        await waitForPrompt(12000);
                        fullLog = "";

                        for (let i = 0; i < commands.length; i += chunkSize) {
                            const batch = commands.slice(i, i + chunkSize);
                            buffer = "";
                            stream.write(`${batch.join("\n")}\n`);
                            await waitForPrompt(10000);
                        }

                        stream.write("exit\n");
                        await new Promise(r => setTimeout(r, 400));
                        ssh.dispose();
                        resolve({
                            success: !hasError,
                            executedCount: commands.length,
                            output: fullLog.trim()
                        });
                    } catch (err: any) {
                        ssh.dispose();
                        resolve({
                            success: false,
                            executedCount: 0,
                            error: err.message,
                            output: fullLog.trim()
                        });
                    }
                };

                run();
            }).catch((err) => {
                ssh.dispose();
                resolve({ success: false, executedCount: 0, error: `Failed to open SSH shell: ${err.message}`, output: "" });
            });
        });
    } catch (err: any) {
        ssh.dispose();
        return { success: false, executedCount: 0, error: `SSH connection failed: ${err.message}`, output: "" };
    }
}

/**
 * Replicates an individual IP to all missing firewalls in the perimeter fleet.
 * Ensures that if an IP was shunned on FW1, FW2/FW3/FW4 receive the exact same shun.
 */
export async function replicateShunToFleet(
    ip: string,
    options?: {
        reason?: string;
        userId?: string;
        clientIp?: string;
    }
): Promise<ReplicateResult> {
    const cleanIp = ip.trim();
    if (isPrivateIp(cleanIp)) {
        return {
            success: false,
            ip: cleanIp,
            targetNodes: [],
            successfulNodes: [],
            failedNodes: [{ node: "N/A", error: "Safety Guardrail: Cannot shun RFC1918 or private IPs" }],
            isNowFullyProtected: false
        };
    }

    const coverageMap = await getFleetShunCoverage([cleanIp]);
    const cov = coverageMap.get(cleanIp);
    const fleet = getFleetFirewalls();

    if (!cov || cov.missingFirewalls.length === 0) {
        return {
            success: true,
            ip: cleanIp,
            targetNodes: [],
            successfulNodes: fleet.map(f => f.name),
            failedNodes: [],
            isNowFullyProtected: true
        };
    }

    const targetNodes = cov.missingFirewalls;
    const command = `shun ${cleanIp}`;
    const now = new Date();

    const nodeResults = await Promise.all(
        targetNodes.map(async (fw) => {
            const res = await executeBatchOnFirewall(fw, [command]);
            return {
                node: fw.name,
                fw,
                success: res.success,
                error: res.error,
                output: res.output
            };
        })
    );

    const successfulNodes: string[] = [];
    const failedNodes: { node: string; error: string }[] = [];

    // Ensure Master Record exists
    await prisma.shunDatabaseIp.upsert({
        where: { ip: cleanIp },
        create: { ip: cleanIp },
        update: {}
    });

    for (const r of nodeResults) {
        if (r.success) {
            successfulNodes.push(r.node);
            await prisma.firewallShunStats.upsert({
                where: {
                    ip_firewall: {
                        ip: cleanIp,
                        firewall: r.node
                    }
                },
                update: {
                    isActive: true,
                    lastSeen: now
                },
                create: {
                    ip: cleanIp,
                    firewall: r.node,
                    isActive: true,
                    firstSeen: now,
                    lastSeen: now,
                    daysShunned: 1
                }
            });
        } else {
            failedNodes.push({ node: r.node, error: r.error || "Execution failed" });
        }
    }

    const newActiveCount = cov.activeCount + successfulNodes.length;
    const isNowFullyProtected = newActiveCount >= fleet.length;

    // Audit and Action logging
    const reasonText = options?.reason || "Universal fleet shun replication across perimeter firewalls";
    await logAudit(
        "UNIVERSAL_SHUN_REPLICATE",
        `Replicated perimeter shun for ${cleanIp} to ${successfulNodes.length} missing firewalls (${successfulNodes.join(", ")}). Full protection: ${isNowFullyProtected ? "YES (4/4)" : "PARTIAL"}.`,
        options?.userId,
        options?.clientIp || "system"
    ).catch(() => {});

    await recordShunActionLog({
        action: "UNIVERSAL_REPLICATE",
        initiator: options?.userId || "Universal Fleet Synchronizer",
        clientIp: options?.clientIp || "system",
        reason: reasonText,
        targetFleet: `Missing nodes: ${successfulNodes.join(", ")}`,
        ips: [cleanIp],
        nodeVerifications: nodeResults.map(r => ({
            target: r.node,
            success: r.success,
            commandsCount: 1,
            promptConfirmed: r.success,
            hasErrors: !r.success,
            errorDetails: r.error,
            transcriptSnippet: r.output.slice(0, 150)
        })),
        verdict: isNowFullyProtected ? "CONFIRMED_ALL_NODES" : "PARTIAL_SUCCESS"
    }).catch(() => {});

    return {
        success: successfulNodes.length > 0,
        ip: cleanIp,
        targetNodes: targetNodes.map(t => t.name),
        successfulNodes,
        failedNodes,
        isNowFullyProtected
    };
}

/**
 * Universal Batch Reconciler:
 * Scans for partially-shunned IPs across the fleet and pushes missing shuns in batch.
 */
export async function replicateBatchToFleet(options: {
    mode: "specific" | "blacklist" | "all_partial";
    ips?: string[];
    limit?: number;
    userId?: string;
    clientIp?: string;
}): Promise<BatchUniversalizeResult> {
    const startTime = Date.now();
    const fleet = getFleetFirewalls();
    const limit = options.limit || 500;
    const errors: string[] = [];
    const replicatedByFirewall: Record<string, number> = {};
    for (const fw of fleet) replicatedByFirewall[fw.name] = 0;

    let targetIps: string[] = [];

    if (options.mode === "specific" && options.ips && options.ips.length > 0) {
        targetIps = options.ips.map(ip => ip.trim()).filter(ip => !isPrivateIp(ip));
    } else if (options.mode === "blacklist") {
        const [blacklisted, cveShuns] = await Promise.all([
            prisma.guardianBlacklist.findMany({ select: { ip: true } }),
            prisma.netscalerCveShun.findMany({ where: { status: "ACTIVE" }, select: { ip: true } })
        ]);
        const ipSet = new Set<string>();
        for (const b of blacklisted) if (!isPrivateIp(b.ip)) ipSet.add(b.ip);
        for (const c of cveShuns) if (!isPrivateIp(c.ip)) ipSet.add(c.ip);
        targetIps = Array.from(ipSet).slice(0, limit);
    } else {
        // all_partial mode: find all IPs active on at least 1 firewall but not all
        const activeStats = await prisma.firewallShunStats.groupBy({
            by: ["ip"],
            where: { isActive: true },
            _count: { firewall: true },
            having: {
                firewall: {
                    _count: {
                        lt: fleet.length
                    }
                }
            },
            orderBy: {
                ip: "asc"
            },
            take: limit
        });
        targetIps = activeStats.map((s: { ip: string }) => s.ip).filter((ip: string) => !isPrivateIp(ip));
    }

    if (targetIps.length === 0) {
        return {
            success: true,
            mode: options.mode,
            totalIpsProcessed: 0,
            totalShunCommandsSent: 0,
            replicatedByFirewall,
            errors: [],
            durationMs: Date.now() - startTime
        };
    }

    // Determine missing firewalls per IP
    const coverageMap = await getFleetShunCoverage(targetIps);
    const fwToIpsMap = new Map<string, string[]>();
    for (const fw of fleet) fwToIpsMap.set(fw.name, []);

    let totalCommandsNeeded = 0;
    for (const ip of targetIps) {
        const cov = coverageMap.get(ip);
        if (cov && cov.missingFirewalls.length > 0) {
            for (const missingFw of cov.missingFirewalls) {
                fwToIpsMap.get(missingFw.name)?.push(ip);
                totalCommandsNeeded++;
            }
        }
    }

    const now = new Date();

    // Execute batches per firewall in parallel (single connection per firewall)
    await Promise.all(
        fleet.map(async (fw) => {
            const missingIps = fwToIpsMap.get(fw.name) || [];
            if (missingIps.length === 0) return;

            const commands = missingIps.map(ip => `shun ${ip}`);
            const execResult = await executeBatchOnFirewall(fw, commands, 30);

            if (execResult.success || execResult.executedCount > 0) {
                replicatedByFirewall[fw.name] = missingIps.length;

                // Bulk upsert into master ShunDatabaseIp and FirewallShunStats
                for (const ip of missingIps) {
                    await prisma.shunDatabaseIp.upsert({
                        where: { ip },
                        create: { ip },
                        update: {}
                    });

                    await prisma.firewallShunStats.upsert({
                        where: {
                            ip_firewall: {
                                ip,
                                firewall: fw.name
                            }
                        },
                        update: {
                            isActive: true,
                            lastSeen: now
                        },
                        create: {
                            ip,
                            firewall: fw.name,
                            isActive: true,
                            firstSeen: now,
                            lastSeen: now,
                            daysShunned: 1
                        }
                    });
                }
            } else {
                errors.push(`Firewall ${fw.name} failed: ${execResult.error || "Unknown execution error"}`);
            }
        })
    );

    const totalSent = Object.values(replicatedByFirewall).reduce((a, b) => a + b, 0);

    await logAudit(
        "UNIVERSAL_FLEET_BATCH_SYNC",
        `Batch universal fleet shun sync (${options.mode}) processed ${targetIps.length} IPs. Dispatched ${totalSent} shuns across missing firewalls.`,
        options.userId,
        options.clientIp || "system"
    ).catch(() => {});

    return {
        success: errors.length === 0,
        mode: options.mode,
        totalIpsProcessed: targetIps.length,
        totalShunCommandsSent: totalSent,
        replicatedByFirewall,
        errors,
        durationMs: Date.now() - startTime
    };
}

export interface PruneDormantResult {
    success: boolean;
    isDryRun: boolean;
    totalEligible: number;
    totalPruned: number;
    candidateSamples: Array<{ ip: string; org: string; country: string }>;
    prunedByFirewall: Record<string, number>;
    errors: string[];
    durationMs: number;
}

/**
 * Prunes dormant domestic US residential broadband IPs that have no VPN attacks
 * and zero active strikes, while strictly protecting all foreign and cloud/hosting IPs.
 */
export async function pruneDormantResidentialShuns(options?: {
    isDryRun?: boolean;
    limit?: number;
    userId?: string;
    clientIp?: string;
}): Promise<PruneDormantResult> {
    const startTime = Date.now();
    const isDryRun = Boolean(options?.isDryRun ?? true);
    const limit = options?.limit || 1500;
    const errors: string[] = [];

    // 1. Fetch active shuns
    const activeStats = await prisma.firewallShunStats.findMany({
        where: { isActive: true },
        select: { ip: true, firewall: true }
    });
    const uniqueActiveIps = Array.from(new Set(activeStats.map(s => s.ip)));

    // 2. Fetch metadata in safe 2,000-IP chunks to strictly prevent SQLite bind variable overflow (max 32,767)
    const shunIps: Array<{ ip: string; ipCountryCode: string | null; org: string | null }> = [];
    for (let i = 0; i < uniqueActiveIps.length; i += 2000) {
        const slice = uniqueActiveIps.slice(i, i + 2000);
        const chunk = await prisma.shunDatabaseIp.findMany({
            where: { ip: { in: slice } },
            select: { ip: true, ipCountryCode: true, org: true }
        });
        shunIps.push(...chunk);
    }

    // Threat sets with 0 bind variables to avoid parameter exhaustion on large fleets
    const [vpnEvents, blacklist, cve] = await Promise.all([
        prisma.vpnEvent.findMany({
            where: { status: "FAILURE" },
            distinct: ["sourceIp"],
            select: { sourceIp: true }
        }),
        prisma.guardianBlacklist.findMany({
            select: { ip: true }
        }),
        prisma.netscalerCveShun.findMany({
            where: { status: "ACTIVE" },
            select: { ip: true }
        })
    ]);

    const shunMap = new Map(shunIps.map(s => [s.ip, s]));
    const vpnSet = new Set(vpnEvents.map(v => v.sourceIp));
    const blSet = new Set([...blacklist.map(b => b.ip), ...cve.map(c => c.ip)]);

    const eligibleIps: string[] = [];
    const candidateSamples: Array<{ ip: string; org: string; country: string }> = [];

    for (const ip of uniqueActiveIps) {
        const s = shunMap.get(ip);
        const countryCode = s?.ipCountryCode || "UNRESOLVED";
        const org = s?.org || "";

        // STRICT SAFETY RULES:
        // Rule 1: Never remove Foreign (Non-US) IPs
        if (countryCode !== "US") continue;
        // Rule 2: Never remove Hosting / VPS / Cloud / Proxy ASNs
        if (!isResidential(org)) continue;
        // Rule 3: Never remove VPN Attackers
        if (vpnSet.has(ip)) continue;
        // Rule 4: Never remove Guardian Blacklist or CVE IOCs
        if (blSet.has(ip)) continue;

        eligibleIps.push(ip);
        if (candidateSamples.length < 50) {
            candidateSamples.push({ ip, org: org || "US Residential ISP", country: countryCode });
        }
    }

    const prunedByFirewall: Record<string, number> = {};
    const fleet = getFleetFirewalls();
    for (const fw of fleet) prunedByFirewall[fw.name] = 0;

    const targetsToPrune = eligibleIps.slice(0, limit);
    const targetSet = new Set(targetsToPrune);
    for (const stat of activeStats) {
        if (targetSet.has(stat.ip)) {
            prunedByFirewall[stat.firewall] = (prunedByFirewall[stat.firewall] || 0) + 1;
        }
    }

    const totalEvaluated = uniqueActiveIps.length;
    const totalProtected = totalEvaluated - eligibleIps.length;

    if (isDryRun || eligibleIps.length === 0) {
        return {
            success: true,
            isDryRun: true,
            totalEvaluated,
            totalProtected,
            totalEligible: eligibleIps.length,
            totalPruned: targetsToPrune.length,
            candidateSamples,
            prunedByFirewall,
            errors: [],
            durationMs: Date.now() - startTime
        };
    }

    // Execute Live Pruning on eligible IPs
    // Map which firewall has which target IP
    const fwToPruneIps = new Map<string, string[]>();
    for (const fw of fleet) fwToPruneIps.set(fw.name, []);

    for (const stat of activeStats) {
        if (targetSet.has(stat.ip)) {
            fwToPruneIps.get(stat.firewall)?.push(stat.ip);
        }
    }

    // Execute batch 'no shun' commands across firewalls in parallel
    await Promise.all(
        fleet.map(async (fw) => {
            const ipsForFw = fwToPruneIps.get(fw.name) || [];
            if (ipsForFw.length === 0) return;

            const commands = ipsForFw.map(ip => `no shun ${ip}`);
            const res = await executeBatchOnFirewall(fw, commands, 30);

            if (res.success || res.executedCount > 0) {
                prunedByFirewall[fw.name] = ipsForFw.length;
            } else {
                errors.push(`Firewall ${fw.name} failed during prune: ${res.error || "Unknown execution error"}`);
            }
        })
    );

    // Mark pruned records as inactive in FirewallShunStats in safe chunks
    for (let i = 0; i < targetsToPrune.length; i += 1000) {
        const slice = targetsToPrune.slice(i, i + 1000);
        await prisma.firewallShunStats.updateMany({
            where: { ip: { in: slice } },
            data: { isActive: false }
        });
    }

    await logAudit(
        "PRUNE_DORMANT_SHUNS",
        `Pruned ${targetsToPrune.length} dormant US residential shuns across perimeter firewalls (strictly keeping all Foreign, Hosting, and VPN attackers).`,
        options?.userId,
        options?.clientIp || "system"
    ).catch(() => {});

    return {
        success: errors.length === 0,
        isDryRun: false,
        totalEvaluated,
        totalProtected,
        totalEligible: eligibleIps.length,
        totalPruned: targetsToPrune.length,
        candidateSamples,
        prunedByFirewall,
        errors,
        durationMs: Date.now() - startTime
    };
}
