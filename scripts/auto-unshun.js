const { NodeSSH } = require('node-ssh');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const originalLog = console.log;
const originalError = console.error;

function getLogFile() {
    const today = new Date().toISOString().split('T')[0];
    return path.resolve(__dirname, `guardian-${today}.log`);
}

function cleanOldLogs() {
    try {
        const files = fs.readdirSync(__dirname);
        const logPattern = /^guardian-\d{4}-\d{2}-\d{2}\.log$/;
        const now = Date.now();
        const maxAgeMs = 14 * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (logPattern.test(file)) {
                const filePath = path.resolve(__dirname, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(filePath);
                }
            }
        }
    } catch (e) {
        originalError("[GUARDIAN] Failed to clean old logs:", e.message);
    }
}

// Clean old logs once when the script starts
cleanOldLogs();

function formatMsg(msg) {
    const ts = new Date().toISOString();
    return `[${ts}] ${msg}`;
}

console.log = (...args) => {
    const msg = args.join(' ');
    const formatted = formatMsg(msg);
    originalLog(formatted);
    fs.appendFileSync(getLogFile(), formatted + '\n');
};

console.error = (...args) => {
    const msg = args.join(' ');
    const formatted = formatMsg(msg);
    originalError(formatted);
    fs.appendFileSync(getLogFile(), formatted + '\n');
};

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
        try {
            await prisma.backgroundJob.upsert({
                where: { name: "Firewall Guardian" },
                update: { lastRun: new Date(), status: "INACTIVE" },
                create: { name: "Firewall Guardian", status: "INACTIVE" }
            });
        } catch (e) {
            console.error("[GUARDIAN] Failed to update heartbeat:", e.message);
        }
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

    let guardianStatus = "SUCCESS";

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
                        // Wait 3 seconds for login banner and prompt to settle
                        await new Promise(r => setTimeout(r, 3000));

                        for (const ip of watchList) {
                            buffer = ""; // Clear buffer for this check
                            stream.write(`show shun ${ip}\n`);
                            
                            // Wait for output to settle
                            await new Promise(r => setTimeout(r, 1500));
                            
                            console.log(`[GUARDIAN] Raw response for ${ip} on ${fw.name}: "${buffer.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);

                            const lines = buffer.split('\n').map(l => l.trim().toLowerCase());
                            const match = lines.find(line => 
                                line.includes('shun') && 
                                line.includes(ip.toLowerCase()) && 
                                !line.includes('show') && 
                                !line.includes('not found')
                            );

                            if (match) {
                                console.log(`[!!!] TRUE MATCH: Found active shun for ${ip} on ${fw.name}. Removing...`);
                                
                                buffer = ""; // Clear buffer before unshun
                                stream.write(`no shun ${ip}\n`);
                                await new Promise(r => setTimeout(r, 1500));
                                
                                const removeLines = buffer.split('\n').map(l => l.trim().toLowerCase());
                                const isError = removeLines.some(line => line.includes('error') || line.includes('invalid') || line.includes('incomplete'));
                                
                                if (isError) {
                                    console.error(`[GUARDIAN] FAILED to unshun ${ip} on ${fw.name}. Firewall response: ${buffer.trim().replace(/\n/g, ' ')}`);
                                    guardianStatus = "WARNING";
                                    await prisma.auditLog.create({
                                        data: {
                                            action: "AUTO_UNSHUN_FAILURE",
                                            details: `Guardian automated safety engine FAILED to clear unauthorized shun for IP: ${ip} on firewall ${fw.name}. Response: ${buffer.trim().replace(/\n/g, ' ')}`,
                                            userId: guardianUser.id,
                                            ipAddress: "internal-subagent"
                                        }
                                    });
                                    continue; // Skip logging success to DB
                                }
                                
                                console.log(`[GUARDIAN] Firewall confirmed unshun for ${ip} on ${fw.name}.`);
                                
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

                                // Write to master System Audit trail
                                await prisma.auditLog.create({
                                    data: {
                                        action: "AUTO_UNSHUN_TRIGGER",
                                        details: `Guardian automated safety engine successfully cleared unauthorized shun for critical watched asset IP: ${ip} on firewall ${fw.name}`,
                                        userId: guardianUser.id,
                                        ipAddress: "internal-subagent"
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
            guardianStatus = "WARNING";
            ssh.dispose();
        }
    }
    
    console.log("[GUARDIAN] Scan complete.");
    
    // 5. Update Heartbeat for Dashboard
    try {
        await prisma.backgroundJob.upsert({
            where: { name: "Firewall Guardian" },
            update: { lastRun: new Date(), status: guardianStatus },
            create: { name: "Firewall Guardian", status: guardianStatus }
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
