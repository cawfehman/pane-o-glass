import { NodeSSH } from "node-ssh";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { updateCreditInfoFromHeaders } from "./iplocate-credits";

function ipToLong(ip: string): number {
    return ip.split(".").reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

const NON_PUBLIC_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" },
    { start: "100.64.0.0", end: "100.127.255.255" },
    { start: "127.0.0.0", end: "127.255.255.255" },
    { start: "169.254.0.0", end: "169.254.255.255" },
    { start: "172.16.0.0", end: "172.31.255.255" },
    { start: "192.0.0.0", end: "192.0.0.255" },
    { start: "192.0.2.0", end: "192.0.2.255" },
    { start: "192.168.0.0", end: "192.168.255.255" },
    { start: "198.18.0.0", end: "198.19.255.255" },
    { start: "198.51.100.0", end: "198.51.100.255" },
    { start: "203.0.113.0", end: "203.0.113.255" },
    { start: "224.0.0.0", end: "239.255.255.255" },
    { start: "240.0.0.0", end: "255.255.255.255" }
];

export function isPrivateShunIp(ip: string): boolean {
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch {
        return false;
    }
}

export interface FirewallSyncResult {
    firewall: string;
    hostIp: string;
    success: boolean;
    activeShuns: number;
    newlyAdded: number;
    cleared: number;
    error?: string;
}

export interface ShunSyncResponse {
    success: boolean;
    syncedAt: string;
    durationMs: number;
    firewalls: FirewallSyncResult[];
    totalActiveShuns: number;
    uniqueActiveIps: number;
    newlyAddedTotal: number;
    clearedTotal: number;
    enrichedPrivateCount: number;
    enrichedPublicCount: number;
}

async function fetchShunsFromFirewall(fw: any): Promise<{ fwName: string; hostIp: string; ips: Set<string>; error?: string }> {
    const fwName = fw.name || fw.id || fw.ip;
    const hostIp = fw.ip;
    const fwIps = new Set<string>();
    const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;

    if (!fw.ip || !fw.user || !fw.pass) {
        return { fwName, hostIp: hostIp || "unknown", ips: fwIps, error: "Missing credentials or IP in FIREWALL_CONFIG" };
    }

    const ssh = new NodeSSH();
    try {
        await ssh.connect({
            host: fw.ip,
            username: fw.user,
            password: fw.pass,
            readyTimeout: 10000
        });

        const shellStream = await ssh.requestShell();
        let shellBuffer = "";

        await new Promise<void>((resolveShell, rejectShell) => {
            shellStream.on("data", (d: Buffer) => {
                shellBuffer += d.toString();
            });
            shellStream.on("error", (err: Error) => rejectShell(err));

            const executeCommand = (command: string, timeoutMs = 15000): Promise<string> => {
                shellBuffer = "";
                if (command !== null && command !== undefined) {
                    shellStream.write(command + "\n");
                }
                return new Promise((res) => {
                    const start = Date.now();
                    const check = () => {
                        const trimmed = shellBuffer.trim();
                        if (trimmed.endsWith(">") || trimmed.endsWith("#")) {
                            res(shellBuffer);
                        } else if (Date.now() - start > timeoutMs) {
                            res(shellBuffer);
                        } else {
                            setTimeout(check, 100);
                        }
                    };
                    check();
                });
            };

            const runTasks = async () => {
                try {
                    await executeCommand("", 10000);
                    const showOutput = await executeCommand("show shun", 120000);

                    const lines = showOutput.split("\n");
                    for (const line of lines) {
                        if (line.includes("shun ") || line.includes("Shun ") || line.includes("SRC_IP=")) {
                            const match = line.match(ipRegex);
                            if (match && match.length > 0) {
                                fwIps.add(match[0]);
                            }
                        }
                    }

                    shellStream.write("exit\n");
                    setTimeout(() => resolveShell(), 300);
                } catch (err) {
                    rejectShell(err);
                }
            };

            runTasks();
        });

        ssh.dispose();
        return { fwName, hostIp, ips: fwIps };
    } catch (err: any) {
        ssh.dispose();
        return { fwName, hostIp, ips: fwIps, error: err?.message || "SSH connection failed" };
    }
}

