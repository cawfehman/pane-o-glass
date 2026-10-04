import { NodeSSH } from "node-ssh";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isPrivateIp, getIpInfoLite } from "@/lib/ipinfo";
import { NetscalerGraylogClient, DEFAULT_CITRIX_IOC_RULES, NetscalerIocRule, NetscalerMatchedIp } from "@/lib/netscaler-graylog";

export interface AutoShunResult {
    executed: boolean;
    autoShunEnabled: boolean;
    scannedLookbackSeconds: number;
    rulesEvaluated: number;
    newlyShunned: {
        ip: string;
        cve: string;
        ruleName: string;
        hits: number;
        countryCode?: string;
        cityName?: string;
        firewalls: string;
    }[];
    existingActiveUpdated: number;
    reShunnedCount: number;
    totalActiveShuns: number;
    errors: string[];
}

interface FwNodeResult {
    target: string;
    success: boolean;
    stdout: string;
    stderr: string;
}

/**
 * Execute command across configured Cisco ASA / Firepower firewall node(s).
 */
export async function executeFirewallCommand(command: string, targetHost: string = "all"): Promise<{
    success: boolean;
    targetLabel: string;
    results: FwNodeResult[];
}> {
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls: any[] = [];
    try {
        firewalls = JSON.parse(configStr);
    } catch {
        firewalls = [];
    }

    if (firewalls.length === 0) {
        return {
            success: false,
            targetLabel: "None (FIREWALL_CONFIG empty)",
            results: [{ target: "N/A", success: false, stdout: "", stderr: "FIREWALL_CONFIG not configured" }]
        };
    }

    let targetFws: any[] = [];
    let targetLabel = "";

    if (targetHost === "all") {
        targetFws = firewalls;
        targetLabel = "All Firewalls (Perimeter Fleet)";
    } else {
        const single = firewalls.find((fw: any) => fw.id === targetHost);
        if (!single) {
            targetFws = firewalls;
            targetLabel = "All Firewalls (Perimeter Fleet)";
        } else {
            targetFws = [single];
            targetLabel = single.name || single.ip;
        }
    }

    const results: FwNodeResult[] = await Promise.all(
        targetFws.map(async (fw): Promise<FwNodeResult> => {
            const sshHost = fw.ip;
            const username = fw.user;
            const password = fw.pass;
            const targetName = fw.name || sshHost;

            if (!username || !password || !sshHost) {
                return { target: targetName, success: false, stdout: "", stderr: "Missing credentials or IP" };
            }

            const ssh = new NodeSSH();
            try {
                await ssh.connect({
                    host: sshHost,
                    username,
                    password,
                    readyTimeout: 10000
                });

                return new Promise<FwNodeResult>((resolve) => {
                    ssh.requestShell().then((stream) => {
                        let output = "";
                        let errorOutput = "";

                        stream.on("data", (data: any) => { output += data.toString(); });
                        stream.stderr.on("data", (data: any) => { errorOutput += data.toString(); });

                        stream.on("close", () => {
                            ssh.dispose();
                            resolve({
                                target: targetName,
                                success: errorOutput.length === 0,
                                stdout: output.trim(),
                                stderr: errorOutput.trim()
                            });
                        });

                        const waitForPrompt = (timeoutMs = 12000) => {
                            return new Promise((res) => {
                                const start = Date.now();
                                const check = () => {
                                    const trimmed = output.trim();
                                    if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
                                        res(true);
                                    } else if (Date.now() - start > timeoutMs) {
                                        res(false);
                                    } else {
                                        setTimeout(check, 100);
                                    }
                                };
                                check();
                            });
                        };

                        const run = async () => {
                            await waitForPrompt(12000);
                            output = "";
                            stream.write(`${command}\n`);
                            await waitForPrompt(5000);
                            stream.write("exit\n");
                            await new Promise(r => setTimeout(r, 400));
                        };

                        run();
                    }).catch((err) => {
                        ssh.dispose();
                        resolve({ target: targetName, success: false, stdout: "", stderr: err.message });
                    });
                });
            } catch (err: any) {
                return { target: targetName, success: false, stdout: "", stderr: `SSH Error: ${err.message}` };
            }
        })
    );

    const overallSuccess = results.some(r => r.success);
    return { success: overallSuccess, targetLabel, results };
}

