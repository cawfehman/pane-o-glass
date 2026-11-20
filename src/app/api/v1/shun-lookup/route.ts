import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { validateApiKeyRequest, getClientIp } from "@/lib/api-keys";
import { isResidentialOrg } from "@/lib/reputation-ledger";
import { isPrivateIp } from "@/lib/iplocate";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface LookupResponseItem {
    ip: string;
    tracked: boolean;
    isCurrentlyActive: boolean;
    activeFirewalls: string[];
    clearedFirewalls: string[];
    firstSeen?: string | null;
    lastSeen?: string | null;
    daysTracked?: number;
    threatProfile: {
        countryCode: string | null;
        country: string | null;
        city: string | null;
        org: string | null;
        asn: string | null;
        classification: "RESIDENTIAL" | "HOSTING_DATACENTER" | "FOREIGN" | "PRIVATE" | "UNKNOWN";
        isForeign: boolean;
        isHostingOrVpn: boolean;
        inGuardianBlacklist: boolean;
        inNetscalerCveShun: boolean;
        inVpnAttackerEvents: boolean;
    };
}

async function authenticateCaller(req: Request): Promise<{
    authorized: boolean;
    identity: string;
    authType: "API_KEY" | "SESSION";
    error?: string;
    status?: number;
}> {
    // 1. Check if caller provided an API Key header
    const hasApiKeyHeader = Boolean(req.headers.get("x-api-key") || req.headers.get("authorization"));
    if (hasApiKeyHeader) {
        const keyResult = await validateApiKeyRequest(req, "shun:read");
        if (!keyResult.authorized) {
            return {
                authorized: false,
                identity: "Unknown",
                authType: "API_KEY",
                error: keyResult.error,
                status: keyResult.status
            };
        }
        return {
            authorized: true,
            identity: keyResult.callerIdentity || "API Client",
            authType: "API_KEY"
        };
    }

    // 2. Fall back to active NextAuth browser session (for testing directly in dashboard/browser)
    const session = await auth();
    const role = (session?.user as any)?.role;
    const userId = session?.user?.id;

    if (session?.user && (await hasPermission(role, "firewall", userId))) {
        return {
            authorized: true,
            identity: session.user.email || session.user.name || "Web User",
            authType: "SESSION"
        };
    }

    return {
        authorized: false,
        identity: "Anonymous",
        authType: "API_KEY",
        status: 401,
        error: "Unauthorized: Missing valid API Key (X-API-Key header) or active user session."
    };
}

async function resolveIpLookupData(targetIps: string[]): Promise<Record<string, LookupResponseItem>> {
    const cleanIps = Array.from(new Set(targetIps.map(ip => ip.trim()))).filter(Boolean);
    const results: Record<string, LookupResponseItem> = {};

    if (cleanIps.length === 0) return results;

    // 1. Query ShunDatabaseIp & FirewallShunStats
    const shunRecords = await prisma.shunDatabaseIp.findMany({
        where: { ip: { in: cleanIps } },
        include: {
            firewallStats: true
        }
    });

    const shunMap = new Map(shunRecords.map(r => [r.ip, r]));

    // 2. Query threat IOC tables in parallel
    const [guardianHits, cveHits, vpnHits] = await Promise.all([
        prisma.guardianBlacklist.findMany({
            where: { ip: { in: cleanIps } },
            select: { ip: true }
        }),
        prisma.netscalerCveShun.findMany({
            where: { ip: { in: cleanIps }, status: "ACTIVE" },
            select: { ip: true }
        }),
        prisma.vpnEvent.findMany({
            where: { sourceIp: { in: cleanIps } },
            select: { sourceIp: true },
            distinct: ["sourceIp"]
        })
    ]);

    const guardianSet = new Set(guardianHits.map(h => h.ip));
    const cveSet = new Set(cveHits.map(h => h.ip));
    const vpnSet = new Set(vpnHits.map(h => h.sourceIp));

    for (const ip of cleanIps) {
        const isPriv = isPrivateIp(ip);
        const record = shunMap.get(ip);

        if (!record) {
            results[ip] = {
                ip,
                tracked: false,
                isCurrentlyActive: false,
                activeFirewalls: [],
                clearedFirewalls: [],
                firstSeen: null,
                lastSeen: null,
                daysTracked: 0,
                threatProfile: {
                    countryCode: null,
                    country: null,
                    city: null,
                    org: null,
                    asn: null,
                    classification: isPriv ? "PRIVATE" : "UNKNOWN",
                    isForeign: false,
                    isHostingOrVpn: false,
                    inGuardianBlacklist: guardianSet.has(ip),
                    inNetscalerCveShun: cveSet.has(ip),
                    inVpnAttackerEvents: vpnSet.has(ip)
                }
            };
            continue;
        }

        const activeFws = record.firewallStats.filter(f => f.isActive).map(f => f.firewall);
        const clearedFws = record.firewallStats.filter(f => !f.isActive).map(f => f.firewall);

        let earliestFirstSeen: Date | null = null;
        let latestLastSeen: Date | null = null;
        let maxDaysShunned = 0;

        for (const stat of record.firewallStats) {
            if (!earliestFirstSeen || stat.firstSeen < earliestFirstSeen) {
                earliestFirstSeen = stat.firstSeen;
            }
            if (!latestLastSeen || stat.lastSeen > latestLastSeen) {
                latestLastSeen = stat.lastSeen;
            }
            if (stat.daysShunned > maxDaysShunned) {
                maxDaysShunned = stat.daysShunned;
            }
        }

        const cc = record.ipCountryCode || null;
        const org = record.org || null;
        const isRes = isResidentialOrg(org);
        const isForeign = Boolean(cc && cc !== "US" && cc !== "UNRESOLVED");
        const isHost = !isRes && !isForeign && !isPriv && Boolean(org);

        let classification: "RESIDENTIAL" | "HOSTING_DATACENTER" | "FOREIGN" | "PRIVATE" | "UNKNOWN" = "UNKNOWN";
        if (isPriv) classification = "PRIVATE";
        else if (isForeign) classification = "FOREIGN";
        else if (isHost) classification = "HOSTING_DATACENTER";
        else if (isRes) classification = "RESIDENTIAL";

        results[ip] = {
            ip,
            tracked: true,
            isCurrentlyActive: activeFws.length > 0,
            activeFirewalls: activeFws,
            clearedFirewalls: clearedFws,
            firstSeen: earliestFirstSeen ? earliestFirstSeen.toISOString() : null,
            lastSeen: latestLastSeen ? latestLastSeen.toISOString() : null,
            daysTracked: maxDaysShunned,
            threatProfile: {
                countryCode: cc,
                country: record.ipCountry || null,
                city: record.city || null,
                org,
                asn: record.ipAsn || null,
                classification,
                isForeign,
                isHostingOrVpn: isHost || vpnSet.has(ip),
                inGuardianBlacklist: guardianSet.has(ip),
                inNetscalerCveShun: cveSet.has(ip),
                inVpnAttackerEvents: vpnSet.has(ip)
            }
        };
    }

    return results;
}

