import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isPrivateIp } from "@/lib/iplocate";
import { isResidentialOrg } from "@/lib/reputation-ledger";
import { FastSubnetMatcher, parseCidr } from "@/lib/ip-subnet";
import crypto from "crypto";

export interface FeedResult {
    body: string;
    md5: string;
    ips: string[];
    metrics: {
        total: number;
        cveCount: number;
        blacklistCount: number;
        hostingCount: number;
        residentialCount: number;
        cidrCount?: number;
        generatedAt: string;
    };
}

export interface WhitelistFeedResult {
    body: string;
    md5: string;
    ips: string[];
    metrics: {
        total: number;
        watchlistCount: number;
        pardonCount: number;
        generatedAt: string;
    };
}

let cachedFeeds: Record<string, { data: FeedResult; timestamp: number }> = {};
let cachedWhitelistFeed: { data: WhitelistFeedResult; timestamp: number } | null = null;
const FEED_CACHE_TTL_MS = 60 * 1000; // 60s TTL ensures FMC MD5 check and feed download receive 100% identical data

export function invalidateFeedCache() {
    cachedFeeds = {};
    cachedWhitelistFeed = null;
}

// -----------------------------------------------------------------------------
// 1. FMC THREAT INTELLIGENCE (BLOCK) FEED GENERATOR
// -----------------------------------------------------------------------------
export async function getSecurityIntelligenceIps(tierFilter: string = "all"): Promise<{
    ips: string[];
    metrics: {
        total: number;
        cveCount: number;
        blacklistCount: number;
        hostingCount: number;
        residentialCount: number;
        cidrCount: number;
        generatedAt: string;
    };
}> {
    const rawEntries = new Set<string>();
    let cveCount = 0;
    let blacklistCount = 0;
    let hostingCount = 0;
    let residentialCount = 0;

    const now = Date.now();
    // 7-Day (168-Hour) TTL for dynamic residential broadband IPs
    const residentialCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // 1. NetScaler CVE Active Shuns (Exploits / Critical IOCs) - Retained Indefinitely
    if (tierFilter === "all" || tierFilter === "cve") {
        const cveShuns = await prisma.netscalerCveShun.findMany({
            where: { status: "ACTIVE" },
            select: { ip: true }
        });
        for (const item of cveShuns) {
            if (!isPrivateIp(item.ip)) {
                rawEntries.add(item.ip);
                cveCount++;
            }
        }
    }

    // 2. Permanent Guardian Blacklist (Supports both /32 host IPs and /24-/22 CIDRs)
    if (tierFilter === "all") {
        const blacklisted = await prisma.guardianBlacklist.findMany({
            select: { ip: true }
        });
        for (const item of blacklisted) {
            const clean = item.ip.trim();
            const hostOrNet = clean.split("/")[0];
            if (!isPrivateIp(hostOrNet) && !rawEntries.has(clean)) {
                rawEntries.add(clean);
                blacklistCount++;
            }
        }
    }

    // 3. Residential Strike Ledger (Strike 2 & Strike 3 Active Enforced/Quarantined)
    if (tierFilter === "all" || tierFilter === "residential") {
        const enforcedStrikes = await prisma.residentialStrikeLedger.findMany({
            where: {
                status: { in: ["ENFORCED", "QUARANTINED"] },
                expiresAt: { gt: new Date() }
            },
            select: { ip: true }
        });
        for (const item of enforcedStrikes) {
            if (!isPrivateIp(item.ip) && !rawEntries.has(item.ip)) {
                rawEntries.add(item.ip);
                residentialCount++;
            }
        }
    }

    // 4. Active Firewall Shun Database Records
    if (tierFilter === "all" || tierFilter === "hosting" || tierFilter === "residential") {
        const activeStats = await prisma.firewallShunStats.findMany({
            where: { isActive: true },
            select: {
                ip: true,
                lastSeen: true,
                shunIp: {
                    select: {
                        org: true,
                        ipAsn: true
                    }
                }
            }
        });

        for (const stat of activeStats) {
            const ip = stat.ip.trim();
            if (rawEntries.has(ip) || isPrivateIp(ip)) continue;

            const isRes = isResidentialOrg(stat.shunIp?.org);

            if (isRes) {
                // Tier 1: Dynamic Residential IP -> strictly apply 7-Day TTL
                if (stat.lastSeen >= residentialCutoff) {
                    if (tierFilter === "all" || tierFilter === "residential") {
                        rawEntries.add(ip);
                        residentialCount++;
                    }
                }
            } else {
                // Tier 3: Cloud VPS / Hosting ASNs / Datacenter -> RETAINED INDEFINITELY
                if (tierFilter === "all" || tierFilter === "hosting") {
                    rawEntries.add(ip);
                    hostingCount++;
                }
            }
        }
    }

    // 5. Deduplicate redundant /32 host entries subsumed by consolidated CIDRs in O(1) time
    const cidrs = Array.from(rawEntries).filter((entry) => entry.includes("/"));
    const finalSet = new Set<string>();
    const matcher = new FastSubnetMatcher(cidrs);

    for (const entry of rawEntries) {
        if (entry.includes("/")) {
            finalSet.add(entry);
        } else {
            // Instant O(1) check if this /32 is already covered by an active CIDR in the feed
            if (!matcher.isSubsumed(entry)) {
                finalSet.add(entry);
            }
        }
    }

    const sortedEntries = Array.from(finalSet).sort((a, b) => {
        const cleanA = a.split("/")[0].split(".").map(Number);
        const cleanB = b.split("/")[0].split(".").map(Number);
        for (let i = 0; i < 4; i++) {
            if (cleanA[i] !== cleanB[i]) return cleanA[i] - cleanB[i];
        }
        return 0;
    });

    return {
        ips: sortedEntries,
        metrics: {
            total: sortedEntries.length,
            cveCount,
            blacklistCount,
            hostingCount,
            residentialCount,
            cidrCount: cidrs.length,
            generatedAt: new Date().toISOString()
        }
    };
}

