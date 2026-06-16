import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getIpInfoLite } from "@/lib/ipinfo";

// Helper to parse duration string (e.g. 0h:05m:30s) to seconds
function parseDuration(durationStr: string): number | null {
    if (!durationStr) return null;
    const match = durationStr.trim().match(/(\d+)\s*h\s*:\s*(\d+)\s*m\s*:\s*(\d+)\s*s/i);
    if (match) {
        return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
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

    // Construct Lucene query
    const signatures = '("113039" OR "113019" OR "113015")';
    let query = signatures;

    if (streamIds.length > 0) {
        const streamQuery = streamIds.map(id => `streams:${id}`).join(" OR ");
        query = `(${streamQuery}) AND ${signatures}`;
    }

    try {
        // Build Graylog search URL
        // Endpoint: /api/search/universal/relative
        const searchUrl = new URL(`${url}/api/search/universal/relative`);
        searchUrl.searchParams.append("query", query);
        searchUrl.searchParams.append("range", rangeSeconds.toString());
        searchUrl.searchParams.append("limit", "200");
        searchUrl.searchParams.append("decorate", "false");

        const authHeader = `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
        const response = await fetch(searchUrl.toString(), {
            method: "GET",
            headers: {
                "Authorization": authHeader,
                "Accept": "application/json",
                "X-Requested-By": "NextJS-App"
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Graylog API returned status ${response.status}: ${errText}`);
        }

        const data = await response.json();
        const messages = data.messages || [];
        let newEventsCount = 0;

        // Regexes for FTD/ASA parsing
        const connRegex = /%(?:FTD|ASA)-\d-113039:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>/i;
        const failRegex = /%(?:FTD|ASA)-\d-113015:\s+AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
        const discRegex = /%(?:FTD|ASA)-\d-113019:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>.*?Duration:\s*([^,]+).*?Bytes\s+Tx:\s*(\d+).*?Bytes\s+Rx:\s*(\d+)/i;

        for (const msgObj of messages) {
            const rawLog = msgObj.message?.message || "";
            const logTimestampStr = msgObj.message?.timestamp;
            if (!rawLog || !logTimestampStr) continue;

            const logTimestamp = new Date(logTimestampStr);

            let username = "";
            let sourceIp = "";
            let status: "SUCCESS" | "FAILURE" | "DISCONNECT" = "SUCCESS";
            let duration: number | null = null;
            let bytesSent: number | null = null;
            let bytesReceived: number | null = null;
            let failureReason: string | null = null;

            if (connRegex.test(rawLog)) {
                const match = rawLog.match(connRegex);
                if (match) {
                    username = match[1];
                    sourceIp = match[2];
                    status = "SUCCESS";
                }
            } else if (failRegex.test(rawLog)) {
                const match = rawLog.match(failRegex);
                if (match) {
                    failureReason = match[1].trim();
                    username = match[2].trim();
                    sourceIp = match[3].trim();
                    status = "FAILURE";
                }
            } else if (discRegex.test(rawLog)) {
                const match = rawLog.match(discRegex);
                if (match) {
                    username = match[1];
                    sourceIp = match[2];
                    status = "DISCONNECT";
                    duration = parseDuration(match[3]);
                    bytesSent = parseFloat(match[4]);
                    bytesReceived = parseFloat(match[5]);
                }
            } else {
                continue; // Skip logs that don't match our signatures
            }

            if (!username || !sourceIp) continue;

            // Deduplication: check if exact same event already exists in database
            const existing = await prisma.vpnEvent.findFirst({
                where: {
                    username,
                    sourceIp,
                    status,
                    createdAt: logTimestamp
                }
            });

            if (existing) continue; // Event already imported

            // Perform IP info enrichment
            let ipInfo = null;
            try {
                ipInfo = await getIpInfoLite(sourceIp);
            } catch (enrichError) {
                console.error(`Failed to enrich IP ${sourceIp}:`, enrichError);
            }

            const bytesTotal = (bytesSent !== null || bytesReceived !== null) 
                ? (bytesSent || 0) + (bytesReceived || 0) 
                : null;

            // Save to database
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
        const range = body.range || 1800; // default 30 minutes

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
        const query = searchParams.get("q");

        if (query) {
            const cleanedQuery = query.trim();
            // Search by either username or IP address
            const results = await prisma.vpnEvent.findMany({
                where: {
                    OR: [
                        { username: { contains: cleanedQuery } },
                        { sourceIp: { contains: cleanedQuery } }
                    ]
                },
                orderBy: { createdAt: "desc" },
                take: 100
            });
            return NextResponse.json(results);
        }

        // Dashboard mode: fetch recent data to parse the last 10 unique successful/failed IPs
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
            take: 20
        });

        // Get status of the last background job sync
        let lastSyncStatus = null;
        try {
            lastSyncStatus = await prisma.backgroundJob.findUnique({
                where: { name: "Graylog VPN Sync" }
            });
        } catch (e) {}

        return NextResponse.json({
            successfulIps,
            failedIps,
            recentEvents,
            lastSync: lastSyncStatus
        });

    } catch (error: any) {
        console.error("VPN Event Query Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}
