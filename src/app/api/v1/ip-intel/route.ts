import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { validateApiKeyRequest, getClientIp } from "@/lib/api-keys";
import { isResidentialOrg } from "@/lib/reputation-ledger";
import { isPrivateIp } from "@/lib/iplocate";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export interface IpIntelResponseItem {
    ip: string;
    tracked: boolean;
    metadata: {
        country: string | null;
        countryCode: string | null;
        subdivision: string | null;
        city: string | null;
        postalCode: string | null;
        timeZone: string | null;
        latitude: number | null;
        longitude: number | null;
        continent: string | null;
        asn: string | null;
        asnName: string | null;
        asnRoute: string | null;
        asnDomain: string | null;
        org: string | null;
        isResidential: boolean;
        isHosting: boolean;
        isPrivate: boolean;
    };
    observations: {
        shun: {
            isActive: boolean;
            activeFirewalls: string[];
            clearedFirewalls: string[];
        };
        securityIntelligenceFeed: boolean;
        guardianBlacklist: boolean;
        netscalerCveExploits: boolean;
        vpnAttackerHistory: boolean;
    };
    lifecycle: {
        firstSeen: string | null;
        lastSeen: string | null;
        daysTracked: number;
        lastEnriched: string | null;
    };
}

// Backward-compatible type alias
export type IpMetadataResponseItem = IpIntelResponseItem;

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
        // Accept either "intel:read" or legacy "shun:read"
        const keyResult = await validateApiKeyRequest(req, "intel:read");
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

