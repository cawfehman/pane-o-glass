const { NodeSSH } = require('node-ssh');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function runAutoUnshun() {
    const watchListStr = process.env.WATCH_IP_LIST || "";
    if (!watchListStr) {
        console.log("[GUARDIAN] No WATCH_IP_LIST defined in .env. Skipping scan.");
        return;
    }

    const watchList = watchListStr.split(',').map(ip => ip.trim());
    const configStr = process.env.FIREWALL_CONFIG || "[]";
    let firewalls = [];
    
    try {
        firewalls = JSON.parse(configStr);
    } catch (e) {
        console.error("[GUARDIAN] Failed to parse FIREWALL_CONFIG:", e.message);
        return;
    }

    console.log(`[GUARDIAN] Starting scan for ${watchList.length} protected IPs across ${firewalls.length} firewalls...`);

    for (const fw of firewalls) {
        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                host: fw.ip,
                username: fw.user,
                password: fw.pass,
                readyTimeout: 10000
            });

            // 1. Get current shun list
            const result = await ssh.execCommand('show shun');
            const output = result.stdout;
            
            // 2. Check for matches using regex to handle "shun (Interface) IP" format
            for (const ip of watchList) {
                // Regex looks for 'shun', then space, then anything in parentheses, then the IP
                const shunRegex = new RegExp(`shun\\s+\\([^)]+\\)\\s+${ip.replace(/\./g, '\\.')}\\s+`, 'i');
                
                if (shunRegex.test(output) || output.includes(`shun ${ip} `)) {
                    console.log(`[!!!] ALERT: Protected IP ${ip} found shunned on ${fw.name}. Removing now...`);
                    
                    // 3. Remove the shun
                    await ssh.execCommand(`no shun ${ip}`);
                    
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
