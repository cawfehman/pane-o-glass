const { NodeSSH } = require('node-ssh');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function runAutoUnshun() {
    const watchListStr = process.env.WATCH_IP_LIST || "";
    const watchList = watchListStr.split(',').map(ip => ip.trim()).filter(ip => ip !== "");
    
    if (watchList.length === 0) {
        console.log("[GUARDIAN] No WATCH_IP_LIST defined in .env. Skipping scan.");
        return;
    }

    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls = [];
    
    try {
        firewalls = JSON.parse(configStr);
    } catch (e) {
        console.error("[GUARDIAN] Failed to parse FIREWALL_CONFIG:", e.message);
        return;
    }

    console.log(`[GUARDIAN] Starting scan...`);
    console.log(`[GUARDIAN] Monitoring: ${watchList.join(', ')}`);
    console.log(`[GUARDIAN] Target Firewalls: ${firewalls.length}`);

    for (const fw of firewalls) {
        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                host: fw.ip,
                username: fw.user,
                password: fw.pass,
                readyTimeout: 15000
            });

            console.log(`[GUARDIAN] Connected to ${fw.name}. Running scan...`);

            const shellOutput = await new Promise((resolve, reject) => {
                ssh.requestShell().then((stream) => {
                    let data = "";
                    stream.on('data', (d) => {
                        data += d.toString();
                    });
                    
                    stream.on('close', () => resolve(data));
                    stream.on('error', (err) => reject(err));

                    // 1. Run all checks and removals in one stream
                    for (const ip of watchList) {
                        stream.write(`show shun ${ip}\n`);
                    }
                    
                    // 2. Give it time to process all commands
                    setTimeout(() => {
                        stream.write("exit\n");
                    }, 3000); // 3 seconds to run all checks
                }).catch(reject);
            });

            if (process.env.DEBUG_GUARDIAN === "true") {
                console.log(`[DEBUG] Raw output from ${fw.name}:\n${shellOutput}`);
            }

            // 3. Post-process the single shell output for all matches
            const { getIpInfoLite } = require('../src/lib/ipinfo');
            
            // Get or Create Guardian User for the log
            let guardianUser = await prisma.user.findUnique({ where: { username: "Guardian" } });
            if (!guardianUser) {
                guardianUser = await prisma.user.create({
                    data: {
                        username: "Guardian",
                        role: "SYSTEM",
                        isExternal: false
                    }
                });
            }

            for (const ip of watchList) {
                const targetIp = ip.toLowerCase();
                const lines = shellOutput.split('\n').map(l => l.trim().toLowerCase());
                
                const match = lines.find(l => l.includes('shun') && l.includes(targetIp) && !l.includes("not found"));
                
                if (match) {
                    console.log(`[!!!] MATCH FOUND: ${ip} was shunned on ${fw.name}.`);
                    
                    const ipInfo = await getIpInfoLite(ip);

                    await new Promise((resolve) => {
                        ssh.requestShell().then((stream) => {
                            console.log(`[GUARDIAN] Removing shun for ${ip} on ${fw.name}...`);
                            stream.write(`no shun ${ip}\n`);
                            setTimeout(() => {
                                stream.write("exit\n");
                                resolve(true);
                            }, 2000);
                        }).catch(() => resolve(false));
                    });

                    // 4. Log to Global History List (Prisma)
                    await prisma.firewallQueryHistory.create({
                        data: {
                            userId: guardianUser.id,
                            command: "Auto-Unshun (Guardian)",
                            targetIp: ip,
                            targetName: fw.name,
                            ipAsn: ipInfo?.asn || "INTERNAL",
                            ipAsName: ipInfo?.as_name || "Protected Asset",
                            ipAsDomain: ipInfo?.as_domain || "guardian.local",
                            ipCountry: ipInfo?.country || "Internal",
                            ipCountryCode: ipInfo?.country_code || "IN"
                        }
                    });
                }
            }
            
            ssh.dispose();
        } catch (err) {
            console.error(`[GUARDIAN] Error on ${fw.name}: ${err.message}`);
            ssh.dispose();
        }
    }
    
    console.log("[GUARDIAN] Scan complete.");
    
    // 5. Update Heartbeat for Dashboard
    try {
        await prisma.backgroundJob.upsert({
            where: { name: "Firewall Guardian" },
            update: { lastRun: new Date(), status: "SUCCESS" },
            create: { name: "Firewall Guardian", status: "SUCCESS" }
        });
    } catch (e) {
        console.error("[GUARDIAN] Failed to update heartbeat:", e.message);
    }
}

// Execute once and exit (perfect for Task Scheduler or Cron)
runAutoUnshun()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
