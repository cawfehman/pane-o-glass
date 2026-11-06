import { prisma } from "@/lib/prisma";
import { isResidentialOrg } from "@/lib/isp-classification";
import { isIpInSubnet, parseCidr, isValidCidr, normalizeAsn } from "@/lib/ip-subnet";
import { invalidateFeedCache } from "@/app/api/feeds/security-intelligence/route";

export interface SubnetCondensationCandidate {
    cidr: string;
    network: string;
    prefixLen: number;
    asn: string;
    asnName: string;
    attackIpsCount: number;
    sampleAttackIps: string[];
    isBlacklistedAsn: boolean;
    reason: string;
}

export interface CondensationResult {
    dryRun: boolean;
    totalEvaluatedIps: number;
    condensedSubnetsCount: number;
    redundantIpsSubsumed: number;
    candidates: SubnetCondensationCandidate[];
    appliedSubnets?: string[];
    errors?: string[];
}

/**
 * Reviews non-residential attack IPs and condenses dense spray clusters
 * into their IPLocate BGP routes (/24 to /22) for FMC Security Intelligence feeds.
 *
 * Guardrails strictly enforced:
 * 1. Residential & Business ISPs (Comcast, Verizon, Spectrum, etc.) are NEVER condensed.
 * 2. Prefix length must be between /24 and /22 (256 - 1024 IPs). Never /16 or /8.
 * 3. Zero Corporate History: If ANY IP in the candidate subnet has a successful Citrix or VPN session,
 *    condensation for that entire subnet is aborted.
 */