export async function enrichPendingShunIps(maxPublicToEnrich?: number): Promise<{ privateCount: number; publicCount: number }> {
    let localPrivateCount = 0;
    let enrichedCount = 0;

    const pendingIpsAll = await prisma.shunDatabaseIp.findMany({
        where: { enrichedAt: null },
        select: { ip: true }
    });

    for (const p of pendingIpsAll) {
        if (isPrivateShunIp(p.ip)) {
            await prisma.shunDatabaseIp.update({
                where: { ip: p.ip },
                data: {
                    ipAsn: "PRIVATE",
                    org: "RFC 1918 / Private Network",
                    ipCountry: "Internal Network",
                    city: "Private Subnet",
                    continent: "Internal",
                    enrichedAt: new Date()
                }
            });
            localPrivateCount++;
        }
    }

    // Check local IpLookupCache first for pending shun IPs (0 external API calls)
    const pendingRemaining = pendingIpsAll.filter(p => !isPrivateShunIp(p.ip));
    if (pendingRemaining.length > 0) {
        const cachedShuns = await prisma.ipLookupCache.findMany({
            where: { ip: { in: pendingRemaining.map(p => p.ip) } }
        });
        for (const cached of cachedShuns) {
            try {
                const data = JSON.parse(cached.rawJson);
                const asnString = typeof data.asn === "object" ? data.asn?.asn : data.asn;
                const orgString = typeof data.asn === "object" ? (data.asn?.name || data.asn?.org || data.org) : data.org;
                await prisma.shunDatabaseIp.update({
                    where: { ip: cached.ip },
                    data: {
                        ipAsn: asnString ? String(asnString) : null,
                        org: orgString ? String(orgString) : null,
                        ipCountry: data.country || null,
                        ipCountryCode: data.country_code || cached.countryCode || null,
                        city: data.city || cached.city || null,
                        continent: data.continent || null,
                        enrichedAt: new Date()
                    }
                });
                enrichedCount++;
            } catch {}
        }
    }

    let limitToEnrich = maxPublicToEnrich !== undefined ? maxPublicToEnrich : 200;

    const pendingPublicIps = await prisma.shunDatabaseIp.findMany({
        where: { enrichedAt: null },
        take: limitToEnrich,
        select: { ip: true }
    });

    if (pendingPublicIps.length > 0) {
        const ipList = pendingPublicIps.map(p => p.ip);
        let quotaExhausted = false;
        const apiKey = process.env.IPLOCATE_API_KEY;

        for (let i = 0; i < ipList.length && !quotaExhausted; i += 100) {
            const batch = ipList.slice(i, i + 100);
            const results: Record<string, any> = {};

            for (const batchIp of batch) {
                try {
                    const res = await axios.get(`https://www.iplocate.io/api/lookup/${batchIp}`, {
                        headers: apiKey ? { "X-API-KEY": apiKey } : {},
                        timeout: 5000
                    });
                    updateCreditInfoFromHeaders(res.headers).catch(() => {});
                    results[batchIp] = res.data;
                } catch (e: any) {
                    if (e.response?.status === 429) {
                        quotaExhausted = true;
                        break;
                    }
                }
            }

                for (const ip of batch) {
                    const data = results[ip];
                    if (data && data.country_code) {
                        const asnString = typeof data.asn === "object" ? data.asn?.asn : data.asn;
                        const orgString = typeof data.asn === "object" ? (data.asn?.name || data.asn?.org || data.org) : data.org;

                        await prisma.shunDatabaseIp.update({
                            where: { ip },
                            data: {
                                ipAsn: asnString ? String(asnString) : null,
                                org: orgString ? String(orgString) : null,
                                ipCountry: data.country,
                                ipCountryCode: data.country_code,
                                city: data.city,
                                continent: data.continent,
                                enrichedAt: new Date()
                            }
                        });

                        // Cache in IpLookupCache for other modules
                        await prisma.ipLookupCache.upsert({
                            where: { ip },
                            create: {
                                ip,
                                latitude: data.latitude || null,
                                longitude: data.longitude || null,
                                countryCode: data.country_code || null,
                                city: data.city || null,
                                subdivision: data.subdivision || null,
                                rawJson: JSON.stringify(data)
                            },
                            update: {
                                latitude: data.latitude || null,
                                longitude: data.longitude || null,
                                countryCode: data.country_code || null,
                                city: data.city || null,
                                subdivision: data.subdivision || null,
                                rawJson: JSON.stringify(data)
                            }
                        }).catch(() => {});
                        enrichedCount++;
                    } else if (!quotaExhausted) {
                        // Negative cache unresolved IP so subsequent sync runs do not re-query
                        await prisma.shunDatabaseIp.update({
                            where: { ip },
                            data: {
                                ipCountryCode: "UNRESOLVED",
                                enrichedAt: new Date()
                            }
                        }).catch(() => {});

                        const unresolvedData = { ip, country: "Unknown", country_code: "UNRESOLVED", city: "N/A", unresolved: true, timestamp: Date.now() };
                        await prisma.ipLookupCache.upsert({
                            where: { ip },
                            create: { ip, countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) },
                            update: { countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) }
                        }).catch(() => {});
                    }
                }
            }
        }

    return { privateCount: localPrivateCount, publicCount: enrichedCount };
}

