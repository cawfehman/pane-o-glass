import { NodeSSH } from "node-ssh";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isPrivateIp } from "@/lib/iplocate";
import { recordShunActionLog, ShunNodeVerification } from "@/lib/shun-logger";

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

    const [stats, blacklists] = await Promise.all([
        prisma.firewallShunStats.findMany({
            where: { ip: { in: ips } }
        }),
        prisma.guardianBlacklist.findMany({
            where: { ip: { in: ips } },
            select: { ip: true }
        })
    ]);

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
