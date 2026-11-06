import { prisma } from "@/lib/prisma";
import { getIpEnrichment, isPrivateIp } from "@/lib/iplocate";
import { isResidentialOrg } from "@/lib/reputation-ledger";
import { isIpInSubnet, FastSubnetMatcher } from "@/lib/ip-subnet";

const PLACEHOLDER_TOKENS = new Set([
    "UNKNOWN",
    "UNKNOWN PROVIDER",
    "N/A",
    "NA",
    "UNRESOLVED",
    "NULL",
    "NONE",
    "-"
]);

export function cleanCountryCode(code?: string | null): string | null {
    if (!code || typeof code !== "string") return null;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || PLACEHOLDER_TOKENS.has(trimmed)) return null;
    return trimmed;
}

export function cleanMetaString(val?: unknown): string | null {
    if (val === null || val === undefined) return null;
    if (typeof val === "object") {
        const obj = val as Record<string, unknown>;
        const candidate = obj.name || obj.asn || obj.as_name || obj.org;
        return cleanMetaString(candidate);
    }
    if (typeof val !== "string" && typeof val !== "number") return null;
    const trimmed = String(val).trim();
    if (!trimmed || PLACEHOLDER_TOKENS.has(trimmed.toUpperCase())) return null;
    return trimmed;
}

export function extractAsnString(rawAsn: unknown): string | null {
    if (!rawAsn) return null;
    if (typeof rawAsn === "object") {
        const obj = rawAsn as Record<string, unknown>;
        return cleanMetaString(obj.asn || obj.as_number || obj.number);
    }
    return cleanMetaString(rawAsn);
}

export interface EvaluatedIpPosture {
    ip: string;
    inFeed: boolean;
    inDoNotBlockFeed?: boolean;
    matchedSubnet?: string | null;
    fmcDecision?: "BLOCK_WITH_RESET" | "DO_NOT_BLOCK" | "PERMIT";
    isCurrentlyBlocked: boolean;
    activeCategory: string;
    reason: string;
    blockPosture: {
        inFmcFeed: boolean;
        inDoNotBlockFeed?: boolean;
        matchedSubnet?: string | null;
        fmcDecision?: "BLOCK_WITH_RESET" | "DO_NOT_BLOCK" | "PERMIT";
        inPerimeterVpnShun: boolean;
        activeShunNodes: string[];
        strikeCount: number;
        strikeStatus: string;
        isBlacklisted: boolean;
        blacklistReason: string | null;
        isAsnBlacklisted: boolean;
        asnBlacklistReason: string | null;
        isCveExploit: boolean;
        fmcGeoStatus: {
            countryCode: string;
            isUsGeo: boolean;
            fmcGeoBlocked: boolean;
            verdict: string;
        };
    };
    networkProfile: {
        isp: string;
        asn: string;
        city: string;
        countryCode: string;
        countryName: string | null;
        carrierType: string;
    };
    shunHistory: {
        hasShunHistory: boolean;
        nodes: Array<{
            node: string;
            isActive: boolean;
            daysShunned: number;
            firstSeen: Date;
            lastSeen: Date;
        }>;
    };
}

interface RawIpPostureInputs {
    ip: string;
    inFeed?: boolean;
    inWhitelistFeed?: boolean;
    matchedSubnet?: string | null;
    residential?: any | null;
    blacklist?: any | null;
    cve?: any | null;
    shunStats?: any[];
    cache?: any | null;
    enrichment?: {
        asn?: string;
        as_name?: string;
        country_code?: string;
        country?: string;
        city?: string;
    } | null;
    hintCountryCode?: string | null;
    hintCountryName?: string | null;
    asnBlacklistLookup?: (normalizedAsnNum: string) => { isBlacklisted: boolean; reason: string | null };
}

