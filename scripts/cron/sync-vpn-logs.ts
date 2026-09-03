import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import dotenv from 'dotenv';
import { getBulkUserAdStatus } from '../../src/lib/ldap';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

const originalLog = console.log;
const originalError = console.error;

function log(msg: any) {
    const timestamp = new Date().toISOString();
    originalLog(`[VPN-SYNC][${timestamp}] ${msg}`);
}

function errorLog(msg, err) {
    const timestamp = new Date().toISOString();
    originalError(`[VPN-SYNC-ERROR][${timestamp}] ${msg}`, err || "");
}

// IP Utility functions
function ipToLong(ip: any) {
    if (!ip || typeof ip !== 'string') return 0;
    return ip.split('.').reduce((long: any, octet: any) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
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

function isPrivateIp(ip: any) {
    if (!ip || typeof ip !== 'string') return true;
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch (e: any) {
        return true; // Treat invalid format as private/skip
    }
}

// IP Enrichment Fetcher (Primary: IPLocate, Fallback: IPInfo Lite)
async function getIpInfo(ip: any): Promise<any> {
    if (!ip || isPrivateIp(ip)) {
        return null;
    }

    try {
        // 1. Check IpLookupCache in PostgreSQL first
        const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
        if (cached) {
            const raw = JSON.parse(cached.rawJson);
            return {
                asn: raw.asn?.asn || raw.asn || raw.as_number || null,
                as_name: raw.asn?.name || raw.company?.name || raw.org || raw.as_name || null,
                as_domain: raw.asn?.domain || raw.company?.domain || raw.as_domain || null,
                country: raw.country || null,
                country_code: raw.country_code || cached.countryCode || null,
                city: cached.city || raw.city || null
            };
        }

        // 2. Fetch live via iplocate.io API
        const apiKey = process.env.IPLOCATE_API_KEY;
        try {
            const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                headers: apiKey ? { "X-API-KEY": apiKey } : {},
                timeout: 5000
            });

            if (res?.data && (res.data.country || res.data.country_code)) {
                const d = res.data;
                const asnStr = d.asn?.asn || d.asn || null;
                const orgStr = d.asn?.name || d.company?.name || d.org || null;
                const domainStr = d.asn?.domain || d.company?.domain || null;
                const countryStr = d.country || null;
                const countryCodeStr = d.country_code || null;
                const cityStr = d.city || null;

                await prisma.ipLookupCache.upsert({
                    where: { ip },
                    update: {
                        latitude: d.latitude || null,
                        longitude: d.longitude || null,
                        countryCode: countryCodeStr,
                        city: cityStr,
                        subdivision: d.subdivision || null,
                        rawJson: JSON.stringify(d)
                    },
                    create: {
                        ip,
                        latitude: d.latitude || null,
                        longitude: d.longitude || null,
                        countryCode: countryCodeStr,
                        city: cityStr,
                        subdivision: d.subdivision || null,
                        rawJson: JSON.stringify(d)
                    }
                }).catch(() => {});

                return {
                    asn: asnStr,
                    as_name: orgStr,
                    as_domain: domainStr,
                    country: countryStr,
                    country_code: countryCodeStr,
                    city: cityStr
                };
            }
        } catch (e: any) {
            // iplocate failed/rate limited, try ipinfo.io fallback if IPINFO_TOKEN is set
            const ipinfoToken = process.env.IPINFO_TOKEN;
            if (ipinfoToken) {
                try {
                    const ipinfoRes = await axios.get(`https://api.ipinfo.io/lite/${ip}?token=${ipinfoToken}`, { timeout: 5000 });
                    if (ipinfoRes?.data) {
                        const d = ipinfoRes.data;
                        const asnStr = d.asn || null;
                        const orgStr = d.as_name || d.company?.name || null;
                        const domainStr = d.as_domain || null;
                        const countryStr = d.country || null;
                        const countryCodeStr = d.country_code || null;

                        await prisma.ipLookupCache.upsert({
                            where: { ip },
                            update: { countryCode: countryCodeStr, rawJson: JSON.stringify(d) },
                            create: { ip, countryCode: countryCodeStr, rawJson: JSON.stringify(d) }
                        }).catch(() => {});

                        return {
                            asn: asnStr,
                            as_name: orgStr,
                            as_domain: domainStr,
                            country: countryStr,
                            country_code: countryCodeStr,
                            city: null
                        };
                    }
                } catch (ipinfoErr) {}
            }
        }
    } catch (e: any) {
        console.error(`[VPN-SYNC] IP enrichment error for ${ip}:`, e.message);
    }
    return null;
}

