import { prisma } from '../../src/lib/prisma';
import { NodeSSH } from 'node-ssh';
import { enrichIpsBatch } from '../../src/lib/iplocate';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables for standalone script execution
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

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

                // Request shell stream to bypass pager issues on ASA
                const shell = await ssh.requestShell();
                let output = '';
                shell.on('data', (data) => { output += data.toString('utf8'); });

                shell.write('terminal pager 0\n');
                shell.write('show shun\n');
                shell.write('exit\n');

                await new Promise((resolve) => {
                    shell.on('close', resolve);
                    setTimeout(resolve, 15000); // 15s timeout
                });
                
                const lines = output.split('\n');
                const fwIps = new Set<string>();

                for (const line of lines) {
                    if (line.includes('shun ') || line.includes('Shun ')) {
                        const match = line.match(ipRegex);
                        if (match && match.length > 0) {
                            fwIps.add(match[0]);
                        }
                    }
                }

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
                    const results = await enrichIpsBatch(batch);
                    
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