export async function syncShunDatabase(options?: {
    triggeredByUserId?: string;
    clientIp?: string;
    inlinePublicEnrichLimit?: number;
    pruneOldSnapshots?: boolean;
}): Promise<ShunSyncResponse> {
    const startTime = Date.now();
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls: any[] = [];
    try {
        firewalls = JSON.parse(configStr);
    } catch {
        throw new Error("Invalid FIREWALL_CONFIG JSON in environment");
    }

    if (firewalls.length === 0) {
        throw new Error("No firewalls configured in FIREWALL_CONFIG");
    }

    const now = new Date();
    const todayString = now.toISOString().split("T")[0];
    const startOfToday = new Date(`${todayString}T00:00:00.000Z`);

    // 1. Poll all configured firewalls in parallel over SSH
    const sshResults = await Promise.all(firewalls.map(fw => fetchShunsFromFirewall(fw)));

    // 2. Ensure all discovered IPs exist in ShunDatabaseIp master table
    const allDiscoveredIps = new Set<string>();
    for (const res of sshResults) {
        if (!res.error) {
            for (const ip of res.ips) allDiscoveredIps.add(ip);
        }
    }

    if (allDiscoveredIps.size > 0) {
        const ipArray = Array.from(allDiscoveredIps);
        const existingMasterIps = await prisma.shunDatabaseIp.findMany({
            where: { ip: { in: ipArray } },
            select: { ip: true }
        });
        const existingMasterSet = new Set(existingMasterIps.map(e => e.ip));
        const missingMasterIps = ipArray.filter(ip => !existingMasterSet.has(ip));

        for (const ip of missingMasterIps) {
            await prisma.shunDatabaseIp.upsert({
                where: { ip },
                create: { ip },
                update: {}
            });
        }
    }

    const firewallResults: FirewallSyncResult[] = [];
    let newlyAddedTotal = 0;
    let clearedTotal = 0;

    // 3. Reconcile FirewallShunStats per firewall
    for (const res of sshResults) {
        const { fwName, hostIp, ips, error } = res;
        if (error) {
            // Preserve existing stats if this firewall was unreachable
            const existingActive = await prisma.firewallShunStats.count({
                where: { firewall: fwName, isActive: true }
            });
            firewallResults.push({
                firewall: fwName,
                hostIp,
                success: false,
                activeShuns: existingActive,
                newlyAdded: 0,
                cleared: 0,
                error
            });
            continue;
        }

        const existingStats = await prisma.firewallShunStats.findMany({
            where: { firewall: fwName }
        });
        const existingByIp = new Map(existingStats.map(s => [s.ip, s]));

        // Determine which previously-active shuns were cleared on this firewall
        const toClearIds: string[] = [];
        for (const stat of existingStats) {
            if (stat.isActive && !ips.has(stat.ip)) {
                toClearIds.push(stat.id);
            }
        }

        if (toClearIds.length > 0) {
            await prisma.firewallShunStats.updateMany({
                where: { id: { in: toClearIds } },
                data: { isActive: false }
            });
        }

        // Check existing snapshots today for this firewall to avoid duplicate daily snapshot rows
        const todaySnapshots = await prisma.firewallShunSnapshot.findMany({
            where: {
                firewall: fwName,
                snapshotDate: { gte: startOfToday }
            },
            select: { ip: true }
        });
        const snapshottedToday = new Set(todaySnapshots.map(s => s.ip));

        let newlyAddedForFw = 0;

        for (const ip of Array.from(ips)) {
            const existingStat = existingByIp.get(ip);
            if (existingStat) {
                const lastSeenStr = existingStat.lastSeen.toISOString().split("T")[0];
                const newDays = lastSeenStr !== todayString ? existingStat.daysShunned + 1 : existingStat.daysShunned;
                if (!existingStat.isActive) {
                    newlyAddedForFw++;
                }
                await prisma.firewallShunStats.update({
                    where: { id: existingStat.id },
                    data: {
                        lastSeen: now,
                        isActive: true,
                        daysShunned: newDays
                    }
                });
            } else {
                newlyAddedForFw++;
                await prisma.firewallShunStats.create({
                    data: {
                        ip,
                        firewall: fwName,
                        firstSeen: now,
                        lastSeen: now,
                        daysShunned: 1,
                        isActive: true
                    }
                });
            }

            if (!snapshottedToday.has(ip)) {
                await prisma.firewallShunSnapshot.create({
                    data: {
                        ip,
                        firewall: fwName,
                        snapshotDate: now
                    }
                });
            }
        }

        newlyAddedTotal += newlyAddedForFw;
        clearedTotal += toClearIds.length;

        firewallResults.push({
            firewall: fwName,
            hostIp,
            success: true,
            activeShuns: ips.size,
            newlyAdded: newlyAddedForFw,
            cleared: toClearIds.length
        });
    }

    // 4. Enrich private IPs + inline batch of public IPs
    const enrichResult = await enrichPendingShunIps(options?.inlinePublicEnrichLimit);

    // If inlinePublicEnrichLimit was capped, continue remaining enrichment in background
    if (options?.inlinePublicEnrichLimit !== undefined) {
        enrichPendingShunIps().catch(err => console.error("[shun-sync] Background enrichment error:", err));
    }

    // 5. Optional snapshot pruning (used by daily cron)
    if (options?.pruneOldSnapshots) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 365);
        await prisma.firewallShunSnapshot.deleteMany({
            where: { snapshotDate: { lt: cutoffDate } }
        });
    }

    const totalActiveShuns = await prisma.firewallShunStats.count({
        where: { isActive: true }
    });
    const activeIpGroups = await prisma.firewallShunStats.groupBy({
        by: ["ip"],
        where: { isActive: true }
    });

    if (options?.triggeredByUserId) {
        await logAudit(
            "SHUN_DB_MANUAL_SYNC",
            `Manual Shun Database sync completed (${totalActiveShuns} active shuns across ${firewallResults.filter(f => f.success).length}/${firewallResults.length} firewalls, +${newlyAddedTotal} new, -${clearedTotal} cleared).`,
            options.triggeredByUserId,
            options.clientIp || "internal"
        ).catch(() => {});
    }

    return {
        success: firewallResults.some(f => f.success),
        syncedAt: now.toISOString(),
        durationMs: Date.now() - startTime,
        firewalls: firewallResults,
        totalActiveShuns,
        uniqueActiveIps: activeIpGroups.length,
        newlyAddedTotal,
        clearedTotal,
        enrichedPrivateCount: enrichResult.privateCount,
        enrichedPublicCount: enrichResult.publicCount
    };
}
