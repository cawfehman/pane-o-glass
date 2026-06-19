const { PrismaClient } = require('@prisma/client');
const path = require('path');
const https = require('https');
const axios = require('axios');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

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
        return true;
    }
}

function getIpInfo(ip) {
    return new Promise((resolve) => {
        if (isPrivateIp(ip)) return resolve(null);

        const token = process.env.IPINFO_TOKEN;
        if (!token) return resolve(null);

        const url = `https://api.ipinfo.io/lite/${ip}?token=${token}`;
        https.get(url, (res) => {
            if (res.statusCode !== 200) return resolve(null);

            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(rawData));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => {
            resolve(null);
        });
    });
}

async function runHistoricalSync() {
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (!rawUrl || !rawToken) {
        console.error("Graylog URL and Token must be configured in .env");
        process.exit(1);
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    
    const streamIds = rawStreams 
        ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
        : [];

    const signatures = '(MessageClass:FTD\\-6\\-113039 OR MessageClass:FTD\\-4\\-113019 OR MessageClass:FTD\\-6\\-113015 OR MessageClass:FTD\\-4\\-113015 OR MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051 OR MessageClass:FTD\\-6\\-113005 OR MessageClass:ASA\\-6\\-113005 OR MessageClass:FTD\\-6\\-750002 OR MessageClass:FTD\\-6\\-750003)';
    
    const connRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+))/i;
    const failRegex = /(?:%(?:FTD|ASA)-\d-113015:\s+)?AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
    const failRegex113005 = /AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+server\s+=\s+[^\s]+\s+:\s+user\s+=\s+(.+?)\s+:\s+user\s+IP\s+=\s+([^\s]+)/i;
    const discRegex = /(?:Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+)|Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>).*?Duration:\s*([^,]+).*?Bytes\s+(?:Tx|xmt):\s*(\d+).*?Bytes\s+(?:Rx|rcv):\s*(\d+)/i;
    const ipAssignRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>\s+(?:IPv4\s+)?Address\s+<([^>]+)>(?:\s+IPv6\s+address\s+<[^>]*>)?\s+assigned\s+to\s+session|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+),\s*(?:IPv4\s*)?Address\s*=\s*([^\s,]+)(?:\s*,\s*IPv6\s*address\s*=\s*[^\s,]+)?\s*assigned\s*to\s*session)/i;
    
    // IKEv2 IPSec Regexes
    const ikev2ConnRegex = /Local:\s*([^\s:]+)(?::\d+)?\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+SA\s+UP/i;
    const ikev2LeaseRegex = /Local:\s*[^\s]+\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+Group:\s*[^\s]+\s+(?:IPv4\s+)?Address:\s*<([^>]+)>/i;

    const authHeader = token.includes(":") 
        ? `Basic ${Buffer.from(token).toString("base64")}`
        : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
    const agent = new https.Agent({ rejectUnauthorized: false });

    // Determine day range from command line arguments (e.g. node sync-vpn-historical.js 45)
    let daysToSync = 30;
    const args = process.argv.slice(2);
    const parsedDays = parseInt(args[0], 10);
    if (!isNaN(parsedDays) && parsedDays > 0) {
        daysToSync = parsedDays;
    }

    // Loop through the last N days, day-by-day
    console.log(`Starting ${daysToSync}-day historical VPN log sync...`);
    
    let totalImported = 0;

    for (let dayOffset = daysToSync; dayOffset >= 0; dayOffset--) {
        const toDate = new Date();
        toDate.setDate(toDate.getDate() - dayOffset);
        
        const fromDate = new Date(toDate);
        fromDate.setDate(fromDate.getDate() - 1);

        const fromIso = fromDate.toISOString();
        const toIso = toDate.toISOString();

        console.log(`\nFetching logs from: ${fromIso} to: ${toIso}...`);

        try {
            const searchUrl = `${url}/api/search/universal/absolute`;
            const params = new URLSearchParams();
            params.append("query", signatures);
            params.append("from", fromIso);
            params.append("to", toIso);
            params.append("limit", "5000"); // Fetch all events in this 24h chunk
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
                timeout: 30000
            });

            const messages = response.data?.messages || [];
            console.log(`Fetched ${messages.length} messages for this day.`);

            let importedThisDay = 0;

            for (const msgObj of messages) {
                const rawLog = msgObj.message?.message || "";
                const logTimestampStr = msgObj.message?.timestamp;
                if (!rawLog || !logTimestampStr) continue;

                const logTimestamp = new Date(logTimestampStr);

                let username = "";
                let sourceIp = "";
                let assignedIp = null;
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
                } else if (rawLog.includes("722051") && ipAssignRegex.test(rawLog)) {
                    const match = rawLog.match(ipAssignRegex);
                    if (match) {
                        username = match[2] || match[6];
                        sourceIp = match[3] || match[7];
                        assignedIp = match[4] || match[8];
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
                } else if (rawLog.includes("113005") && failRegex113005.test(rawLog)) {
                    const match = rawLog.match(failRegex113005);
                    if (match) {
                        failureReason = match[1].trim();
                        username = match[2].trim();
                        sourceIp = match[3].trim();
                        status = "FAILURE";
                    }
                } else if (rawLog.includes("750002") && ikev2ConnRegex.test(rawLog)) {
                    const match = rawLog.match(ikev2ConnRegex);
                    if (match) {
                        username = match[3];
                        sourceIp = match[2];
                        status = "SUCCESS";
                    }
                } else if (rawLog.includes("750003") && ikev2LeaseRegex.test(rawLog)) {
                    const match = rawLog.match(ikev2LeaseRegex);
                    if (match) {
                        username = match[2];
                        sourceIp = match[1];
                        assignedIp = match[3];
                        status = "SUCCESS";
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

                // Check duplication: check if an event for same user/IP/status exists within 5 seconds of the timestamp
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
                    // If we got the assignedIp now (from 722051) and existing doesn't have it, update it
                    if (status === "SUCCESS" && assignedIp && !existing.assignedIp) {
                        await prisma.vpnEvent.update({
                            where: { id: existing.id },
                            data: { assignedIp }
                        });
                    }
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

                // Carry over assignedIp to disconnect events if not already present
                let finalAssignedIp = assignedIp;
                if (status === "DISCONNECT" && !finalAssignedIp) {
                    const recentSuccess = await prisma.vpnEvent.findFirst({
                        where: {
                            username,
                            sourceIp,
                            status: "SUCCESS",
                            assignedIp: { not: null },
                            createdAt: {
                                gte: new Date(logTimestamp.getTime() - 24 * 60 * 60 * 1000), // 24 hours back
                                lte: logTimestamp
                            }
                        },
                        orderBy: { createdAt: "desc" }
                    });
                    if (recentSuccess) {
                        finalAssignedIp = recentSuccess.assignedIp;
                    }
                }

                const ipInfo = await getIpInfo(sourceIp);

                await prisma.vpnEvent.create({
                    data: {
                        username,
                        sourceIp,
                        assignedIp: finalAssignedIp || assignedIp || null,
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

                importedThisDay++;
            }

            console.log(`Imported ${importedThisDay} new events for this day.`);
            totalImported += importedThisDay;

        } catch (err) {
            console.error(`Error fetching logs for day offset ${dayOffset}:`, err.message);
        }
    }

    console.log(`\nHistorical sync completed! Total new events imported: ${totalImported}`);
}

runHistoricalSync()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
