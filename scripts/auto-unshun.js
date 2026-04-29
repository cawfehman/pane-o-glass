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
            for (const ip of watchList) {
                const targetIp = ip.toLowerCase();
                const lines = shellOutput.split('\n').map(l => l.trim().toLowerCase());
                
                // Find if any line contains 'shun' and our IP
                const match = lines.find(l => l.includes('shun') && l.includes(targetIp) && !l.includes("not found"));
                
                if (match) {
                    console.log(`[!!!] MATCH FOUND: ${ip} was shunned on ${fw.name}.`);
                    
                    // Since we already ran the checks, we need to run the REMOVALS now 
                    // We'll open one more shell for removals if needed, or just run them in the first pass
                    // To be safe, let's run them in a second interactive pass
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
                            userId: null,
                            command: "Auto-Unshun (Guardian)",
                            targetIp: ip,
                            targetName: fw.name,
                            ipAsn: "INTERNAL_WATCHLIST",
                            ipAsName: "Protected Asset",
                            ipAsDomain: "guardian.local"
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
