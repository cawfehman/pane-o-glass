import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIpInfoLite } from "@/lib/ipinfo";
import { getUserDetails } from "@/lib/ldap";
import axios from "axios";
import https from "https";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Helper to parse duration string (e.g. 0h:05m:30s or 1d 0h:05m:30s) to seconds
function parseDuration(durationStr: string): number | null {
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

// Main logic to fetch logs from Graylog and sync them
async function syncFromGraylog(rangeSeconds = 1800): Promise<{ count: number; error?: string }> {
    const rawUrl = process.env.GRAYLOG_URL;
    const rawToken = process.env.GRAYLOG_API_TOKEN;
    const rawStreams = process.env.GRAYLOG_STREAM_ID;

    if (!rawUrl || !rawToken) {
        return { count: 0, error: "Graylog configuration (GRAYLOG_URL, GRAYLOG_API_TOKEN) is missing in environment." };
    }

    const url = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
    const token = rawToken.replace(/^"|"$/g, '');
    
    // Parse multiple streams from comma-separated list
    const streamIds = rawStreams 
        ? rawStreams.replace(/^"|"$/g, '').split(",").map(id => id.trim()).filter(Boolean)
        : [];

    // Construct Lucene query using the indexed MessageClass field (escaping hyphens for Lucene parser)
    const signatures = '(MessageClass:FTD\\-6\\-113039 OR MessageClass:FTD\\-4\\-113019 OR MessageClass:FTD\\-6\\-113015 OR MessageClass:FTD\\-4\\-113015 OR MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051 OR MessageClass:FTD\\-6\\-113005 OR MessageClass:ASA\\-6\\-113005 OR MessageClass:FTD\\-5\\-750002 OR MessageClass:FTD\\-6\\-750002 OR MessageClass:ASA\\-5\\-750002 OR MessageClass:ASA\\-6\\-750002 OR MessageClass:FTD\\-4\\-750003 OR MessageClass:FTD\\-6\\-750003 OR MessageClass:ASA\\-4\\-750003 OR MessageClass:ASA\\-6\\-750003)';

    try {
        const searchUrl = `${url}/api/search/universal/relative`;
        
        // Support both username:password format and raw API token
        const authHeader = token.includes(":") 
            ? `Basic ${Buffer.from(token).toString("base64")}`
            : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        const params = new URLSearchParams();
        params.append("query", signatures);
        params.append("range", rangeSeconds.toString());
        params.append("limit", rangeSeconds > 3600 ? "5000" : "200");
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
            timeout: 60000
        });

        const data = response.data;
        const messages = data.messages || [];

        console.log(`[VPN-DEBUG] Total combined messages returned from Graylog: ${messages.length}`);
        if (messages.length > 0) {
            console.log(`[VPN-DEBUG] Sample log 0: "${messages[0].message?.message}"`);
        }

        let newEventsCount = 0;

        // Regexes for FTD/ASA parsing (making the FTD/ASA header prefix optional in case Graylog stripped it)
        const connRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+))/i;
        const failRegex = /(?:%(?:FTD|ASA)-\d-113015:\s+)?AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
        const failRegex113005 = /AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+server\s+=\s+[^\s]+\s+:\s+user\s+=\s+(.+?)\s+:\s+user\s+IP\s+=\s+([^\s]+)/i;
        const discRegex = /(?:Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+)|Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>).*?Duration:\s*([^,]+),\s*(?:Rx\s*Rules:[^,]+,\s*Tx\s*Rules:[^,]+,\s*)?Bytes\s+(?:Tx|xmt):\s*(\d+),\s*Bytes\s+(?:Rx|rcv):\s*(\d+)/i;
        const ipAssignRegex = /(?:Group\s+<([^>]+)>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>\s+(?:IPv4\s+)?Address\s+<([^>]+)>(?:\s+IPv6\s+address\s+<[^>]*>)?\s+assigned\s+to\s+session|Group\s*=\s*([^\s,]+),\s*Username\s*=\s*([^\s,]+),\s*IP\s*=\s*([^\s,]+),\s*(?:IPv4\s*)?Address\s*=\s*([^\s,]+)(?:\s*,\s*IPv6\s*address\s*=\s*[^\s,]+)?\s*assigned\s*to\s*session)/i;
        
        // IKEv2 IPSec Regexes
        const ikev2ConnRegex = /Local:\s*([^\s:]+)(?::\d+)?\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+SA\s+UP/i;
        const ikev2LeaseRegex = /Local:\s*[^\s]+\s+Remote:\s*([^\s:]+)(?::\d+)?\s+Username:\s*([^\s]+)\s+IKEv2\s+Group:\s*[^\s]+\s+(?:IPv4\s+)?Address\s*[:=]\s*<?([^>\s]+)>?/i;

        for (const msgObj of messages) {
            const rawLog = msgObj.message?.message || "";
            const logTimestampStr = msgObj.message?.timestamp;
            if (!rawLog || !logTimestampStr) continue;

            const logTimestamp = new Date(logTimestampStr);

            let username = "";
            let sourceIp = "";
            let assignedIp: string | null = null;
            let status: "SUCCESS" | "FAILURE" | "DISCONNECT" = "SUCCESS";
            let duration: number | null = null;
            let bytesSent: number | null = null;
            let bytesReceived: number | null = null;
            let failureReason: string | null = null;
            let vpnType = "SSL";
            let vpnStream: string | null = null;

            const streams = msgObj.message?.streams || [];
            const msgSource = msgObj.message?.source || "";
            if (streams.includes("69248813fdd3a42c0c71c19e") || msgSource.startsWith("172.18.166.") || rawLog.toLowerCase().includes("kel-2mc-3140") || rawLog.toLowerCase().includes("3140")) {
                vpnStream = "Kel-3140";
            } else if (streams.includes("692f2262ae54205382c89a5b") || msgSource.startsWith("172.16.2.") || rawLog.toLowerCase().includes("wdc-ftd") || rawLog.toLowerCase().includes("connect")) {
                vpnStream = "WDC-FTD";
            }

            if (rawLog.includes("113039") && connRegex.test(rawLog)) {
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
            } else if (rawLog.includes("750002") && ikev2ConnRegex.test(rawLog)) {
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
            } else if (rawLog.includes("113019") && discRegex.test(rawLog)) {
                const match = rawLog.match(discRegex);
                if (match) {
                    username = match[2] || match[5];
                    sourceIp = match[3] || match[6];
                    status = "DISCONNECT";
                    duration = parseDuration(match[7]);
                    bytesSent = parseFloat(match[8]);
                    bytesReceived = parseFloat(match[9]);
                    vpnType = "SSL"; // fallback, will carry over from SUCCESS
                }
            } else {
                continue; // Skip logs that don't match our signatures
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

            // Perform IP info enrichment
            let ipInfo = null;
            try {
                ipInfo = await getIpInfoLite(sourceIp);
            } catch (enrichError) {
                console.error(`Failed to enrich IP ${sourceIp}:`, enrichError);
            }

            // Save to database
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
                    createdAt: logTimestamp // align with Graylog timestamp
                }
            });

            newEventsCount++;
        }

        return { count: newEventsCount };

    } catch (err: any) {
        console.error("Graylog Sync Error:", err);
        return { count: 0, error: err.message || "An unexpected error occurred during sync." };
    }
}

