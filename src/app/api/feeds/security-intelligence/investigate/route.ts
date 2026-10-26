import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { isPrivateIp } from "@/lib/ipinfo";
import axios from "axios";
import https from "https";

export const dynamic = "force-dynamic";

async function isAuthorized(session: any): Promise<boolean> {
    if (!session?.user) return false;
    const role = (session.user as any)?.role;
    if (role === "ADMIN") return true;
    const [hasFw, hasNetscaler] = await Promise.all([
        hasPermission(role, "firewall"),
        hasPermission(role, "netscaler")
    ]);
    return Boolean(hasFw || hasNetscaler);
}

// GET: Quickly investigate if an IP or corporate user is being blocked by Security Intelligence or Shuns
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const targetIp = url.searchParams.get("ip")?.trim() || "";
        const targetUser = url.searchParams.get("username")?.trim() || "";

        if (!targetIp && !targetUser) {
            return NextResponse.json({ error: "Either 'ip' or 'username' parameter is required." }, { status: 400 });
        }

        let ipToInspect = targetIp;

        // If username given without IP, find recent IPs for that user
        let userRecentIps: string[] = [];
        if (targetUser) {
            const cleanU = targetUser.toLowerCase().endsWith("@cooperhealth.edu") ? targetUser.slice(0, -17) : targetUser;
            const recentVpn = await prisma.vpnEvent.findMany({
                where: { username: { contains: cleanU, mode: "insensitive" } },
                orderBy: { createdAt: "desc" },
                take: 5,
                select: { sourceIp: true, status: true, createdAt: true }
            });
            userRecentIps = Array.from(new Set(recentVpn.map(v => v.sourceIp)));
            if (!ipToInspect && userRecentIps.length > 0) {
                ipToInspect = userRecentIps[0];
            }
        }

        if (!ipToInspect) {
            return NextResponse.json({
                verdict: "NO_IP_FOUND",
                message: `No active or recent IP address found for user ${targetUser}.`,
                userRecentIps: []
            });
        }

        // 1. Check SI Feed & Shun Table Membership
        const [blacklisted, activeShunStats, cveRecord, cacheInfo] = await Promise.all([
            prisma.guardianBlacklist.findUnique({ where: { ip: ipToInspect } }),
            prisma.firewallShunStats.findMany({
                where: { ip: ipToInspect, isActive: true },
                include: { shunIp: true }
            }),
            prisma.netscalerCveShun.findUnique({ where: { ip: ipToInspect } }),
            prisma.ipLookupCache.findUnique({ where: { ip: ipToInspect } })
        ]);

        const inBlacklist = Boolean(blacklisted);
        const inActiveShuns = activeShunStats.length > 0;
        const inCveBlock = Boolean(cveRecord && cveRecord.status === "ACTIVE");
        const isCurrentlyBlocked = inBlacklist || inActiveShuns || inCveBlock;

        // 2. Query Good Traffic Indicators (AnyConnect VPN Success)
        const [vpnSuccesses, vpnFailures] = await Promise.all([
            prisma.vpnEvent.findMany({
                where: { sourceIp: ipToInspect, status: "SUCCESS" },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: { username: true, createdAt: true, vpnType: true }
            }),
            prisma.vpnEvent.findMany({
                where: { sourceIp: ipToInspect, status: "FAILURE" },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: { username: true, createdAt: true, failureReason: true }
            })
        ]);

        const hasVpnSuccess = vpnSuccesses.length > 0;
        const uniqueVpnSuccessUsers = Array.from(new Set(vpnSuccesses.map(v => v.username)));

        // 3. Query Graylog for Cisco FTD Security Intelligence Block Logs (%FTD-4-430002 / 430003)
        let ftdDropCount = 0;
        let lastFtdDropAt: string | null = null;
        let citrixSuccessCount = 0;

        const rawUrl = process.env.GRAYLOG_URL || process.env.OG_GRAYLOG_URL;
        const rawToken = process.env.GRAYLOG_API_TOKEN || process.env.OG_GRAYLOG_API_TOKEN;

        if (rawUrl && rawToken) {
            try {
                const gUrl = rawUrl.replace(/^"|"$/g, '').endsWith('/') ? rawUrl.replace(/^"|"$/g, '').slice(0, -1) : rawUrl.replace(/^"|"$/g, '');
                const token = rawToken.replace(/^"|"$/g, '');
                const authHeader = token.includes(":") 
                    ? `Basic ${Buffer.from(token).toString("base64")}`
                    : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;
                
                const agent = new https.Agent({ rejectUnauthorized: false });

                // Query FTD SI blocks for this IP in the past 24 hours
                const ftdRes = await axios.get(`${gUrl}/api/search/universal/relative`, {
                    params: {
                        query: `"${ipToInspect}" AND ("430002" OR "430003" OR "Security Intelligence" OR "blacklisted")`,
                        range: 86400,
                        limit: 10,
                        fields: "timestamp,message,source"
                    },
                    headers: { Authorization: authHeader, Accept: "application/json" },
                    httpsAgent: agent,
                    timeout: 8000
                }).catch(() => null);

                if (ftdRes?.data?.messages) {
                    ftdDropCount = ftdRes.data.messages.length;
                    if (ftdDropCount > 0) {
                        lastFtdDropAt = ftdRes.data.messages[0].message?.timestamp || null;
                    }
                }

                // Query Citrix NetScaler Success in Graylog
                const citrixRes = await axios.get(`${gUrl}/api/search/universal/relative`, {
                    params: {
                        query: `(client_ip:"${ipToInspect}" OR source_ip:"${ipToInspect}") AND (ns_action:(LOGIN OR ICASTART) OR "response-200")`,
                        range: 604800, // 7 days
                        limit: 10,
                        fields: "timestamp,username,ns_username"
                    },
                    headers: { Authorization: authHeader, Accept: "application/json" },
                    httpsAgent: agent,
                    timeout: 8000
                }).catch(() => null);

                if (citrixRes?.data?.messages) {
                    citrixSuccessCount = citrixRes.data.messages.length;
                }
            } catch (err: any) {
                console.error("Graylog investigation probe error:", err.message);
            }
        }

        // 4. Calculate Risk Verdict
        let verdict: "FALSE_POSITIVE_LIKELY" | "CONFIRMED_THREAT" | "CLEAN_NOT_BLOCKED";
        let verdictReason = "";

        if (!isCurrentlyBlocked) {
            verdict = "CLEAN_NOT_BLOCKED";
            verdictReason = `IP ${ipToInspect} is NOT currently in the Security Intelligence feed or firewall shun tables.`;
        } else if (hasVpnSuccess || citrixSuccessCount > 0) {
            verdict = "FALSE_POSITIVE_LIKELY";
            verdictReason = `WARNING: IP ${ipToInspect} is currently blocked, but has ${vpnSuccesses.length} successful VPN sessions and/or ${citrixSuccessCount} Citrix logins for legitimate corporate staff (${uniqueVpnSuccessUsers.slice(0, 3).join(", ") || "known users"}). Likely false positive!`;
        } else if (inCveBlock) {
            verdict = "CONFIRMED_THREAT";
            verdictReason = `CONFIRMED MALICIOUS: IP ${ipToInspect} matched critical exploit signature ${cveRecord?.cve} (${cveRecord?.ruleName}). Zero legitimate login history.`;
        } else {
            verdict = "CONFIRMED_THREAT";
            verdictReason = `THREAT: IP ${ipToInspect} has ${vpnFailures.length} failed login attempts with zero successful VPN or Citrix history.`;
        }

        let geoData = null;
        if (cacheInfo?.rawJson) {
            try { geoData = JSON.parse(cacheInfo.rawJson); } catch {}
        }

        return NextResponse.json({
            targetIp: ipToInspect,
            targetUser: targetUser || null,
            verdict,
            verdictReason,
            isCurrentlyBlocked,
            details: {
                inBlacklist,
                blacklistReason: blacklisted?.reason || null,
                inActiveShuns,
                activeShunFirewalls: activeShunStats.map(s => s.firewall),
                inCveBlock,
                cveTag: cveRecord?.cve || null,
                org: cacheInfo ? (geoData?.company?.name || geoData?.asn?.name || geoData?.org || "Unknown") : "Unenriched",
                asn: cacheInfo ? (geoData?.asn?.asn || "Unknown") : "Unenriched",
                country: cacheInfo?.countryCode || "Unknown"
            },
            telemetry: {
                ftdSecurityIntelligenceDropsPast24h: ftdDropCount,
                lastFtdDropTimestamp: lastFtdDropAt,
                vpnSuccessfulLoginsPast30d: vpnSuccesses.length,
                citrixSuccessfulLoginsPast7d: citrixSuccessCount,
                vpnFailedLoginsPast30d: vpnFailures.length,
                associatedCorporateUsers: uniqueVpnSuccessUsers
            },
            recommendedAction: verdict === "FALSE_POSITIVE_LIKELY" ? "UNBLOCK_IMMEDIATELY" : (verdict === "CLEAN_NOT_BLOCKED" ? "NONE" : "MAINTAIN_BLOCK")
        });
    } catch (err: any) {
        console.error("SI Feed Investigation Error:", err);
        return NextResponse.json({ error: err.message || "Failed to complete investigation." }, { status: 500 });
    }
}
