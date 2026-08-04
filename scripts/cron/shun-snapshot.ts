import { PrismaClient } from '@prisma/client';
import { NodeSSH } from 'node-ssh';
import * as dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

// Load environment variables for standalone script execution
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function run() {
    console.log(`[${new Date().toISOString()}] Starting daily Shun Snapshot & Enrichment Cron...`);
    try {
        const configStr = process.env.FIREWALL_CONFIG || "[]";
        let firewalls = [];
        try {
            firewalls = JSON.parse(configStr);
        } catch (e) {
            console.error("Invalid FIREWALL_CONFIG JSON");
            process.exit(1);
        }

        if (firewalls.length === 0) {
            console.log("No firewalls configured. Exiting.");
            process.exit(0);
        }

        const todayDate = new Date();
        const todayString = todayDate.toISOString().split('T')[0];

        // 1. Set all current Firewall stats to inactive
        console.log("Setting previous active shuns to inactive...");
        await prisma.firewallShunStats.updateMany({
            where: { isActive: true },
            data: { isActive: false }
        });

        // 2. SSH into firewalls and parse IPs
        const ipRegex = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g;
        
        for (const fw of firewalls) {
            if (!fw.ip || !fw.user || !fw.pass) continue;
            const fwName = fw.name || fw.id;
            console.log(`Connecting to firewall: ${fwName} (${fw.ip})...`);

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
                
                const fwIps = new Set<string>();
                
                await new Promise<void>((resolveShell, rejectShell) => {
                    shellStream.on('data', d => { shellBuffer += d.toString(); });
                    shellStream.on('error', err => rejectShell(err));

                    const executeCommand = (command: string, timeoutMs = 15000): Promise<string> => {
                        shellBuffer = ""; // Reset buffer
                        if (command !== null && command !== undefined) {
                            shellStream.write(command + "\n");
                        }
                        return new Promise((res) => {
                            const start = Date.now();
                            const check = () => {
                                const trimmed = shellBuffer.trim();
                                if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
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
                            // Wait for initial login prompt
                            await executeCommand("", 10000);

                            // Disable pager
                            await executeCommand("terminal pager 0", 5000);

                            // Run show shun
                            const showOutput = await executeCommand("show shun", 120000);
                            
                            // Process output
                            const lines = showOutput.split('\n');
                            for (const line of lines) {
                                if (line.includes('shun ') || line.includes('Shun ') || line.includes('SRC_IP=')) {
                                    const match = line.match(ipRegex);
                                    if (match && match.length > 0) {
                                        fwIps.add(match[0]);
                                    }
                                }
                            }

                            shellStream.write("exit\n");
                            setTimeout(() => resolveShell(), 500);
                        } catch (err) {
                            rejectShell(err);
                        }
                    };

                    runTasks();
                });

                ssh.dispose();
                console.log(`Found ${fwIps.size} shuns on ${fwName}. Updating database...`);

                // 3. Upsert into DB for this firewall
                for (const ip of Array.from(fwIps)) {
                    // Upsert Master
                    await prisma.shunDatabaseIp.upsert({
                        where: { ip },
                        create: { ip },
                        update: {}
                    });

                    // Upsert Stats for this firewall
                    const existingStat = await prisma.firewallShunStats.findUnique({
                        where: { ip_firewall: { ip, firewall: fwName } }
                    });

                    if (existingStat) {
                        const lastSeenStr = existingStat.lastSeen.toISOString().split('T')[0];
                        const newDays = lastSeenStr !== todayString ? existingStat.daysShunned + 1 : existingStat.daysShunned;
                        
                        await prisma.firewallShunStats.update({
                            where: { id: existingStat.id },
                            data: {
                                lastSeen: todayDate,
                                isActive: true,
                                daysShunned: newDays
                            }
                        });
                    } else {
                        await prisma.firewallShunStats.create({
                            data: {
                                ip,
                                firewall: fwName,
                                firstSeen: todayDate,
                                lastSeen: todayDate,
                                daysShunned: 1,
                                isActive: true
                            }
                        });
                    }

                    // Create Snapshot Audit Trail
                    await prisma.firewallShunSnapshot.create({
                        data: {
                            ip,
                            firewall: fwName,
                            snapshotDate: todayDate
                        }
                    });
                }
            } catch (err) {
                console.error(`[cron] Failed to process firewall ${fwName}:`, err);
                ssh.dispose();
            }
        }

        // 4. IPLocate Quota Engine
        console.log("Checking IPLocate enrichment queue...");
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);

        const queriesUsedToday = await prisma.ipLookupCache.count({
            where: { updatedAt: { gte: startOfUtcDay } }
        });

        const dailyQuota = 1000;
        const remainingQuota = Math.max(0, dailyQuota - queriesUsedToday);
        console.log(`IPLocate daily limit: ${dailyQuota}. Used today: ${queriesUsedToday}. Remaining quota: ${remainingQuota}.`);

        let enrichedCount = 0;
        
        if (remainingQuota > 0) {
            // Find unenriched IPs
            const pendingIps = await prisma.shunDatabaseIp.findMany({
                where: { enrichedAt: null },
                take: remainingQuota,
                select: { ip: true }
            });

            if (pendingIps.length > 0) {
                console.log(`Found ${pendingIps.length} pending IPs for enrichment. Processing batches...`);
                const ipList = pendingIps.map(p => p.ip);
                
                // Process in batches of 100
                for (let i = 0; i < ipList.length; i += 100) {
                    const batch = ipList.slice(i, i + 100);
                    const results: any = {};
                    const apiKey = process.env.IPLOCATE_API_KEY!;
                    for (const batchIp of batch) {
                        try {
                            const res = await axios.get(`https://www.iplocate.io/api/lookup/${batchIp}`, {
                                headers: apiKey ? { "X-API-KEY": apiKey } : {},
                                timeout: 5000
                            });
                            results[batchIp] = res.data;
                            
                            // Log the usage to AuditLog for dashboard usage tracking
                            await prisma.auditLog.create({
                                data: {
                                    action: "IPLOCATE_API_QUERY",
                                    details: `Executed lookup for IP: ${batchIp} via Shun Database Cron.`,
                                    ipAddress: batchIp
                                }
                            });
                        } catch (e: any) {
                            console.error(`Failed to enrich IP ${batchIp}:`, e.message);
                        }
                    }
                    
                    for (const ip of batch) {
                        const data = results[ip];
                        if (data && data.country_code) {
                            const asnString = typeof data.asn === 'object' ? data.asn?.asn : data.asn;
                            const orgString = typeof data.asn === 'object' ? (data.asn?.name || data.asn?.org || data.org) : data.org;
                            
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
                            enrichedCount++;
                        }
                    }
                    console.log(`Processed batch ${i} to ${i + batch.length}...`);
                }
            } else {
                console.log("No pending IPs require enrichment at this time.");
            }
        }

        // 5. Prune old snapshots (> 365 days)
        console.log("Pruning historical snapshots older than 365 days...");
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 365);
        
        const pruneResult = await prisma.firewallShunSnapshot.deleteMany({
            where: { snapshotDate: { lt: cutoffDate } }
        });
        console.log(`Pruned ${pruneResult.count} old snapshots.`);

        console.log(`[${new Date().toISOString()}] Cron executed successfully. Enriched ${enrichedCount} IPs today.`);
        process.exit(0);

    } catch (error: any) {
        console.error('[cron/shun-snapshot] Critical Error:', error);
        process.exit(1);
    }
}

run();
