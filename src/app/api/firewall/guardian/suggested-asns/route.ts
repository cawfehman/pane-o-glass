import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";

export const dynamic = "force-dynamic";

const EXCLUDED_CONSUMER_ASNS = new Set([
    "7922",   // Comcast Cable
    "701",    // Verizon Business / Fios
    "702",    // Verizon
    "10796",  // Charter Communications
    "11351",  // Charter Communications
    "11426",  // Charter Communications
    "11427",  // Charter Communications
    "12271",  // Charter Communications
    "20115",  // Charter Communications
    "33363",  // Charter Communications
    "7018",   // AT&T Services
    "6128",   // Cablevision / Optimum
    "21928",  // T-Mobile USA
    "22773",  // Cox Communications
    "209",    // CenturyLink / Lumen
    "13335",  // Cloudflare
    "8075",   // Microsoft
    "15169",  // Google
]);

const CONSUMER_NAME_REGEX = /comcast|verizon|charter|spectrum|at&t|optimum|t-mobile|cox|centurylink|lumen|frontier|suddenlink|windstream|mediacom/i;

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const userId = session.user.id;
    const [hasFw, hasVpn, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall", userId),
        hasPermission(role, "vpn-reporting", userId),
        hasPermission(role, "netscaler", userId)
    ]);
    return Boolean(hasFw || hasVpn || hasNetscaler);
}

