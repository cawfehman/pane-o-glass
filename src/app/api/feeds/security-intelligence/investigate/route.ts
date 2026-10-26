import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/app/actions/permissions";
import { logAudit } from "@/lib/audit";
import { isPrivateIp } from "@/lib/iplocate";
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

// GET: Investigate an IP, ASN, or corporate user across Security Intelligence, Shuns, and VPN telemetry
export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user || !(await isAuthorized(session))) {
            return NextResponse.json({ error: "Forbidden: Admin or Firewall permission required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const targetRaw = url.searchParams.get("target")?.trim() || url.searchParams.get("ip")?.trim() || "";
        const targetUser = url.searchParams.get("username")?.trim() || "";

        if (!targetRaw && !targetUser) {
            return NextResponse.json({ error: "Either 'target', 'ip', or 'username' parameter is required." }, { status: 400 });
        }

        let cleanTarget = targetRaw;

        // If username given without target, find recent IPs for that user
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
            if (!cleanTarget && userRecentIps.length > 0) {
                cleanTarget = userRecentIps[0];
            }
        }

        if (!cleanTarget) {
            return NextResponse.json({
                verdict: "NO_TARGET_FOUND",
                message: `No active or recent IP address found for user ${targetUser}.`,
                userRecentIps: []
            });
        }

        // ==========================================
        // 1. ASN INVESTIGATION MODE
        // ==========================================
        const isAsn = /^AS\d+$/i.test(cleanTarget) || (/^\d+$/.test(cleanTarget) && parseInt(cleanTarget, 10) > 0 && parseInt(cleanTarget, 10) < 4200000000 && !cleanTarget.includes('.'));

        if (isAsn) {
            const rawNum = cleanTarget.toUpperCase().replace(/^AS/, '');
            const asnFormatted = `AS${rawNum}`;

            const [asnBlacklistEntry, sampleVpn, vpnSuccessCount, vpnFailCount, vpnUsers, strikeCount, recentStrikes] = await Promise.all([
                prisma.guardianAsnBlacklist.findFirst({
                    where: { OR: [{ asn: asnFormatted }, { asn: rawNum }] }
                }),
                prisma.vpnEvent.findFirst({
                    where: { OR: [{ ipAsn: asnFormatted }, { ipAsn: rawNum }, { ipAsn: { contains: rawNum } }] },
                    select: { ipAsName: true, ipCountry: true }
                }),
                prisma.vpnEvent.count({
                    where: { status: "SUCCESS", OR: [{ ipAsn: asnFormatted }, { ipAsn: rawNum }] }
                }),
                prisma.vpnEvent.count({
                    where: { status: "FAILURE", OR: [{ ipAsn: asnFormatted }, { ipAsn: rawNum }] }
                }),
                prisma.vpnEvent.findMany({
                    where: { status: "SUCCESS", OR: [{ ipAsn: asnFormatted }, { ipAsn: rawNum }] },
                    select: { username: true },
                    distinct: ["username"],
                    take: 10
                }),
                prisma.residentialStrikeLedger.count({
                    where: { OR: [{ asn: asnFormatted }, { asn: rawNum }] }
                }),
                prisma.residentialStrikeLedger.findMany({
                    where: { OR: [{ asn: asnFormatted }, { asn: rawNum }] },
                    orderBy: { lastSeen: "desc" },
                    take: 5,
                    select: { ip: true, strikeCount: true, status: true, ispOrg: true, lastSeen: true }
                })
            ]);

            const isBlacklisted = Boolean(asnBlacklistEntry);
            const orgName = asnBlacklistEntry?.asnName || sampleVpn?.ipAsName || "Autonomous System Network";
            const country = sampleVpn?.ipCountry || "Global";

            let verdictLevel: "CONFIRMED_THREAT" | "LEGITIMATE_RESIDENTIAL_ISP" | "SUSPICIOUS_NETWORK";
            let recommendation = "";

            if (isBlacklisted) {
                verdictLevel = "CONFIRMED_THREAT";
                recommendation = `BLACKLISTED ASN: Entire network ${asnFormatted} is blocked fleet-wide by Guardian policy. Reason: ${asnBlacklistEntry?.reason}`;
            } else if (vpnSuccessCount > 100) {
                verdictLevel = "LEGITIMATE_RESIDENTIAL_ISP";
                recommendation = `CRITICAL PROVIDER: High legitimate employee usage (${vpnSuccessCount.toLocaleString()} successful sessions, ${vpnUsers.length} corporate staff). DO NOT BLACKLIST this ASN.`;
            } else if (vpnFailCount > 0 && vpnSuccessCount === 0) {
                verdictLevel = "SUSPICIOUS_NETWORK";
                recommendation = `POTENTIAL THREAT: Network has ${vpnFailCount.toLocaleString()} failed attempts with zero legitimate employee logins. Safe to blacklist if abuse persists.`;
            } else {
                verdictLevel = "SUSPICIOUS_NETWORK";
                recommendation = `Network ${asnFormatted} has minimal perimeter history (${vpnSuccessCount} logins).`;
            }

            return NextResponse.json({
                type: "ASN",
                target: asnFormatted,
                targetIp: asnFormatted,
                targetUser: null,
                asn: asnFormatted,
                asnName: orgName,
                country,
                isBlacklisted,
                inSecurityIntelligence: isBlacklisted,
                isCurrentlyBlocked: isBlacklisted,
                blacklistReason: asnBlacklistEntry?.reason || null,
                verdict: {
                    level: verdictLevel,
                    reason: isBlacklisted ? "Blacklisted in Guardian" : (vpnSuccessCount > 100 ? "Legitimate employee ISP" : "Low trust network"),
                    recommendation
                },
                ipInfo: {
                    ip: asnFormatted,
                    as_name: orgName,
                    asn: asnFormatted,
                    country,
                    city: null
                },
                ftdDropCount24h: 0,
                vpnHistory: {
                    hasRecentSuccess: vpnSuccessCount > 0,
                    successfulLogins: vpnSuccessCount,
                    failedLogins: vpnFailCount,
                    users: vpnUsers.map(u => u.username)
                },
                details: {
                    isAsn: true,
                    asn: asnFormatted,
                    org: orgName,
                    inBlacklist: isBlacklisted,
                    blacklistReason: asnBlacklistEntry?.reason || null,
                    residentialStrikesCount: strikeCount,
                    recentStrikeIps: recentStrikes,
                    country
                },
                telemetry: {
                    vpnSuccessfulLoginsPast30d: vpnSuccessCount,
                    vpnFailedLoginsPast30d: vpnFailCount,
                    associatedCorporateUsers: vpnUsers.map(u => u.username)
                },
                recommendedAction: isBlacklisted ? "MAINTAIN_BLOCK" : (vpnSuccessCount > 100 ? "ALLOWLIST_PERMANENT" : "MONITOR")
            });
        }

        // ==========================================
        // 2. IP ADDRESS INVESTIGATION MODE
        // ==========================================
        const ipToInspect = cleanTarget;
        const forceEnrich = url.searchParams.get("enrich") === "true";

        let cacheInfo = await prisma.ipLookupCache.findUnique({ where: { ip: ipToInspect } });

        // On-the-spot Live Threat Intel Enrichment (Analyst requested via button)
        if (forceEnrich && !isPrivateIp(ipToInspect)) {
            const apiKey = process.env.IPLOCATE_API_KEY;
            if (apiKey) {
                try {
                    const res = await axios.get(`https://www.iplocate.io/api/lookup/${ipToInspect}`, {
                        headers: { "X-API-KEY": apiKey },
                        timeout: 5000
                    });
                    if (res.data) {
                        const d = res.data;
                        cacheInfo = await prisma.ipLookupCache.upsert({
                            where: { ip: ipToInspect },
                            update: {
                                latitude: d.latitude || null,
                                longitude: d.longitude || null,
                                countryCode: d.country_code || null,
                                city: d.city || null,
                                subdivision: d.subdivision || null,
                                rawJson: JSON.stringify(d)
                            },
                            create: {
                                ip: ipToInspect,
                                latitude: d.latitude || null,
                                longitude: d.longitude || null,
                                countryCode: d.country_code || null,
                                city: d.city || null,
                                subdivision: d.subdivision || null,
                                rawJson: JSON.stringify(d)
                            }
                        });

                        // Also update ResidentialStrikeLedger if present
                        await prisma.residentialStrikeLedger.updateMany({
                            where: { ip: ipToInspect },
                            data: {
                                ispOrg: d.company?.name || d.asn?.name || d.org || undefined,
                                asn: d.asn?.asn ? String(d.asn.asn).replace(/^AS/, '') : (d.asn ? String(d.asn).replace(/^AS/, '') : undefined),
                                country: d.country_code || undefined,
                                city: d.city || undefined
                            }
                        }).catch(() => {});
                    }
                } catch (e: any) {
                    console.error("[Investigate] On-the-spot IPLocate enrichment failed:", e.message);
                }
            }
        }

        const [blacklisted, activeShunStats, cveRecord, residentialRecord, pendingCommands] = await Promise.all([
            prisma.guardianBlacklist.findUnique({ where: { ip: ipToInspect } }),
            prisma.firewallShunStats.findMany({
                where: { ip: ipToInspect, isActive: true },
                include: { shunIp: true }
            }),
            prisma.netscalerCveShun.findUnique({ where: { ip: ipToInspect } }),
            prisma.residentialStrikeLedger.findUnique({ where: { ip: ipToInspect } }),
            prisma.firewallCommandQueue.findMany({ where: { ip: ipToInspect, status: "PENDING" } })
        ]);

        const inResidentialBlock = Boolean(residentialRecord && (residentialRecord.strikeCount >= 2 || residentialRecord.status === "ENFORCED" || residentialRecord.status === "QUARANTINED"));
        const inBlacklist = Boolean(blacklisted);
        const inActiveShuns = activeShunStats.length > 0;
        const inCveBlock = Boolean(cveRecord && cveRecord.status === "ACTIVE");
        const isCurrentlyBlocked = inBlacklist || inActiveShuns || inCveBlock || inResidentialBlock;

        // Query Good Traffic Indicators (AnyConnect VPN Success)
        const [vpnSuccesses, vpnFailures] = await Promise.all([
            prisma.vpnEvent.findMany({
                where: { sourceIp: ipToInspect, status: "SUCCESS" },
                orderBy: { createdAt: "desc" },
                take: 50,
                select: { username: true, createdAt: true, vpnType: true, vpnStream: true }
            }),
            prisma.vpnEvent.findMany({
                where: { sourceIp: ipToInspect, status: "FAILURE" },
                orderBy: { createdAt: "desc" },
                take: 50,
                select: { username: true, createdAt: true, failureReason: true, vpnStream: true }
            })
        ]);

        const hasVpnSuccess = vpnSuccesses.length > 0;
        const uniqueVpnSuccessUsers = Array.from(new Set(vpnSuccesses.map(v => v.username)));

        // Query Graylog for Cisco FTD Security Intelligence Block Logs (%FTD-4-430002 / 430003)
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

                const citrixRes = await axios.get(`${gUrl}/api/search/universal/relative`, {
                    params: {
                        query: `(client_ip:"${ipToInspect}" OR source_ip:"${ipToInspect}") AND (ns_action:(LOGIN OR ICASTART) OR "response-200")`,
                        range: 604800,
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

        let geoData = null;
        if (cacheInfo?.rawJson) {
            try { geoData = JSON.parse(cacheInfo.rawJson); } catch {}
        }

        let orgName = cacheInfo ? (geoData?.company?.name || geoData?.asn?.name || geoData?.org || "Unknown") : "Unenriched";
        let asnStr = cacheInfo ? (geoData?.asn?.asn || "Unknown") : "Unenriched";
        let countryCode = cacheInfo?.countryCode || "Unknown";
        let cityName = cacheInfo?.city || null;

        // Fallback to internal PostgreSQL records (Reputation Ledger or VPN Event telemetry)
        if (orgName === "Unenriched" || orgName === "Unknown" || asnStr === "Unknown" || asnStr === "Unenriched") {
            if (residentialRecord?.asn) asnStr = residentialRecord.asn;
            if (residentialRecord?.ispOrg) orgName = residentialRecord.ispOrg;
            if (residentialRecord?.country) countryCode = residentialRecord.country;
            if (residentialRecord?.city) cityName = residentialRecord.city;

            if (asnStr === "Unknown" || asnStr === "Unenriched") {
                const sampleVpn = await prisma.vpnEvent.findFirst({
                    where: { sourceIp: ipToInspect, ipAsn: { not: null } },
                    select: { ipAsn: true, ipAsName: true, ipCountry: true }
                });
                if (sampleVpn?.ipAsn) asnStr = sampleVpn.ipAsn;
                if (sampleVpn?.ipAsName) orgName = sampleVpn.ipAsName;
                if (sampleVpn?.ipCountry) countryCode = sampleVpn.ipCountry;
            }
        }

        // Check if this IP's ASN is in Guardian ASN Blacklist
        let asnBlacklistEntry = null;
        if (asnStr && asnStr !== "Unknown" && asnStr !== "Unenriched") {
            const rawAsn = asnStr.toUpperCase().replace(/^AS/, "");
            asnBlacklistEntry = await prisma.guardianAsnBlacklist.findFirst({
                where: { OR: [{ asn: `AS${rawAsn}` }, { asn: rawAsn }] }
            });
        }
        const inAsnBlacklist = Boolean(asnBlacklistEntry);

        // Calculate Risk Verdict
        let verdict: "FALSE_POSITIVE_LIKELY" | "CONFIRMED_THREAT" | "CLEAN_NOT_BLOCKED";
        let verdictReason = "";

        if (hasVpnSuccess || citrixSuccessCount > 0) {
            verdict = "FALSE_POSITIVE_LIKELY";
            verdictReason = `WARNING: IP ${ipToInspect} is currently blocked or monitored, but has ${vpnSuccesses.length} successful VPN sessions and/or ${citrixSuccessCount} Citrix logins for legitimate corporate staff (${uniqueVpnSuccessUsers.slice(0, 3).join(", ") || "known users"}). Likely false positive!${inAsnBlacklist ? ` (Note: Host ASN ${asnStr} is blacklisted in Guardian: "${asnBlacklistEntry?.reason}")` : ''}`;
        } else if (inAsnBlacklist) {
            verdict = "CONFIRMED_THREAT";
            verdictReason = `CONFIRMED THREAT (BLACKLISTED ASN): IP ${ipToInspect} belongs to ${asnStr} (${orgName}), which is blacklisted fleet-wide in Guardian Policy. Reason: "${asnBlacklistEntry?.reason}".`;
        } else if (inCveBlock) {
            verdict = "CONFIRMED_THREAT";
            verdictReason = `CONFIRMED MALICIOUS: IP ${ipToInspect} matched critical exploit signature ${cveRecord?.cve} (${cveRecord?.ruleName}). Zero legitimate login history.`;
        } else if (!isCurrentlyBlocked) {
            verdict = "CLEAN_NOT_BLOCKED";
            verdictReason = `IP ${ipToInspect} is NOT currently in the Security Intelligence feed or firewall shun tables.`;
        } else {
            verdict = "CONFIRMED_THREAT";
            verdictReason = `THREAT: IP ${ipToInspect} has ${vpnFailures.length} failed login attempts with zero successful VPN or Citrix history.`;
        }

        return NextResponse.json({
            type: "IP",
            target: ipToInspect,
            targetIp: ipToInspect,
            targetUser: targetUser || null,
            inSecurityIntelligence: isCurrentlyBlocked,
            isCurrentlyBlocked,
            verdict: {
                level: verdict,
                reason: verdictReason,
                recommendation: verdict === "FALSE_POSITIVE_LIKELY"
                    ? "UNBLOCK_IMMEDIATELY: Verified corporate employee activity detected. Recommend pardoning or allowlisting."
                    : (inAsnBlacklist
                        ? `ENFORCE_BLOCK: Entire ASN ${asnStr} is blacklisted in Guardian Policy. Ensure IP is locked in Guardian Blacklist and enforced in SI feed.`
                        : (verdict === "CLEAN_NOT_BLOCKED" 
                            ? "NONE: IP is clean and not blocked anywhere across perimeter firewalls."
                            : "MAINTAIN_BLOCK: Confirmed threat with zero legitimate employee login history."))
            },
            ipInfo: {
                ip: ipToInspect,
                as_name: orgName,
                asn: asnStr,
                country: countryCode,
                city: cityName
            },
            ftdDropCount24h: ftdDropCount,
            vpnHistory: {
                hasRecentSuccess: hasVpnSuccess,
                successfulLogins: vpnSuccesses.length,
                failedLogins: vpnFailures.length,
                users: uniqueVpnSuccessUsers,
                gateways: {
                    connect: {
                        name: "Connect (Wilmington)",
                        stream: "WDC-FTD",
                        failures: vpnFailures.filter(f => f.vpnStream === "WDC-FTD").length,
                        successes: vpnSuccesses.filter(s => s.vpnStream === "WDC-FTD").length
                    },
                    reconnect: {
                        name: "Reconnect (Keleman)",
                        stream: "Kel-3140",
                        failures: vpnFailures.filter(f => f.vpnStream === "Kel-3140").length,
                        successes: vpnSuccesses.filter(s => s.vpnStream === "Kel-3140").length
                    }
                }
            },
            details: {
                inBlacklist,
                blacklistReason: blacklisted?.reason || null,
                asnBlacklisted: inAsnBlacklist,
                asnBlacklistReason: asnBlacklistEntry?.reason || null,
                inActiveShuns,
                activeShunFirewalls: activeShunStats.map(s => s.firewall),
                inCveBlock,
                cveTag: cveRecord?.cve || null,
                residential: residentialRecord ? {
                    strikeCount: residentialRecord.strikeCount,
                    status: residentialRecord.status,
                    targetPlatform: residentialRecord.targetPlatform,
                    attemptedUsers: residentialRecord.attemptedUsers,
                    expiresAt: residentialRecord.expiresAt
                } : null,
                pendingQueueCount: pendingCommands.length,
                org: orgName,
                asn: asnStr,
                country: cacheInfo?.countryCode || "Unknown",
                city: cacheInfo?.city || null
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
