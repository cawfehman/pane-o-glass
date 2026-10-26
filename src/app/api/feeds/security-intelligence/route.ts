import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isPrivateIp } from "@/lib/iplocate";
import crypto from "crypto";

// Common US consumer residential ISPs for TTL aging calculus
const RESIDENTIAL_ISP_KEYWORDS = [
    "comcast",
    "charter",
    "spectrum",
    "verizon",
    "at&t",
    "att",
    "cox",
    "optimum",
    "centurylink",
    "frontier",
    "t-mobile",
    "sprint"
];

function isResidentialOrg(org?: string | null): boolean {
    if (!org) return false;
    const lower = org.toLowerCase();
    return RESIDENTIAL_ISP_KEYWORDS.some(kw => lower.includes(kw));
}

export async function getSecurityIntelligenceIps(tierFilter: string = "all"): Promise<{
    ips: string[];
    metrics: {
        total: number;
        cveCount: number;
        blacklistCount: number;
        hostingCount: number;
        residentialCount: number;
        generatedAt: string;
    };
}> {
    const ipSet = new Set<string>();
    let cveCount = 0;
    let blacklistCount = 0;
    let hostingCount = 0;
    let residentialCount = 0;

    const now = Date.now();
    // 7-Day (168-Hour) TTL for dynamic residential broadband IPs
    // Aligns with typical Comcast/Spectrum/Verizon DHCP lease sticky times (7-14 days)
    // and ensures multi-day weekend attack campaigns cannot reuse expired proxy nodes.
    const residentialCutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // 1. NetScaler CVE Active Shuns (Exploits / Critical IOCs) - Retained Indefinitely
    if (tierFilter === "all" || tierFilter === "cve") {
        const cveShuns = await prisma.netscalerCveShun.findMany({
            where: { status: "ACTIVE" },
            select: { ip: true }
        });
        for (const item of cveShuns) {
            if (!isPrivateIp(item.ip)) {
                ipSet.add(item.ip);
                cveCount++;
            }
        }
    }

    // 2. Permanent Guardian Blacklist - Retained Indefinitely
    if (tierFilter === "all") {
        const blacklisted = await prisma.guardianBlacklist.findMany({
            select: { ip: true }
        });
        for (const item of blacklisted) {
            if (!isPrivateIp(item.ip) && !ipSet.has(item.ip)) {
                ipSet.add(item.ip);
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
            if (!isPrivateIp(item.ip) && !ipSet.has(item.ip)) {
                ipSet.add(item.ip);
                residentialCount++;
            }
        }
    }

    // 4. Active Firewall Shun Database Records
    // - Dynamic Residential ISPs: 48-Hour TTL aging to prevent bloat & DHCP employee collateral lockout
    // - Cloud VPS / Hosting ASNs / Datacenters: RETAINED INDEFINITELY (zero business need for inbound VPS traffic)
    if (tierFilter === "all" || tierFilter === "hosting" || tierFilter === "residential") {
        const activeStats = await prisma.firewallShunStats.findMany({
            where: {
                isActive: true
            },
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
            const ip = stat.ip;
            if (ipSet.has(ip) || isPrivateIp(ip)) continue;

            const isRes = isResidentialOrg(stat.shunIp?.org);

            if (isRes) {
                // Tier 1: Dynamic Residential IP -> strictly apply 48-Hour TTL
                if (stat.lastSeen >= residentialCutoff) {
                    if (tierFilter === "all" || tierFilter === "residential") {
                        ipSet.add(ip);
                        residentialCount++;
                    }
                }
            } else {
                // Tier 3: Cloud VPS / Hosting ASNs / Datacenter -> RETAINED INDEFINITELY
                if (tierFilter === "all" || tierFilter === "hosting") {
                    ipSet.add(ip);
                    hostingCount++;
                }
            }
        }
    }

    const sortedIps = Array.from(ipSet).sort((a, b) => {
        const cleanA = a.split("/")[0];
        const cleanB = b.split("/")[0];
        const numA = cleanA.split(".").map(Number);
        const numB = cleanB.split(".").map(Number);
        for (let i = 0; i < 4; i++) {
            if (numA[i] !== numB[i]) return numA[i] - numB[i];
        }
        return 0;
    });

    return {
        ips: sortedIps,
        metrics: {
            total: sortedIps.length,
            cveCount,
            blacklistCount,
            hostingCount,
            residentialCount,
            generatedAt: new Date().toISOString()
        }
    };
}

export const dynamic = "force-dynamic";

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
        generatedAt: string;
    };
}

let cachedFeeds: Record<string, { data: FeedResult; timestamp: number }> = {};
const FEED_CACHE_TTL_MS = 60 * 1000; // 60s TTL ensures FMC MD5 check and feed download receive 100% identical data

export function invalidateFeedCache() {
    cachedFeeds = {};
}

export async function getSecurityIntelligenceFeed(tierFilter: string = "all", forceRefresh = false): Promise<FeedResult> {
    const now = Date.now();
    const cached = cachedFeeds[tierFilter];
    if (!forceRefresh && cached && (now - cached.timestamp < FEED_CACHE_TTL_MS)) {
        return cached.data;
    }

    const { ips, metrics } = await getSecurityIntelligenceIps(tierFilter);

    // Standard Cisco FMC plain text feed format
    // Crucial: Deterministic content without volatile sub-minute timestamps in body
    // so FMC checksum validation is 100% consistent between the MD5 check and the feed download.
    const lines: string[] = [
        `# ==============================================================================`,
        `# Cooper Health Security Intelligence Threat Feed (Cisco FTD / FMC)`,
        `# Total Active Threat Entries: ${metrics.total}`,
        `# Breakdown: CVE (${metrics.cveCount}) | Blacklist (${metrics.blacklistCount}) | Datacenter/VPS (${metrics.hostingCount}) | Active Residential (<7d) (${metrics.residentialCount})`,
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

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const format = url.searchParams.get("format") || "txt";

        // Track last poll timestamp for FMC dynamic hold synchronization
        await prisma.netscalerCveSetting.upsert({
            where: { key: "LAST_FMC_SI_POLL" },
            update: { value: new Date().toISOString() },
            create: { key: "LAST_FMC_SI_POLL", value: new Date().toISOString() }
        }).catch(() => {});
        const tier = url.searchParams.get("tier") || "all";
        const key = url.searchParams.get("key");

        // Optional token security check
        const requiredKey = process.env.SECURITY_INTELLIGENCE_KEY;
        if (requiredKey && key !== requiredKey) {
            // Also allow internal RFC 1918 traffic
            const forwarded = req.headers.get("x-forwarded-for") || "";
            const clientIp = forwarded.split(",")[0].trim();
            if (!isPrivateIp(clientIp)) {
                return new NextResponse("Unauthorized: Invalid Security Intelligence Key", { status: 401 });
            }
        }

        const { body, md5, metrics, ips } = await getSecurityIntelligenceFeed(tier);

        if (format === "json") {
            return NextResponse.json({
                success: true,
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
                "X-Total-Entries": String(metrics.total)
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