export interface SuggestedAsn {
    asn: string;
    asnNum: string;
    asnName: string;
    country: string;
    countryCode: string;
    shunnedIpCount: number;
    vpnFailuresCount: number;
    threatCategory: "BULLETPROOF_VPS" | "FOREIGN_ATTACK_SOURCE" | "AGGRESSIVE_SPRAY_ORIGIN";
    recommendedReason: string;
    threatScore: number;
}

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Access to this tool is restricted." }, { status: 403 });
        }

        const [existingBlacklisted, shunGroups, vpnFailures, vpnSuccesses] = await Promise.all([
            prisma.guardianAsnBlacklist.findMany({ select: { asn: true } }),
            prisma.shunDatabaseIp.groupBy({
                by: ["ipAsn"],
                _count: { ip: true },
                where: { ipAsn: { not: null } },
                orderBy: { _count: { ip: "desc" } },
                take: 120
            }),
            prisma.vpnEvent.groupBy({
                by: ["ipAsn"],
                _count: { id: true },
                where: { status: "FAILURE", ipAsn: { not: null } },
                orderBy: { _count: { id: "desc" } },
                take: 120
            }),
            prisma.vpnEvent.groupBy({
                by: ["ipAsn"],
                _count: { id: true },
                where: { status: "SUCCESS", ipAsn: { not: null } }
            })
        ]);

        const blacklistedSet = new Set(
            existingBlacklisted.map((a) => a.asn.toUpperCase().replace(/^AS/, "").trim())
        );

        const successMap = new Map<string, number>();
        for (const s of vpnSuccesses) {
            if (!s.ipAsn) continue;
            const num = s.ipAsn.toUpperCase().replace(/^AS/, "").trim();
            successMap.set(num, s._count.id);
        }

        const asnCounts = new Map<string, { shuns: number; vpnFailures: number }>();

        for (const s of shunGroups) {
            if (!s.ipAsn) continue;
            const num = s.ipAsn.toUpperCase().replace(/^AS/, "").trim();
            if (!num || num === "0" || num === "UNKNOWN") continue;
            if (!asnCounts.has(num)) asnCounts.set(num, { shuns: 0, vpnFailures: 0 });
            asnCounts.get(num)!.shuns += s._count.ip;
        }

        for (const v of vpnFailures) {
            if (!v.ipAsn) continue;
            const num = v.ipAsn.toUpperCase().replace(/^AS/, "").trim();
            if (!num || num === "0" || num === "UNKNOWN") continue;
            if (!asnCounts.has(num)) asnCounts.set(num, { shuns: 0, vpnFailures: 0 });
            asnCounts.get(num)!.vpnFailures += v._count.id;
        }

        // Filter eligible candidate numbers
        const candidateNums = Array.from(asnCounts.keys()).filter((num) => {
            if (blacklistedSet.has(num)) return false;
            if (EXCLUDED_CONSUMER_ASNS.has(num)) return false;
            const successes = successMap.get(num) || 0;
            if (successes > 0) return false;
            const metrics = asnCounts.get(num)!;
            return metrics.shuns >= 5 || metrics.vpnFailures >= 250;
        });

        // Enrich candidates with metadata (org, country)
        const enrichedMetadata = await prisma.shunDatabaseIp.findMany({
            where: {
                OR: candidateNums.map((num) => ({ ipAsn: { contains: num } }))
            },
            select: {
                ipAsn: true,
                org: true,
                ipCountry: true,
                ipCountryCode: true
            },
            take: 1000
        });

        const metaMap = new Map<string, { org: string; country: string; countryCode: string }>();
        for (const row of enrichedMetadata) {
            if (!row.ipAsn) continue;
            const num = row.ipAsn.toUpperCase().replace(/^AS/, "").trim();
            if (!metaMap.has(num)) {
                metaMap.set(num, {
                    org: row.org || "Autonomous System",
                    country: row.ipCountry || "Foreign / Cloud",
                    countryCode: row.ipCountryCode || "US"
                });
            } else {
                const current = metaMap.get(num)!;
                if ((!current.org || current.org === "Autonomous System") && row.org) {
                    current.org = row.org;
                }
                if ((!current.country || current.country === "Foreign / Cloud") && row.ipCountry) {
                    current.country = row.ipCountry;
                    current.countryCode = row.ipCountryCode || current.countryCode;
                }
            }
        }

        // Fallback to VpnEvent metadata if not found in ShunDatabaseIp
        const missingMetaNums = candidateNums.filter((num) => !metaMap.has(num));
        if (missingMetaNums.length > 0) {
            const vpnMeta = await prisma.vpnEvent.findMany({
                where: {
                    ipAsn: { in: missingMetaNums.map((n) => `AS${n}`) }
                },
                select: {
                    ipAsn: true,
                    ipAsName: true,
                    ipCountry: true,
                    ipCountryCode: true
                },
                take: 200
            });
            for (const v of vpnMeta) {
                if (!v.ipAsn) continue;
                const num = v.ipAsn.toUpperCase().replace(/^AS/, "").trim();
                if (!metaMap.has(num)) {
                    metaMap.set(num, {
                        org: v.ipAsName || "Autonomous System",
                        country: v.ipCountry || "Foreign / Cloud",
                        countryCode: v.ipCountryCode || "US"
                    });
                }
            }
        }

        const results: SuggestedAsn[] = [];

        for (const num of candidateNums) {
            const metrics = asnCounts.get(num)!;
            const meta = metaMap.get(num) || {
                org: "Autonomous System",
                country: "Hosting / Cloud Provider",
                countryCode: "US"
            };

            if (CONSUMER_NAME_REGEX.test(meta.org)) {
                continue;
            }

            const isHostingRegex = /clouvider|datacamp|hostline|packethub|whitelabel|green floid|m247|digitalocean|ovh|linode|hetzner|choopa|vultr|leaseweb|contabo|cogent|zayo|gtt/i;
            const isHosting = isHostingRegex.test(meta.org);
            const isForeign = meta.countryCode !== "US" && meta.country !== "United States";

            let threatCategory: SuggestedAsn["threatCategory"] = "AGGRESSIVE_SPRAY_ORIGIN";
            if (isHosting) {
                threatCategory = "BULLETPROOF_VPS";
            } else if (isForeign) {
                threatCategory = "FOREIGN_ATTACK_SOURCE";
            }

            let reasonDetail = "";
            if (threatCategory === "BULLETPROOF_VPS") {
                reasonDetail = `Hostile cloud/bulletproof VPS infrastructure (${meta.org}) with ${metrics.shuns} active/historical shuns and ${metrics.vpnFailures.toLocaleString()} failed brute-force probes. Zero legitimate employee history.`;
            } else if (threatCategory === "FOREIGN_ATTACK_SOURCE") {
                reasonDetail = `High-volume foreign attack network (${meta.country} - ${meta.org}) targeting perimeter gateways with ${metrics.shuns} shuns and ${metrics.vpnFailures.toLocaleString()} auth failures.`;
            } else {
                reasonDetail = `High-frequency credential spray origin (${meta.org}) with ${metrics.shuns} perimeter shuns and ${metrics.vpnFailures.toLocaleString()} connection failures.`;
            }

            const threatScore = metrics.shuns * 100 + Math.min(metrics.vpnFailures, 50000) + (isHosting ? 500 : 0) + (isForeign ? 300 : 0);

            results.push({
                asn: `AS${num}`,
                asnNum: num,
                asnName: meta.org,
                country: meta.country,
                countryCode: meta.countryCode,
                shunnedIpCount: metrics.shuns,
                vpnFailuresCount: metrics.vpnFailures,
                threatCategory,
                recommendedReason: reasonDetail,
                threatScore
            });
        }

        results.sort((a, b) => b.threatScore - a.threatScore);

        return NextResponse.json({
            suggestedAsns: results.slice(0, 15),
            totalCandidates: results.length
        });
    } catch (err: any) {
        console.error("Failed to generate suggested ASNs:", err);
        return NextResponse.json({ error: err.message || "Failed to generate suggested ASNs" }, { status: 500 });
    }
}