/**
 * GET /api/v1/shun-lookup?ip=203.0.113.5
 * Single IP lookup.
 */
export async function GET(req: NextRequest) {
    const authResult = await authenticateCaller(req);
    if (!authResult.authorized) {
        return NextResponse.json(
            { error: authResult.error },
            { status: authResult.status || 401 }
        );
    }

    const { searchParams } = new URL(req.url);
    const targetIp = searchParams.get("ip");

    if (!targetIp || !targetIp.trim()) {
        return NextResponse.json(
            { error: "Missing required query parameter: ?ip=<ipv4-address>" },
            { status: 400 }
        );
    }

    const cleanIp = targetIp.trim();
    const lookupMap = await resolveIpLookupData([cleanIp]);
    const item = lookupMap[cleanIp];

    const clientIp = getClientIp(req);
    logAudit(
        "API_SHUN_LOOKUP",
        `Caller ${authResult.identity} queried IP ${cleanIp} (active: ${item.isCurrentlyActive})`,
        authResult.identity,
        clientIp
    ).catch(() => {});

    return NextResponse.json({
        success: true,
        caller: authResult.identity,
        query: item
    });
}

/**
 * POST /api/v1/shun-lookup
 * Bulk batch lookup for SIEM / SOAR / Pipelines.
 * Body: { "ips": ["1.1.1.1", "2.2.2.2"] }
 */
export async function POST(req: NextRequest) {
    const authResult = await authenticateCaller(req);
    if (!authResult.authorized) {
        return NextResponse.json(
            { error: authResult.error },
            { status: authResult.status || 401 }
        );
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON request body." },
            { status: 400 }
        );
    }

    const rawIps = Array.isArray(body?.ips) ? body.ips : [];
    if (rawIps.length === 0) {
        return NextResponse.json(
            { error: "Empty 'ips' array provided in request body." },
            { status: 400 }
        );
    }

    // Limit batch size to 500 IPs per request
    if (rawIps.length > 500) {
        return NextResponse.json(
            { error: "Batch size exceeds maximum limit of 500 IPs per request." },
            { status: 400 }
        );
    }

    const lookupMap = await resolveIpLookupData(rawIps);

    const values = Object.values(lookupMap);
    const totalTracked = values.filter(v => v.tracked).length;
    const totalActive = values.filter(v => v.isCurrentlyActive).length;

    const clientIp = getClientIp(req);
    logAudit(
        "API_SHUN_BATCH_LOOKUP",
        `Caller ${authResult.identity} batch-queried ${rawIps.length} IPs (${totalActive} active shuns)`,
        authResult.identity,
        clientIp
    ).catch(() => {});

    return NextResponse.json({
        success: true,
        caller: authResult.identity,
        summary: {
            totalQueried: rawIps.length,
            totalTrackedInDatabase: totalTracked,
            totalCurrentlyActiveShuns: totalActive
        },
        results: lookupMap
    });
}