export async function getSecurityIntelligenceFeed(tierFilter: string = "all", forceRefresh = false): Promise<FeedResult> {
    const now = Date.now();
    const cached = cachedFeeds[tierFilter];
    if (!forceRefresh && cached && (now - cached.timestamp < FEED_CACHE_TTL_MS)) {
        return cached.data;
    }

    const { ips, metrics } = await getSecurityIntelligenceIps(tierFilter);

    const lines: string[] = [
        `# ==============================================================================`,
        `# Cooper Health Security Intelligence Threat Feed (Cisco FTD / FMC)`,
        `# Total Active Threat Entries: ${metrics.total}`,
        `# Breakdown: CVE (${metrics.cveCount}) | Blacklist (${metrics.blacklistCount}) | Datacenter/VPS (${metrics.hostingCount}) | Active Residential (<7d) (${metrics.residentialCount}) | Subnets (${metrics.cidrCount || 0})`,
        `# Recommended Action in FMC: Block with Reset`,
        `# ==============================================================================`
    ];

    for (const ip of ips) {
        lines.push(ip);
    }

    const body = lines.join("\n") + "\n";
    const md5 = crypto.createHash("md5").update(body).digest("hex");

    const result: FeedResult = {
        body,
        md5,
        ips,
        metrics
    };

    cachedFeeds[tierFilter] = { data: result, timestamp: now };
    return result;
}

// -----------------------------------------------------------------------------
// 2. FMC DO NOT BLOCK / WHITELIST FEED GENERATOR
// -----------------------------------------------------------------------------
export async function getSecurityIntelligenceWhitelist(): Promise<{
    ips: string[];
    metrics: {
        total: number;
        watchlistCount: number;
        pardonCount: number;
        generatedAt: string;
    };
}> {
    const ipSet = new Set<string>();
    let watchlistCount = 0;

    // 1. Authoritative Corporate & Partner Static Assets (Guardian Watchlist)
    // Dynamic residential home IPs with pardons are EXCLUDED from FMC Whitelist to prevent global bypass
    const watchIps = await prisma.guardianWatchIp.findMany({ select: { ip: true } });
    for (const item of watchIps) {
        const clean = item.ip.trim();
        const host = clean.split("/")[0];
        if (!isPrivateIp(host) && !ipSet.has(clean)) {
            ipSet.add(clean);
            watchlistCount++;
        }
    }

    const sortedIps = Array.from(ipSet).sort((a, b) => {
        const cleanA = a.split("/")[0].split(".").map(Number);
        const cleanB = b.split("/")[0].split(".").map(Number);
        for (let i = 0; i < 4; i++) {
            if (cleanA[i] !== cleanB[i]) return cleanA[i] - cleanB[i];
        }
        return 0;
    });

    return {
        ips: sortedIps,
        metrics: {
            total: sortedIps.length,
            watchlistCount,
            pardonCount: 0,
            generatedAt: new Date().toISOString()
        }
    };
}

