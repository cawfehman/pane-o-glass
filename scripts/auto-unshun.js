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
                readyTimeout: 10000
            });

            for (const ip of watchList) {
                const checkCmd = `show shun ${ip}`;
                console.log(`[GUARDIAN] Executing on ${fw.name}: "${checkCmd}"`);
                
                const checkResult = await ssh.execCommand(checkCmd);
                const output = checkResult.stdout.trim();
                const error = checkResult.stderr.trim();
                
                if (error) console.log(`[DEBUG] Stderr from ${fw.name}: ${error}`);
                if (output) console.log(`[DEBUG] Stdout from ${fw.name}: ${output}`);

                // If output contains the IP, it is currently shunned
                const isMatch = output.toLowerCase().includes(ip.toLowerCase()) && 
                                !output.toLowerCase().includes("not found") && 
                                !output.toLowerCase().includes("no shun");

                if (isMatch) {
                    console.log(`[!!!] MATCH FOUND: ${ip} is shunned on ${fw.name}.`);
                    
                    const removeCmd = `no shun ${ip}`;
                    console.log(`[GUARDIAN] Executing removal: "${removeCmd}"`);
                    const removeResult = await ssh.execCommand(removeCmd);
                    
                    if (removeResult.stdout) console.log(`[DEBUG] Removal Output: ${removeResult.stdout.trim()}`);
                    if (removeResult.stderr) console.log(`[DEBUG] Removal Error: ${removeResult.stderr.trim()}`);
                    
                    // 4. Log to Global History List (Prisma)
                    await prisma.firewallQueryHistory.create({
                        data: {
                            userId: null, // System Action
                            command: "Auto-Unshun (Guardian)",
                            targetIp: ip,
                            targetName: fw.name,
                            ipAsn: "INTERNAL_WATCHLIST",
                            ipAsName: "Protected Asset",
                            ipAsDomain: "guardian.local"
                        }
                    });
                    
                    console.log(`[GUARDIAN] Successfully removed and logged shun for ${ip}.`);
                }
            }
            
            ssh.dispose();
        } catch (err) {
            console.error(`[GUARDIAN] Failed to connect to ${fw.name} (${fw.ip}):`, err.message);
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