function buildPostureFromRecords(inputs: RawIpPostureInputs): EvaluatedIpPosture {
    const {
        ip,
        residential,
        blacklist,
        cve,
        shunStats = [],
        cache,
        enrichment,
        hintCountryCode,
        hintCountryName,
        asnBlacklistLookup
    } = inputs;

    const activeShunNodes = shunStats.filter(s => s.isActive).map(s => s.firewall || "Perimeter ASA");
    const inPerimeterVpnShun = activeShunNodes.length > 0;

    let rawGeo: any = null;
    if (cache?.rawJson) {
        try {
            rawGeo = JSON.parse(cache.rawJson);
        } catch {}
    }

    const ispOrg =
        cleanMetaString(enrichment?.as_name) ||
        cleanMetaString(rawGeo?.company?.name) ||
        cleanMetaString(rawGeo?.asn?.name) ||
        cleanMetaString(rawGeo?.as_name) ||
        cleanMetaString(rawGeo?.org) ||
        cleanMetaString(rawGeo?.isp) ||
        cleanMetaString(residential?.ispOrg) ||
        cleanMetaString(shunStats[0]?.shunIp?.org) ||
        "Unknown Provider";

    const asnResolved =
        extractAsnString(enrichment?.asn) ||
        extractAsnString(rawGeo?.asn) ||
        extractAsnString(rawGeo?.as) ||
        extractAsnString(residential?.asn) ||
        extractAsnString(shunStats[0]?.shunIp?.ipAsn);
    const asnStr = asnResolved || "Unknown";

    const resolvedCountryCode =
        cleanCountryCode(enrichment?.country_code) ||
        cleanCountryCode(cache?.countryCode) ||
        cleanCountryCode(rawGeo?.country_code) ||
        cleanCountryCode(rawGeo?.countryCode) ||
        cleanCountryCode(residential?.country) ||
        cleanCountryCode(shunStats[0]?.shunIp?.ipCountryCode) ||
        cleanCountryCode(hintCountryCode);

    const resolvedCountryName =
        cleanMetaString(enrichment?.country) ||
        cleanMetaString(rawGeo?.country) ||
        cleanMetaString(rawGeo?.country_name) ||
        cleanMetaString(hintCountryName);

    const city =
        cleanMetaString(enrichment?.city) ||
        cleanMetaString(cache?.city) ||
        cleanMetaString(rawGeo?.city) ||
        cleanMetaString(residential?.city) ||
        cleanMetaString(shunStats[0]?.shunIp?.city) ||
        "Unknown";

    const carrierType = cleanMetaString(rawGeo?.carrier?.name) || "Broadband / Hosting";

    // ASN Blacklist check
    let isAsnBlacklisted = false;
    let asnBlacklistReason: string | null = null;
    if (asnResolved && asnBlacklistLookup) {
        const rawNum = asnResolved.toUpperCase().replace(/^AS/, "");
        const asnCheck = asnBlacklistLookup(rawNum);
        isAsnBlacklisted = asnCheck.isBlacklisted;
        asnBlacklistReason = asnCheck.reason;
    }

    // Strike Ledger check (respect PARDONED status and expiresAt TTL)
    const now = new Date();
    const isStrikeNotExpired = !residential?.expiresAt || new Date(residential.expiresAt) > now;
    const isStrikeEnforced = Boolean(
        residential &&
        residential.status !== "PARDONED" &&
        isStrikeNotExpired &&
        (residential.status === "ENFORCED" || residential.status === "QUARANTINED" || residential.strikeCount >= 2)
    );

    // Whitelist / Do Not Block status
    const isPardoned = Boolean(
        inputs.inWhitelistFeed ||
        (residential?.status === "PARDONED" && isStrikeNotExpired)
    );

    const isCveExploit = Boolean(cve && cve.status === "ACTIVE");
    const matchedSubnet = inputs.matchedSubnet || null;
    const isBlacklisted = Boolean(blacklist) || Boolean(matchedSubnet);
    const blacklistReason = blacklist?.reason || (matchedSubnet ? `Covered by consolidated hostile subnet ${matchedSubnet}` : null);

    // If caller didn't supply a pre-computed feed set, compute whether this IP qualifies for the SI feed
    let inFeed = inputs.inFeed;
    if (inFeed === undefined) {
        const residentialCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const qualifiesViaShun = shunStats.some(stat => {
            if (!stat.isActive) return false;
            const isRes = isResidentialOrg(stat.shunIp?.org || ispOrg);
            return isRes ? new Date(stat.lastSeen) >= residentialCutoff : true;
        });
        inFeed = isCveExploit || isBlacklisted || isStrikeEnforced || qualifiesViaShun;
    }

    // FMC GeoIP Rule 2 (US Permit) / Rule 3 (Foreign Block) evaluation
    // Never default an unresolved country to "US", and never treat an unresolved country as Geo-Blocked.
    const isUsGeo = resolvedCountryCode === "US";
    const fmcGeoBlocked = Boolean(resolvedCountryCode && resolvedCountryCode.length === 2 && resolvedCountryCode !== "US");
    const displayCountryCode = resolvedCountryCode || "UNRESOLVED";

    let activeCategory = "NONE";
    let reason = "Not blocked in FMC Security Intelligence feed or perimeter controls";

    if (isPardoned) {
        activeCategory = "FMC_DO_NOT_BLOCK";
        reason = `Explicitly permitted by FMC Security Intelligence 'Do Not Block' Policy${residential?.pardonReason ? `: "${residential.pardonReason}"` : " (Pardoned / Whitelisted)"}`;
    } else if (isCveExploit) {
        activeCategory = "CVE_IOC";
        reason = `NetScaler CVE-2026 Exploit IOC (${cve.cve})`;
    } else if (isBlacklisted) {
        activeCategory = matchedSubnet ? "SUBNET_BLACKLIST" : "BLACKLIST";
        reason = `Permanent Guardian Blacklist: ${blacklistReason || "Administrative block"}`;
    } else if (isAsnBlacklisted) {
        activeCategory = "ASN_BLACKLIST";
        reason = `Blacklisted Autonomous System (${asnStr}): ${asnBlacklistReason || "Administrative ASN block"}`;
    } else if (isStrikeEnforced) {
        activeCategory = "RESIDENTIAL_STRIKE";
        reason = `Citrix Strike ${residential.strikeCount} (${residential.status}): ${residential.attemptedUsers?.length || 0} account(s) probed`;
    } else if (inPerimeterVpnShun) {
        activeCategory = "PERIMETER_VPN_SHUN";
        reason = `Perimeter VPN Shun active on: ${activeShunNodes.join(", ")}`;
    } else if (fmcGeoBlocked) {
        activeCategory = "FMC_GEOIP_BLOCKED";
        reason = `Non-US Location (${resolvedCountryCode}): Likely blocked by FMC ACP Rule 3 ('Block access to Netscaler') unless whitelisted in Rule 1`;
    } else if (inFeed) {
        activeCategory = "SI_FEED";
        reason = "Present in FMC Security Intelligence Feed (POG_SI_Edge_Defense)";
    }

    const isBlockedByThreatRules =
        Boolean(inFeed) ||
        isAsnBlacklisted ||
        isBlacklisted ||
        isCveExploit ||
        isStrikeEnforced ||
        fmcGeoBlocked;

    // In FMC, Do Not Block ALWAYS takes precedence over Threat Blocks!
    const isCurrentlyBlocked = isPardoned ? inPerimeterVpnShun : (isBlockedByThreatRules || inPerimeterVpnShun);
    const fmcDecision: "DO_NOT_BLOCK" | "BLOCK_WITH_RESET" | "PERMIT" = isPardoned
        ? "DO_NOT_BLOCK"
        : (isBlockedByThreatRules ? "BLOCK_WITH_RESET" : "PERMIT");

    return {
        ip,
        inFeed: Boolean(inFeed),
        inDoNotBlockFeed: isPardoned,
        matchedSubnet,
        fmcDecision,
        isCurrentlyBlocked,
        activeCategory,
        reason,
        blockPosture: {
            inFmcFeed: Boolean(inFeed),
            inDoNotBlockFeed: isPardoned,
            matchedSubnet,
            fmcDecision,
            inPerimeterVpnShun,
            activeShunNodes,
            strikeCount: residential?.strikeCount ?? 0,
            strikeStatus: residential?.status ?? "CLEAN",
            isBlacklisted,
            blacklistReason,
            isAsnBlacklisted,
            asnBlacklistReason,
            isCveExploit,
            fmcGeoStatus: {
                countryCode: displayCountryCode,
                isUsGeo,
                fmcGeoBlocked,
                verdict: fmcGeoBlocked
                    ? `LIKELY BLOCKED by FMC ACP Rule 3 (Non-US: ${resolvedCountryCode}, unless in Rule 1 allowlist)`
                    : isUsGeo
                    ? "PERMITTED by FMC ACP Rule 2 (Domestic US)"
                    : "UNRESOLVED (Geolocation not yet verified)"
            }
        },
        networkProfile: {
            isp: ispOrg,
            asn: asnStr,
            city,
            countryCode: displayCountryCode,
            countryName: resolvedCountryName,
            carrierType
        },
        shunHistory: {
            hasShunHistory: shunStats.length > 0,
            nodes: shunStats.map(s => ({
                node: s.firewall,
                isActive: s.isActive,
                daysShunned: s.daysShunned,
                firstSeen: s.firstSeen,
                lastSeen: s.lastSeen
            }))
        }
    };
}