/**
 * Checks whether the automated NetScaler CVE-2026-88771/72 shunning engine is enabled.
 */
export async function isAutoShunEnabled(): Promise<boolean> {
    try {
        const setting = await prisma.netscalerCveSetting.findUnique({
            where: { key: "AUTO_SHUN_ENABLED" }
        });
        if (!setting) return false;
        return setting.value.toLowerCase() === "true";
    } catch {
        return false;
    }
}

/**
 * Toggles automated shunning on/off.
 */
export async function setAutoShunEnabled(enabled: boolean, modifiedBy?: string): Promise<boolean> {
    await prisma.netscalerCveSetting.upsert({
        where: { key: "AUTO_SHUN_ENABLED" },
        update: { value: enabled ? "true" : "false" },
        create: { key: "AUTO_SHUN_ENABLED", value: enabled ? "true" : "false" }
    });

    await logAudit(
        "NETSCALER_AUTO_SHUN_TOGGLE",
        `Automated NetScaler CVE-2026 shunning was ${enabled ? "ENABLED" : "PAUSED"} by ${modifiedBy || "Administrator"}.`
    ).catch(() => {});

    return enabled;
}

/**
 * Returns hunt rules specific to CVE-2026-88771 and CVE-2026-88772.
 */
export function getCve2026Rules(): NetscalerIocRule[] {
    return DEFAULT_CITRIX_IOC_RULES.filter(
        r => r.id.startsWith("cve-2026-") || (r.cve && r.cve.includes("2026"))
    );
}

/**
 * Core cycle: scans Graylog for CVE-2026-88771 & CVE-2026-88772 exploit attempts,
 * automatically pushes perimeter firewall shuns for external threat IPs,
 * and maintains dedicated tracking records.
 */