// Helper to parse duration string (e.g. 0h:05m:30s or 1d 0h:05m:30s) to seconds
function parseDuration(durationStr: any) {
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
    const rawUrl = process.env.GRAYLOG_URL!;
    const rawToken = process.env.GRAYLOG_API_TOKEN!;
    const rawStreams = process.env.GRAYLOG_STREAM_ID!;

    if (!rawUrl || !rawToken) {
        log("Sync skipped: Graylog configuration (GRAYLOG_URL, GRAYLOG_API_TOKEN) is not configured in .env");
        return;
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    
    const streamIds = rawStreams 
        ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
        : [];

    const signatures = '(MessageClass:FTD\\-6\\-113039 OR MessageClass:ASA\\-6\\-113039 OR MessageClass:FTD\\-4\\-113019 OR MessageClass:ASA\\-4\\-113019 OR MessageClass:FTD\\-6\\-113015 OR MessageClass:ASA\\-6\\-113015 OR MessageClass:FTD\\-4\\-113015 OR MessageClass:ASA\\-4\\-113015 OR MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051 OR MessageClass:FTD\\-6\\-722022 OR MessageClass:ASA\\-6\\-722022 OR MessageClass:FTD\\-6\\-722023 OR MessageClass:ASA\\-6\\-722023 OR MessageClass:FTD\\-6\\-113005 OR MessageClass:ASA\\-6\\-113005 OR MessageClass:FTD\\-5\\-750002 OR MessageClass:FTD\\-6\\-750002 OR MessageClass:ASA\\-5\\-750002 OR MessageClass:ASA\\-6\\-750002 OR MessageClass:FTD\\-4\\-750003 OR MessageClass:FTD\\-6\\-750003 OR MessageClass:ASA\\-4\\-750003 OR MessageClass:ASA\\-6\\-750003 OR MessageClass:FTD\\-5\\-750006 OR MessageClass:FTD\\-6\\-750006 OR MessageClass:ASA\\-5\\-750006 OR MessageClass:ASA\\-6\\-750006 OR MessageClass:FTD\\-5\\-750007 OR MessageClass:FTD\\-6\\-750007 OR MessageClass:ASA\\-5\\-750007 OR MessageClass:ASA\\-6\\-750007 OR MessageClass:FTD\\-5\\-751025 OR MessageClass:FTD\\-6\\-751025 OR MessageClass:ASA\\-5\\-751025 OR MessageClass:ASA\\-6\\-751025 OR MessageClass:FTD\\-5\\-751026 OR MessageClass:FTD\\-6\\-751026 OR MessageClass:ASA\\-5\\-751026 OR MessageClass:ASA\\-6\\-751026 OR message:"113039" OR message:"113019" OR message:"722051" OR message:"722022" OR message:"722023" OR message:"113015")';

    log(`Querying Graylog for VPN events (Streams configured: ${streamIds.length > 0 ? streamIds.join(', ') : 'None'})`);

    try {
        const searchUrl = `${url}/api/search/universal/relative`;
        
        // Support both username:password format and raw API token
        const authHeader = token.includes(":") 
            ? `Basic ${Buffer.from(token).toString("base64")}`
            : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        
        const agent = new https.Agent({ rejectUnauthorized: false });

        let messages = [];
        const streamsToQuery = streamIds.length > 0 ? streamIds : [null];

        for (const streamId of streamsToQuery) {
            const params = new URLSearchParams();
            params.append("query", signatures);
            params.append("range", "2100");
            params.append("limit", "200");
            params.append("decorate", "false");
            if (streamId) {
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

            const streamMsgs = response.data?.messages || [];
            messages = messages.concat(streamMsgs);
        }

        // Sort merged messages chronologically (newest first)
        messages.sort((a: any, b: any) => {
            const tA = new Date(a.message?.timestamp || 0).getTime();
            const tB = new Date(b.message?.timestamp || 0).getTime();
            return tB - tA;
        });

        log(`Fetched ${messages.length} total messages from Graylog matching VPN criteria across all streams.`);

        // Regexes for FTD/ASA parsing (making the FTD/ASA header prefix optional in case Graylog stripped it)
        const connRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+))/i;
        const failRegex = /(?:%(?:FTD|ASA)-\d-113015:\s+)?AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
        const failRegex113005 = /AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+server\s+=\s+[^\s]+\s+:\s+user\s+=\s+(.+?)\s+:\s+user\s+IP\s+=\s+([^\s]+)/i;
        const discRegex = /(?:Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+)|Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>).*?Duration:\s*([^,]+),\s*(?:Rx\s*Rules:[^,]+,\s*Tx\s*Rules:[^,]+,\s*)?Bytes\s+(?:Tx|xmt):\s*(\d+),\s*Bytes\s+(?:Rx|rcv):\s*(\d+)/i;
        const ipAssignRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>\s+(?:IPv4\s+)?Address\s+<([^>]+)>(?:\s+IPv6\s+address\s+<[^>]*>)?\s+assigned\s+to\s+session|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+),\s*(?:IPv4\s*)?Address\s*=\s*([^\s,]+)(?:\s*,\s*IPv6\s*address\s*=\s*[^\s,]+)?\s*assigned\s*to\s*session)/i;
        
        // IKEv2 IPSec Regexes
        const ikev2ConnRegex = /Local:\s*([^\s:]+)(?::\d+)?\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+SA\s+UP/i;
        const ikev2LeaseRegex = /Local:\s*[^\s]+\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+Group:\s*[^\s]+\s+(?:IPv4\s+)?Address\s*[:=]\s*<?([^>\s]+)>?/i;

        let addedCount = 0;

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
            let vpnType = "SSL";
            let vpnStream = null;

            const streams = msgObj.message?.streams || [];
            const msgSource = msgObj.message?.source || "";
            if (streams.includes("69248813fdd3a42c0c71c19e") || msgSource.startsWith("172.18.166.") || rawLog.toLowerCase().includes("kel-2mc-3140") || rawLog.toLowerCase().includes("3140")) {
                vpnStream = "Kel-3140";
            } else if (streams.includes("692f2262ae54205382c89a5b") || msgSource.startsWith("172.16.2.") || rawLog.toLowerCase().includes("wdc-ftd") || rawLog.toLowerCase().includes("connect")) {
                vpnStream = "WDC-FTD";
            }

            if ((rawLog.includes("722022") || rawLog.includes("722023") || rawLog.includes("722036") || rawLog.toLowerCase().includes("session resumed") || rawLog.toLowerCase().includes("reconnect")) && connRegex.test(rawLog)) {
                const match = rawLog.match(connRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "RECONNECT";
                    vpnType = "SSL";
                }
            } else if (rawLog.includes("113039") && connRegex.test(rawLog)) {
                const match = rawLog.match(connRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "SUCCESS";
                    vpnType = "SSL";
                }
            } else if (rawLog.includes("722051") && ipAssignRegex.test(rawLog)) {
                const match = rawLog.match(ipAssignRegex);
                if (match) {
                    username = match[2] || match[6];
                    sourceIp = match[3] || match[7];
                    assignedIp = match[4] || match[8];
                    status = "SUCCESS";
                    vpnType = "SSL";
                }
            } else if (rawLog.includes("113015") && failRegex.test(rawLog)) {
                const match = rawLog.match(failRegex);
                if (match) {
                    failureReason = match[1].trim();
                    username = match[2].trim();
                    sourceIp = match[3].trim();
                    status = "FAILURE";
                    vpnType = "SSL";
                }
            } else if (rawLog.includes("113005") && failRegex113005.test(rawLog)) {
                const match = rawLog.match(failRegex113005);
                if (match) {
                    failureReason = match[1].trim();
                    username = match[2].trim();
                    sourceIp = match[3].trim();
                    status = "FAILURE";
                    vpnType = "SSL";
                }
            } else if ((rawLog.includes("750002") || rawLog.includes("751025") || rawLog.includes("750006")) && ikev2LeaseRegex.test(rawLog)) {
                const match = rawLog.match(ikev2LeaseRegex);
                if (match) {
                    username = match[2];
                    sourceIp = match[1];
                    assignedIp = match[3];
                    status = "SUCCESS";
                    vpnType = "IKEv2";
                }
            } else if ((rawLog.includes("750002") || rawLog.includes("751025") || rawLog.includes("750006")) && ikev2ConnRegex.test(rawLog)) {
                const match = rawLog.match(ikev2ConnRegex);
                if (match) {
                    username = match[3];
                    sourceIp = match[2];
                    status = "SUCCESS";
                    vpnType = "IKEv2";
                }
            } else if (rawLog.includes("750003") && ikev2LeaseRegex.test(rawLog)) {
                const match = rawLog.match(ikev2LeaseRegex);
                if (match) {
                    username = match[2];
                    sourceIp = match[1];
                    assignedIp = match[3];
                    status = "SUCCESS";
                    vpnType = "IKEv2";
                }
            } else if ((rawLog.includes("113019") || rawLog.includes("751026") || rawLog.includes("750007")) && discRegex.test(rawLog)) {
                const match = rawLog.match(discRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "DISCONNECT";
                    duration = parseDuration(match[7]);
                    bytesSent = parseFloat(match[8]);
                    bytesReceived = parseFloat(match[9]);
                    vpnType = rawLog.includes("113019") ? "SSL" : "IKEv2";
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

            // Carry over assignedIp, vpnType, and vpnStream to disconnect events if not already present
            let finalAssignedIp = assignedIp;
            let finalVpnType = vpnType;
            let finalVpnStream = vpnStream;
            if (status === "DISCONNECT") {
                const recentSuccess = await prisma.vpnEvent.findFirst({
                    where: {
                        username,
                        sourceIp,
                        status: "SUCCESS",
                        createdAt: {
                            gte: new Date(logTimestamp.getTime() - 24 * 60 * 60 * 1000), // 24 hours back
                            lte: logTimestamp
                        }
                    },
                    orderBy: { createdAt: "desc" }
                });
                if (recentSuccess) {
                    if (!finalAssignedIp) {
                        finalAssignedIp = recentSuccess.assignedIp;
                    }
                    if (recentSuccess.vpnType) {
                        finalVpnType = recentSuccess.vpnType;
                    }
                    if (recentSuccess.vpnStream) {
                        finalVpnStream = recentSuccess.vpnStream;
                    }
                }
            }

            // Enrich IPinfo & Point-in-Time Active Directory Identity
            const [ipInfo, adMap] = await Promise.all([
                getIpInfo(sourceIp),
                getBulkUserAdStatus([username]).catch(() => ({}))
            ]);

            const adInfo = adMap[username] || {
                adStatus: "NOT_FOUND",
                displayName: null,
                department: null,
                title: null
            };

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
                    vpnType: finalVpnType,
                    vpnStream: finalVpnStream,
                    ipAsn: ipInfo?.asn || null,
                    ipAsName: ipInfo?.as_name || null,
                    ipAsDomain: ipInfo?.as_domain || null,
                    ipCountry: ipInfo?.country || null,
                    ipCountryCode: ipInfo?.country_code || null,
                    
                    // Point-in-Time AD Snapshot at Ingest
                    adStatus: adInfo.adStatus,
                    adDisplayName: adInfo.displayName || null,
                    adDepartment: adInfo.department || null,
                    adTitle: adInfo.title || null,
                    adEnrichedAt: new Date(),

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

    } catch (err: any) {
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
        } catch (e: any) {
            errorLog("Failed to write failure log to database:", e);
        }
    }
}

// Check execution mode (Daemon vs Cron Job)
if (process.argv.includes('--once')) {
    log("Running sync once (Cron mode)...");
    runSync()
        .then(() => {
            prisma.$disconnect();
            process.exit(0);
        })
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