export async function resolveFullIpIntel(targetIps: string[]): Promise<Record<string, IpIntelResponseItem>> {
    const cleanIps = Array.from(new Set(targetIps.map(ip => ip.trim()))).filter(Boolean);
    const results: Record<string, IpIntelResponseItem> = {};

    if (cleanIps.length === 0) return results;

    // Parallel fetch across databases & caches
    const [shunRecords, cacheRecords, guardianHits, cveHits, vpnHits] = await Promise.all([
        prisma.shunDatabaseIp.findMany({
            where: { ip: { in: cleanIps } },
            include: { firewallStats: true }
        }),
        prisma.ipLookupCache.findMany({
            where: { ip: { in: cleanIps } }
        }),
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

    const shunMap = new Map(shunRecords.map(r => [r.ip, r]));
    const cacheMap = new Map(cacheRecords.map(c => [c.ip, c]));
    const guardianSet = new Set(guardianHits.map(h => h.ip));
    const cveSet = new Set(cveHits.map(h => h.ip));
    const vpnSet = new Set(vpnHits.map(h => h.sourceIp));

    for (const ip of cleanIps) {
        const isPriv = isPrivateIp(ip);
        const shunRecord = shunMap.get(ip);
        const cacheRecord = cacheMap.get(ip);

        let parsedJson: any = {};
        if (cacheRecord?.rawJson) {
            try {
                parsedJson = JSON.parse(cacheRecord.rawJson);
            } catch {}
        }

        const country = parsedJson.country || shunRecord?.ipCountry || null;
        const countryCode = parsedJson.country_code || cacheRecord?.countryCode || shunRecord?.ipCountryCode || null;
        const subdivision = parsedJson.subdivision || cacheRecord?.subdivision || null;
        const city = parsedJson.city || cacheRecord?.city || shunRecord?.city || null;
        const postalCode = parsedJson.postal_code || null;
        const timeZone = parsedJson.time_zone || null;
        const latitude = parsedJson.latitude ?? cacheRecord?.latitude ?? null;
        const longitude = parsedJson.longitude ?? cacheRecord?.longitude ?? null;
        const continent = parsedJson.continent || shunRecord?.continent || null;

        const asnObj = typeof parsedJson.asn === "object" ? parsedJson.asn : null;
        const asn = asnObj?.asn || (typeof parsedJson.asn === "string" ? parsedJson.asn : shunRecord?.ipAsn) || null;
        const asnName = asnObj?.name || asnObj?.org || null;
        const asnRoute = asnObj?.route || null;
        const asnDomain = asnObj?.domain || null;
        const org = parsedJson.org || asnName || shunRecord?.org || null;

        const isRes = isResidentialOrg(org);
        const isForeign = Boolean(countryCode && countryCode !== "US" && countryCode !== "UNRESOLVED");
        const isHost = !isRes && !isForeign && !isPriv && Boolean(org);

        // Observations
        const activeFws = shunRecord ? shunRecord.firewallStats.filter(f => f.isActive).map(f => f.firewall) : [];
        const clearedFws = shunRecord ? shunRecord.firewallStats.filter(f => !f.isActive).map(f => f.firewall) : [];

        let earliestFirstSeen: Date | null = null;
        let latestLastSeen: Date | null = null;
        let maxDaysShunned = 0;

        if (shunRecord) {
            for (const stat of shunRecord.firewallStats) {
                if (!earliestFirstSeen || stat.firstSeen < earliestFirstSeen) earliestFirstSeen = stat.firstSeen;
                if (!latestLastSeen || stat.lastSeen > latestLastSeen) latestLastSeen = stat.lastSeen;
                if (stat.daysShunned > maxDaysShunned) maxDaysShunned = stat.daysShunned;
            }
        }

        const inGuardian = guardianSet.has(ip);
        const inCve = cveSet.has(ip);
        const inVpn = vpnSet.has(ip);
        const isShunActive = activeFws.length > 0;

        // An IP is in the FMC Security Intelligence feed if it's active in CVE shuns, Guardian blacklist, or active foreign/hosting shuns
        const inFmcFeed = inCve || inGuardian || (isShunActive && (isForeign || isHost));

        results[ip] = {
            ip,
            tracked: Boolean(shunRecord || cacheRecord),
            metadata: {
                country,
                countryCode,
                subdivision,
                city,
                postalCode,
                timeZone,
                latitude,
                longitude,
                continent,
                asn: asn ? (String(asn).startsWith("AS") ? String(asn) : `AS${asn}`) : null,
                asnName,
                asnRoute,
                asnDomain,
                org,
                isResidential: isRes,
                isHosting: isHost,
                isPrivate: isPriv
            },
            observations: {
                shun: {
                    isActive: isShunActive,
                    activeFirewalls: activeFws,
                    clearedFirewalls: clearedFws
                },
                securityIntelligenceFeed: inFmcFeed,
                guardianBlacklist: inGuardian,
                netscalerCveExploits: inCve,
                vpnAttackerHistory: inVpn
            },
            lifecycle: {
                firstSeen: earliestFirstSeen ? earliestFirstSeen.toISOString() : null,
                lastSeen: latestLastSeen ? latestLastSeen.toISOString() : null,
                daysTracked: maxDaysShunned,
                lastEnriched: shunRecord?.enrichedAt ? shunRecord.enrichedAt.toISOString() : (cacheRecord ? cacheRecord.updatedAt.toISOString() : null)
            }
        };
    }

    return results;
}

// Backward compatibility alias
export const resolveFullIpMetadata = resolveFullIpIntel;

/**
 * GET /api/v1/ip-intel?ip=203.0.113.5
 * Objective, high-fidelity IP intelligence and observation lookup.
 */
export async function GET(req: NextRequest) {
    const authResult = await authenticateCaller(req);
    if (!authResult.authorized) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetIp = searchParams.get("ip");

    if (!targetIp || !targetIp.trim()) {
        return NextResponse.json({ error: "Missing required query parameter: ?ip=<ipv4-address>" }, { status: 400 });
    }

    const cleanIp = targetIp.trim();
    const lookupMap = await resolveFullIpIntel([cleanIp]);
    const item = lookupMap[cleanIp];

    const clientIp = getClientIp(req);
    logAudit(
        "API_IP_INTEL_LOOKUP",
        `Caller ${authResult.identity} queried IP ${cleanIp} (active: ${item.observations.shun.isActive})`,
        authResult.identity,
        clientIp
    ).catch(() => {});

    return NextResponse.json({
        success: true,
        caller: authResult.identity,
        ip: cleanIp,
        tracked: item.tracked,
        metadata: item.metadata,
        observations: item.observations,
        lifecycle: item.lifecycle
    });
}

/**
 * POST /api/v1/ip-intel
 * Batch lookup for SIEM / SOAR / Pipelines.
 * Body: { "ips": ["1.1.1.1", "2.2.2.2"] }
 */
export async function POST(req: NextRequest) {
    const authResult = await authenticateCaller(req);
    if (!authResult.authorized) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status || 401 });
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const rawIps = Array.isArray(body?.ips) ? body.ips : [];
    if (rawIps.length === 0) {
        return NextResponse.json({ error: "Empty 'ips' array provided in request body." }, { status: 400 });
    }

    if (rawIps.length > 500) {
        return NextResponse.json({ error: "Batch size exceeds maximum limit of 500 IPs per request." }, { status: 400 });
    }

    const lookupMap = await resolveFullIpIntel(rawIps);

    const values = Object.values(lookupMap);
    const totalTracked = values.filter(v => v.tracked).length;
    const totalActiveShuns = values.filter(v => v.observations.shun.isActive).length;

    const clientIp = getClientIp(req);
    logAudit(
        "API_IP_INTEL_BATCH_LOOKUP",
        `Caller ${authResult.identity} batch-queried ${rawIps.length} IPs (${totalActiveShuns} active shuns)`,
        authResult.identity,
        clientIp
    ).catch(() => {});

    return NextResponse.json({
        success: true,
        caller: authResult.identity,
        summary: {
            totalQueried: rawIps.length,
            totalTrackedInDatabase: totalTracked,
            totalCurrentlyActiveShuns: totalActiveShuns
        },
        results: lookupMap
    });
}
