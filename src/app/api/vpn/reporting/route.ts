import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { prisma } from "@/lib/prisma";
import { getBulkUserAdStatus } from "@/lib/ldap";
import { parseBooleanSearchQuery } from "@/lib/booleanQueryParser";
import { logAudit } from "@/lib/audit";
import {
    fetchImprivataBatchIndex,
    matchEventToImprivataSession,
    formatImprivataFailureReason,
} from "@/lib/imprivata-graylog";

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

        // 2. Status event type filtering (supports multi-select comma separated list)
        if (statusParam && statusParam !== "ALL") {
            const statuses = statusParam.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
            if (statuses.length === 1) {
                whereConditions.status = statuses[0];
            } else if (statuses.length > 1) {
                whereConditions.status = { in: statuses };
            }
        }

        // 3. Multi-Term & Full Boolean Expression Search Parser (supports (), AND, OR)
        if (query) {
            const parsedWhere = parseBooleanSearchQuery(query);
            if (parsedWhere) {
                if (parsedWhere.AND) whereConditions.AND = parsedWhere.AND;
                else if (parsedWhere.OR) whereConditions.OR = parsedWhere.OR;
                else Object.assign(whereConditions, parsedWhere);
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

        // Check if any legacy events are missing adStatus or IP enrichment, and collect failed usernames for Imprivata correlation
        const missingAdUsernames = new Set<string>();
        const missingIpSet = new Set<string>();
        const imprivataTargetUsers = new Set<string>();
        const fourteenDaysAgoMs = Date.now() - 14 * 86400 * 1000;

        for (const evt of events) {
            if (!evt.adStatus && evt.username) {
                missingAdUsernames.add(evt.username);
            }
            if (evt.sourceIp && (!evt.ipAsn || !evt.ipCountry)) {
                missingIpSet.add(evt.sourceIp);
            }
            if (
                evt.username &&
                new Date(evt.createdAt).getTime() >= fourteenDaysAgoMs &&
                (evt.status === "FAILURE" || evt.status === "SUCCESS")
            ) {
                if (evt.status === "FAILURE" || imprivataTargetUsers.size < 50) {
                    imprivataTargetUsers.add(evt.username);
                }
            }
        }

        const effectiveImprivataRange =
            rangeSeconds > 0 ? Math.min(rangeSeconds + 3600, 14 * 86400) : 7 * 86400;

        // Live fallback lookup for un-enriched legacy AD rows, IpLookupCache, and Imprivata RADIUS batch index
        const [fallbackAdMap, cachedIps, imprivataIndex] = await Promise.all([
            missingAdUsernames.size > 0
                ? getBulkUserAdStatus(Array.from(missingAdUsernames)).catch(() => ({} as any))
                : Promise.resolve({} as any),
            missingIpSet.size > 0
                ? prisma.ipLookupCache
                      .findMany({
                          where: { ip: { in: Array.from(missingIpSet) } },
                      })
                      .catch(() => [])
                : Promise.resolve([]),
            imprivataTargetUsers.size > 0
                ? fetchImprivataBatchIndex(
                      effectiveImprivataRange,
                      "VPN",
                      900,
                      Array.from(imprivataTargetUsers)
                  ).catch(() => new Map())
                : Promise.resolve(new Map()),
        ]);

        // Batch lookup IpLookupCache for source IPs missing ASN/Country info
        const ipCacheMap: Record<string, any> = {};
        for (const c of cachedIps) {
            try {
                const raw = JSON.parse(c.rawJson);
                ipCacheMap[c.ip] = {
                    ipAsn: raw.asn?.asn || raw.asn || null,
                    ipAsName: raw.asn?.name || raw.company?.name || raw.org || null,
                    ipAsDomain: raw.asn?.domain || raw.company?.domain || null,
                    ipCountry: raw.country || null,
                    ipCountryCode: raw.country_code || c.countryCode || null,
                    city: c.city || raw.city || null,
                };
            } catch (e) {}
        }

        let imprivataBadPasswordCount = 0;
        let imprivataMfaTimeoutCount = 0;
        let imprivataInvalidUserCount = 0;

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

            const fallbackIp = ipCacheMap[evt.sourceIp] || {};
            const ipAsn = evt.ipAsn || fallbackIp.ipAsn || null;
            const ipAsName = evt.ipAsName || fallbackIp.ipAsName || null;
            const ipAsDomain = evt.ipAsDomain || fallbackIp.ipAsDomain || null;
            const ipCountry = evt.ipCountry || fallbackIp.ipCountry || null;
            const ipCountryCode = evt.ipCountryCode || fallbackIp.ipCountryCode || null;
            const ipCity = fallbackIp.city || null;

            // Correlate with Imprivata RADIUS session if within window
            let imprivataVerdict: string | null = null;
            let imprivataVerdictLabel: string | null = null;
            let imprivataMfaMethod: string | null = null;
            let imprivataNode: string | null = null;
            let enrichedFailureReason = evt.failureReason;

            if (evt.status === "FAILURE" || evt.status === "SUCCESS") {
                const matchedImp = matchEventToImprivataSession(
                    evt.username,
                    evt.createdAt,
                    imprivataIndex,
                    120000,
                    evt.status === "FAILURE"
                );
                if (matchedImp) {
                    imprivataVerdict = matchedImp.verdict;
                    imprivataVerdictLabel = matchedImp.verdictLabel;
                    imprivataMfaMethod = matchedImp.mfaMethod || null;
                    imprivataNode = matchedImp.imprivataNode || null;

                    if (evt.status === "FAILURE") {
                        if (matchedImp.verdict === "BAD_AD_PASSWORD_OR_POLICY") imprivataBadPasswordCount++;
                        else if (matchedImp.verdict === "MFA_PUSH_TIMEOUT") imprivataMfaTimeoutCount++;
                        else if (matchedImp.verdict === "INVALID_USER") imprivataInvalidUserCount++;

                        if (
                            !enrichedFailureReason ||
                            /^(unspecified|invalid password|authentication failed)$/i.test(
                                enrichedFailureReason.replace(/^\[⚠️[^\]]+\]\s*/, "").trim()
                            )
                        ) {
                            const threatPrefixMatch = enrichedFailureReason?.match(/^(\[⚠️[^\]]+\])\s*/);
                            const prefix = threatPrefixMatch ? `${threatPrefixMatch[1]} ` : "";
                            enrichedFailureReason = `${prefix}${formatImprivataFailureReason(matchedImp)}`;
                        }
                    }
                }
            }

            return {
                ...evt,
                failureReason: enrichedFailureReason,
                imprivataVerdict,
                imprivataVerdictLabel,
                imprivataMfaMethod,
                imprivataNode,
                ipAsn,
                ipAsName,
                ipAsDomain,
                ipCountry,
                ipCountryCode,
                ipCity,
                adStatus,
                adDisplayName,
                adDepartment,
                adTitle,
                adLastCheckedAt: adEnrichedAt
            };
        });

        // Log audit event for reporting query
        try {
            const forwardedFor = req.headers.get("x-forwarded-for");
            const clientIp = forwardedFor ? forwardedFor.split(',')[0] : 'unknown';
            logAudit(
                "VPN_REPORT_QUERY",
                `Queried VPN reporting dataset (timeframe: ${rangeSeconds}s, query: "${query || 'none'}", status: ${statusParam}, results: ${events.length})`,
                session.user.id,
                clientIp
            ).catch(() => {});
        } catch (e) {
            console.error("Failed to write audit log for VPN reporting query:", e);
        }

        return NextResponse.json({
            responseTimeMs: Date.now() - startTime,
            totalEventsReturned: enrichedEvents.length,
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
            imprivataBadPasswordCount,
            imprivataMfaTimeoutCount,
            imprivataInvalidUserCount,
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