export async function runSubnetCondensation(options?: {
    dryRun?: boolean;
    minAttackersPerSubnet?: number;
    targetAsn?: string;
}): Promise<CondensationResult> {
    const dryRun = options?.dryRun !== false; // Default to dry-run for safety
    const minAttackers = options?.minAttackersPerSubnet ?? 2;
    const targetAsnNormalized = options?.targetAsn ? normalizeAsn(options.targetAsn) : null;

    // 1. Load blacklisted ASNs
    const asnBlacklistRecords = await prisma.guardianAsnBlacklist.findMany();
    const blacklistedAsnSet = new Set(asnBlacklistRecords.map((r) => normalizeAsn(r.asn)));
    const asnNameMap = new Map(asnBlacklistRecords.map((r) => [normalizeAsn(r.asn), r.asnName || ""]));

    // 2. Fetch all entries from GuardianBlacklist and active FirewallShunStats
    const [blacklistRows, activeShunRows] = await Promise.all([
        prisma.guardianBlacklist.findMany({ select: { ip: true, reason: true } }),
        prisma.firewallShunStats.findMany({
            where: { isActive: true },
            select: { ip: true, shunIp: { select: { org: true, ipAsn: true } } }
        })
    ]);

    const candidateIps = new Set<string>();
    for (const b of blacklistRows) {
        if (!b.ip.includes("/")) candidateIps.add(b.ip.trim());
    }
    for (const s of activeShunRows) {
        if (!s.ip.includes("/")) {
            // Pre-filter out known residential broadband orgs to avoid needless cache lookups
            if (s.shunIp?.org && isResidentialOrg(s.shunIp.org)) continue;
            candidateIps.add(s.ip.trim());
        }
    }

    // 3. Batch load IPLocate Cache for candidate IPs in chunks
    const ipList = Array.from(candidateIps);
    const cacheRows: Array<{ ip: string; rawJson: string }> = [];
    const CHUNK_SIZE = 1000;
    for (let i = 0; i < ipList.length; i += CHUNK_SIZE) {
        const chunk = ipList.slice(i, i + CHUNK_SIZE);
        const rows = await prisma.ipLookupCache.findMany({
            where: { ip: { in: chunk } },
            select: { ip: true, rawJson: true }
        });
        cacheRows.push(...rows);
    }

    const cacheMap = new Map<string, any>();
    for (const row of cacheRows) {
        try {
            cacheMap.set(row.ip, JSON.parse(row.rawJson));
        } catch (e) {}
    }

    // 4. Group non-residential IPs by candidate BGP route CIDR
    const subnetMap = new Map<string, {
        network: string;
        prefixLen: number;
        asn: string;
        asnName: string;
        ips: Set<string>;
    }>();

    for (const ip of ipList) {
        const enriched = cacheMap.get(ip);
        if (!enriched) continue;

        const org = enriched.org || enriched.company?.name || enriched.asn?.name || "";
        // GUARDRAIL 1: Strictly exclude residential / business broadband ISPs
        if (isResidentialOrg(org)) continue;

        const asnRaw = enriched.asn?.asn || "";
        const asnNorm = normalizeAsn(asnRaw);
        if (targetAsnNormalized && asnNorm !== targetAsnNormalized) continue;

        const isAsnBlacklisted = blacklistedAsnSet.has(asnNorm);
        const isHosting = enriched.privacy?.is_hosting === true;

        // Only condense if ASN is on the Blacklist OR classified as hosting VPS
        if (!isAsnBlacklisted && !isHosting) continue;

        const route = enriched.asn?.route || enriched.network?.route;
        if (!route || !isValidCidr(route)) continue;

        const parsed = parseCidr(route);
        if (!parsed) continue;

        // GUARDRAIL 2: Enforce tight subnet bounds (between /22 and /24)
        if (parsed.prefixLen < 22 || parsed.prefixLen > 24) continue;

        const key = `${parsed.network}/${parsed.prefixLen}`;
        if (!subnetMap.has(key)) {
            const resolvedName = asnNameMap.get(asnNorm) || enriched.asn?.name || org || "Hostile Network";
            subnetMap.set(key, {
                network: parsed.network,
                prefixLen: parsed.prefixLen,
                asn: asnNorm,
                asnName: resolvedName,
                ips: new Set<string>()
            });
        }
        subnetMap.get(key)!.ips.add(ip);
    }

    // 5. Pre-load historical successful VPN source IPs to evaluate Guardrail 3 completely in-memory
    const successfulVpns = await prisma.vpnEvent.findMany({
        where: { status: "SUCCESS" },
        select: { sourceIp: true }
    });
    const successfulIpList = Array.from(new Set(successfulVpns.map((v) => v.sourceIp)));

    // 6. Filter subnets meeting attacker threshold & GUARDRAIL 3 (Zero corporate logins)
    const validCandidates: SubnetCondensationCandidate[] = [];

    for (const [cidr, data] of subnetMap.entries()) {
        const isAsnBlacklisted = blacklistedAsnSet.has(data.asn);
        // If ASN is explicitly on Blacklist, even 1 confirmed attacker is eligible; otherwise require minAttackers (>=2)
        const requiredThreshold = isAsnBlacklisted ? 1 : minAttackers;
        if (data.ips.size < requiredThreshold) continue;

        // GUARDRAIL 3: Verify zero historical corporate logins from ANY address in this subnet
        const hasCorporateSuccess = successfulIpList.some((goodIp) => isIpInSubnet(goodIp, cidr));
        if (hasCorporateSuccess) {
            // Abort condensation for this subnet: corporate employee has successfully connected from it!
            continue;
        }

        const candidateIpsArr = Array.from(data.ips);
        validCandidates.push({
            cidr,
            network: data.network,
            prefixLen: data.prefixLen,
            asn: data.asn,
            asnName: data.asnName,
            attackIpsCount: data.ips.size,
            sampleAttackIps: candidateIpsArr.slice(0, 5),
            isBlacklistedAsn: isAsnBlacklisted,
            reason: `Consolidated Hostile Subnet (${data.asn} ${data.asnName} - ${data.ips.size} distinct attack hosts)`
        });
    }

    // Sort by largest attacker count first
    validCandidates.sort((a, b) => b.attackIpsCount - a.attackIpsCount);

    const redundantIpsSubsumed = validCandidates.reduce((sum, c) => sum + c.attackIpsCount, 0);

    // 6. If LIVE mode, apply to GuardianBlacklist
    const appliedSubnets: string[] = [];
    if (!dryRun && validCandidates.length > 0) {
        for (const cand of validCandidates) {
            // Upsert consolidated CIDR into GuardianBlacklist
            await prisma.guardianBlacklist.upsert({
                where: { ip: cand.cidr },
                update: { reason: cand.reason },
                create: { ip: cand.cidr, reason: cand.reason }
            });

            // Remove individual /32s from GuardianBlacklist now covered by the CIDR
            const coveredIps = Array.from(subnetMap.get(cand.cidr)?.ips || []);
            if (coveredIps.length > 0) {
                await prisma.guardianBlacklist.deleteMany({
                    where: { ip: { in: coveredIps } }
                });
            }
            appliedSubnets.push(cand.cidr);
        }
        invalidateFeedCache();
    }

    return {
        dryRun,
        totalEvaluatedIps: ipList.length,
        condensedSubnetsCount: validCandidates.length,
        redundantIpsSubsumed,
        candidates: validCandidates,
        appliedSubnets: dryRun ? [] : appliedSubnets
    };
}
