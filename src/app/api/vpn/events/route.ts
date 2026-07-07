import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIpInfoLite } from "@/lib/ipinfo";
import { getUserDetails } from "@/lib/ldap";
import { enrichIp, isStandardUsIsp } from "@/lib/iplocate";
import axios from "axios";
import https from "https";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyRotatingPassword } from "@/lib/rotatingPassword";

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
export async function syncFromGraylog(rangeSeconds = 1800): Promise<{ count: number; error?: string }> {
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
    const signatures = '(MessageClass:FTD\\-6\\-113039 OR MessageClass:FTD\\-4\\-113019 OR MessageClass:FTD\\-6\\-113015 OR MessageClass:FTD\\-4\\-113015 OR MessageClass:FTD\\-4\\-722051 OR MessageClass:ASA\\-4\\-722051 OR MessageClass:FTD\\-6\\-113005 OR MessageClass:ASA\\-6\\-113005 OR MessageClass:FTD\\-5\\-750002 OR MessageClass:FTD\\-6\\-750002 OR MessageClass:ASA\\-5\\-750002 OR MessageClass:ASA\\-6\\-750002 OR MessageClass:FTD\\-4\\-750003 OR MessageClass:FTD\\-6\\-750003 OR MessageClass:ASA\\-4\\-750003 OR MessageClass:ASA\\-6\\-750003 OR MessageClass:FTD\\-5\\-750006 OR MessageClass:FTD\\-6\\-750006 OR MessageClass:ASA\\-5\\-750006 OR MessageClass:ASA\\-6\\-750006 OR MessageClass:FTD\\-5\\-750007 OR MessageClass:FTD\\-6\\-750007 OR MessageClass:ASA\\-5\\-750007 OR MessageClass:ASA\\-6\\-750007 OR MessageClass:FTD\\-5\\-751025 OR MessageClass:FTD\\-6\\-751025 OR MessageClass:ASA\\-5\\-751025 OR MessageClass:ASA\\-6\\-751025 OR MessageClass:FTD\\-5\\-751026 OR MessageClass:FTD\\-6\\-751026 OR MessageClass:ASA\\-5\\-751026 OR MessageClass:ASA\\-6\\-751026)';

    try {
        const searchUrl = `${url}/api/search/universal/relative`;
        
        // Support both username:password format and raw API token
        const authHeader = token.includes(":") 
            ? `Basic ${Buffer.from(token).toString("base64")}`
            : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        
        const agent = new https.Agent({ rejectUnauthorized: false });
        
        let messages: any[] = [];
        const streamsToQuery = streamIds.length > 0 ? streamIds : [null];

        for (const streamId of streamsToQuery) {
            const params = new URLSearchParams();
            params.append("query", signatures);
            params.append("range", rangeSeconds.toString());
            params.append("limit", (rangeSeconds > 3600 ? 5000 : 200).toString());
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
                timeout: 60000
            });

            const streamMsgs = response.data?.messages || [];
            messages = messages.concat(streamMsgs);
        }

        // Sort merged messages chronologically (newest first)
        messages.sort((a, b) => {
            const tA = new Date(a.message?.timestamp || 0).getTime();
            const tB = new Date(b.message?.timestamp || 0).getTime();
            return tB - tA;
        });

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
            let finalFailureReason = failureReason;
            try {
                ipInfo = await getIpInfoLite(sourceIp);
                
                // If it is a failed VPN connection attempt, evaluate threat risk
                if (status === "FAILURE" && ipInfo) {
                    let score = 0;
                    const badAsns = ["12345", "99999", "66666"];
                    const highRiskCountries = ["KP", "IR", "SY"];
                    
                    if (badAsns.includes(ipInfo.asn || "")) {
                        score += 50;
                    }
                    if (highRiskCountries.includes(ipInfo.country_code || "")) {
                        score += 40;
                    }
                    
                    if (score > 30) {
                        const threatPrefix = `[⚠️ THREAT: ${score}/100]`;
                        finalFailureReason = finalFailureReason 
                            ? `${threatPrefix} ${finalFailureReason}`
                            : `${threatPrefix} High-risk network source`;
                            
                        // Log a high-priority system audit event
                        await logAudit(
                            "SUSPICIOUS_VPN_ATTEMPT",
                            `Security Alert: Failed VPN login attempt from high-risk IP ${sourceIp} (${ipInfo.country || 'Unknown'}). Threat score: ${score}/100.`,
                            "SYSTEM"
                        );
                    }
                }

                // Selective iplocate.io enrichment for US targets
                if (ipInfo && ipInfo.country_code === "US") {
                    const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
                    const cleanUname = username?.toLowerCase().endsWith("@cooperhealth.edu") ? username.slice(0, -17) : username;
                    const isValidUser = nameNameRegex.test(cleanUname);
                    const isNonStandardIsp = !isStandardUsIsp(ipInfo.as_name);

                    const shouldEnrich = 
                        status === "SUCCESS" || 
                        (status === "FAILURE" && isValidUser) || 
                        isNonStandardIsp;

                    if (shouldEnrich) {
                        try {
                            await enrichIp(sourceIp, false); // false = automated sync
                        } catch (e) {
                            console.error("[Sync] iplocate enrichment error:", e);
                        }
                    }
                }
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
                    failureReason: finalFailureReason,
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
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const range = body.range || 2100; // default 35 minutes
        const rangeSeconds = parseInt(range, 10);
        const password = body.password;

        if (rangeSeconds >= 604800) {
            if (!password) {
                await logAudit(
                    "VPN_SYNC_LOCKED_ATTEMPT_FAILED",
                    `Sync attempted for range ${rangeSeconds}s but no password was provided.`,
                    session.user.id
                ).catch(() => {});
                
                return NextResponse.json({ error: "Password verification required for Last 7 Days / Last 30 Days." }, { status: 400 });
            }

            if (!verifyRotatingPassword(password)) {
                await logAudit(
                    "VPN_SYNC_LOCKED_ATTEMPT_FAILED",
                    `Sync attempted for range ${rangeSeconds}s with invalid password: "${password}".`,
                    session.user.id
                ).catch(() => {});

                return NextResponse.json({ error: "Invalid rotating password. Please check the System Health dashboard." }, { status: 400 });
            }

            await logAudit(
                "VPN_SYNC_LOCKED_ATTEMPT_SUCCESS",
                `Sync successfully authorized for range ${rangeSeconds}s using rotating password.`,
                session.user.id
            ).catch(() => {});
        }

        const result = await syncFromGraylog(rangeSeconds);

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
        const session = await auth();
        console.log("[VPN-API-GET] session:", session);
        if (!session) {
            console.log("[VPN-API-GET] Unauthorized - session is null");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session?.user as any)?.role || "USER";
        console.log("[VPN-API-GET] user role:", role);
        const isDesktop = String(role).toLowerCase() === "desktop";
        const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;

        const { searchParams } = new URL(req.url);

        // Parse securityScope filter
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

        const detailUsername = searchParams.get("detailUsername");

        if (detailUsername) {
            if (isDesktop) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

            let term = cleanedQuery;
            let dateFilter: any = null;

            // 1. "last X days/hours/weeks/minutes" (with or without term)
            let lastRangeMatch = cleanedQuery.match(/(.+?)\s+last\s+(\d+)\s+(day|hour|minute|week)s?$/i);
            if (!lastRangeMatch) {
                lastRangeMatch = cleanedQuery.match(/^last\s+(\d+)\s+(day|hour|minute|week)s?$/i);
            }
            if (lastRangeMatch) {
                const isStandalone = lastRangeMatch.length === 3;
                term = isStandalone ? "" : lastRangeMatch[1].trim();
                const amount = parseInt(isStandalone ? lastRangeMatch[1] : lastRangeMatch[2], 10);
                const unit = (isStandalone ? lastRangeMatch[2] : lastRangeMatch[3]).toLowerCase();
                let ms = 0;
                if (unit.startsWith("day")) ms = amount * 24 * 60 * 60 * 1000;
                else if (unit.startsWith("hour")) ms = amount * 60 * 60 * 1000;
                else if (unit.startsWith("minute")) ms = amount * 60 * 1000;
                else if (unit.startsWith("week")) ms = amount * 7 * 24 * 60 * 60 * 1000;

                const start = new Date(Date.now() - ms);
                dateFilter = { createdAt: { gte: start } };
            }

            // 2. Month range like "june 6-8" or "jun 6 to 8" (with or without term)
            if (!dateFilter) {
                let monthRangeMatch = cleanedQuery.match(/(.+?)\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d+)\s*[-–—to\s]+\s*(\d+)$/i);
                if (!monthRangeMatch) {
                    monthRangeMatch = cleanedQuery.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d+)\s*[-–—to\s]+\s*(\d+)$/i);
                }
                if (monthRangeMatch) {
                    const isStandalone = monthRangeMatch.length === 4;
                    term = isStandalone ? "" : monthRangeMatch[1].trim();
                    const monthStr = (isStandalone ? monthRangeMatch[1] : monthRangeMatch[2]).toLowerCase().substring(0, 3);
                    const dayStart = parseInt(isStandalone ? monthRangeMatch[2] : monthRangeMatch[3], 10);
                    const dayEnd = parseInt(isStandalone ? monthRangeMatch[3] : monthRangeMatch[4], 10);
                    
                    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                    const monthIdx = months.indexOf(monthStr);
                    if (monthIdx !== -1) {
                        const currentYear = new Date().getFullYear();
                        const start = new Date(currentYear, monthIdx, dayStart, 0, 0, 0, 0);
                        const end = new Date(currentYear, monthIdx, dayEnd, 23, 59, 59, 999);
                        dateFilter = { createdAt: { gte: start, lte: end } };
                    }
                }
            }

            // 3. Date range like "june 6 to june 8" (with or without term)
            if (!dateFilter) {
                let fullMonthRangeMatch = cleanedQuery.match(/(.+?)\s+([a-z]{3,})\s+(\d+)\s*[-–—to\s]+\s*([a-z]{3,})\s+(\d+)$/i);
                if (!fullMonthRangeMatch) {
                    fullMonthRangeMatch = cleanedQuery.match(/^([a-z]{3,})\s+(\d+)\s*[-–—to\s]+\s*([a-z]{3,})\s+(\d+)$/i);
                }
                if (fullMonthRangeMatch) {
                    const isStandalone = fullMonthRangeMatch.length === 5;
                    term = isStandalone ? "" : fullMonthRangeMatch[1].trim();
                    const m1Str = (isStandalone ? fullMonthRangeMatch[1] : fullMonthRangeMatch[2]).toLowerCase().substring(0, 3);
                    const d1 = parseInt(isStandalone ? fullMonthRangeMatch[2] : fullMonthRangeMatch[3], 10);
                    const m2Str = (isStandalone ? fullMonthRangeMatch[3] : fullMonthRangeMatch[4]).toLowerCase().substring(0, 3);
                    const d2 = parseInt(isStandalone ? fullMonthRangeMatch[4] : fullMonthRangeMatch[5], 10);

                    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
                    const m1Idx = months.indexOf(m1Str);
                    const m2Idx = months.indexOf(m2Str);

                    if (m1Idx !== -1 && m2Idx !== -1) {
                        const currentYear = new Date().getFullYear();
                        const start = new Date(currentYear, m1Idx, d1, 0, 0, 0, 0);
                        const end = new Date(currentYear, m2Idx, d2, 23, 59, 59, 999);
                        dateFilter = { createdAt: { gte: start, lte: end } };
                    }
                }
            }

            // 4. ISO Date range like "2026-06-06 to 2026-06-08" (with or without term)
            if (!dateFilter) {
                let ymdRangeMatch = cleanedQuery.match(/(.+?)\s+(\d{4}-\d{2}-\d{2})\s*[-–—to\s]+\s*(\d{4}-\d{2}-\d{2})$/i);
                if (!ymdRangeMatch) {
                    ymdRangeMatch = cleanedQuery.match(/^(\d{4}-\d{2}-\d{2})\s*[-–—to\s]+\s*(\d{4}-\d{2}-\d{2})$/i);
                }
                if (ymdRangeMatch) {
                    const isStandalone = ymdRangeMatch.length === 3;
                    term = isStandalone ? "" : ymdRangeMatch[1].trim();
                    const start = new Date(isStandalone ? ymdRangeMatch[1] : ymdRangeMatch[2]);
                    const end = new Date(isStandalone ? ymdRangeMatch[2] : ymdRangeMatch[3]);
                    end.setHours(23, 59, 59, 999);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        dateFilter = { createdAt: { gte: start, lte: end } };
                    }
                }
            }

            // 5. Fallback standalone single date like "2026-06-06" or "june 6"
            if (!dateFilter) {
                const singleDate = new Date(cleanedQuery);
                if (!isNaN(singleDate.getTime()) && !/^[a-zA-Z]+$/.test(cleanedQuery) && cleanedQuery.length >= 5) {
                    const start = new Date(singleDate.getFullYear(), singleDate.getMonth(), singleDate.getDate());
                    const end = new Date(singleDate.getFullYear(), singleDate.getMonth(), singleDate.getDate(), 23, 59, 59, 999);
                    term = "";
                    dateFilter = { createdAt: { gte: start, lte: end } };
                }
            }

            const searchConditions: any[] = [];
            if (term) {
                searchConditions.push({
                    OR: [
                        { username: { contains: term } },
                        { sourceIp: { contains: term } },
                        { assignedIp: { contains: term } }
                    ]
                });
            }
            if (dateFilter) {
                searchConditions.push(dateFilter);
            }

            const whereClause = searchConditions.length > 0 
                ? (searchConditions.length === 1 ? searchConditions[0] : { AND: searchConditions })
                : {};

            results = await prisma.vpnEvent.findMany({
                where: whereClause,
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

        let topUploadEvents: any[] = [];
        let topDownloadEvents: any[] = [];
        let topFailedUsernames: any[] = [];
        let topFailedValidUsernames: any[] = [];
        let topFailedIps: any[] = [];
        let topFailedAsns: any[] = [];
        let activeSessionsCount = 0;
        let peakUniqueUsers24h = 0;
        let peakUniqueUsers24hDate = "";
        let averageWeekdayUsers = 0;
        let averageWeekendUsers = 0;

        if (!isDesktop) {
            // Fetch top 10 sessions by upload (bytesSent) and download (bytesReceived) within date filter
            topUploadEvents = await prisma.vpnEvent.findMany({
                where: {
                    bytesSent: { not: null, gt: 0 },
                    createdAt: bandwidthDateFilter
                },
                orderBy: { bytesSent: "desc" },
                take: 10
            });

            topDownloadEvents = await prisma.vpnEvent.findMany({
                where: {
                    bytesReceived: { not: null, gt: 0 },
                    createdAt: bandwidthDateFilter
                },
                orderBy: { bytesReceived: "desc" },
                take: 10
            });

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
            topFailedUsernames = rawFailures.slice(0, 25).map(f => ({
                username: f.username,
                count: f._count.username
            }));

            // Top 25 Failed Valid Usernames (name-name or name-name-name)
            topFailedValidUsernames = rawFailures
                .filter(f => nameNameRegex.test(f.username))
                .slice(0, 25)
                .map(f => ({
                    username: f.username,
                    count: f._count.username
                }));

            // Top 25 Failed IPs
            const rawIpFailures = await prisma.vpnEvent.groupBy({
                by: ['sourceIp'],
                _count: {
                    sourceIp: true
                },
                where: {
                    status: "FAILURE",
                    createdAt: securityDateFilter
                },
                orderBy: {
                    _count: {
                        sourceIp: 'desc'
                    }
                },
                take: 25
            });

            topFailedIps = await Promise.all(
                rawIpFailures.map(async (f) => {
                    const latestEvent = await prisma.vpnEvent.findFirst({
                        where: { sourceIp: f.sourceIp },
                        orderBy: { createdAt: "desc" },
                        select: {
                            ipAsn: true,
                            ipAsName: true,
                            ipAsDomain: true,
                            ipCountry: true,
                            ipCountryCode: true,
                        }
                    });
                    return {
                        sourceIp: f.sourceIp,
                        count: f._count.sourceIp,
                        ipAsn: latestEvent?.ipAsn || null,
                        ipAsName: latestEvent?.ipAsName || null,
                        ipAsDomain: latestEvent?.ipAsDomain || null,
                        ipCountry: latestEvent?.ipCountry || null,
                        ipCountryCode: latestEvent?.ipCountryCode || null,
                    };
                })
            );

            // Top 25 Failed ASNs
            const rawAsnFailures = await prisma.vpnEvent.groupBy({
                by: ['ipAsn', 'ipAsName', 'ipAsDomain'],
                _count: {
                    ipAsn: true
                },
                where: {
                    status: "FAILURE",
                    ipAsn: { not: null },
                    createdAt: securityDateFilter
                },
                orderBy: {
                    _count: {
                        ipAsn: 'desc'
                    }
                },
                take: 25
            });

            topFailedAsns = rawAsnFailures.map(f => ({
                ipAsn: f.ipAsn,
                ipAsName: f.ipAsName,
                ipAsDomain: f.ipAsDomain,
                count: f._count.ipAsn
            }));

            // 1. Current Active Sessions Count
            // Query events from the last 24 hours to evaluate active tunnels (session limits prevent longer connections)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentActiveEvents = await prisma.vpnEvent.findMany({
                where: {
                    status: { in: ["SUCCESS", "DISCONNECT"] },
                    createdAt: { gte: twentyFourHoursAgo }
                },
                orderBy: { createdAt: "desc" }
            });

            const activeSessionsMap = new Map<string, any>();
            const seenPairs = new Set<string>();
            for (const evt of recentActiveEvents) {
                const username = evt.username?.trim();
                if (!username || username.toLowerCase() === "unknown") continue;
                const key = `${username}-${evt.sourceIp}`;
                if (!seenPairs.has(key)) {
                    seenPairs.add(key);
                    if (evt.status === "SUCCESS") {
                        activeSessionsMap.set(key, evt);
                    }
                }
            }
            activeSessionsCount = activeSessionsMap.size;

            // Collect the full active session event objects for the map
            successfulIps.length = 0; // Clear the limited list
            activeSessionsMap.forEach((evt) => {
                successfulIps.push(evt);
            });

            // 2. Peak All-Time Unique Users in a 24-hour Calendar Day (Option B)
            // Fetch all success events to group by calendar day
            const allSuccessEvents = await prisma.vpnEvent.findMany({
                where: { status: "SUCCESS" },
                select: { username: true, createdAt: true }
            });

            const dailyUniqueUsers = new Map<string, Set<string>>();
            for (const evt of allSuccessEvents) {
                const username = evt.username?.trim();
                if (!username || username.toLowerCase() === "unknown") continue;
                const dateStr = evt.createdAt.toISOString().split("T")[0]; // YYYY-MM-DD
                if (!dailyUniqueUsers.has(dateStr)) {
                    dailyUniqueUsers.set(dateStr, new Set());
                }
                dailyUniqueUsers.get(dateStr)!.add(username);
            }

            let weekdaySum = 0;
            let weekdayCount = 0;
            let weekendSum = 0;
            let weekendCount = 0;

            for (const [dateStr, usersSet] of dailyUniqueUsers.entries()) {
                if (usersSet.size > peakUniqueUsers24h) {
                    peakUniqueUsers24h = usersSet.size;
                    peakUniqueUsers24hDate = dateStr;
                }

                const [year, month, day] = dateStr.split("-");
                const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
                const dayOfWeek = date.getUTCDay(); // 0 is Sunday, 6 is Saturday
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                if (isWeekend) {
                    weekendSum += usersSet.size;
                    weekendCount++;
                } else {
                    weekdaySum += usersSet.size;
                    weekdayCount++;
                }
            }

            averageWeekdayUsers = weekdayCount > 0 ? Math.round(weekdaySum / weekdayCount) : 0;
            averageWeekendUsers = weekendCount > 0 ? Math.round(weekendSum / weekendCount) : 0;
        }

        // Get status of the last background job sync
        let lastSyncStatus = null;
        try {
            lastSyncStatus = await prisma.backgroundJob.findUnique({
                where: { name: "Graylog VPN Sync" }
            });
        } catch (e) {}

        // Gather unique usernames for AD Info enrichment (filtering to only lookup name-name/name-name-name formats)
        const uniqueUsernames = Array.from(new Set([
            ...successfulIps.map(e => e.username),
            ...failedIps.map(e => e.username),
            ...recentEvents.map(e => e.username),
            ...topUploadEvents.map(e => e.username),
            ...topDownloadEvents.map(e => e.username),
            ...topFailedUsernames.map(e => e.username),
            ...topFailedValidUsernames.map(e => e.username),
            ...results.map(e => e.username)
        ].filter(uname => {
            if (!uname) return false;
            const clean = uname.toLowerCase().endsWith("@cooperhealth.edu") ? uname.slice(0, -17) : uname;
            return nameNameRegex.test(clean);
        })));

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

        // Retrieve and format the complete IP Geolocation cache
        const caches = await prisma.ipLookupCache.findMany();
        const ipCache: Record<string, any> = {};
        for (const entry of caches) {
            try {
                ipCache[entry.ip] = {
                    latitude: entry.latitude,
                    longitude: entry.longitude,
                    city: entry.city,
                    subdivision: entry.subdivision,
                    countryCode: entry.countryCode,
                    details: JSON.parse(entry.rawJson)
                };
            } catch (e) {}
        }

        if (isSearchMode) {
            return NextResponse.json({
                results,
                adUsers,
                ipCache
            });
        }

        return NextResponse.json({
            successfulIps,
            failedIps,
            topFailedUsernames,
            topFailedValidUsernames,
            topFailedIps,
            topFailedAsns,
            activeSessionsCount,
            peakUniqueUsers24h,
            peakUniqueUsers24hDate,
            averageWeekdayUsers,
            averageWeekendUsers,
            recentEvents,
            topUploadEvents,
            topDownloadEvents,
            lastSync: lastSyncStatus,
            adUsers,
            ipCache
        });

    } catch (error: any) {
        console.error("VPN Event Query Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}
