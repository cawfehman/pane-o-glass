import https from "https";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getBulkUserAdStatus } from "@/lib/ldap";
import { isPrivateIp } from "@/lib/ipinfo";
import { NetscalerGraylogClient } from "@/lib/netscaler-graylog";
import { executeFirewallCommand } from "@/lib/netscaler-auto-shun";
import { logAudit } from "@/lib/audit";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export type CitrixIssueCategory =
    | "AAA_LOGIN_FAILED"
    | "AAA_POLICY_FAILED"
    | "STA_TICKET_FAILED"
    | "IDP_COOKIE_INVALID"
    | "AUTH_DENIED_OTHER";

export type GuardianAbuseVerdict =
    | "ABUSIVE_BLOCK"
    | "SUSPICIOUS_WATCH"
    | "LEGIT_USER_ISSUE";

export interface CitrixLoginFailureEvent {
    id: string;
    timestamp: string;
    category: CitrixIssueCategory;
    module: string;
    action: string;
    username: string;
    isCorporateFormat: boolean;
    adStatus: string;
    adDisplayName?: string;
    adDepartment?: string;
    clientIp: string;
    countryCode: string;
    cityName: string;
    failureReason: string;
    policyName?: string;
    userAgent?: string;
    rawMessage: string;
}

export interface CitrixGuardianRuleFlag {
    code:
        | "NON_EXISTENT_AD_USER"
        | "NON_CORPORATE_USERNAME"
        | "PASSWORD_SPRAY"
        | "HIGH_FAILURE_VOLUME"
        | "FOREIGN_ORIGIN"
        | "HOSTING_DATACENTER_ASN"
        | "BLACKLISTED_ASN"
        | "DISABLED_OR_LOCKED_AD"
        | "REPEATED_STA_TICKET_ABUSE";
    label: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    points: number;
    detail: string;
}

export interface CitrixIpEvaluation {
    ip: string;
    countryCode: string;
    cityName: string;
    asn: string;
    companyName: string;
    companyType: string;
    cidr: string;
    isResidentialIsp: boolean;
    totalFailures: number;
    loginFailedCount: number;
    policyFailedCount: number;
    staFailedCount: number;
    cookieFailedCount: number;
    citrixSuccessCount: number;
    hasVpnSuccessHistory: boolean;
    targetedUsers: {
        username: string;
        isCorporateFormat: boolean;
        adStatus: string;
        adDisplayName?: string;
        adDepartment?: string;
        failures: number;
        succeededLater: boolean;
    }[];
    firstSeen: string;
    lastSeen: string;
    riskScore: number;
    verdict: GuardianAbuseVerdict;
    verdictReason: string;
    protectionNote?: string;
    triggeredRules: CitrixGuardianRuleFlag[];
    isCurrentlyShunned: boolean;
    shunnedFirewalls: string[];
    isOnGuardianBlacklist: boolean;
    guardianBlacklistReason?: string;
    isOnWatchlist: boolean;
    sampleMessages: string[];
}

export interface CitrixUserIssueSummary {
    username: string;
    isCorporateFormat: boolean;
    adStatus: string;
    adDisplayName?: string;
    adDepartment?: string;
    adTitle?: string;
    failureCount: number;
    citrixSuccessCount: number;
    categories: CitrixIssueCategory[];
    sourceIps: string[];
    countries: string[];
    failureReasons: string[];
    lastFailureAt: string;
    lastSuccessAt?: string;
    diagnosis: string;
}

export interface CitrixTriageConfig {
    minFailuresForBlock: number;
    minSprayUsers: number;
    flagForeignIps: boolean;
    flagNonExistentAdUsers: boolean;
    protectIspWithValidAdUser: boolean;
}

export const DEFAULT_CITRIX_TRIAGE_CONFIG: CitrixTriageConfig = {
    minFailuresForBlock: 3,
    minSprayUsers: 2,
    flagForeignIps: true,
    flagNonExistentAdUsers: true,
    protectIspWithValidAdUser: true,
};

export interface CitrixLoginTriageResponse {
    rangeSeconds: number;
    config: CitrixTriageConfig;
    summary: {
        totalFailureEvents: number;
        totalSuccessLogins: number;
        aaaLoginFailedCount: number;
        policyFailedCount: number;
        staTicketFailedCount: number;
        cookieInvalidCount: number;
        uniqueExternalIps: number;
        abusiveBlockIpCount: number;
        suspiciousWatchIpCount: number;
        legitProtectedIpCount: number;
        alreadyShunnedIpCount: number;
        uniqueUsersImpacted: number;
    };
    ipEvaluations: CitrixIpEvaluation[];
    userSummaries: CitrixUserIssueSummary[];
    events: CitrixLoginFailureEvent[];
}

const CORPORATE_USERNAME_REGEX = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;

export function isCorporateUsernameFormat(username: string): boolean {
    if (!username) return false;
    const clean = username.toLowerCase().replace(/@.*$/, "").trim();
    if (clean === "anonymous" || clean === "nsroot" || clean === "admin" || clean === "administrator") {
        return false;
    }
    return CORPORATE_USERNAME_REGEX.test(clean);
}

interface IpMetaInfo {
    countryCode: string;
    city: string;
    asn: string;
    companyName: string;
    companyType: string;
    cidr: string;
    isResidentialIsp: boolean;
}