// POST endpoint triggers Graylog sync
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const range = body.range || 2100; // default 35 minutes

        const result = await syncFromGraylog(range);

        if (result.error) {
            return NextResponse.json({
                success: false,
                error: result.error
            }, { status: 500 });
        }

        // Record a background job status log (optional, aligns with pane-o-glass DB dashboard logs)
        try {
            await prisma.backgroundJob.upsert({
                where: { name: "Graylog VPN Sync" },
                update: {
                    lastRun: new Date(),
                    status: "SUCCESS",
                    message: `Successfully synced. Added ${result.count} new events.`
                },
                create: {
                    name: "Graylog VPN Sync",
                    status: "SUCCESS",
                    message: `Initial sync. Added ${result.count} new events.`
                }
            });
        } catch (e) {
            console.error("Failed to update background job status:", e);
        }

        // Audit manual sync action
        try {
            const session = await auth();
            if (session?.user) {
                const forwardedFor = req.headers.get("x-forwarded-for");
                const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
                const minutes = Math.round(range / 60);
                const actionMsg = `Manually triggered VPN sync for the last ${minutes} minute(s) (added ${result.count} new events).`;
                await logAudit("VPN_LOG_SYNC", actionMsg, session.user.id, clientIp);
            }
        } catch (auditError) {
            console.error("Failed to write manual sync audit log:", auditError);
        }

        return NextResponse.json({
            success: true,
            syncedCount: result.count
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}

// GET endpoint retrieves dashboard query data or search results
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const detailUsername = searchParams.get("detailUsername");

        if (detailUsername) {
            const securityScope = searchParams.get("securityScope") || "last24hours";
            let securityDateFilter: any = {};
            const now = new Date();

            if (securityScope === "today") {
                const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                securityDateFilter = { gte: start };
            } else if (securityScope === "yesterday") {
                const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
                securityDateFilter = { gte: start, lte: end };
            } else if (securityScope === "last7days") {
                const start = new Date();
                start.setDate(now.getDate() - 7);
                securityDateFilter = { gte: start };
            } else if (securityScope === "last14days") {
                const start = new Date();
                start.setDate(now.getDate() - 14);
                securityDateFilter = { gte: start };
            } else if (securityScope === "last30days") {
                const start = new Date();
                start.setDate(now.getDate() - 30);
                securityDateFilter = { gte: start };
            } else { // default last24hours
                const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                securityDateFilter = { gte: start };
            }

            const events = await prisma.vpnEvent.findMany({
                where: {
                    username: detailUsername,
                    status: "FAILURE",
                    createdAt: securityDateFilter
                },
                orderBy: { createdAt: "desc" },
                take: 100
            });
            return NextResponse.json({ success: true, events });
        }

        const query = searchParams.get("q");

        let results: any[] = [];
        let isSearchMode = false;

        if (query) {
            isSearchMode = true;
            const cleanedQuery = query.trim();
            
            let dateFilter: any = null;
            if (cleanedQuery.length >= 6 && !/^[a-zA-Z]+$/.test(cleanedQuery)) {
                const parsedDate = new Date(cleanedQuery);
                if (!isNaN(parsedDate.getTime())) {
                    const start = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
                    const end = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999);
                    dateFilter = { createdAt: { gte: start, lte: end } };
                }
            }

            results = await prisma.vpnEvent.findMany({
                where: dateFilter ? dateFilter : {
                    OR: [
                        { username: { contains: cleanedQuery } },
                        { sourceIp: { contains: cleanedQuery } },
                        { assignedIp: { contains: cleanedQuery } }
                    ]
                },
                orderBy: { createdAt: "desc" },
                take: 200
            });
        }

        // Fetch recent data to parse the last 10 unique successful/failed IPs
        const recentSuccessEvents = await prisma.vpnEvent.findMany({
            where: {
                status: { in: ["SUCCESS", "DISCONNECT"] }
            },
            orderBy: { createdAt: "desc" },
            take: 200
        });

        const successfulIps: any[] = [];
        const seenSuccessIps = new Set<string>();
        for (const evt of recentSuccessEvents) {
            if (!seenSuccessIps.has(evt.sourceIp)) {
                seenSuccessIps.add(evt.sourceIp);
                successfulIps.push(evt);
                if (successfulIps.length >= 10) break;
            }
        }

        const recentFailedEvents = await prisma.vpnEvent.findMany({
            where: { status: "FAILURE" },
            orderBy: { createdAt: "desc" },
            take: 200
        });

        const failedIps: any[] = [];
        const seenFailedIps = new Set<string>();
        for (const evt of recentFailedEvents) {
            if (!seenFailedIps.has(evt.sourceIp)) {
                seenFailedIps.add(evt.sourceIp);
                failedIps.push(evt);
                if (failedIps.length >= 10) break;
            }
        }

        const recentEvents = await prisma.vpnEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 200
        });

        // Parse bandwidthScope filter
        const bandwidthScope = searchParams.get("bandwidthScope") || "last30days";
        let bandwidthDateFilter: any = {};
        const now = new Date();
        
        if (bandwidthScope === "today") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            bandwidthDateFilter = { gte: start };
        } else if (bandwidthScope === "yesterday") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            bandwidthDateFilter = { gte: start, lte: end };
        } else if (bandwidthScope === "last7days") {
            const start = new Date();
            start.setDate(now.getDate() - 7);
            bandwidthDateFilter = { gte: start };
        } else if (bandwidthScope === "last14days") {
            const start = new Date();
            start.setDate(now.getDate() - 14);
            bandwidthDateFilter = { gte: start };
        } else { // default last30days
            const start = new Date();
            start.setDate(now.getDate() - 30);
            bandwidthDateFilter = { gte: start };
        }

        // Fetch top 10 sessions by upload (bytesSent) and download (bytesReceived) within date filter
        const topUploadEvents = await prisma.vpnEvent.findMany({
            where: {
                bytesSent: { not: null, gt: 0 },
                createdAt: bandwidthDateFilter
            },
            orderBy: { bytesSent: "desc" },
            take: 10
        });

        const topDownloadEvents = await prisma.vpnEvent.findMany({
            where: {
                bytesReceived: { not: null, gt: 0 },
                createdAt: bandwidthDateFilter
            },
            orderBy: { bytesReceived: "desc" },
            take: 10
        });

        // Parse securityScope filter
        const securityScope = searchParams.get("securityScope") || "last24hours";
        let securityDateFilter: any = {};
        
        if (securityScope === "today") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            securityDateFilter = { gte: start };
        } else if (securityScope === "yesterday") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            securityDateFilter = { gte: start, lte: end };
        } else if (securityScope === "last7days") {
            const start = new Date();
            start.setDate(now.getDate() - 7);
            securityDateFilter = { gte: start };
        } else if (securityScope === "last14days") {
            const start = new Date();
            start.setDate(now.getDate() - 14);
            securityDateFilter = { gte: start };
        } else if (securityScope === "last30days") {
            const start = new Date();
            start.setDate(now.getDate() - 30);
            securityDateFilter = { gte: start };
        } else { // default last24hours
            const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            securityDateFilter = { gte: start };
        }

        // Query grouped failure attempts
        const rawFailures = await prisma.vpnEvent.groupBy({
            by: ['username'],
            _count: {
                username: true
            },
            where: {
                status: "FAILURE",
                createdAt: securityDateFilter
            },
            orderBy: {
                _count: {
                    username: 'desc'
                }
            }
        });

        // Top 25 Failed Usernames (All)
        const topFailedUsernames = rawFailures.slice(0, 25).map(f => ({
            username: f.username,
            count: f._count.username
        }));

        // Top 25 Failed Valid Usernames (name-name or name-name-name)
        const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
        const topFailedValidUsernames = rawFailures
            .filter(f => nameNameRegex.test(f.username))
            .slice(0, 25)
            .map(f => ({
                username: f.username,
                count: f._count.username
            }));

        // Get status of the last background job sync
        let lastSyncStatus = null;
        try {
            lastSyncStatus = await prisma.backgroundJob.findUnique({
                where: { name: "Graylog VPN Sync" }
            });
        } catch (e) {}

        // Gather unique usernames for AD Info enrichment (filtering to only lookup name-name formats)
        const uniqueUsernames = Array.from(new Set([
            ...successfulIps.map(e => e.username),
            ...failedIps.map(e => e.username),
            ...recentEvents.map(e => e.username),
            ...topUploadEvents.map(e => e.username),
            ...topDownloadEvents.map(e => e.username),
            ...topFailedUsernames.map(e => e.username),
            ...topFailedValidUsernames.map(e => e.username),
            ...results.map(e => e.username)
        ].filter(uname => uname && nameNameRegex.test(uname))));

        const adUsers: Record<string, any> = {};
        await Promise.all(uniqueUsernames.map(async (uname) => {
            try {
                const details = await getUserDetails(uname);
                if (details) {
                    adUsers[uname] = details;
                }
            } catch (e) {
                // Ignore LDAP lookup failure
            }
        }));

        if (isSearchMode) {
            return NextResponse.json({
                results,
                adUsers
            });
        }

        return NextResponse.json({
            successfulIps,
            failedIps,
            topFailedUsernames,
            topFailedValidUsernames,
            recentEvents,
            topUploadEvents,
            topDownloadEvents,
            lastSync: lastSyncStatus,
            adUsers
        });

    } catch (error: any) {
        console.error("VPN Event Query Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}
