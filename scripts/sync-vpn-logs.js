const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const https = require('https');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const originalLog = console.log;
const originalError = console.error;

function log(msg) {
    const timestamp = new Date().toISOString();
    originalLog(`[VPN-SYNC][${timestamp}] ${msg}`);
}

function errorLog(msg, err) {
    const timestamp = new Date().toISOString();
    originalError(`[VPN-SYNC-ERROR][${timestamp}] ${msg}`, err || "");
}

// IP Utility functions
function ipToLong(ip) {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
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

function isPrivateIp(ip) {
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch (e) {
        return true; // Treat invalid format as private/skip
    }
}

// IPinfo Fetcher
function getIpInfo(ip) {
    return new Promise((resolve) => {
        if (isPrivateIp(ip)) {
            return resolve(null);
        }

        const token = process.env.IPINFO_TOKEN;
        if (!token) {
            return resolve(null);
        }

        const url = `https://api.ipinfo.io/lite/${ip}?token=${token}`;
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return resolve(null);
            }

            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData);
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => {
            resolve(null);
        });
    });
}

// Helper to parse duration string (e.g. 0h:05m:30s or 1d 0h:05m:30s) to seconds
function parseDuration(durationStr) {
    if (!durationStr) return null;
    
    let days = 0;
    const dayMatch = durationStr.trim().match(/(\d+)\s*d/i);
    if (dayMatch) {
        days = parseInt(dayMatch[1], 10);
    }
    
    const timeMatch = durationStr.trim().match(/(\d+)\s*h\s*:\s*(\d+)\s*m\s*:\s*(\d+)\s*s/i);
    if (timeMatch) {
        return (days * 86400) + parseInt(timeMatch[1], 10) * 3600 + parseInt(timeMatch[2], 10) * 60 + parseInt(timeMatch[3], 10);
    }
    
    const seconds = parseInt(durationStr, 10);
    return isNaN(seconds) ? null : seconds;
}