async function enrichIpMetadata(ip: string): Promise<IpMetaInfo> {
    const fallback = {
        countryCode: "Unknown",
        city: "N/A",
        asn: "Unknown",
        companyName: "Unknown Network",
        companyType: "unknown",
        cidr: "N/A",
        isResidentialIsp: false,
    };

    if (!ip || isPrivateIp(ip)) return fallback;

    try {
        let rawData: any = null;
        const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
        if (cached) {
            try {
                rawData = JSON.parse(cached.rawJson);
            } catch {
                rawData = {};
            }
        } else {
            const apiKey = process.env.IPLOCATE_API_KEY;
            try {
                const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                    headers: apiKey ? { "X-API-KEY": apiKey } : {},
                    timeout: 4500,
                });
                if (res.data) {
                    rawData = res.data;
                    await prisma.ipLookupCache.upsert({
                        where: { ip },
                        update: {
                            latitude: rawData.latitude || null,
                            longitude: rawData.longitude || null,
                            countryCode: rawData.country_code || null,
                            city: rawData.city || null,
                            subdivision: rawData.subdivision || null,
                            rawJson: JSON.stringify(rawData),
                        },
                        create: {
                            ip,
                            latitude: rawData.latitude || null,
                            longitude: rawData.longitude || null,
                            countryCode: rawData.country_code || null,
                            city: rawData.city || null,
                            subdivision: rawData.subdivision || null,
                            rawJson: JSON.stringify(rawData),
                        },
                    }).catch(() => {});
                }
            } catch {
                // ignore external timeout
            }
        }

        if (!rawData) return fallback;

        const companyName = rawData.company?.name || rawData.asn?.name || rawData.as_name || rawData.org || "Unknown Network";
        const companyType = (rawData.company?.type || rawData.asn?.type || "unknown").toLowerCase();
        const cidr = rawData.asn?.route || rawData.network?.route || "N/A";
        const asnRaw = typeof rawData.asn === "object" ? (rawData.asn?.asn || "Unknown") : (rawData.asn || "Unknown");
        const asn = String(asnRaw);
        const countryCode = rawData.country_code || cached?.countryCode || "Unknown";
        const city = rawData.city || cached?.city || "N/A";

        const cleanComp = companyName.toLowerCase();
        const isResidentialIsp =
            companyType === "isp" ||
            cleanComp.includes("comcast") ||
            cleanComp.includes("verizon") ||
            cleanComp.includes("at&t") ||
            cleanComp.includes("charter") ||
            cleanComp.includes("spectrum") ||
            cleanComp.includes("optimum") ||
            cleanComp.includes("cablevision") ||
            cleanComp.includes("cox ") ||
            cleanComp.includes("t-mobile") ||
            cleanComp.includes("telecom") ||
            cleanComp.includes("broadband") ||
            cleanComp.includes("communications") ||
            cleanComp.includes("cable");

        return {
            countryCode,
            city,
            asn,
            companyName,
            companyType,
            cidr,
            isResidentialIsp,
        };
    } catch {
        return fallback;
    }
}