/**
 * Single authoritative check for whether a public IPv4 address is blocked across
 * any perimeter layer (FMC SI Feed, ASA Shun, Strike Ledger, Guardian IP/ASN Blacklist, CVE Shun, or FMC Geo-Fence).
 */
export async function evaluateSingleIpPosture(
    ip: string,
    options?: {
        inFeed?: boolean;
        enrichIfMissing?: boolean;
        hintCountryCode?: string | null;
        hintCountryName?: string | null;
    }
): Promise<EvaluatedIpPosture | null> {
    const cleanIp = (ip || "").trim();
    if (!cleanIp || isPrivateIp(cleanIp)) {
        return null;
    }

    const [residential, blacklist, cve, allShunStats, cache, blacklistCidrs, watchEntry] = await Promise.all([
        prisma.residentialStrikeLedger.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.guardianBlacklist.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.netscalerCveShun.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.firewallShunStats.findMany({
            where: { ip: cleanIp },
            include: { shunIp: true }
        }).catch(() => []),
        prisma.ipLookupCache.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.guardianBlacklist.findMany({ where: { ip: { contains: "/" } } }).catch(() => []),
        prisma.guardianWatchIp.findUnique({ where: { ip: cleanIp } }).catch(() => null)
    ]);

    const subnetMatcher = new FastSubnetMatcher(blacklistCidrs.map((c) => c.ip));
    const matchedSubnet = subnetMatcher.findMatchingSubnet(cleanIp);
    const isPardonedStrike = Boolean(residential?.status === "PARDONED" && (!residential.expiresAt || new Date(residential.expiresAt) > new Date()));
    const inWhitelistFeed = Boolean(watchEntry) || isPardonedStrike;

    let hasCachedCountry = Boolean(cleanCountryCode(cache?.countryCode));
    if (!hasCachedCountry && cache?.rawJson) {
        try {
            const parsed = JSON.parse(cache.rawJson);
            hasCachedCountry = Boolean(cleanCountryCode(parsed?.country_code || parsed?.countryCode));
        } catch {}
    }

    let enrichment = null;
    if (options?.enrichIfMissing !== false && !hasCachedCountry && !cleanCountryCode(options?.hintCountryCode)) {
        try {
            enrichment = await getIpEnrichment(cleanIp);
        } catch {}
    }

    // Check ASN blacklist if we have an ASN
    let rawGeo: any = null;
    if (cache?.rawJson) {
        try { rawGeo = JSON.parse(cache.rawJson); } catch {}
    }
    const candidateAsn =
        extractAsnString(enrichment?.asn) ||
        extractAsnString(rawGeo?.asn) ||
        extractAsnString(rawGeo?.as) ||
        extractAsnString(residential?.asn) ||
        extractAsnString(allShunStats[0]?.shunIp?.ipAsn);

    let asnEntry: { reason: string | null } | null = null;
    if (candidateAsn) {
        const rawNum = candidateAsn.toUpperCase().replace(/^AS/, "");
        asnEntry = await prisma.guardianAsnBlacklist.findFirst({
            where: { OR: [{ asn: `AS${rawNum}` }, { asn: rawNum }] }
        }).catch(() => null);
    }

    return buildPostureFromRecords({
        ip: cleanIp,
        inFeed: options?.inFeed,
        inWhitelistFeed,
        matchedSubnet,
        residential,
        blacklist,
        cve,
        shunStats: allShunStats,
        cache,
        enrichment,
        hintCountryCode: options?.hintCountryCode,
        hintCountryName: options?.hintCountryName,
        asnBlacklistLookup: () => ({
            isBlacklisted: Boolean(asnEntry),
            reason: asnEntry?.reason || null
        })
    });
}