// Main sync logic
async function runSync() {
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (!rawUrl || !rawToken) {
        log("Sync skipped: Graylog configuration (GRAYLOG_URL, GRAYLOG_API_TOKEN) is not configured in .env");
        return;
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    
    const streamIds = rawStreams 
        ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
        : [];

    const signatures = '(MessageClass:FTD\\-6\\-113039 OR MessageClass:FTD\\-4\\-113019 OR MessageClass:FTD\\-6\\-113015 OR MessageClass:FTD\\-4\\-113015)';

    log(`Querying Graylog for VPN events (Streams configured: ${streamIds.length > 0 ? streamIds.join(', ') : 'None'})`);

    try {
        const searchUrl = `${url}/api/search/universal/relative`;
        
        // Support both username:password format and raw API token
        const authHeader = token.includes(":") 
            ? `Basic ${Buffer.from(token).toString("base64")}`
            : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        
        const agent = new https.Agent({ rejectUnauthorized: false });

        const params = new URLSearchParams();
        params.append("query", signatures);
        params.append("range", "2100");
        params.append("limit", "200");
        params.append("decorate", "false");
        for (const streamId of streamIds) {
            params.append("filter", `streams:${streamId}`);
        }

        const response = await axios.get(searchUrl, {
            params,
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            httpsAgent: agent,
            timeout: 15000
        });

        const data = response.data;
        const messages = data.messages || [];

        log(`Fetched ${messages.length} total messages from Graylog matching VPN criteria.`);

        // Regexes for FTD/ASA parsing (making the FTD/ASA header prefix optional in case Graylog stripped it)
        const connRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+))/i;
        const failRegex = /(?:%(?:FTD|ASA)-\d-113015:\s+)?AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
        const discRegex = /(?:Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+)|Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>).*?Duration:\s*([^,]+).*?Bytes\s+(?:Tx|xmt):\s*(\d+).*?Bytes\s+(?:Rx|rcv):\s*(\d+)/i;

        let addedCount = 0;

        for (const msgObj of messages) {
            const rawLog = msgObj.message?.message || "";
            const logTimestampStr = msgObj.message?.timestamp;
            if (!rawLog || !logTimestampStr) continue;

            const logTimestamp = new Date(logTimestampStr);

            let username = "";
            let sourceIp = "";
            let status = "SUCCESS";
            let duration = null;
            let bytesSent = null;
            let bytesReceived = null;
            let failureReason = null;

            if (rawLog.includes("113039") && connRegex.test(rawLog)) {
                const match = rawLog.match(connRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "SUCCESS";
                }
            } else if (rawLog.includes("113015") && failRegex.test(rawLog)) {
                const match = rawLog.match(failRegex);
                if (match) {
                    failureReason = match[1].trim();
                    username = match[2].trim();
                    sourceIp = match[3].trim();
                    status = "FAILURE";
                }
            } else if (rawLog.includes("113019") && discRegex.test(rawLog)) {
                const match = rawLog.match(discRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "DISCONNECT";
                    duration = parseDuration(match[7]);
                    bytesSent = parseFloat(match[8]);
                    bytesReceived = parseFloat(match[9]);
                }
            } else {
                continue;
            }

            if (!username || !sourceIp) continue;

            const bytesTotal = (bytesSent !== null || bytesReceived !== null) 
                ? (bytesSent || 0) + (bytesReceived || 0) 
                : null;

            // Deduplication: check if an event for same user/IP/status exists within 5 seconds of the timestamp
            const fiveSeconds = 5 * 1000;
            const rangeStart = new Date(logTimestamp.getTime() - fiveSeconds);
            const rangeEnd = new Date(logTimestamp.getTime() + fiveSeconds);

            const existing = await prisma.vpnEvent.findFirst({
                where: {
                    username,
                    sourceIp,
                    status,
                    createdAt: {
                        gte: rangeStart,
                        lte: rangeEnd
                    }
                }
            });

            if (existing) {
                // If it is a disconnect event and we now have a log with actual byte counts, update the existing record
                if (status === "DISCONNECT" && (!existing.bytesTotal || existing.bytesTotal === 0) && bytesTotal && bytesTotal > 0) {
                    await prisma.vpnEvent.update({
                        where: { id: existing.id },
                        data: {
                            bytesSent,
                            bytesReceived,
                            bytesTotal,
                            duration: duration || existing.duration
                        }
                    });
                }
                continue; // Skip creating a duplicate record
            }

            // Enrich IPinfo
            const ipInfo = await getIpInfo(sourceIp);

            await prisma.vpnEvent.create({
                data: {
                    username,
                    sourceIp,
                    status,
                    duration,
                    bytesSent,
                    bytesReceived,
                    bytesTotal,
                    failureReason,
                    ipAsn: ipInfo?.asn || null,
                    ipAsName: ipInfo?.as_name || null,
                    ipAsDomain: ipInfo?.as_domain || null,
                    ipCountry: ipInfo?.country || null,
                    ipCountryCode: ipInfo?.country_code || null,
                    createdAt: logTimestamp
                }
            });

            addedCount++;
        }

        log(`Sync finished. Saved ${addedCount} new VPN events to database.`);

        // Record successful job status log
        await prisma.backgroundJob.upsert({
            where: { name: "Graylog VPN Sync" },
            update: {
                lastRun: new Date(),
                status: "SUCCESS",
                message: `Automated run. Added ${addedCount} new events.`
            },
            create: {
                name: "Graylog VPN Sync",
                status: "SUCCESS",
                message: `Automated run init. Added ${addedCount} new events.`
            }
        });

    } catch (err) {
        errorLog("Error during background sync:", err);
        try {
            await prisma.backgroundJob.upsert({
                where: { name: "Graylog VPN Sync" },
                update: {
                    lastRun: new Date(),
                    status: "FAILURE",
                    message: `Automated run error: ${err.message}`
                },
                create: {
                    name: "Graylog VPN Sync",
                    status: "FAILURE",
                    message: `Automated run error init: ${err.message}`
                }
            });
        } catch (e) {
            errorLog("Failed to write failure log to database:", e);
        }
    }
}

// Check execution mode (Daemon vs Cron Job)
if (process.argv.includes('--once')) {
    log("Running sync once (Cron mode)...");
    runSync()
        .then(() => prisma.$disconnect())
        .catch(err => {
            errorLog("Cron run failed:", err);
            prisma.$disconnect();
            process.exit(1);
        });
} else {
    // Polling Loop (Run every 5 minutes / 300 seconds)
    const INTERVAL_MS = 5 * 60 * 1000;

    async function startPolling() {
        log("Starting background Graylog VPN Sync Daemon...");
        // Initial run
        await runSync();

        setInterval(async () => {
            log("Executing scheduled poll...");
            await runSync();
        }, INTERVAL_MS);
    }

    startPolling().catch(err => {
        errorLog("Daemon crashed:", err);
        prisma.$disconnect();
    });
}