function classifyFailureMessage(msg: any): {
    category: CitrixIssueCategory;
    failureReason: string;
    policyName?: string;
    userAgent?: string;
} {
    const raw = msg?.message || "";
    const action = (msg?.ns_action || msg?.status || "").toUpperCase();
    const mod = (msg?.ns_module || "").toUpperCase();

    let userAgent: string | undefined = msg?.user_agent;
    if (!userAgent) {
        const uaMatch = raw.match(/(?:Browser|Browser_type)\s+"?([^"\r\n]+)"?/i);
        if (uaMatch) userAgent = uaMatch[1].trim();
    }

    if (action === "LOGIN_FAILED" || /AAA\s+LOGIN_FAILED/i.test(raw)) {
        let reason = msg?.failure_reason || msg?.reason || "";
        if (!reason) {
            const rMatch = raw.match(/Failure_reason\s+"([^"]+)"/i);
            if (rMatch) reason = rMatch[1];
        }
        return {
            category: "AAA_LOGIN_FAILED",
            failureReason: reason || "External authentication server denied access",
            userAgent,
        };
    }

    if (/Failed policy for user/i.test(raw)) {
        const polMatch = raw.match(/Failed policy for user\s+[^\s=]+\s*=\s*([^\s"]+)/i);
        const policyName = polMatch ? polMatch[1].trim() : "Unknown-Policy";
        return {
            category: "AAA_POLICY_FAILED",
            failureReason: `AAA Policy Failure (${policyName})`,
            policyName,
            userAgent,
        };
    }

    if (/STA ticket validation failed/i.test(raw)) {
        return {
            category: "STA_TICKET_FAILED",
            failureReason: "Citrix ICA STA ticket validation failed",
            userAgent,
        };
    }

    if (/Invalid tass cookie/i.test(raw)) {
        const pathMatch = raw.match(/idp functionality:\s*([^\s"]+)/i);
        return {
            category: "IDP_COOKIE_INVALID",
            failureReason: `Invalid TASS / IDP authentication cookie${pathMatch ? ` (${pathMatch[1]})` : ""}`,
            userAgent,
        };
    }

    return {
        category: "AUTH_DENIED_OTHER",
        failureReason: msg?.failure_reason || msg?.reason || `${mod || "Citrix"} ${action || "Authentication Failure"}`,
        userAgent,
    };
}

export async function analyzeCitrixLoginTriage(
    rangeSeconds: number = 86400,
    customConfig?: Partial<CitrixTriageConfig>
): Promise<CitrixLoginTriageResponse> {
    const config: CitrixTriageConfig = {
        ...DEFAULT_CITRIX_TRIAGE_CONFIG,
        ...(customConfig || {}),
    };

    const baseUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const authHeader = "Basic " + Buffer.from(`${apiToken}:token`).toString("base64");
    const baseStream = "(streams:5c055e3ab20902046cedcfcd OR _exists_:ns_module)";

    const failQuery = `${baseStream} AND (ns_action:LOGIN_FAILED OR (ns_module:(AAA OR SSLVPN OR AAATM OR ICA) AND (LOGIN_FAILED OR "Failed policy" OR "denied access" OR "STA ticket validation failed" OR "Invalid tass cookie" OR FAILURE OR FAILED OR DENIED OR "type 5") AND NOT "invalid opcode" AND NOT "NAS_NAC_PROXY" AND NOT "CONSOLE_CLOUD_AGENT"))`;
    const successQuery = `${baseStream} AND (ns_action:(LOGIN OR LOGOUT OR ICASTART OR ICAEND_CONNSTAT) OR (ns_module:SSLVPN AND "response-200"))`;

    const fields = [
        "src_ip",
        "source_ip",
        "client_ip",
        "ns_remote_ip",
        "src_ip_country_code",
        "source_ip_country_code",
        "client_ip_country_code",
        "src_ip_city_name",
        "source_ip_city_name",
        "client_ip_city_name",
        "ns_username",
        "username",
        "user",
        "ns_module",
        "ns_action",
        "status",
        "failure_reason",
        "reason",
        "user_agent",
        "message",
        "timestamp",
    ].join(",");

    const [failRes, successRes] = await Promise.all([
        axios.get(`${baseUrl}/api/search/universal/relative`, {
            params: {
                query: failQuery,
                range: rangeSeconds,
                limit: 500,
                fields,
                sort: "timestamp:desc",
            },
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass",
            },
            timeout: 20000,
        }).catch(() => ({ data: { messages: [], total_results: 0 } })),
        axios.get(`${baseUrl}/api/search/universal/relative`, {
            params: {
                query: successQuery,
                range: rangeSeconds,
                limit: 500,
                fields,
                sort: "timestamp:desc",
            },
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass",
            },
            timeout: 20000,
        }).catch(() => ({ data: { messages: [], total_results: 0 } })),
    ]);

    const rawFailures: any[] = failRes.data?.messages || [];
    const rawSuccesses: any[] = successRes.data?.messages || [];

    // Track successful Citrix sessions by IP and by Username (with latest timestamp)
    const citrixSuccessByIp = new Map<string, { count: number; lastSuccessAt: string }>();
    const citrixSuccessByUser = new Map<string, { count: number; lastSuccessAt: string }>();
    // Also map username -> most recent known Client IP from nearby events (for AAA Failed policy messages that omit IP)
    const recentUserIpMap = new Map<string, { ip: string; countryCode: string; cityName: string }>();

    for (const s of rawSuccesses) {
        const msg = s.message || {};
        const ip = NetscalerGraylogClient.extractSourceIp(msg);
        const u = NetscalerGraylogClient.extractUsername(msg).toLowerCase();
        const ts = msg.timestamp || "";
        const country = NetscalerGraylogClient.extractCountryCode(msg);
        const city = NetscalerGraylogClient.extractCityName(msg);

        if (ip && !isPrivateIp(ip)) {
            const cur = citrixSuccessByIp.get(ip) || { count: 0, lastSuccessAt: ts };
            cur.count += 1;
            if (ts > cur.lastSuccessAt) cur.lastSuccessAt = ts;
            citrixSuccessByIp.set(ip, cur);

            if (u && u !== "anonymous" && !recentUserIpMap.has(u)) {
                recentUserIpMap.set(u, { ip, countryCode: country, cityName: city });
            }
        }
        if (u && u !== "anonymous") {
            const curU = citrixSuccessByUser.get(u) || { count: 0, lastSuccessAt: ts };
            curU.count += 1;
            if (ts > curU.lastSuccessAt) curU.lastSuccessAt = ts;
            citrixSuccessByUser.set(u, curU);
        }
    }

    // First pass over failures to also populate recentUserIpMap from AAA LOGIN_FAILED events
    for (const f of rawFailures) {
        const msg = f.message || {};
        const ip = NetscalerGraylogClient.extractSourceIp(msg);
        const u = NetscalerGraylogClient.extractUsername(msg).toLowerCase();
        if (ip && !isPrivateIp(ip) && u && u !== "anonymous") {
            const country = NetscalerGraylogClient.extractCountryCode(msg);
            const city = NetscalerGraylogClient.extractCityName(msg);
            recentUserIpMap.set(u, { ip, countryCode: country, cityName: city });
        }
    }

    // Collect all unique usernames to enrich against Active Directory in bulk
    const allUsernamesSet = new Set<string>();
    for (const f of rawFailures) {
        const u = NetscalerGraylogClient.extractUsername(f.message);
        if (u && u !== "anonymous" && u !== "nsroot") {
            allUsernamesSet.add(u.toLowerCase());
        }
    }

    const adStatusMap: Record<string, { adStatus: string; displayName: string; department: string; title: string }> =
        allUsernamesSet.size > 0
            ? await getBulkUserAdStatus(Array.from(allUsernamesSet)).catch(() => ({}))
            : {};

    // Check if any of the users have recent ACCOUNT_LOCKOUT (Event 4740) in AccountLifecycleEvent
    if (allUsernamesSet.size > 0) {
        const sinceDate = new Date(Date.now() - rangeSeconds * 1000);
        const lockedRecords = await prisma.accountLifecycleEvent.findMany({
            where: {
                canonicalUsername: { in: Array.from(allUsernamesSet) },
                eventType: "ACCOUNT_LOCKOUT",
                timestamp: { gte: sinceDate },
            },
            select: { canonicalUsername: true },
            distinct: ["canonicalUsername"],
        }).catch(() => []);
        for (const lr of lockedRecords) {
            const key = lr.canonicalUsername.toLowerCase();
            if (adStatusMap[key] && adStatusMap[key].adStatus === "ACTIVE") {
                adStatusMap[key].adStatus = "LOCKED";
            }
        }
    }

    // Parse all failure events
    const events: CitrixLoginFailureEvent[] = [];
    const uniqueExternalIpsSet = new Set<string>();

    for (const f of rawFailures) {
        const msg = f.message || {};
        const raw = msg.message || "";
        if (/invalid opcode 8/i.test(raw) || /NAS_NAC_PROXY to INVALID/i.test(raw) || /CONSOLE_CLOUD_AGENT/i.test(raw)) {
            continue;
        }

        const usernameRaw = NetscalerGraylogClient.extractUsername(msg);
        const usernameClean = (usernameRaw || "anonymous").toLowerCase();
        let clientIp = NetscalerGraylogClient.extractSourceIp(msg);
        let countryCode = NetscalerGraylogClient.extractCountryCode(msg);
        let cityName = NetscalerGraylogClient.extractCityName(msg);

        // If AAA Failed policy message didn't include Client_ip directly, correlate with the companion AAA LOGIN_FAILED / session IP for that user
        if (!clientIp && usernameClean !== "anonymous" && recentUserIpMap.has(usernameClean)) {
            const correlated = recentUserIpMap.get(usernameClean)!;
            clientIp = correlated.ip;
            if (countryCode === "Unknown") countryCode = correlated.countryCode;
            if (cityName === "N/A") cityName = correlated.cityName;
        }

        if (clientIp && !isPrivateIp(clientIp)) {
            uniqueExternalIpsSet.add(clientIp);
        }

        const classified = classifyFailureMessage(msg);
        const adInfo = adStatusMap[usernameClean] || adStatusMap[usernameRaw];
        const isCorp = isCorporateUsernameFormat(usernameClean);

        events.push({
            id: msg._id || `${msg.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: msg.timestamp || new Date().toISOString(),
            category: classified.category,
            module: msg.ns_module || "Citrix",
            action: msg.ns_action || "Message",
            username: usernameRaw || "anonymous",
            isCorporateFormat: isCorp,
            adStatus: usernameClean === "anonymous" ? "ANONYMOUS" : (adInfo?.adStatus || "NOT_FOUND"),
            adDisplayName: adInfo?.displayName,
            adDepartment: adInfo?.department,
            clientIp: clientIp || "Internal / Unattributed",
            countryCode,
            cityName,
            failureReason: classified.failureReason,
            policyName: classified.policyName,
            userAgent: classified.userAgent,
            rawMessage: raw,
        });
    }

    // Enrich all external IPs with IPLocate/Cache, Shun DB, Guardian Blacklist, Guardian Watchlist, and VPN History
    const externalIps = Array.from(uniqueExternalIpsSet);
    const ipMetaEntries: { ip: string; meta: IpMetaInfo }[] = await Promise.all(
        externalIps.map(async (ip) => ({ ip, meta: await enrichIpMetadata(ip) }))
    );

    const [
        shunEntries,
        cveShunEntries,
        guardianBlacklistEntries,
        guardianWatchEntries,
        asnBlacklistEntries,
        vpnSuccessEntries,
    ] = await Promise.all([
        externalIps.length > 0
            ? prisma.firewallShunStats.findMany({ where: { ip: { in: externalIps }, isActive: true } }).catch(() => [])
            : Promise.resolve([]),
        externalIps.length > 0
            ? prisma.netscalerCveShun.findMany({ where: { ip: { in: externalIps }, status: "ACTIVE" } }).catch(() => [])
            : Promise.resolve([]),
        externalIps.length > 0
            ? prisma.guardianBlacklist.findMany({ where: { ip: { in: externalIps } } }).catch(() => [])
            : Promise.resolve([]),
        externalIps.length > 0
            ? prisma.guardianWatchIp.findMany({ where: { ip: { in: externalIps } } }).catch(() => [])
            : Promise.resolve([]),
        prisma.guardianAsnBlacklist.findMany().catch(() => []),
        externalIps.length > 0
            ? prisma.vpnEvent.findMany({
                  where: { sourceIp: { in: externalIps }, status: "SUCCESS" },
                  select: { sourceIp: true },
                  distinct: ["sourceIp"],
              }).catch(() => [])
            : Promise.resolve([]),
    ]);

    const ipMetaMap = new Map<string, IpMetaInfo>(ipMetaEntries.map((e) => [e.ip, e.meta]));
    const shunMap = new Map<string, Set<string>>();
    for (const s of shunEntries) {
        if (!shunMap.has(s.ip)) shunMap.set(s.ip, new Set());
        shunMap.get(s.ip)!.add(s.firewall);
    }
    for (const cs of cveShunEntries) {
        if (!shunMap.has(cs.ip)) shunMap.set(cs.ip, new Set());
        shunMap.get(cs.ip)!.add((cs as any).firewalls || (cs as any).targetFirewalls || "Perimeter Fleet");
    }

    const blacklistMap = new Map<string, string>(
        guardianBlacklistEntries.map((b) => [b.ip, b.reason || "Blacklisted"])
    );
    const watchSet = new Set<string>(guardianWatchEntries.map((w) => w.ip));
    const vpnSuccessSet = new Set<string>(vpnSuccessEntries.map((v) => v.sourceIp));
    const blacklistedAsnSet = new Set<string>(
        asnBlacklistEntries.map((a) => String(a.asn).toUpperCase().replace(/^AS/, ""))
    );

    // Backfill Geo info on events from ipMetaMap if Graylog didn't have country/city
    for (const ev of events) {
        if (ev.clientIp && ipMetaMap.has(ev.clientIp)) {
            const meta = ipMetaMap.get(ev.clientIp)!;
            if (ev.countryCode === "Unknown" && meta.countryCode !== "Unknown") {
                ev.countryCode = meta.countryCode;
            }
            if (ev.cityName === "N/A" && meta.city !== "N/A") {
                ev.cityName = meta.city;
            }
        }
    }

    // Build Per-IP Evaluations with Smart Guardian Rules
    const ipGroups = new Map<string, CitrixLoginFailureEvent[]>();
    for (const ev of events) {
        if (!ev.clientIp || ev.clientIp === "Internal / Unattributed" || isPrivateIp(ev.clientIp)) {
            continue;
        }
        if (!ipGroups.has(ev.clientIp)) ipGroups.set(ev.clientIp, []);
        ipGroups.get(ev.clientIp)!.push(ev);
    }

    const ipEvaluations: CitrixIpEvaluation[] = [];

    for (const [ip, ipEvents] of ipGroups.entries()) {
        const meta = ipMetaMap.get(ip) || {
            countryCode: ipEvents[0]?.countryCode || "Unknown",
            city: ipEvents[0]?.cityName || "N/A",
            asn: "Unknown",
            companyName: "Unknown Network",
            companyType: "unknown",
            cidr: "N/A",
            isResidentialIsp: false,
        };

        const countryCode = meta.countryCode !== "Unknown" ? meta.countryCode : (ipEvents[0]?.countryCode || "Unknown");
        const cityName = meta.city !== "N/A" ? meta.city : (ipEvents[0]?.cityName || "N/A");

        let loginFailedCount = 0;
        let policyFailedCount = 0;
        let staFailedCount = 0;
        let cookieFailedCount = 0;
        let firstSeen = ipEvents[0].timestamp;
        let lastSeen = ipEvents[0].timestamp;

        const userMap = new Map<string, {
            username: string;
            isCorporateFormat: boolean;
            adStatus: string;
            adDisplayName?: string;
            adDepartment?: string;
            failures: number;
            succeededLater: boolean;
        }>();

        for (const ev of ipEvents) {
            if (ev.category === "AAA_LOGIN_FAILED") loginFailedCount++;
            else if (ev.category === "AAA_POLICY_FAILED") policyFailedCount++;
            else if (ev.category === "STA_TICKET_FAILED") staFailedCount++;
            else if (ev.category === "IDP_COOKIE_INVALID") cookieFailedCount++;

            if (ev.timestamp < firstSeen) firstSeen = ev.timestamp;
            if (ev.timestamp > lastSeen) lastSeen = ev.timestamp;

            const uKey = ev.username.toLowerCase();
            const existingU = userMap.get(uKey);
            const userSucc = citrixSuccessByUser.get(uKey);
            const succeededLater = Boolean(userSucc && userSucc.lastSuccessAt >= ev.timestamp);

            if (existingU) {
                existingU.failures += 1;
                if (succeededLater) existingU.succeededLater = true;
            } else {
                userMap.set(uKey, {
                    username: ev.username,
                    isCorporateFormat: ev.isCorporateFormat,
                    adStatus: ev.adStatus,
                    adDisplayName: ev.adDisplayName,
                    adDepartment: ev.adDepartment,
                    failures: 1,
                    succeededLater,
                });
            }
        }

        const targetedUsers = Array.from(userMap.values());
        const nonAnonUsers = targetedUsers.filter((u) => u.username.toLowerCase() !== "anonymous");
        const citrixSucc = citrixSuccessByIp.get(ip)?.count || 0;
        const hasVpnSuccessHistory = vpnSuccessSet.has(ip);
        const totalFailures = ipEvents.length;

        // Evaluate Smart Guardian Rules
        const triggeredRules: CitrixGuardianRuleFlag[] = [];
        let riskScore = 0;

        // 1. Foreign Origin Check
        if (config.flagForeignIps && countryCode !== "US" && countryCode !== "Unknown") {
            triggeredRules.push({
                code: "FOREIGN_ORIGIN",
                label: `Foreign Origin (${countryCode})`,
                severity: "CRITICAL",
                points: 50,
                detail: `Authentication/session failures originating outside the US (${cityName !== "N/A" ? `${cityName}, ` : ""}${countryCode}).`,
            });
            riskScore += 50;
        }

        // 2. Password Spraying Check (multiple distinct usernames)
        if (nonAnonUsers.length >= config.minSprayUsers) {
            triggeredRules.push({
                code: "PASSWORD_SPRAY",
                label: `Password Spray (${nonAnonUsers.length} Users)`,
                severity: "CRITICAL",
                points: 55,
                detail: `Single IP targeted ${nonAnonUsers.length} distinct usernames (${nonAnonUsers.map((u) => u.username).slice(0, 4).join(", ")}).`,
            });
            riskScore += 55;
        }

        // 3. Non-Corporate or Non-Existent AD Usernames
        if (config.flagNonExistentAdUsers && nonAnonUsers.length > 0) {
            const invalidFormatUsers = nonAnonUsers.filter((u) => !u.isCorporateFormat);
            const notFoundAdUsers = nonAnonUsers.filter((u) => u.isCorporateFormat && u.adStatus === "NOT_FOUND");
            const disabledLockedUsers = nonAnonUsers.filter((u) => u.adStatus === "DISABLED" || u.adStatus === "LOCKED" || u.adStatus === "EXPIRED");

            if (invalidFormatUsers.length > 0) {
                triggeredRules.push({
                    code: "NON_CORPORATE_USERNAME",
                    label: "Non-Corporate Username Format",
                    severity: "HIGH",
                    points: 45,
                    detail: `Attempted username(s) do not match corporate name-name format: ${invalidFormatUsers.map((u) => u.username).join(", ")}.`,
                });
                riskScore += 45;
            }

            if (notFoundAdUsers.length > 0) {
                triggeredRules.push({
                    code: "NON_EXISTENT_AD_USER",
                    label: "Username Not Found in AD",
                    severity: "CRITICAL",
                    points: 50,
                    detail: `Corporate-formatted username(s) do not exist in Active Directory: ${notFoundAdUsers.map((u) => u.username).join(", ")}.`,
                });
                riskScore += 50;
            }

            if (disabledLockedUsers.length > 0) {
                triggeredRules.push({
                    code: "DISABLED_OR_LOCKED_AD",
                    label: `AD Account ${disabledLockedUsers[0].adStatus}`,
                    severity: "MEDIUM",
                    points: 25,
                    detail: `Targeted AD account is currently ${disabledLockedUsers.map((u) => `${u.username} (${u.adStatus})`).join(", ")}.`,
                });
                riskScore += 25;
            }
        }

        // 4. High Failure Volume without Success
        if (totalFailures >= config.minFailuresForBlock && citrixSucc === 0 && !hasVpnSuccessHistory) {
            triggeredRules.push({
                code: "HIGH_FAILURE_VOLUME",
                label: `Repeated Failures (${totalFailures}x, 0 Success)`,
                severity: "HIGH",
                points: 35,
                detail: `IP generated ${totalFailures} Citrix failure events with zero successful Citrix or VPN logins.`,
            });
            riskScore += 35;
        }

        // 5. Hosting / Datacenter / Blacklisted ASN
        const cleanAsnNum = String(meta.asn).toUpperCase().replace(/^AS/, "");
        const isEnterpriseProxy = /zscaler|netskope|palo alto|cloudflare|akamai|cisco umbrella/i.test(meta.companyName);
        if (blacklistedAsnSet.has(cleanAsnNum)) {
            triggeredRules.push({
                code: "BLACKLISTED_ASN",
                label: `Blacklisted ASN (${meta.asn})`,
                severity: "CRITICAL",
                points: 60,
                detail: `Origin belongs to Guardian blacklisted ASN ${meta.asn} (${meta.companyName}).`,
            });
            riskScore += 60;
        } else if (meta.companyType === "hosting" && !isEnterpriseProxy) {
            triggeredRules.push({
                code: "HOSTING_DATACENTER_ASN",
                label: "Hosting / Datacenter / VPN ASN",
                severity: "HIGH",
                points: 40,
                detail: `Source IP belongs to hosting/cloud provider ${meta.companyName} (${meta.asn}).`,
            });
            riskScore += 40;
        }

        // 6. Anonymous STA ticket validation probing without valid session
        if (staFailedCount >= config.minFailuresForBlock && nonAnonUsers.length === 0 && citrixSucc === 0 && !hasVpnSuccessHistory) {
            triggeredRules.push({
                code: "REPEATED_STA_TICKET_ABUSE",
                label: `Repeated STA Ticket Failures (${staFailedCount}x)`,
                severity: "HIGH",
                points: 35,
                detail: `Repeated unauthenticated/anonymous STA ticket validation failures (${staFailedCount}x) with no active Citrix session from this IP.`,
            });
            riskScore += 35;
        }

        // Guardian Safety Shield Evaluation (Protects legitimate Cooper users on US ISPs)
        const allUsersValidAd =
            nonAnonUsers.length > 0 &&
            nonAnonUsers.every((u) => u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" || u.adStatus === "LOCKED");
        const isSingleUser = nonAnonUsers.length === 1;
        const isOnWatchlist = watchSet.has(ip);
        const isOnGuardianBlacklist = blacklistMap.has(ip);

        let verdict: GuardianAbuseVerdict = "SUSPICIOUS_WATCH";
        let verdictReason = "";
        let protectionNote: string | undefined;

        if (isOnGuardianBlacklist) {
            verdict = "ABUSIVE_BLOCK";
            riskScore = Math.max(riskScore, 85);
            verdictReason = `On Guardian Do-Not-Unshun Blacklist: ${blacklistMap.get(ip)}`;
        } else if (isOnWatchlist) {
            verdict = "LEGIT_USER_ISSUE";
            riskScore = Math.min(riskScore, 10);
            verdictReason = "Protected Watchlist Asset IP";
            protectionNote = "IP is registered on the Guardian Monitored Watchlist.";
        } else if (
            config.protectIspWithValidAdUser &&
            countryCode === "US" &&
            allUsersValidAd &&
            isSingleUser &&
            (citrixSucc > 0 || hasVpnSuccessHistory || (meta.isResidentialIsp && totalFailures < config.minFailuresForBlock * 2))
        ) {
            verdict = "LEGIT_USER_ISSUE";
            riskScore = Math.min(riskScore, 15);
            const u = nonAnonUsers[0];
            const userLabel = u.adDisplayName ? `${u.adDisplayName} (${u.username})` : u.username;
            if (citrixSucc > 0 || u.succeededLater) {
                verdictReason = `Legitimate AD user ${userLabel} had ${totalFailures} failure(s) (e.g., Imprivata/LDAP retry) and logged into Citrix successfully (${citrixSucc} session events).`;
                protectionNote = "Guardian Protected: Verified AD user with successful Citrix login from this US IP.";
            } else if (hasVpnSuccessHistory) {
                verdictReason = `Legitimate AD user ${userLabel} with prior successful AnyConnect VPN history from this IP.`;
                protectionNote = "Guardian Protected: IP has verified Cooper VPN success history and valid AD user.";
            } else {
                verdictReason = `Valid AD user ${userLabel} connecting from US ISP (${meta.companyName}). Likely password typo or Imprivata MFA prompt timeout.`;
                protectionNote = "Guardian Protected: US ISP with verified Active Directory corporate user.";
            }
        } else if (
            loginFailedCount === 0 &&
            policyFailedCount === 0 &&
            staFailedCount > 0 &&
            staFailedCount < config.minFailuresForBlock
        ) {
            verdict = "SUSPICIOUS_WATCH";
            riskScore = Math.min(riskScore, 35);
            verdictReason = `Isolated ICA STA ticket validation failure (${staFailedCount}x, 0 login/password failures)${
                isEnterpriseProxy ? ` via Enterprise SASE Proxy (${meta.companyName})` : ""
            }. Monitor for repeated brute-force activity before shunning.`;
            if (isEnterpriseProxy) {
                protectionNote = `Shared Enterprise SASE Proxy (${meta.companyName} ${meta.asn}) — shunning may impact multiple proxied remote users.`;
            }
        } else if (riskScore >= 50) {
            verdict = "ABUSIVE_BLOCK";
            verdictReason = triggeredRules.map((r) => r.label).join(" + ") || "High-risk authentication abuse pattern";
        } else if (riskScore >= 20 || staFailedCount > 0) {
            verdict = "SUSPICIOUS_WATCH";
            verdictReason =
                triggeredRules.map((r) => r.label).join(" + ") ||
                "Unattributed STA ticket / session validation failure (monitor for repeat hits)";
        } else {
            verdict = "LEGIT_USER_ISSUE";
            verdictReason = "Low-risk authentication anomaly from US network.";
        }

        riskScore = Math.min(100, riskScore);
        const fwSet = shunMap.get(ip);

        ipEvaluations.push({
            ip,
            countryCode,
            cityName,
            asn: meta.asn,
            companyName: meta.companyName,
            companyType: meta.companyType,
            cidr: meta.cidr,
            isResidentialIsp: meta.isResidentialIsp,
            totalFailures,
            loginFailedCount,
            policyFailedCount,
            staFailedCount,
            cookieFailedCount,
            citrixSuccessCount: citrixSucc,
            hasVpnSuccessHistory,
            targetedUsers,
            firstSeen,
            lastSeen,
            riskScore,
            verdict,
            verdictReason,
            protectionNote,
            triggeredRules,
            isCurrentlyShunned: Boolean(fwSet && fwSet.size > 0),
            shunnedFirewalls: fwSet ? Array.from(fwSet) : [],
            isOnGuardianBlacklist,
            guardianBlacklistReason: blacklistMap.get(ip),
            isOnWatchlist,
            sampleMessages: ipEvents.slice(0, 3).map((e) => e.rawMessage),
        });
    }

    ipEvaluations.sort((a, b) => {
        const order: Record<GuardianAbuseVerdict, number> = {
            ABUSIVE_BLOCK: 3,
            SUSPICIOUS_WATCH: 2,
            LEGIT_USER_ISSUE: 1,
        };
        if (order[b.verdict] !== order[a.verdict]) return order[b.verdict] - order[a.verdict];
        if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
        return b.totalFailures - a.totalFailures;
    });

    // Build Per-User Issue Summaries (for user login troubleshooting & lockout correlation)
    const userGroups = new Map<string, CitrixLoginFailureEvent[]>();
    for (const ev of events) {
        const uKey = ev.username.toLowerCase();
        if (!uKey || uKey === "anonymous" || uKey === "nsroot") continue;
        if (!userGroups.has(uKey)) userGroups.set(uKey, []);
        userGroups.get(uKey)!.push(ev);
    }

    const userSummaries: CitrixUserIssueSummary[] = [];
    for (const [uKey, uEvents] of userGroups.entries()) {
        const firstEv = uEvents[0];
        const adInfo = adStatusMap[uKey];
        const succInfo = citrixSuccessByUser.get(uKey);
        const categories = Array.from(new Set(uEvents.map((e) => e.category)));
        const sourceIps = Array.from(new Set(uEvents.map((e) => e.clientIp).filter((ip) => ip && ip !== "Internal / Unattributed")));
        const countries = Array.from(new Set(uEvents.map((e) => e.countryCode).filter((c) => c && c !== "Unknown")));
        const reasons = Array.from(new Set(uEvents.map((e) => e.failureReason)));

        let diagnosis = "";
        if (firstEv.adStatus === "NOT_FOUND") {
            diagnosis = "Account does not exist in Active Directory — potential username enumeration or typo.";
        } else if (firstEv.adStatus === "LOCKED") {
            diagnosis = "Active Directory account is currently LOCKED OUT. Check Account Lockout Investigator.";
        } else if (firstEv.adStatus === "DISABLED") {
            diagnosis = "Active Directory account is DISABLED (terminated or inactive user attempting Citrix access).";
        } else if (categories.includes("AAA_POLICY_FAILED") && categories.includes("AAA_LOGIN_FAILED")) {
            if (succInfo && succInfo.lastSuccessAt >= firstEv.timestamp) {
                diagnosis = "Failed Imprivata-prod / AAA policy check (password or MFA push denial), then authenticated successfully afterward.";
            } else {
                diagnosis = "Failed Imprivata-prod / External AAA authentication policy. Verify user's AD password and Imprivata MFA enrollment.";
            }
        } else {
            diagnosis = reasons[0] || "Citrix Gateway authentication failure.";
        }

        userSummaries.push({
            username: firstEv.username,
            isCorporateFormat: firstEv.isCorporateFormat,
            adStatus: firstEv.adStatus,
            adDisplayName: adInfo?.displayName,
            adDepartment: adInfo?.department,
            adTitle: adInfo?.title,
            failureCount: uEvents.length,
            citrixSuccessCount: succInfo?.count || 0,
            categories,
            sourceIps,
            countries,
            failureReasons: reasons,
            lastFailureAt: firstEv.timestamp,
            lastSuccessAt: succInfo?.lastSuccessAt,
            diagnosis,
        });
    }

    userSummaries.sort((a, b) => b.failureCount - a.failureCount);

    const aaaLoginFailedCount = events.filter((e) => e.category === "AAA_LOGIN_FAILED").length;
    const policyFailedCount = events.filter((e) => e.category === "AAA_POLICY_FAILED").length;
    const staTicketFailedCount = events.filter((e) => e.category === "STA_TICKET_FAILED").length;
    const cookieInvalidCount = events.filter((e) => e.category === "IDP_COOKIE_INVALID").length;

    return {
        rangeSeconds,
        config,
        summary: {
            totalFailureEvents: events.length,
            totalSuccessLogins: rawSuccesses.length,
            aaaLoginFailedCount,
            policyFailedCount,
            staTicketFailedCount,
            cookieInvalidCount,
            uniqueExternalIps: ipEvaluations.length,
            abusiveBlockIpCount: ipEvaluations.filter((i) => i.verdict === "ABUSIVE_BLOCK").length,
            suspiciousWatchIpCount: ipEvaluations.filter((i) => i.verdict === "SUSPICIOUS_WATCH").length,
            legitProtectedIpCount: ipEvaluations.filter((i) => i.verdict === "LEGIT_USER_ISSUE").length,
            alreadyShunnedIpCount: ipEvaluations.filter((i) => i.isCurrentlyShunned).length,
            uniqueUsersImpacted: userSummaries.length,
        },
        ipEvaluations,
        userSummaries,
        events,
    };
}

/**
 * Executes a perimeter firewall shun AND adds the IP(s) to the Guardian Do-Not-Unshun Blacklist
 * so that the Guardian cron never unshuns an abusive Citrix attacker IP.
 */
export async function blockCitrixAbusiveIps(params: {
    ips: string[];
    reason: string;
    targetHost?: string;
    addToGuardianBlacklist?: boolean;
    userId: string;
    clientIp: string;
}): Promise<{
    success: boolean;
    blockedIps: string[];
    skippedIps: string[];
    firewallResults: any[];
    blacklistedCount: number;
}> {
    const {
        ips,
        reason,
        targetHost = "all",
        addToGuardianBlacklist = true,
        userId,
        clientIp,
    } = params;

    const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
    const uniqueIps = Array.from(new Set(ips.map((ip) => String(ip).trim()))).filter(
        (ip) => ipv4Regex.test(ip) && !isPrivateIp(ip)
    );

    // Never block IPs on the Guardian Protected Watchlist
    const watched = await prisma.guardianWatchIp.findMany({
        where: { ip: { in: uniqueIps } },
    });
    const watchSet = new Set(watched.map((w) => w.ip));

    const blockedIps = uniqueIps.filter((ip) => !watchSet.has(ip));
    const skippedIps = uniqueIps.filter((ip) => watchSet.has(ip));

    const firewallResults: any[] = [];
    let blacklistedCount = 0;

    for (const ip of blockedIps) {
        const fwExec = await executeFirewallCommand(`shun ${ip}`, targetHost);
        firewallResults.push({
            ip,
            success: fwExec.success,
            targetLabel: fwExec.targetLabel,
            results: fwExec.results,
        });

        const meta = await enrichIpMetadata(ip);

        // Record in FirewallQueryHistory
        await prisma.firewallQueryHistory.create({
            data: {
                userId,
                command: "Shun IP (Citrix Abuse Triage)",
                targetIp: ip,
                targetName: fwExec.targetLabel,
                ipAsn: meta.asn !== "Unknown" ? meta.asn : null,
                ipAsName: meta.companyName !== "Unknown Network" ? meta.companyName : null,
                ipCountry: meta.countryCode !== "Unknown" ? meta.countryCode : null,
                ipCountryCode: meta.countryCode !== "Unknown" ? meta.countryCode : null,
            },
        }).catch(() => {});

        // Also insert into FirewallShunStats & ShunDatabaseIp so the Shun Database tab reflects it immediately
        const now = new Date();
        await prisma.shunDatabaseIp.upsert({
            where: { ip },
            update: {
                ipAsn: meta.asn !== "Unknown" ? meta.asn : undefined,
                org: meta.companyName !== "Unknown Network" ? meta.companyName : undefined,
                ipCountryCode: meta.countryCode !== "Unknown" ? meta.countryCode : undefined,
                city: meta.city !== "N/A" ? meta.city : undefined,
                enrichedAt: now,
            },
            create: {
                ip,
                ipAsn: meta.asn !== "Unknown" ? meta.asn : null,
                org: meta.companyName !== "Unknown Network" ? meta.companyName : null,
                ipCountryCode: meta.countryCode !== "Unknown" ? meta.countryCode : null,
                city: meta.city !== "N/A" ? meta.city : null,
                enrichedAt: now,
            },
        }).catch(() => {});

        for (const r of fwExec.results) {
            if (r.success) {
                const existingStat = await prisma.firewallShunStats.findFirst({
                    where: { ip, firewall: r.target },
                });
                if (existingStat) {
                    await prisma.firewallShunStats.update({
                        where: { id: existingStat.id },
                        data: { isActive: true, lastSeen: now },
                    }).catch(() => {});
                } else {
                    await prisma.firewallShunStats.create({
                        data: {
                            ip,
                            firewall: r.target,
                            firstSeen: now,
                            lastSeen: now,
                            daysShunned: 1,
                            isActive: true,
                        },
                    }).catch(() => {});
                }
            }
        }

        if (addToGuardianBlacklist) {
            const blReason = `[Citrix Abuse Guard] ${reason}`;
            await prisma.guardianBlacklist.upsert({
                where: { ip },
                update: { reason: blReason },
                create: { ip, reason: blReason },
            }).catch(() => {});
            blacklistedCount++;
        }

        await logAudit(
            "CITRIX_ABUSE_SHUN",
            `Blocked Citrix abusive IP ${ip} on ${fwExec.targetLabel}${addToGuardianBlacklist ? " + added to Guardian Do-Not-Unshun Blacklist" : ""}. Reason: ${reason}`,
            userId,
            clientIp
        );
    }

    return {
        success: firewallResults.every((r) => r.success),
        blockedIps,
        skippedIps,
        firewallResults,
        blacklistedCount,
    };
}