export async function getSecurityIntelligenceWhitelistFeed(forceRefresh = false): Promise<WhitelistFeedResult> {
    const now = Date.now();
    if (!forceRefresh && cachedWhitelistFeed && (now - cachedWhitelistFeed.timestamp < FEED_CACHE_TTL_MS)) {
        return cachedWhitelistFeed.data;
    }

    const { ips, metrics } = await getSecurityIntelligenceWhitelist();

    const lines: string[] = [
        `# ==============================================================================`,
        `# Cooper Health Security Intelligence DO NOT BLOCK Feed (Cisco FTD / FMC)`,
        `# Total Active Whitelist Entries: ${metrics.total}`,
        `# Source: Authoritative Corporate & Partner Static Assets (Guardian Watchlist)`,
        `# Recommended Action in FMC: Do Not Block (Whitelist)`,
        `# Note: Evaluates BEFORE the Security Intelligence Threat Feed in FMC`,
        `# ==============================================================================`
    ];

    for (const ip of ips) {
        lines.push(ip);
    }

    const body = lines.join("\n") + "\n";
    const md5 = crypto.createHash("md5").update(body).digest("hex");

    const result: WhitelistFeedResult = {
        body,
        md5,
        ips,
        metrics
    };

    cachedWhitelistFeed = { data: result, timestamp: now };
    return result;
}

export const dynamic = "force-dynamic";

// -----------------------------------------------------------------------------
// 3. API ROUTE HANDLER (DISPATCHES BLOCK OR WHITELIST FEED)
// -----------------------------------------------------------------------------
export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const format = url.searchParams.get("format") || "txt";
        const feedType = (url.searchParams.get("feed") || url.searchParams.get("type") || "block").toLowerCase();
        const tier = url.searchParams.get("tier") || "all";
        const key = url.searchParams.get("key");

        // 1. Validate authorization BEFORE updating poll timestamps or serving feed data
        const requiredKey = process.env.SECURITY_INTELLIGENCE_KEY;
        if (requiredKey && key !== requiredKey) {
            const session = await auth().catch(() => null);
            if (!session?.user) {
                return new NextResponse("Unauthorized: Invalid Security Intelligence Key", { status: 401 });
            }
        }

        const isWhitelist = feedType === "whitelist" || feedType === "do-not-block" || feedType === "allow";

        // 2. Track FMC poll heartbeat timestamp
        if (format === "txt") {
            const pollKey = isWhitelist ? "LAST_FMC_SI_WHITELIST_POLL" : "LAST_FMC_SI_POLL";
            await prisma.netscalerCveSetting.upsert({
                where: { key: pollKey },
                update: { value: new Date().toISOString() },
                create: { key: pollKey, value: new Date().toISOString() }
            }).catch(() => {});
        }

        if (isWhitelist) {
            const { body, md5, metrics, ips } = await getSecurityIntelligenceWhitelistFeed();

            if (format === "json") {
                return NextResponse.json({
                    success: true,
                    feed: "whitelist",
                    metrics,
                    count: ips.length,
                    ips
                });
            }

            const ifNoneMatch = req.headers.get("if-none-match");
            if (ifNoneMatch === md5 || ifNoneMatch === `"${md5}"` || ifNoneMatch === `W/"${md5}"`) {
                return new NextResponse(null, { status: 304 });
            }

            return new NextResponse(body, {
                status: 200,
                headers: {
                    "Content-Type": "text/plain; charset=utf-8",
                    "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
                    "ETag": `"${md5}"`,
                    "X-Total-Entries": String(metrics.total),
                    "X-Feed-Type": "whitelist"
                }
            });
        }

        // Standard Threat / Block Feed
        const { body, md5, metrics, ips } = await getSecurityIntelligenceFeed(tier);

        if (format === "json") {
            return NextResponse.json({
                success: true,
                feed: "block",
                metrics,
                count: ips.length,
                ips
            });
        }

        const ifNoneMatch = req.headers.get("if-none-match");
        if (ifNoneMatch === md5 || ifNoneMatch === `"${md5}"` || ifNoneMatch === `W/"${md5}"`) {
            return new NextResponse(null, { status: 304 });
        }

        return new NextResponse(body, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "public, max-age=60, stale-while-revalidate=30",
                "ETag": `"${md5}"`,
                "X-Total-Entries": String(metrics.total),
                "X-Feed-Type": "block"
            }
        });
    } catch (error: any) {
        console.error("Security Intelligence Feed Generation Error:", error);
        return new NextResponse(`# Error generating Security Intelligence feed: ${error.message}\n`, {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    }
}
