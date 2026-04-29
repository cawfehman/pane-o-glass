const { NodeSSH } = require('node-ssh');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// Standalone IP Metadata Lookup
async function getIpInfo(ip) {
    try {
        const response = await axios.get(`https://ipapi.co/${ip}/json/`);
        const d = response.data;
        return {
            asn: d.asn,
            as_name: d.org,
            as_domain: d.asn,
            country: d.country_name,
            country_code: d.country_code
        };
    } catch (e) {
        return null;
    }
}

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

    console.log(`[GUARDIAN] Starting scan...`);
    console.log(`[GUARDIAN] Monitoring: ${watchList.join(', ')}`);

    for (const fw of firewalls) {
        const ssh = new NodeSSH();
        try {
            await ssh.connect({
                host: fw.ip,
                username: fw.user,
                password: fw.pass,
                readyTimeout: 15000
            });

            console.log(`[GUARDIAN] Connected to ${fw.name}. Scanning...`);

            await new Promise((resolve, reject) => {
                ssh.requestShell().then((stream) => {
                    let buffer = "";
                    stream.on('data', (d) => {
                        buffer += d.toString();
                    });
                    
                    stream.on('close', () => resolve(true));
                    stream.on('error', (err) => reject(err));

                    const processQueue = async () => {
                        for (const ip of watchList) {
                            buffer = ""; // Clear buffer for this check
                            stream.write(`show shun ${ip}\n`);
                            
                            // Wait for output to settle
                            await new Promise(r => setTimeout(r, 1500));
                            
                            const lines = buffer.split('\n').map(l => l.trim().toLowerCase());
                            const match = lines.find(line => 
                                line.includes('shun') && 
                                line.includes(ip.toLowerCase()) && 
                                !line.includes('show') && 
                                !line.includes('not found')
                            );

                            if (match) {
                                console.log(`[!!!] TRUE MATCH: Found active shun for ${ip} on ${fw.name}. Removing...`);
                                
                                stream.write(`no shun ${ip}\n`);
                                await new Promise(r => setTimeout(r, 1000));
                                
                                // Enrichment & Logging
                                const ipInfo = await getIpInfo(ip);
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
                                console.log(`[GUARDIAN] Successfully unshunned and logged ${ip}.`);
                            }
                        }
                        stream.write("exit\n");
                    };

                    processQueue();
                }).catch(reject);
            });
            
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

// Execute once and exit
runAutoUnshun()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
