import { NodeSSH } from 'node-ssh';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import axios from 'axios';
import fs from 'fs';
import https from 'https';
import { Client } from 'ldapts';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function isAdUserValid(username) {
    const url = process.env.AD_URL;
    const bindDN = process.env.AD_BIND_DN;
    const bindPassword = process.env.AD_BIND_PASSWORD;
    const baseDN = process.env.AD_BASE_DN;
    const rejectUnauthorized = process.env.AD_LDAPS_REJECT_UNAUTHORIZED !== "false";

    if (!url || !bindDN || !bindPassword || !baseDN) {
        console.error("[GUARDIAN] AD configuration missing in environment variables.");
        return false;
    }

    const cleanUsername = username.toLowerCase().endsWith("@cooperhealth.edu")
        ? username.slice(0, -17)
        : username;

    const client = new Client({
        url,
        tlsOptions: url.startsWith("ldaps") ? { rejectUnauthorized } : undefined,
        timeout: 5000,
        connectTimeout: 5000,
    });

    try {
        await client.bind(bindDN, bindPassword);
        const { searchEntries } = await client.search(baseDN, {
            filter: `(|(sAMAccountName=${cleanUsername})(userPrincipalName=${cleanUsername}@cooperhealth.edu)(userPrincipalName=${username}))`,
            scope: "sub",
            attributes: ["dn"],
        });
        return searchEntries.length > 0;
    } catch (err) {
        console.error(`[GUARDIAN] AD check error for ${username}:`, err.message);
        return false;
    } finally {
        try {
            await client.unbind();
        } catch (e) {}
    }
}

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
        const response = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
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
    const args = process.argv.slice(2);
    let rangeSeconds = "240"; // 4 minutes default in seconds
    let limitCount = "100";
    
    const rangeIndex = args.indexOf("--range");
    if (rangeIndex !== -1 && args[rangeIndex + 1]) {
        const mins = parseInt(args[rangeIndex + 1], 10);
        if (!isNaN(mins)) {
            rangeSeconds = String(mins * 60);
        }
    }
    
    const limitIndex = args.indexOf("--limit");
    if (limitIndex !== -1 && args[limitIndex + 1]) {
        const lim = parseInt(args[limitIndex + 1], 10);
        if (!isNaN(lim)) {
            limitCount = String(lim);
        }
    }
    
    const isRecoveryMode = rangeSeconds !== "240";

    const watchListStr = process.env.WATCH_IP_LIST || "";
    const watchList = watchListStr.split(',').map(ip => ip.trim()).filter(ip => ip !== "");
    
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

    // Prune entries older than 30 days to maintain rolling window
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const pruned = await prisma.guardianEvent.deleteMany({
            where: { createdAt: { lt: thirtyDaysAgo } }
        });
        if (pruned.count > 0) {
            console.log(`[GUARDIAN] Pruned ${pruned.count} expired Guardian log entries older than 30 days.`);
        }
    } catch (pruneErr) {
        console.error("[GUARDIAN] Log pruning error:", pruneErr.message);
    }

    let guardianStatus = "SUCCESS";

    if (watchList.length > 0) {
        console.log(`[GUARDIAN] Monitoring Watch List: ${watchList.join(', ')}`);
        for (const fw of firewalls) {
            const ssh = new NodeSSH();
            try {
                await ssh.connect({
                    host: fw.ip,
                    username: fw.user,
                    password: fw.pass,
                    readyTimeout: 15000
                });

                console.log(`[GUARDIAN] Connected to ${fw.name}. Scanning watchlist...`);

            await new Promise((resolve, reject) => {
                ssh.requestShell().then((stream) => {
                    let buffer = "";
                    stream.on('data', (d) => {
                        buffer += d.toString();
                    });
                    
                    stream.on('close', () => resolve(true));
                    stream.on('error', (err) => reject(err));

                    const waitForPrompt = (timeoutMs = 15000) => {
                        return new Promise((resolve) => {
                            const start = Date.now();
                            const check = () => {
                                const trimmed = buffer.trim();
                                if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
                                    resolve(true);
                                } else if (Date.now() - start > timeoutMs) {
                                    resolve(false);
                                } else {
                                    setTimeout(check, 100);
                                }
                            };
                            check();
                        });
                    };

                    const processQueue = async () => {
                        // Wait for login banner and prompt to settle
                        await waitForPrompt(15000);

                        for (const ip of watchList) {
                            buffer = ""; // Clear buffer for this check
                            stream.write(`show shun ${ip}\n`);
                            
                            // Wait for output and next prompt to return
                            await waitForPrompt(5000);
                            
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
                                
                                // Wait for unshun and next prompt
                                await waitForPrompt(5000);
                                
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
                                    await prisma.guardianEvent.create({
                                        data: {
                                            ip,
                                            firewall: fw.name,
                                            action: "FAILED",
                                            reason: "WATCHLIST",
                                            details: `Guardian FAILED to clear watchlist asset shun for IP: ${ip} on firewall ${fw.name}. Response: ${buffer.trim().replace(/\n/g, ' ')}`
                                        }
                                    }).catch(() => {});
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

                                await prisma.guardianEvent.create({
                                    data: {
                                        ip,
                                        firewall: fw.name,
                                        action: "AUTO_UNSHUNNED",
                                        reason: "WATCHLIST",
                                        companyName: ipInfo?.as_name || "Protected Asset",
                                        companyType: "business",
                                        cidr: ipInfo?.as_domain || "watchlist",
                                        asn: ipInfo?.asn || "watchlist",
                                        details: `Guardian automated safety engine successfully cleared watchlist asset shun for IP: ${ip} on firewall ${fw.name}`
                                    }
                                }).catch(() => {});

                                console.log(`[GUARDIAN] Successfully unshunned and logged ${ip}.`);
                            }
                        }
                        stream.write("exit\n");
                        await new Promise(r => setTimeout(r, 500));
                        resolve(true);
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
    }
    
    // Graylog-driven Shun Monitoring & Auto-Unshun Action
    console.log("[GUARDIAN] Querying Graylog SIEM for %FTD-4-401002 (Shun added) logs...");
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (rawUrl && rawToken) {
        const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
        const token = rawToken.replace(/^"|"$/g, '');
        const streamIds = rawStreams 
            ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
            : [];

        const searchUrl = `${url}/api/search/universal/relative`;
        const authHeader = token.includes(":") 
            ? `Basic ${Buffer.from(token).toString("base64")}`
            : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        
        const agent = new https.Agent({ rejectUnauthorized: false });
        const streamsToQuery = streamIds.length > 0 ? streamIds : [null];

        let shunnedIps = new Set();
        let ipFirewalls = {};

        for (const streamId of streamsToQuery) {
            const params = new URLSearchParams();
            params.append("query", "401002");
            params.append("range", rangeSeconds); // query window in seconds
            params.append("limit", limitCount);
            params.append("decorate", "false");
            if (streamId) {
                params.append("filter", `streams:${streamId}`);
            }

            try {
                const response = await axios.get(searchUrl, {
                    params,
                    headers: {
                        "Authorization": authHeader,
                        "Accept": "application/json",
                        "X-Requested-By": "cli"
                    },
                    httpsAgent: agent,
                    timeout: 20000
                });

                const messages = response.data?.messages || [];
                for (const msgObj of messages) {
                    const rawLog = msgObj.message?.message || "";
                    const match = rawLog.match(/Shun\s+added:\s+([^\s]+)/i);
                    if (match) {
                        const ip = match[1];
                        shunnedIps.add(ip);
                        let sourceFw = msgObj.message?.source || "unknown";
                        if (!ipFirewalls[ip]) ipFirewalls[ip] = new Set();
                        ipFirewalls[ip].add(sourceFw);
                    }
                }
            } catch (e) {
                console.error(`[GUARDIAN] Failed to retrieve shun logs from stream ${streamId}:`, e.message);
                guardianStatus = "WARNING";
            }
        }

        console.log(`[GUARDIAN] Found ${shunnedIps.size} unique shunned IPs in Graylog in the last ${Math.round(parseInt(rangeSeconds, 10) / 60)} minutes.`);

        for (const ip of shunnedIps) {
            try {
                const alreadyChecked = await prisma.guardianEvent.findFirst({
                    where: {
                        ip,
                        createdAt: { gte: new Date(Date.now() - 300 * 1000) } // 5 mins window to match 2-minute cron frequency
                    }
                });

                if (!isRecoveryMode && alreadyChecked) {
                    console.log(`[GUARDIAN] IP ${ip} was already evaluated in this check interval. Skipping.`);
                    continue;
                }

                console.log(`[GUARDIAN] Evaluating shunned IP: ${ip}...`);

                const blacklistEntry = await prisma.guardianBlacklist.findUnique({
                    where: { ip }
                });

                if (blacklistEntry) {
                    console.log(`[GUARDIAN] IP ${ip} is on the do-not-unshun blacklist (reason: ${blacklistEntry.reason}). Skipping auto-unshun.`);
                    continue;
                }

                let cacheEntry = await prisma.ipLookupCache.findUnique({ where: { ip } });
                let ipData;
                if (cacheEntry) {
                    ipData = JSON.parse(cacheEntry.rawJson);
                } else {
                    const apiKey = process.env.IPLOCATE_API_KEY;
                    const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                        headers: apiKey ? { "X-API-KEY": apiKey } : {},
                        timeout: 5000
                    });
                    ipData = res.data;
                    
                    await prisma.ipLookupCache.create({
                        data: {
                            ip,
                            latitude: ipData.latitude || null,
                            longitude: ipData.longitude || null,
                            countryCode: ipData.country_code || null,
                            city: ipData.city || null,
                            subdivision: ipData.subdivision || null,
                            rawJson: JSON.stringify(ipData)
                        }
                    });

                    // Log IPLocate lookup to AuditLog for dashboard usage tracking
                    try {
                        const startOfUtcDay = new Date();
                        startOfUtcDay.setUTCHours(0, 0, 0, 0);
                        const dailyCount = await prisma.ipLookupCache.count({
                            where: { updatedAt: { gte: startOfUtcDay } }
                        });
                        await prisma.auditLog.create({
                            data: {
                                action: "IPLOCATE_API_QUERY",
                                details: `Executed lookup for IP: ${ip} via Guardian. Daily usage since 00:00 UTC: ${dailyCount} queries.`,
                                ipAddress: ip
                            }
                        });
                    } catch (auditErr) {
                        console.error("[GUARDIAN] Audit logging error:", auditErr.message);
                    }
                }

                const companyName = ipData.company?.name || ipData.asn?.name || ipData.org || "Unknown";
                const companyType = ipData.company?.type || ipData.asn?.type || "unknown";
                const cidr = ipData.asn?.route || ipData.network?.route || "unknown";
                const asn = typeof ipData.asn === 'object' ? (ipData.asn?.asn || "unknown") : (ipData.asn || "unknown");

                const successfulVpnCount = await prisma.vpnEvent.count({
                    where: { sourceIp: ip, status: "SUCCESS" }
                });
                const hasVpnHistory = successfulVpnCount > 0;
                
                const cleanComp = companyName.toLowerCase();
                const isIsp = companyType.toLowerCase() === "isp" || 
                              cleanComp.includes("telecom") || 
                              cleanComp.includes("communication") ||
                              cleanComp.includes("cable") ||
                              cleanComp.includes("broadband") ||
                              cleanComp.includes("isp") ||
                              cleanComp.includes("internet service");

                console.log(`[GUARDIAN] IP: ${ip} | Company: ${companyName} (${companyType}) | CIDR: ${cidr} | Has VPN Success: ${hasVpnHistory} | Is ISP: ${isIsp}`);

                let matchesUnshunCriteria = false;
                let matchReason = "";
                let shouldBlacklist = false;
                let blacklistReason = "";

                if (hasVpnHistory) {
                    matchesUnshunCriteria = true;
                    matchReason = "VPN_HISTORY";
                } else if (isIsp) {
                    const failedVpnEvents = await prisma.vpnEvent.findMany({
                        where: {
                            sourceIp: ip,
                            status: "FAILURE"
                        }
                    });

                    if (failedVpnEvents.length > 0) {
                        const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
                        const corporateFailures = failedVpnEvents.filter(evt => {
                            const cleanUname = evt.username.toLowerCase().endsWith("@cooperhealth.edu")
                                ? evt.username.slice(0, -17)
                                : evt.username;
                            return nameNameRegex.test(cleanUname);
                        });

                        if (corporateFailures.length === 0) {
                            shouldBlacklist = true;
                            blacklistReason = `Blocked: IP is an ISP with ${failedVpnEvents.length} failed login attempts, but none match the corporate username format (name-name or name-name-name).`;
                        } else {
                            console.log(`[GUARDIAN] Verifying ${corporateFailures.length} corporate-formatted usernames against Active Directory for ISP IP ${ip}...`);
                            let hasRealUser = false;
                            for (const failure of corporateFailures) {
                                const isValid = await isAdUserValid(failure.username);
                                if (isValid) {
                                    hasRealUser = true;
                                    console.log(`[GUARDIAN] AD check PASSED for username: ${failure.username}`);
                                    break;
                                } else {
                                    console.log(`[GUARDIAN] AD check FAILED for username: ${failure.username}`);
                                }
                            }

                            if (hasRealUser) {
                                matchesUnshunCriteria = true;
                                matchReason = "ISP_WITH_VALID_USER";
                            } else {
                                shouldBlacklist = true;
                                blacklistReason = `Blocked: Corporate-formatted usernames were tried but none exist in Active Directory.`;
                            }
                        }
                    }
                }

                // Check for repeated auto-unshuns in the last 2 hours
                if (matchesUnshunCriteria) {
                    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                    const recentUnshuns = await prisma.guardianEvent.count({
                        where: {
                            ip,
                            action: "AUTO_UNSHUNNED",
                            createdAt: { gte: twoHoursAgo }
                        }
                    });

                    if (recentUnshuns >= 2) {
                        matchesUnshunCriteria = false;
                        shouldBlacklist = true;
                        blacklistReason = `Blocked: Repeated auto-unshuns detected (${recentUnshuns} times in the last 2 hours).`;
                    }
                }

                if (shouldBlacklist) {
                    console.log(`[GUARDIAN] ${blacklistReason} Adding IP to blacklist and retaining shun.`);
                    try {
                        await prisma.guardianBlacklist.upsert({
                            where: { ip },
                            update: { reason: blacklistReason },
                            create: { ip, reason: blacklistReason }
                        });

                        await prisma.auditLog.create({
                            data: {
                                action: "GUARDIAN_BLACKLIST_ADD",
                                details: `Guardian safety engine blacklisted IP: ${ip}. Reason: ${blacklistReason}`,
                                userId: guardianUser.id,
                                ipAddress: ip
                            }
                        });
                    } catch (dbErr) {
                        console.error("[GUARDIAN] Failed to upsert blacklist entry or log audit:", dbErr.message);
                    }

                    await prisma.guardianEvent.create({
                        data: {
                            ip,
                            action: "SKIPPED",
                            reason: "DO_NOT_UNSHUN",
                            companyName,
                            companyType,
                            cidr,
                            asn,
                            details: blacklistReason
                        }
                    }).catch(() => {});
                } else if (matchesUnshunCriteria) {
                    const reason = matchReason;
                    console.log(`[GUARDIAN] AUTO-UNSHUN MATCH: IP ${ip} matches due to ${reason}. Clearing shuns...`);

                     for (const fw of firewalls) {
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
                            
                            await new Promise((resolveShell, rejectShell) => {
                                shellStream.on('data', d => { shellBuffer += d.toString(); });
                                shellStream.on('close', () => resolveShell(true));
                                shellStream.on('error', err => rejectShell(err));

                                const executeCommand = (command, timeoutMs = 15000) => {
                                    shellBuffer = ""; // Reset buffer
                                    if (command !== null && command !== undefined) {
                                        shellStream.write(command + "\n");
                                    }
                                    return new Promise((resolve) => {
                                        const start = Date.now();
                                        const check = () => {
                                            const trimmed = shellBuffer.trim();
                                            if (trimmed.endsWith('>') || trimmed.endsWith('#')) {
                                                resolve(shellBuffer);
                                            } else if (Date.now() - start > timeoutMs) {
                                                resolve(shellBuffer);
                                            } else {
                                                setTimeout(check, 100);
                                            }
                                        };
                                        check();
                                    });
                                };

                                const runTasks = async () => {
                                    try {
                                        // 1. Wait for initial login prompt
                                        await executeCommand("");

                                        // 2. Run show shun and wait dynamically for prompt to settle
                                        const showOutput = await executeCommand(`show shun ${ip}`);
                                        const lines = showOutput.split('\n').map(l => l.trim().toLowerCase());
                                        const match = lines.find(line => 
                                            line.includes('shun') && 
                                            line.includes(ip.toLowerCase()) && 
                                            !line.includes('show') && 
                                            !line.includes('not found')
                                        );

                                        if (match) {
                                            console.log(`[GUARDIAN] Found active shun for ${ip} on ${fw.name}. Clearing...`);
                                            
                                            // 3. Clear shun and wait dynamically for completion prompt
                                            await executeCommand(`no shun ${ip}`);

                                            // 4. Log results
                                            await prisma.guardianEvent.create({
                                                data: {
                                                    ip,
                                                    firewall: fw.name,
                                                    action: "AUTO_UNSHUNNED",
                                                    reason,
                                                    companyName,
                                                    companyType,
                                                    cidr,
                                                    asn,
                                                    details: `Automatically cleared shun for IP: ${ip} on firewall ${fw.name} due to ${reason}. Company: ${companyName} (${companyType}), CIDR: ${cidr}.`
                                                }
                                            }).catch(() => {});

                                            await prisma.firewallQueryHistory.create({
                                                data: {
                                                    userId: guardianUser.id,
                                                    command: "Auto-Unshun (Guardian)",
                                                    targetIp: ip,
                                                    targetName: fw.name,
                                                    ipAsn: asn,
                                                    ipAsName: companyName,
                                                    ipAsDomain: ipData.company?.domain || "iplocate.io",
                                                    ipCountry: ipData.country || "US",
                                                    ipCountryCode: ipData.country_code || "US"
                                                }
                                            });
                                        } else {
                                            console.log(`[GUARDIAN] Shun not present for ${ip} on ${fw.name}. Skipping clear/log.`);
                                        }

                                        // 5. Exit cleanly
                                        shellStream.write("exit\n");
                                        await new Promise(r => setTimeout(r, 500));
                                        resolveShell(true);
                                    } catch (err) {
                                        rejectShell(err);
                                    }
                                };

                                runTasks();
                            });
                            ssh.dispose();
                        } catch (err) {
                            console.error(`[GUARDIAN] Failed to clear shun for ${ip} on firewall ${fw.name}:`, err.message);
                            ssh.dispose();
                            
                            await prisma.guardianEvent.create({
                                data: {
                                    ip,
                                    firewall: fw.name,
                                    action: "FAILED",
                                    reason,
                                    companyName,
                                    companyType,
                                    cidr,
                                    asn,
                                    details: `Failed to clear shun on firewall ${fw.name}. Error: ${err.message}`
                                }
                            });
                        }
                    }

                    await prisma.auditLog.create({
                        data: {
                            action: "GUARDIAN_AUTO_UNSHUN",
                            details: `Guardian automated safety engine successfully cleared shun for IP: ${ip} due to ${reason}. Company: ${companyName}.`,
                            userId: guardianUser.id,
                            ipAddress: "internal-subagent"
                        }
                    });
                } else {
                    console.log(`[GUARDIAN] Retaining shun for IP: ${ip}. Does not qualify for auto-unshun.`);
                    await prisma.guardianEvent.create({
                        data: {
                            ip,
                            action: "SKIPPED",
                            reason: "NONE",
                            companyName,
                            companyType,
                            cidr,
                            asn,
                            details: `Retained shun for IP: ${ip}. No successful VPN history and no valid Active Directory username attempts from ISP.`
                        }
                    });
                }
            } catch (err) {
                console.error(`[GUARDIAN] Error evaluating IP ${ip}:`, err.message);
            }
        }
    } else {
        console.log("[GUARDIAN] Graylog configuration not fully set. Skipping shun scan.");
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