export async function runNetscalerCveAutoShunCycle(
    lookbackSeconds: number = 300,
    targetHost: string = "all"
): Promise<AutoShunResult> {
    const enabled = await isAutoShunEnabled();
    const cveRules = getCve2026Rules();
    const result: AutoShunResult = {
        executed: true,
        autoShunEnabled: enabled,
        scannedLookbackSeconds: lookbackSeconds,
        rulesEvaluated: cveRules.length,
        newlyShunned: [],
        existingActiveUpdated: 0,
        reShunnedCount: 0,
        totalActiveShuns: 0,
        errors: []
    };

    if (!enabled) {
        result.executed = false;
        return result;
    }

    try {
        const client = new NetscalerGraylogClient();
        const findings = await client.scanIocs(cveRules, lookbackSeconds);

        // Collect all matched external threat IPs grouped by IP
        const threatActorsByIp = new Map<string, {
            matched: NetscalerMatchedIp;
            rule: NetscalerIocRule;
        }>();

        for (const finding of findings) {
            if (finding.matchCount > 0 && finding.matchedExternalIps) {
                for (const matchedIp of finding.matchedExternalIps) {
                    const ip = matchedIp.ip.trim();
                    // Enforce safety guards: ignore internal or invalid IPs
                    if (isPrivateIp(ip)) continue;

                    const existing = threatActorsByIp.get(ip);
                    if (existing) {
                        existing.matched.count += matchedIp.count;
                    } else {
                        threatActorsByIp.set(ip, {
                            matched: { ...matchedIp },
                            rule: finding.rule
                        });
                    }
                }
            }
        }

        const candidateIps = Array.from(threatActorsByIp.keys());

        for (const ip of candidateIps) {
            const threat = threatActorsByIp.get(ip)!;
            const cveTag = threat.rule.cve || (threat.rule.id.includes("88772") ? "CVE-2026-88772" : "CVE-2026-88771");

            // Look up existing tracking record
            const existingRecord = await prisma.netscalerCveShun.findUnique({
                where: { ip }
            });

            if (existingRecord) {
                if (existingRecord.status === "ACTIVE") {
                    // Already shunned and active: update telemetry
                    await prisma.netscalerCveShun.update({
                        where: { ip },
                        data: {
                            matchCount: existingRecord.matchCount + threat.matched.count,
                            lastSeenAt: new Date(),
                            samplePayload: threat.matched.sampleMessage || existingRecord.samplePayload
                        }
                    });
                    result.existingActiveUpdated++;
                } else if (existingRecord.status === "REMOVED") {
                    // Previously un-shunned, but detected attacking again: Re-apply perimeter shun!
                    const fwExec = await executeFirewallCommand(`shun ${ip}`, targetHost);
                    await prisma.netscalerCveShun.update({
                        where: { ip },
                        data: {
                            status: "ACTIVE",
                            matchCount: existingRecord.matchCount + threat.matched.count,
                            shunnedAt: new Date(),
                            lastSeenAt: new Date(),
                            targetFirewalls: fwExec.targetLabel,
                            removedAt: null,
                            removedBy: null,
                            samplePayload: threat.matched.sampleMessage || existingRecord.samplePayload,
                            notes: `Re-shunned automatically: detected recurrence of ${threat.rule.name}`
                        }
                    });

                    await logAudit(
                        "NETSCALER_CVE_AUTO_SHUN_RECURRENCE",
                        `Re-applied perimeter shun for ${ip} on recurrence of ${threat.rule.name} (${cveTag}) across ${fwExec.targetLabel}.`
                    ).catch(() => {});

                    result.reShunnedCount++;
                    result.newlyShunned.push({
                        ip,
                        cve: cveTag,
                        ruleName: threat.rule.name,
                        hits: threat.matched.count,
                        countryCode: threat.matched.countryCode,
                        cityName: threat.matched.cityName,
                        firewalls: fwExec.targetLabel
                    });
                }
            } else {
                // New threat actor identified: execute immediate automatic perimeter firewall shun!
                const fwExec = await executeFirewallCommand(`shun ${ip}`, targetHost);

                await prisma.netscalerCveShun.create({
                    data: {
                        ip,
                        cve: cveTag,
                        ruleId: threat.rule.id,
                        ruleName: threat.rule.name,
                        matchCount: threat.matched.count,
                        countryCode: threat.matched.countryCode,
                        cityName: threat.matched.cityName,
                        samplePayload: threat.matched.sampleMessage?.slice(0, 1000),
                        targetFirewalls: fwExec.targetLabel,
                        status: "ACTIVE",
                        shunnedAt: new Date(),
                        lastSeenAt: new Date(),
                        notes: `Automated zero-day perimeter shun triggered by ${threat.rule.name}`
                    }
                });

                // Audit logging
                await logAudit(
                    "NETSCALER_CVE_AUTO_SHUN",
                    `Automated zero-day shun applied for ${ip} matching ${threat.rule.name} (${cveTag}) across ${fwExec.targetLabel}.`
                ).catch(() => {});

                // Record in dual history
                const ipInfo = await getIpInfoLite(ip).catch(() => null);
                await prisma.firewallQueryHistory.create({
                    data: {
                        command: "Apply Shun (Auto NetScaler CVE-2026)",
                        targetIp: ip,
                        targetName: fwExec.targetLabel,
                        ipAsn: ipInfo?.asn,
                        ipAsName: ipInfo?.as_name,
                        ipAsDomain: ipInfo?.as_domain,
                        ipCountry: ipInfo?.country,
                        ipCountryCode: ipInfo?.country_code
                    }
                }).catch(() => {});

                result.newlyShunned.push({
                    ip,
                    cve: cveTag,
                    ruleName: threat.rule.name,
                    hits: threat.matched.count,
                    countryCode: threat.matched.countryCode,
                    cityName: threat.matched.cityName,
                    firewalls: fwExec.targetLabel
                });
            }
        }

        // Count current total active shuns for this CVE
        result.totalActiveShuns = await prisma.netscalerCveShun.count({
            where: { status: "ACTIVE" }
        });

        // Update BackgroundJob status
        const cycleMsg = `Evaluated ${cveRules.length} CISA rules (${lookbackSeconds}s window). Auto-shunned ${result.newlyShunned.length} new IPs, updated ${result.existingActiveUpdated} active IPs. Total active CVE-2026 shuns: ${result.totalActiveShuns}.`;
        await prisma.backgroundJob.upsert({
            where: { name: "NetScaler CVE-2026 Auto-Shun Monitor" },
            update: { lastRun: new Date(), status: "SUCCESS", message: cycleMsg },
            create: { name: "NetScaler CVE-2026 Auto-Shun Monitor", status: "SUCCESS", message: cycleMsg }
        }).catch(() => {});

    } catch (err: any) {
        result.errors.push(err.message || "Failed auto-shun cycle");
        await prisma.backgroundJob.upsert({
            where: { name: "NetScaler CVE-2026 Auto-Shun Monitor" },
            update: { lastRun: new Date(), status: "FAILURE", message: err.message },
            create: { name: "NetScaler CVE-2026 Auto-Shun Monitor", status: "FAILURE", message: err.message }
        }).catch(() => {});
    }

    return result;
}

