import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { getBulkUserAdStatus } from "@/lib/ldap";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isValidCorporateUsername(uname: string): boolean {
    if (!uname) return false;
    let clean = uname.trim().toLowerCase();
    if (clean.endsWith("@cooperhealth.edu")) {
        clean = clean.slice(0, -17);
    }
    return /^[a-z0-9]+(-[a-z0-9]+){1,2}$/.test(clean);
}

export async function GET(req: Request) {
    const startTime = Date.now();
    try {
        const session = await auth();
        const role = (session?.user as any)?.role;

        if (!session?.user || !(await hasPermission(role, 'vpn-reporting'))) {
            return new NextResponse("Forbidden: Access restricted to authorized VPN Reporting roles.", { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("query")?.trim() || "";
        const rangeParam = searchParams.get("range");
        const rangeSeconds = rangeParam !== null ? parseInt(rangeParam, 10) : 86400; // 24h default
        const startDateParam = searchParams.get("startDate");
        const endDateParam = searchParams.get("endDate");
        const statusParam = searchParams.get("status")?.toUpperCase() || "ALL";
        const limitParam = parseInt(searchParams.get("limit") || "2000", 10);
        const limit = isNaN(limitParam) ? 2000 : Math.min(10000, Math.max(1, limitParam));

        const whereConditions: any = {};

        // 1. Timeframe filtering: Custom Date Range vs. Relative Range
        if (startDateParam || endDateParam) {
            whereConditions.createdAt = {};
            if (startDateParam) whereConditions.createdAt.gte = new Date(startDateParam);
            if (endDateParam) whereConditions.createdAt.lte = new Date(endDateParam);
        } else if (rangeSeconds > 0) {
            whereConditions.createdAt = { gte: new Date(Date.now() - rangeSeconds * 1000) };
        }

        // 2. Status event type filtering
        if (statusParam && statusParam !== "ALL") {
            whereConditions.status = statusParam;
        }

        const searchMode = searchParams.get("searchMode")?.toUpperCase() === "AND" ? "AND" : "OR";

        // 3. Multi-Term Username / IP / Reason search (supports OR vs AND mode)
        if (query) {
            const tokens = query.split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
            if (tokens.length > 0) {
                if (searchMode === "AND") {
                    whereConditions.AND = tokens.map(token => ({
                        OR: [
                            { username: { contains: token, mode: 'insensitive' } },
                            { sourceIp: { contains: token } },
                            { assignedIp: { contains: token } },
                            { failureReason: { contains: token, mode: 'insensitive' } },
                            { vpnStream: { contains: token, mode: 'insensitive' } },
                            { ipAsName: { contains: token, mode: 'insensitive' } }
                        ]
                    }));
                } else {
                    whereConditions.OR = tokens.flatMap(token => [
                        { username: { contains: token, mode: 'insensitive' } },
                        { sourceIp: { contains: token } },
                        { assignedIp: { contains: token } },
                        { failureReason: { contains: token, mode: 'insensitive' } },
                        { vpnStream: { contains: token, mode: 'insensitive' } },
                        { ipAsName: { contains: token, mode: 'insensitive' } }
                    ]);
                }
            }
        }

        // 4. Query PostgreSQL database & calculate exact timeframe event count
        const [events, earliestRecord, dbTotalCount, totalTimeframeEvents] = await Promise.all([
            prisma.vpnEvent.findMany({
                where: whereConditions,
                orderBy: { createdAt: 'desc' },
                take: limit
            }),
            prisma.vpnEvent.findFirst({
                select: { createdAt: true },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.vpnEvent.count(),
            prisma.vpnEvent.count({ where: whereConditions })
        ]);

        // 5. Extract unique usernames & metrics
        const uniqueUserSet = new Set<string>();
        const uniqueValidUserSet = new Set<string>();
        const activeAdUserSet = new Set<string>();
        const disabledAdUserSet = new Set<string>();
        const notFoundAdUserSet = new Set<string>();
        const uniqueIpSet = new Set<string>();
        let successCount = 0;
        let failureCount = 0;
        let disconnectCount = 0;
        let totalBytes = 0;

        // Check if any legacy events are missing adStatus
        const missingAdUsernames = new Set<string>();
        for (const evt of events) {
            if (!evt.adStatus && evt.username) {
                missingAdUsernames.add(evt.username);
            }
        }

        // Live fallback lookup only for un-enriched legacy rows
        const fallbackAdMap = missingAdUsernames.size > 0 
            ? await getBulkUserAdStatus(Array.from(missingAdUsernames)).catch(() => ({} as any))
            : {};

        const enrichedEvents = events.map(evt => {
            const u = (evt.username || "").toLowerCase();
            if (u) {
                uniqueUserSet.add(u);
                if (isValidCorporateUsername(u)) {
                    uniqueValidUserSet.add(u);
                }
            }
            if (evt.sourceIp) uniqueIpSet.add(evt.sourceIp);
            if (evt.status === "SUCCESS") successCount++;
            else if (evt.status === "FAILURE") failureCount++;
            else if (evt.status === "DISCONNECT") disconnectCount++;

            if (evt.bytesTotal) totalBytes += evt.bytesTotal;

            // Use persisted point-in-time AD status or fallback
            const adStatus = evt.adStatus || fallbackAdMap[u]?.adStatus || "NOT_FOUND";
            const adDisplayName = evt.adDisplayName || fallbackAdMap[u]?.displayName || null;
            const adDepartment = evt.adDepartment || fallbackAdMap[u]?.department || null;
            const adTitle = evt.adTitle || fallbackAdMap[u]?.title || null;
            const adEnrichedAt = evt.adEnrichedAt ? evt.adEnrichedAt.toISOString() : new Date().toISOString();

            if (u) {
                if (adStatus === "ACTIVE") activeAdUserSet.add(u);
                else if (adStatus === "DISABLED") disabledAdUserSet.add(u);
                else notFoundAdUserSet.add(u);
            }

            return {
                ...evt,
                adStatus,
                adDisplayName,
                adDepartment,
                adTitle,
                adLastCheckedAt: adEnrichedAt
            };
        });

        const responseTimeMs = Date.now() - startTime;

        return NextResponse.json({
            responseTimeMs,
            totalEventsReturned: events.length,
            totalTimeframeEvents,
            dbTotalCount,
            earliestRecordDate: earliestRecord?.createdAt ? earliestRecord.createdAt.toISOString() : null,
            uniqueUsersCount: uniqueUserSet.size,
            uniqueValidUsersCount: uniqueValidUserSet.size,
            activeAdUsersCount: activeAdUserSet.size,
            disabledAdUsersCount: disabledAdUserSet.size,
            notFoundAdUsersCount: notFoundAdUserSet.size,
            uniqueIpsCount: uniqueIpSet.size,
            successCount,
            failureCount,
            disconnectCount,
            totalBytesTransferred: totalBytes,
            events: enrichedEvents
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            }
        });

    } catch (error: any) {
        console.error("VPN Reporting API Error:", error);
        return NextResponse.json(
            { error: "Failed to fetch VPN reporting data", details: error.message },
            { status: 500 }
        );
    }
}