/**
 * Bulk authoritative check for up to 100 IPv4 addresses using the exact same rules
 * as evaluateSingleIpPosture.
 */
export async function evaluateBatchIpPosture(
    ips: string[],
    feedIpSet: Set<string>
): Promise<Array<EvaluatedIpPosture & { pendingCommandsCount: number }>> {
    const cleanIps = Array.from(new Set(ips.map(i => i.trim()).filter(Boolean))).slice(0, 100);
    if (cleanIps.length === 0) return [];

    const [residentialList, blacklistList, cveList, allShunStats, allCache, allAsnBlacklist, pendingCommands, blacklistCidrs, watchList, pardonedList] = await Promise.all([
        prisma.residentialStrikeLedger.findMany({ where: { ip: { in: cleanIps } } }),
        prisma.guardianBlacklist.findMany({ where: { ip: { in: cleanIps } } }),
        prisma.netscalerCveShun.findMany({ where: { ip: { in: cleanIps } } }),
        prisma.firewallShunStats.findMany({
            where: { ip: { in: cleanIps } },
            include: { shunIp: true }
        }),
        prisma.ipLookupCache.findMany({ where: { ip: { in: cleanIps } } }),
        prisma.guardianAsnBlacklist.findMany(),
        prisma.firewallCommandQueue.findMany({ where: { ip: { in: cleanIps }, status: "PENDING" } }),
        prisma.guardianBlacklist.findMany({ where: { ip: { contains: "/" } } }).catch(() => []),
        prisma.guardianWatchIp.findMany({ where: { ip: { in: cleanIps } } }).catch(() => []),
        prisma.residentialStrikeLedger.findMany({
            where: {
                ip: { in: cleanIps },
                status: "PARDONED",
                expiresAt: { gt: new Date() }
            }
        }).catch(() => [])
    ]);

    const resMap = new Map(residentialList.map(r => [r.ip, r]));
    const blMap = new Map(blacklistList.map(b => [b.ip, b]));
    const cveMap = new Map(cveList.map(c => [c.ip, c]));
    const cacheMap = new Map(allCache.map(c => [c.ip, c]));
    const watchSet = new Set(watchList.map(w => w.ip));
    const pardonedSet = new Set(pardonedList.map(p => p.ip));
    const pendingMap = new Map<string, number>();
    for (const p of pendingCommands) {
        pendingMap.set(p.ip, (pendingMap.get(p.ip) || 0) + 1);
    }

    const shunStatsMap = new Map<string, typeof allShunStats>();
    for (const s of allShunStats) {
        if (!shunStatsMap.has(s.ip)) shunStatsMap.set(s.ip, []);
        shunStatsMap.get(s.ip)!.push(s);
    }

    const asnBlacklistMap = new Map<string, string | null>();
    for (const a of allAsnBlacklist) {
        asnBlacklistMap.set(a.asn.toUpperCase().replace(/^AS/, ""), a.reason || null);
    }

    const subnetMatcher = new FastSubnetMatcher(blacklistCidrs.map((c) => c.ip));

    return cleanIps.map(currIp => {
        const matchedSubnet = subnetMatcher.findMatchingSubnet(currIp);
        const inWhitelistFeed = watchSet.has(currIp) || pardonedSet.has(currIp);

        const evaluated = buildPostureFromRecords({
            ip: currIp,
            inFeed: feedIpSet.has(currIp) || Boolean(matchedSubnet),
            inWhitelistFeed,
            matchedSubnet,
            residential: resMap.get(currIp),
            blacklist: blMap.get(currIp),
            cve: cveMap.get(currIp),
            shunStats: shunStatsMap.get(currIp) || [],
            cache: cacheMap.get(currIp),
            asnBlacklistLookup: (rawNum) => ({
                isBlacklisted: asnBlacklistMap.has(rawNum),
                reason: asnBlacklistMap.get(rawNum) || null
            })
        });

        return {
            ...evaluated,
            pendingCommandsCount: pendingMap.get(currIp) || 0
        };
    });
}