/**
 * Manually un-shuns an IP tracked under CVE-2026 and marks it as REMOVED.
 */
export async function unshunCveIp(ip: string, username?: string, notes?: string): Promise<{
    success: boolean;
    stdout: string;
    error?: string;
}> {
    const existing = await prisma.netscalerCveShun.findUnique({ where: { ip } });
    if (!existing) {
        return { success: false, stdout: "", error: "IP is not found in CVE-2026 tracking database." };
    }

    const fwExec = await executeFirewallCommand(`no shun ${ip}`, "all");

    await prisma.netscalerCveShun.update({
        where: { ip },
        data: {
            status: "REMOVED",
            removedAt: new Date(),
            removedBy: username || "analyst",
            notes: notes ? `${existing.notes || ''} | Unshun: ${notes}` : existing.notes
        }
    });

    await logAudit(
        "NETSCALER_CVE_MANUAL_UNSHUN",
        `Manual un-shun applied for ${ip} (tagged ${existing.cve}) by ${username || "analyst"}.`
    ).catch(() => {});

    return {
        success: fwExec.success,
        stdout: fwExec.results.map(r => `[${r.target}] ${r.stdout || 'OK'}`).join("\n")
    };
}

/**
 * Manually re-shuns an IP tracked under CVE-2026 and sets status back to ACTIVE.
 */
export async function reshunCveIp(ip: string, username?: string): Promise<{
    success: boolean;
    stdout: string;
    error?: string;
}> {
    const existing = await prisma.netscalerCveShun.findUnique({ where: { ip } });
    if (!existing) {
        return { success: false, stdout: "", error: "IP is not found in CVE-2026 tracking database." };
    }

    const fwExec = await executeFirewallCommand(`shun ${ip}`, "all");

    await prisma.netscalerCveShun.update({
        where: { ip },
        data: {
            status: "ACTIVE",
            shunnedAt: new Date(),
            removedAt: null,
            removedBy: null,
            notes: `Manually re-shunned by ${username || "analyst"}`
        }
    });

    await logAudit(
        "NETSCALER_CVE_MANUAL_RESHUN",
        `Manual re-shun applied for ${ip} (tagged ${existing.cve}) by ${username || "analyst"}.`
    ).catch(() => {});

    return {
        success: fwExec.success,
        stdout: fwExec.results.map(r => `[${r.target}] ${r.stdout || 'OK'}`).join("\n")
    };
}

/**
 * Returns summary metrics for CVE-2026 tracking.
 */
export async function getCveShunStats() {
    const [totalTracked, activeCount, removedCount, cve88771Count, cve88772Count, jobStatus, isEnabled] = await Promise.all([
        prisma.netscalerCveShun.count(),
        prisma.netscalerCveShun.count({ where: { status: "ACTIVE" } }),
        prisma.netscalerCveShun.count({ where: { status: "REMOVED" } }),
        prisma.netscalerCveShun.count({ where: { cve: { contains: "88771" } } }),
        prisma.netscalerCveShun.count({ where: { cve: { contains: "88772" } } }),
        prisma.backgroundJob.findUnique({ where: { name: "NetScaler CVE-2026 Auto-Shun Monitor" } }),
        isAutoShunEnabled()
    ]);

    return {
        totalTracked,
        activeCount,
        removedCount,
        cve88771Count,
        cve88772Count,
        lastCycleTime: jobStatus?.lastRun || null,
        lastCycleStatus: jobStatus?.status || "NEVER_RUN",
        lastCycleMessage: jobStatus?.message || null,
        autoShunEnabled: isEnabled
    };
}
