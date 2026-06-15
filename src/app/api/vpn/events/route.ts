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
    // Check if it's just raw seconds as a number
    const seconds = parseInt(durationStr, 10);
    return isNaN(seconds) ? null : seconds;
}

export async function POST(req: NextRequest) {
    try {
        let username = "";
        let sourceIp = "";
        let status: "SUCCESS" | "FAILURE" | "DISCONNECT" = "SUCCESS";
        let duration: number | null = null;
        let bytesSent: number | null = null;
        let bytesReceived: number | null = null;
        let failureReason: string | null = null;

        const contentType = req.headers.get("content-type") || "";
        let rawLog = "";

        if (contentType.includes("application/json")) {
            const body = await req.json();
            if (body.rawSyslog || body.syslog) {
                rawLog = body.rawSyslog || body.syslog;
            } else {
                // Direct JSON fields
                username = body.username || "";
                sourceIp = body.sourceIp || "";
                status = body.status || "SUCCESS";
                duration = typeof body.duration === "string" ? parseDuration(body.duration) : (body.duration || null);
                bytesSent = body.bytesSent || null;
                bytesReceived = body.bytesReceived || null;
                failureReason = body.failureReason || null;
            }
        } else {
            rawLog = await req.text();
        }

        if (rawLog) {
            rawLog = rawLog.trim();
            // Parse FTD or ASA syslog messages
            
            // 1. Connection established: %FTD-6-113039: Group <GP_User> User <john.doe> IP <192.0.2.50> session established.
            const connRegex = /%(?:FTD|ASA)-\d-113039:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>/i;
            
            // 2. Auth Rejected: %FTD-6-113015: AAA user authentication Rejected : reason = Password expired : User = john.doe : IP = 192.0.2.50
            const failRegex = /%(?:FTD|ASA)-\d-113015:\s+AAA\s+user\s+authentication\s+Rejected\s+:\s+reason\s+=\s+(.+?)\s+:\s+User\s+=\s+(.+?)\s+:\s+IP\s+=\s+([^\s]+)/i;
            
            // 3. Disconnect: %FTD-4-113019: Group <GP_User> User <john.doe> IP <192.0.2.50> Separate Session Policy: Duration: 0h:05m:30s, Rx Rules: 0, Tx Rules: 0, Bytes Tx: 102400, Bytes Rx: 204800
            const discRegex = /%(?:FTD|ASA)-\d-113019:\s+Group\s+<[^>]+>\s+User\s+<([^>]+)>\s+IP\s+<([^>]+)>.*?Duration:\s*([^,]+).*?Bytes\s+Tx:\s*(\d+).*?Bytes\s+Rx:\s*(\d+)/i;

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
                return NextResponse.json({
                    success: false,
                    error: "Could not parse raw syslog. No matching signature (113039, 113015, or 113019) found."
                }, { status: 400 });
            }
        }

        // Validate basic fields
        if (!username || !sourceIp) {
            return NextResponse.json({
                success: false,
                error: "Missing required fields: username and sourceIp must be provided or parsed."
            }, { status: 400 });
        }

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

        // Save event to database
        const event = await prisma.vpnEvent.create({
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
            }
        });

        return NextResponse.json({
            success: true,
            event
        });

    } catch (error: any) {
        console.error("VPN Event Ingestion Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}

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
        // Fetch last 200 connection events to find 10 unique successful IPs
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

        // Fetch last 200 failure events to find 10 unique failed IPs
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

        // Fetch last 20 recent events overall for the feed
        const recentEvents = await prisma.vpnEvent.findMany({
            orderBy: { createdAt: "desc" },
            take: 20
        });

        return NextResponse.json({
            successfulIps,
            failedIps,
            recentEvents
        });

    } catch (error: any) {
        console.error("VPN Event Query Error:", error);
        return NextResponse.json({
            success: false,
            error: error.message || "Internal server error"
        }, { status: 500 });
    }
}
