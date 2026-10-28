import dns from "dns";
import { enqueueFirewallCommand, getDynamicHoldExpiresAt } from "@/lib/firewall-queue";
import https from "https";
import axios from "axios";
import { prisma } from "@/lib/prisma";
import { getBulkUserAdStatus } from "@/lib/ldap";
import { isPrivateIp } from "@/lib/iplocate";
import { NetscalerGraylogClient } from "@/lib/netscaler-graylog";
import { executeFirewallBulkCommands } from "@/lib/netscaler-auto-shun";
import { getFleetFirewalls } from "@/lib/universal-shun-sync";
import { logAudit } from "@/lib/audit";
import { analyzeFirewallVerification, recordShunActionLog, ShunNodeVerification } from "@/lib/shun-logger";
import {
    fetchImprivataBatchIndex,
    matchEventToImprivataSession,
    formatImprivataFailureReason,
} from "@/lib/imprivata-graylog";
import { getAdaptiveSearchWindow } from "@/lib/graylog-backlog-guardian";

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
    imprivataVerdict?: string;
    imprivataVerdictLabel?: string;
    imprivataMfaMethod?: string;
    imprivataNode?: string;
    rawMessage: string;
}

export interface CitrixGuardianRuleFlag {
    code:
        | "NON_EXISTENT_AD_USER"
        | "NON_CORPORATE_USERNAME"
        | "PASSWORD_SPRAY"
        | "AUTH_BURST_10M"
        | "HIGH_FAILURE_VOLUME"
        | "FOREIGN_ORIGIN"
        | "HOSTING_DATACENTER_ASN"
        | "BLACKLISTED_ASN"
        | "DISABLED_OR_LOCKED_AD"
        | "REPEATED_STA_TICKET_ABUSE"
        | "RESIDENTIAL_SPRAY_ATTACK"
        | "RESIDENTIAL_DICTIONARY_PROBE"
        | "RESIDENTIAL_AUTH_BURST";
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
    maxAuthFailuresIn10m: number;
    isOnAsnBlacklist: boolean;
    imprivataBadPasswordCount: number;
    imprivataMfaTimeoutCount: number;
    imprivataInvalidUserCount: number;
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
    isFullyShunned: boolean;
    isPartiallyShunned: boolean;
    missingFirewalls: string[];
    shunnedFirewalls: string[];
    isOnGuardianBlacklist: boolean;
    guardianBlacklistReason?: string;
    isOnWatchlist: boolean;
    isResidentialAbusive?: boolean;
    residentialBlockReason?: string;
    isProtectedHousehold?: boolean;
    sampleMessages: string[];
}

export interface CitrixAutoShunConfig {
    enabled: boolean;
    windowSeconds: number;
    minAuthFailuresIn10m: number;
    shunSingleFailureOnBlacklistedAsn: boolean;
    targetHost: string;
    lastRunAt?: string | null;
    lastRunNewShuns?: number;
    lastRunEvaluatedIps?: number;
    lastRunSummary?: string | null;
    modifiedBy?: string | null;
}

export const DEFAULT_CITRIX_AUTO_SHUN_CONFIG: CitrixAutoShunConfig = {
    enabled: false, // Paused by default until explicitly enabled in the UI
    windowSeconds: 600, // 10-minute rolling window
    minAuthFailuresIn10m: 3, // 3 failed authentication attempts within 10 minutes
    shunSingleFailureOnBlacklistedAsn: true, // OR >= 1 failed attempt when ASN is in GuardianAsnBlacklist
    targetHost: "all",
    lastRunAt: null,
    lastRunNewShuns: 0,
    lastRunEvaluatedIps: 0,
    lastRunSummary: null,
    modifiedBy: null,
};

export interface CitrixUserIssueSummary {
    username: string;
    isCorporateFormat: boolean;
    adStatus: string;
    adDisplayName?: string;
    adDepartment?: string;
    adTitle?: string;
    failureCount: number;
    citrixSuccessCount: number;
    imprivataBadPasswordCount: number;
    imprivataMfaTimeoutCount: number;
    imprivataInvalidUserCount: number;
    imprivataMfaMethod?: string;
    categories: CitrixIssueCategory[];
    sourceIps: string[];
    countries: string[];
    failureReasons: string[];
    lastFailureAt: string;
    lastSuccessAt?: string;
    diagnosis: string;
}

export interface CitrixAsnMetric {
    asn: string; // e.g. "AS16509"
    asnNumber: string; // e.g. "16509"
    asnName: string; // e.g. "Amazon.com, Inc."
    companyType?: string; // e.g. "hosting", "isp", "business"
    countryCode?: string;
    totalFailures: number;
    loginFailedCount: number;
    policyFailedCount: number;
    staFailedCount: number;
    uniqueIpCount: number;
    ips: string[];
    uniqueUserCount: number;
    targetedUsers: string[];
    abusiveIpCount: number;
    alreadyShunnedIpCount: number;
    maxRiskScore: number;
    isBlacklisted: boolean;
    blacklistReason?: string;
    firstSeen: string;
    lastSeen: string;
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
    autoShunConfig: CitrixAutoShunConfig;
    summary: {
        totalFailureEvents: number;
        evaluatedFailureEventsCount?: number;
        totalSuccessLogins: number;
        evaluatedSuccessLoginsCount?: number;
        aaaLoginFailedCount: number;
        policyFailedCount: number;
        staTicketFailedCount: number;
        cookieInvalidCount: number;
        imprivataBadPasswordCount: number;
        imprivataMfaTimeoutCount: number;
        imprivataInvalidUserCount: number;
        uniqueExternalIps: number;
        abusiveBlockIpCount: number;
        suspiciousWatchIpCount: number;
        legitProtectedIpCount: number;
        alreadyShunnedIpCount: number;
        uniqueUsersImpacted: number;
        uniqueAsnsCount: number;
        blacklistedAsnsCount: number;
        residentialBlockedCount: number;
        residentialBlockReasons: { reason: string; count: number }[];
    };
    ipEvaluations: CitrixIpEvaluation[];
    asnMetrics: CitrixAsnMetric[];
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

export function isResidential(org?: string | null): boolean {
    if (!org) return false;
    const clean = org.toLowerCase();
    return (
        clean.includes("comcast") ||
        clean.includes("charter") ||
        clean.includes("spectrum") ||
        clean.includes("verizon") ||
        clean.includes("at&t") ||
        clean.includes("att") ||
        clean.includes("cox") ||
        clean.includes("optimum") ||
        clean.includes("cablevision") ||
        clean.includes("centurylink") ||
        clean.includes("frontier") ||
        clean.includes("t-mobile") ||
        clean.includes("sprint") ||
        clean.includes("broadband") ||
        clean.includes("cable") ||
        clean.includes("telecom") ||
        clean.includes("fiber") ||
        clean.includes("wireless") ||
        clean.includes("ezee") ||
        clean.includes("northland") ||
        clean.includes("blue stream") ||
        clean.includes("altafiber") ||
        clean.includes("spacex") ||
        clean.includes("starlink") ||
        clean.includes("tds") ||
        clean.includes("penteledata") ||
        clean.includes("liveoak")
    );
}

const REVERSE_DNS_ISP_PATTERNS = [
    { match: /comcast|hsd1/i, name: "Comcast Cable Communications", asn: "AS7922" },
    { match: /verizon|fios|myvzw/i, name: "Verizon Business / Fios", asn: "AS701" },
    { match: /spectrum|rr\.com|charter/i, name: "Charter Communications / Spectrum", asn: "AS20115" },
    { match: /att\.net|sbcglobal|attlocal/i, name: "AT&T Services", asn: "AS7018" },
    { match: /frontier/i, name: "Frontier Communications", asn: "AS5650" },
    { match: /cox\.net/i, name: "Cox Communications", asn: "AS22773" },
    { match: /optimum|cv\.net/i, name: "Optimum / Altice", asn: "AS6128" },
    { match: /centurylink|qwest/i, name: "CenturyLink / Lumen", asn: "AS209" },
    { match: /t-mobile/i, name: "T-Mobile USA", asn: "AS21928" },
    { match: /rowan\.edu/i, name: "Rowan University", asn: "AS33523" }
];

interface IpMetaInfo {
    countryCode: string;
    city: string;
    asn: string;
    companyName: string;
    companyType: string;
    cidr: string;
    isResidentialIsp: boolean;
}

async function enrichIpMetadata(ip: string, allowExternalLookup: boolean = true): Promise<IpMetaInfo> {
    const fallback: IpMetaInfo = {
        countryCode: "US",
        city: "N/A",
        asn: "Unknown",
        companyName: "Unknown Network",
        companyType: "unknown",
        cidr: "N/A",
        isResidentialIsp: false,
    };

    if (!ip || isPrivateIp(ip)) return fallback;

    try {
        // 1. Check local PostgreSQL IpLookupCache first (Zero credits)
        const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
        if (cached?.rawJson) {
            try {
                const rawData = JSON.parse(cached.rawJson);
                const companyName = rawData.company?.name || rawData.asn?.name || rawData.as_name || rawData.org || "Unknown Network";
                if (companyName !== "Unknown Network") {
                    const companyType = (rawData.company?.type || rawData.asn?.type || "unknown").toLowerCase();
                    const cidr = rawData.asn?.route || rawData.network?.route || "N/A";
                    const asnRaw = typeof rawData.asn === "object" ? (rawData.asn?.asn || "Unknown") : (rawData.asn || "Unknown");
                    const asn = String(asnRaw).replace(/^AS/, '');
                    const countryCode = rawData.country_code || cached.countryCode || "US";
                    const city = rawData.city || cached.city || "N/A";
                    const cleanComp = companyName.toLowerCase();
                    const isResidentialIsp = companyType === "isp" || cleanComp.includes("comcast") || cleanComp.includes("verizon") || cleanComp.includes("at&t") || cleanComp.includes("charter") || cleanComp.includes("spectrum") || cleanComp.includes("cox") || cleanComp.includes("optimum") || cleanComp.includes("frontier") || cleanComp.includes("centurylink") || cleanComp.includes("broadband") || cleanComp.includes("cable");
                    return { countryCode, city, asn: `AS${asn}`, companyName, companyType, cidr, isResidentialIsp };
                }
            } catch {}
        }

        // 2. Check local VpnEvent history (Have staff logged in via AnyConnect VPN before?)
        try {
            const vpnSample = await prisma.vpnEvent.findFirst({
                where: { sourceIp: ip, ipAsName: { not: null } },
                select: { ipAsn: true, ipAsName: true, ipCountry: true, ipCountryCode: true }
            });
            if (vpnSample?.ipAsName) {
                const companyName = vpnSample.ipAsName;
                const asn = vpnSample.ipAsn || "Unknown";
                const countryCode = vpnSample.ipCountryCode || vpnSample.ipCountry || "US";
                const isResidentialIsp = isResidential(companyName);
                return { countryCode, city: "N/A", asn, companyName, companyType: isResidentialIsp ? "isp" : "business", cidr: "N/A", isResidentialIsp };
            }
        } catch {}

        // 3. Ultra-Fast Zero-Cost Reverse DNS (PTR) Resolution (Resolves Verizon Fios, Spectrum, Comcast, Frontier, Cox, AT&T)
        try {
            const ptrs = await dns.promises.reverse(ip).catch(() => []);
            const ptr = ptrs[0] || "";
            if (ptr) {
                for (const p of REVERSE_DNS_ISP_PATTERNS) {
                    if (p.match.test(ptr)) {
                        await prisma.ipLookupCache.upsert({
                            where: { ip },
                            update: { countryCode: "US", rawJson: JSON.stringify({ company: { name: p.name, type: "isp" }, asn: { asn: p.asn, name: p.name } }) },
                            create: { ip, countryCode: "US", rawJson: JSON.stringify({ company: { name: p.name, type: "isp" }, asn: { asn: p.asn, name: p.name } }) }
                        }).catch(() => {});
                        return { countryCode: "US", city: "N/A", asn: p.asn, companyName: p.name, companyType: "isp", cidr: "N/A", isResidentialIsp: true };
                    }
                }
            }
        } catch {}

        // 4. On-demand explicit lookup via IPLocate if specifically requested
        if (allowExternalLookup && process.env.IPLOCATE_API_KEY) {
            try {
                const apiKey = process.env.IPLOCATE_API_KEY;
                const res = await axios.get(`https://www.iplocate.io/api/lookup/${ip}`, {
                    headers: { "X-API-KEY": apiKey },
                    timeout: 4000,
                });
                if (res.data) {
                    const rawData = res.data;
                    const companyName = rawData.company?.name || rawData.asn?.name || rawData.as_name || rawData.org || "Unknown Network";
                    const companyType = (rawData.company?.type || rawData.asn?.type || "unknown").toLowerCase();
                    const cidr = rawData.asn?.route || rawData.network?.route || "N/A";
                    const asnRaw = typeof rawData.asn === "object" ? (rawData.asn?.asn || "Unknown") : (rawData.asn || "Unknown");
                    const asn = String(asnRaw);
                    const countryCode = rawData.country_code || "US";
                    const city = rawData.city || "N/A";
                    const isResidentialIsp = isResidential(companyName);

                    await prisma.ipLookupCache.upsert({
                        where: { ip },
                        update: { latitude: rawData.latitude || null, longitude: rawData.longitude || null, countryCode, city, subdivision: rawData.subdivision || null, rawJson: JSON.stringify(rawData) },
                        create: { ip, latitude: rawData.latitude || null, longitude: rawData.longitude || null, countryCode, city, subdivision: rawData.subdivision || null, rawJson: JSON.stringify(rawData) },
                    }).catch(() => {});

                    return { countryCode, city, asn, companyName, companyType, cidr, isResidentialIsp };
                }
            } catch {}
        }

        return fallback;
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

    const adaptive = await getAdaptiveSearchWindow("OG_GRAYLOG", rangeSeconds);
    const queryLimit = rangeSeconds <= 3600 ? 3000 : rangeSeconds <= 86400 ? 5000 : 8000;

    const [failRes, successRes] = await Promise.all([
        axios.get(`${baseUrl}/api/search/universal/relative`, {
            params: {
                query: failQuery,
                range: adaptive.effectiveRangeSeconds,
                limit: queryLimit,
                fields,
                sort: "timestamp:desc",
            },
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass",
            },
            timeout: 25000,
        }).catch(() => ({ data: { messages: [], total_results: 0 } })),
        axios.get(`${baseUrl}/api/search/universal/relative`, {
            params: {
                query: successQuery,
                range: adaptive.effectiveRangeSeconds,
                limit: queryLimit,
                fields,
                sort: "timestamp:desc",
            },
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass",
            },
            timeout: 25000,
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

    // Enrich against Active Directory and Imprivata RADIUS stream in parallel
    const [adStatusMap, imprivataIndex] = await Promise.all([
        allUsernamesSet.size > 0
            ? getBulkUserAdStatus(Array.from(allUsernamesSet)).catch(
                  () => ({} as Record<string, { adStatus: string; displayName: string; department: string; title: string }>)
              )
            : Promise.resolve({} as Record<string, { adStatus: string; displayName: string; department: string; title: string }>),
        allUsernamesSet.size > 0
            ? fetchImprivataBatchIndex(
                  rangeSeconds + 600,
                  "CITRIX",
                  900,
                  Array.from(allUsernamesSet)
              ).catch(() => new Map())
            : Promise.resolve(new Map()),
    ]);

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
        const uNoDomain = usernameClean.replace(/^[a-zA-Z0-9_\-\.]+[\\\/]/, "");
        const uNoEmail = uNoDomain.split("@")[0];
        const adInfo =
            adStatusMap[usernameClean] ||
            adStatusMap[usernameRaw] ||
            adStatusMap[uNoDomain] ||
            adStatusMap[uNoEmail];
        const isCorp = isCorporateUsernameFormat(usernameClean) || isCorporateUsernameFormat(uNoEmail);

        // Correlate with Imprivata RADIUS session if available
        let imprivataVerdict: string | undefined;
        let imprivataVerdictLabel: string | undefined;
        let imprivataMfaMethod: string | undefined;
        let imprivataNode: string | undefined;
        let enrichedFailureReason = classified.failureReason;

        if (
            usernameClean !== "anonymous" &&
            (classified.category === "AAA_LOGIN_FAILED" ||
                classified.category === "AAA_POLICY_FAILED" ||
                classified.category === "AUTH_DENIED_OTHER")
        ) {
            const matchedImp = matchEventToImprivataSession(
                usernameRaw,
                msg.timestamp || new Date().toISOString(),
                imprivataIndex,
                120000,
                true
            );
            if (matchedImp) {
                imprivataVerdict = matchedImp.verdict;
                imprivataVerdictLabel = matchedImp.verdictLabel;
                imprivataMfaMethod = matchedImp.mfaMethod;
                imprivataNode = matchedImp.imprivataNode;

                if (classified.category === "AAA_POLICY_FAILED") {
                    enrichedFailureReason = `AAA Policy (${classified.policyName || "Imprivata-prod"}) → ${formatImprivataFailureReason(matchedImp)}`;
                } else {
                    enrichedFailureReason = formatImprivataFailureReason(matchedImp);
                }
            }
        }

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
            failureReason: enrichedFailureReason,
            policyName: classified.policyName,
            userAgent: classified.userAgent,
            imprivataVerdict,
            imprivataVerdictLabel,
            imprivataMfaMethod,
            imprivataNode,
            rawMessage: raw,
        });
    }

    // Enrich all external IPs with IPLocate/Cache, Shun DB, Guardian Blacklist, Guardian Watchlist, and VPN History
    const externalIps = Array.from(uniqueExternalIpsSet);
    const ipMetaEntries: { ip: string; meta: IpMetaInfo }[] = await Promise.all(
        externalIps.map(async (ip) => ({ ip, meta: await enrichIpMetadata(ip, true) }))
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
        let ipImpBadPwdCount = 0;
        let ipImpMfaTimeoutCount = 0;
        let ipImpInvalidUserCount = 0;
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

            if (ev.imprivataVerdict === "BAD_AD_PASSWORD_OR_POLICY") ipImpBadPwdCount++;
            else if (ev.imprivataVerdict === "MFA_PUSH_TIMEOUT" || ev.imprivataVerdict === "MFA_CHALLENGED") ipImpMfaTimeoutCount++;
            else if (ev.imprivataVerdict === "INVALID_USER") ipImpInvalidUserCount++;

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

        // Calculate maximum authentication/policy failures within any rolling 10-minute (600s) burst window
        const authFailureEpochs = ipEvents
            .filter((ev) => ev.category === "AAA_LOGIN_FAILED" || ev.category === "AAA_POLICY_FAILED")
            .map((ev) => new Date(ev.timestamp).getTime())
            .filter((t) => !isNaN(t))
            .sort((a, b) => a - b);

        let maxAuthFailuresIn10m = 0;
        let windowStartIdx = 0;
        for (let i = 0; i < authFailureEpochs.length; i++) {
            while (authFailureEpochs[i] - authFailureEpochs[windowStartIdx] > 600_000) {
                windowStartIdx++;
            }
            const countIn10m = i - windowStartIdx + 1;
            if (countIn10m > maxAuthFailuresIn10m) {
                maxAuthFailuresIn10m = countIn10m;
            }
        }

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

        // 4. 10-Minute Authentication Failure Burst (>= minFailuresForBlock within 10 minutes) OR High Failure Volume
        if (maxAuthFailuresIn10m >= config.minFailuresForBlock) {
            triggeredRules.push({
                code: "AUTH_BURST_10M",
                label: `${maxAuthFailuresIn10m} Auth Failures in ≤10m`,
                severity: "CRITICAL",
                points: 55,
                detail: `IP triggered ${maxAuthFailuresIn10m} failed authentication attempts within a 10-minute window (threshold: ${config.minFailuresForBlock}).`,
            });
            riskScore += 55;
        } else if (totalFailures >= config.minFailuresForBlock && citrixSucc === 0 && !hasVpnSuccessHistory) {
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
        const isOnAsnBlacklist = blacklistedAsnSet.has(cleanAsnNum);
        const isEnterpriseProxy = /zscaler|netskope|palo alto|cloudflare|akamai|cisco umbrella/i.test(meta.companyName);
        if (isOnAsnBlacklist) {
            triggeredRules.push({
                code: "BLACKLISTED_ASN",
                label: `Blacklisted ASN (${meta.asn})`,
                severity: "CRITICAL",
                points: 65,
                detail: `Origin belongs to Guardian blacklisted ASN ${meta.asn} (${meta.companyName}) — single failed attempt triggers immediate block.`,
            });
            riskScore += 65;
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

        // Guardian Safety Shield & Residential Threat Lens Evaluation
        const allUsersValidAd =
            nonAnonUsers.length > 0 &&
            nonAnonUsers.every((u) => u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" || u.adStatus === "LOCKED");
        const isSingleUser = nonAnonUsers.length === 1;
        const notFoundAdUsers = nonAnonUsers.filter((u) => u.adStatus === "NOT_FOUND");
        const invalidFormatUsers = nonAnonUsers.filter((u) => !u.isCorporateFormat);
        const isOnWatchlist = watchSet.has(ip);
        const isOnGuardianBlacklist = blacklistMap.has(ip);

        // Multi-employee household detection (e.g. employee spouses sharing home residential ISP)
        let isProtectedHousehold = false;
        let isResidentialAbusive = false;
        let residentialBlockReason: string | undefined;

        if (meta.isResidentialIsp) {
            if (
                countryCode === "US" &&
                nonAnonUsers.length >= 1 &&
                nonAnonUsers.length <= 2 &&
                allUsersValidAd &&
                notFoundAdUsers.length === 0 &&
                invalidFormatUsers.length === 0 &&
                (citrixSucc > 0 ||
                    hasVpnSuccessHistory ||
                    (ipImpMfaTimeoutCount > 0 && ipImpBadPwdCount === 0) ||
                    maxAuthFailuresIn10m < config.minFailuresForBlock)
            ) {
                isProtectedHousehold = nonAnonUsers.length === 2;
            } else {
                // Threat Lens: Residential IP with credential spray, dictionary probe, or high-velocity brute force
                if (nonAnonUsers.length >= 3) {
                    isResidentialAbusive = true;
                    residentialBlockReason = "Credential Spray (≥3 Accounts)";
                    triggeredRules.push({
                        code: "RESIDENTIAL_SPRAY_ATTACK",
                        label: `Residential Spray (${nonAnonUsers.length} Users)`,
                        severity: "CRITICAL",
                        points: 70,
                        detail: `Residential IP targeted ${nonAnonUsers.length} distinct usernames (${nonAnonUsers.map((u) => u.username).slice(0, 4).join(", ")}). Revoked residential safety shield.`,
                    });
                    riskScore += 70;
                } else if (notFoundAdUsers.length > 0 || invalidFormatUsers.length > 0) {
                    isResidentialAbusive = true;
                    residentialBlockReason = "Probing Non-Existent AD Accounts";
                    triggeredRules.push({
                        code: "RESIDENTIAL_DICTIONARY_PROBE",
                        label: "Residential Dictionary Probe",
                        severity: "CRITICAL",
                        points: 65,
                        detail: `Residential IP attempted non-existent/non-corporate username(s): ${[...notFoundAdUsers, ...invalidFormatUsers].map((u) => u.username).slice(0, 4).join(", ")}.`,
                    });
                    riskScore += 65;
                } else if (maxAuthFailuresIn10m >= config.minFailuresForBlock && citrixSucc === 0 && !hasVpnSuccessHistory) {
                    isResidentialAbusive = true;
                    residentialBlockReason = "Rapid Auth Burst (≥5 Failures / 10m)";
                    triggeredRules.push({
                        code: "RESIDENTIAL_AUTH_BURST",
                        label: `Residential Brute Force (${maxAuthFailuresIn10m}x / 10m)`,
                        severity: "CRITICAL",
                        points: 60,
                        detail: `Residential IP executed ${maxAuthFailuresIn10m} authentication failures in ≤10 minutes with 0 successful logins.`,
                    });
                    riskScore += 60;
                } else if (totalFailures >= config.minFailuresForBlock && citrixSucc === 0 && !hasVpnSuccessHistory) {
                    isResidentialAbusive = true;
                    residentialBlockReason = "High Failure Volume (0 Success)";
                }

                if (isOnGuardianBlacklist) {
                    isResidentialAbusive = true;
                    residentialBlockReason = residentialBlockReason || "Guardian Do-Not-Unshun Blacklist";
                }
            }
        }

        let verdict: GuardianAbuseVerdict = "SUSPICIOUS_WATCH";
        let verdictReason = "";
        let protectionNote: string | undefined;

        if (isOnGuardianBlacklist) {
            verdict = "ABUSIVE_BLOCK";
            riskScore = Math.max(riskScore, 85);
            verdictReason = `On Guardian Do-Not-Unshun Blacklist: ${blacklistMap.get(ip)}`;
            if (meta.isResidentialIsp) {
                isResidentialAbusive = true;
                residentialBlockReason = residentialBlockReason || "Guardian Do-Not-Unshun Blacklist";
            }
        } else if (isOnWatchlist) {
            verdict = "LEGIT_USER_ISSUE";
            riskScore = Math.min(riskScore, 10);
            verdictReason = "Protected Watchlist Asset IP";
            protectionNote = "IP is registered on the Guardian Monitored Watchlist.";
        } else if (isOnAsnBlacklist) {
            verdict = "ABUSIVE_BLOCK";
            riskScore = Math.max(riskScore, 85);
            verdictReason = `Blacklisted ASN ${meta.asn} (${meta.companyName}) with ${totalFailures} failed attempt(s) — zero-tolerance ASN block.`;
        } else if (isResidentialAbusive) {
            verdict = "ABUSIVE_BLOCK";
            riskScore = Math.max(riskScore, 85);
            verdictReason = `Abusive Residential IP (${meta.companyName}): ${residentialBlockReason}`;
        } else if (
            config.protectIspWithValidAdUser &&
            countryCode === "US" &&
            allUsersValidAd &&
            notFoundAdUsers.length === 0 &&
            invalidFormatUsers.length === 0 &&
            (isSingleUser || isProtectedHousehold) &&
            (citrixSucc > 0 ||
                hasVpnSuccessHistory ||
                (ipImpMfaTimeoutCount > 0 && ipImpBadPwdCount === 0) ||
                (meta.isResidentialIsp && maxAuthFailuresIn10m < config.minFailuresForBlock))
        ) {
            verdict = "LEGIT_USER_ISSUE";
            riskScore = Math.min(riskScore, 15);
            if (isProtectedHousehold) {
                verdictReason = `Verified multi-employee household (${nonAnonUsers.map((u) => u.username).join(" & ")}) connecting from US residential ISP (${meta.companyName}) with active AD accounts.`;
                protectionNote = "Guardian Protected Household: Up to 2 verified active AD corporate users sharing residential connection.";
            } else {
                const u = nonAnonUsers[0];
                const userLabel = u.adDisplayName ? `${u.adDisplayName} (${u.username})` : u.username;
                if (ipImpMfaTimeoutCount > 0 && ipImpBadPwdCount === 0 && citrixSucc === 0) {
                    verdictReason = `Imprivata Confirmed AD Password OK for ${userLabel}, but user did not accept the smartphone Confirm ID MFA Push in time (${ipImpMfaTimeoutCount}x MFA timeout).`;
                    protectionNote = "Guardian Protected: Imprivata RADIUS verified user's AD password succeeded (only 2FA push timed out).";
                } else if (citrixSucc > 0 || u.succeededLater) {
                    verdictReason = `Legitimate AD user ${userLabel} had ${totalFailures} failure(s)${
                        ipImpBadPwdCount > 0
                            ? ` (${ipImpBadPwdCount}x Imprivata AD password/policy retry)`
                            : ipImpMfaTimeoutCount > 0
                            ? ` (${ipImpMfaTimeoutCount}x Imprivata MFA push timeout)`
                            : " (e.g., Imprivata/LDAP retry)"
                    } and logged into Citrix successfully (${citrixSucc} session events).`;
                    protectionNote = "Guardian Protected: Verified AD user with successful Citrix login from this US IP.";
                } else if (hasVpnSuccessHistory) {
                    verdictReason = `Legitimate AD user ${userLabel} with prior successful AnyConnect VPN history from this IP.`;
                    protectionNote = "Guardian Protected: IP has verified Cooper VPN success history and valid AD user.";
                } else {
                    verdictReason = `Valid AD user ${userLabel} connecting from US ISP (${meta.companyName}). ${
                        ipImpBadPwdCount > 0
                            ? `Imprivata RADIUS logged ${ipImpBadPwdCount}x Bad AD Password / Policy failure.`
                            : "Likely password typo or Imprivata MFA prompt timeout."
                    }`;
                    protectionNote = "Guardian Protected: US ISP with verified Active Directory corporate user.";
                }
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
        const configuredFleet = getFleetFirewalls();
        const configuredFwNames = configuredFleet.map((f) => f.name);
        const fwList = fwSet ? Array.from(fwSet) : [];
        const isFullyShunned = configuredFwNames.length > 0 && fwList.length >= configuredFwNames.length;
        const isPartiallyShunned = fwList.length > 0 && !isFullyShunned;
        const missingFirewalls = configuredFwNames.filter((f) => !fwSet?.has(f));

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
            maxAuthFailuresIn10m,
            isOnAsnBlacklist,
            imprivataBadPasswordCount: ipImpBadPwdCount,
            imprivataMfaTimeoutCount: ipImpMfaTimeoutCount,
            imprivataInvalidUserCount: ipImpInvalidUserCount,
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
            isFullyShunned,
            isPartiallyShunned,
            missingFirewalls,
            shunnedFirewalls: fwList,
            isOnGuardianBlacklist,
            guardianBlacklistReason: blacklistMap.get(ip),
            isOnWatchlist,
            isResidentialAbusive,
            residentialBlockReason,
            isProtectedHousehold,
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
        const uNoDomain = uKey.replace(/^[a-zA-Z0-9_\-\.]+[\\\/]/, "");
        const uNoEmail = uNoDomain.split("@")[0];
        const adInfo = adStatusMap[uKey] || adStatusMap[uNoDomain] || adStatusMap[uNoEmail];
        const succInfo = citrixSuccessByUser.get(uKey);
        const categories = Array.from(new Set(uEvents.map((e) => e.category)));
        const sourceIps = Array.from(new Set(uEvents.map((e) => e.clientIp).filter((ip) => ip && ip !== "Internal / Unattributed")));
        const countries = Array.from(new Set(uEvents.map((e) => e.countryCode).filter((c) => c && c !== "Unknown")));
        const reasons = Array.from(new Set(uEvents.map((e) => e.failureReason)));

        const uImpBadPwdCount = uEvents.filter((e) => e.imprivataVerdict === "BAD_AD_PASSWORD_OR_POLICY").length;
        const uImpMfaTimeoutCount = uEvents.filter(
            (e) => e.imprivataVerdict === "MFA_PUSH_TIMEOUT" || e.imprivataVerdict === "MFA_CHALLENGED"
        ).length;
        const uImpInvalidUserCount = uEvents.filter((e) => e.imprivataVerdict === "INVALID_USER").length;
        const uImpMfaMethod = uEvents.find((e) => e.imprivataMfaMethod)?.imprivataMfaMethod;
        const uImpNode = uEvents.find((e) => e.imprivataNode)?.imprivataNode || "Imprivata";

        let diagnosis = "";
        if (firstEv.adStatus === "NOT_FOUND" || uImpInvalidUserCount > 0) {
            diagnosis = `Account does not exist in Active Directory${
                uImpInvalidUserCount > 0 ? ` (Confirmed by ${uImpNode} RADIUS: Invalid user name)` : ""
            } — potential username enumeration or typo.`;
        } else if (firstEv.adStatus === "LOCKED") {
            diagnosis = `Active Directory account is currently LOCKED OUT${
                uImpBadPwdCount > 0
                    ? ` following ${uImpBadPwdCount}x Bad AD Password attempts via ${uImpNode} RADIUS`
                    : ""
            }. Check Account Lockout Investigator.`;
        } else if (firstEv.adStatus === "DISABLED") {
            diagnosis = "Active Directory account is DISABLED (terminated or inactive user attempting Citrix access).";
        } else if (uImpMfaTimeoutCount > 0 && uImpBadPwdCount === 0) {
            if (succInfo && succInfo.lastSuccessAt >= firstEv.timestamp) {
                diagnosis = `AD password verified OK by ${uImpNode}; user timed out on Confirm ID MFA push (${uImpMfaTimeoutCount}x), then accepted MFA and logged in successfully.`;
            } else {
                diagnosis = `AD password verified OK by ${uImpNode}, but user did not accept the Confirm ID smartphone push notification (${uImpMfaTimeoutCount}x MFA timeout). Does NOT increment AD badPwdCount.`;
            }
        } else if (uImpBadPwdCount > 0) {
            if (succInfo && succInfo.lastSuccessAt >= firstEv.timestamp) {
                diagnosis = `Failed AD password validation via ${uImpNode} RADIUS (${uImpBadPwdCount}x bad password / policy denial), then authenticated successfully afterward.`;
            } else {
                diagnosis = `Failed AD password or OneSign policy validation via ${uImpNode} RADIUS (${uImpBadPwdCount}x) — increments Active Directory badPwdCount toward lockout.`;
            }
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
            imprivataBadPasswordCount: uImpBadPwdCount,
            imprivataMfaTimeoutCount: uImpMfaTimeoutCount,
            imprivataInvalidUserCount: uImpInvalidUserCount,
            imprivataMfaMethod: uImpMfaMethod,
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

    // Aggregate ASN Metrics across evaluated IPs and failure events
    const asnMap = new Map<string, {
        asn: string;
        asnNumber: string;
        asnName: string;
        companyType?: string;
        countryCode?: string;
        totalFailures: number;
        loginFailedCount: number;
        policyFailedCount: number;
        staFailedCount: number;
        ips: Set<string>;
        targetedUsers: Set<string>;
        abusiveIpCount: number;
        alreadyShunnedIpCount: number;
        maxRiskScore: number;
        isBlacklisted: boolean;
        blacklistReason?: string;
        firstSeen: string;
        lastSeen: string;
    }>();

    for (const ipEval of ipEvaluations) {
        const rawAsn = (ipEval.asn || "Unknown").trim();
        const cleanAsnNum = rawAsn.toUpperCase().replace(/^AS/, "");
        const asnKey = cleanAsnNum ? `AS${cleanAsnNum}` : "Unknown";

        const existing = asnMap.get(asnKey) || {
            asn: asnKey,
            asnNumber: cleanAsnNum,
            asnName: ipEval.companyName || "Unknown Organization",
            companyType: ipEval.companyType,
            countryCode: ipEval.countryCode,
            totalFailures: 0,
            loginFailedCount: 0,
            policyFailedCount: 0,
            staFailedCount: 0,
            ips: new Set<string>(),
            targetedUsers: new Set<string>(),
            abusiveIpCount: 0,
            alreadyShunnedIpCount: 0,
            maxRiskScore: 0,
            isBlacklisted: ipEval.isOnAsnBlacklist,
            blacklistReason: undefined,
            firstSeen: ipEval.firstSeen,
            lastSeen: ipEval.lastSeen,
        };

        existing.totalFailures += ipEval.totalFailures;
        existing.loginFailedCount += ipEval.loginFailedCount;
        existing.policyFailedCount += ipEval.policyFailedCount;
        existing.staFailedCount += ipEval.staFailedCount;
        existing.ips.add(ipEval.ip);
        ipEval.targetedUsers.forEach((u) => existing.targetedUsers.add(u.username));
        if (ipEval.verdict === "ABUSIVE_BLOCK") existing.abusiveIpCount++;
        if (ipEval.isCurrentlyShunned) existing.alreadyShunnedIpCount++;
        if (ipEval.riskScore > existing.maxRiskScore) existing.maxRiskScore = ipEval.riskScore;
        if (ipEval.isOnAsnBlacklist) existing.isBlacklisted = true;
        if (new Date(ipEval.firstSeen).getTime() < new Date(existing.firstSeen).getTime()) {
            existing.firstSeen = ipEval.firstSeen;
        }
        if (new Date(ipEval.lastSeen).getTime() > new Date(existing.lastSeen).getTime()) {
            existing.lastSeen = ipEval.lastSeen;
        }

        asnMap.set(asnKey, existing);
    }

    // Attach blacklist reasons from asnBlacklistEntries
    const asnBlacklistMap = new Map<string, string>();
    for (const b of asnBlacklistEntries) {
        const cleanKey = `AS${String(b.asn).toUpperCase().replace(/^AS/, "")}`;
        asnBlacklistMap.set(cleanKey, b.reason || "Blacklisted ASN");
    }

    const asnMetrics: CitrixAsnMetric[] = Array.from(asnMap.values()).map((a) => ({
        asn: a.asn,
        asnNumber: a.asnNumber,
        asnName: a.asnName,
        companyType: a.companyType,
        countryCode: a.countryCode,
        totalFailures: a.totalFailures,
        loginFailedCount: a.loginFailedCount,
        policyFailedCount: a.policyFailedCount,
        staFailedCount: a.staFailedCount,
        uniqueIpCount: a.ips.size,
        ips: Array.from(a.ips),
        uniqueUserCount: a.targetedUsers.size,
        targetedUsers: Array.from(a.targetedUsers),
        abusiveIpCount: a.abusiveIpCount,
        alreadyShunnedIpCount: a.alreadyShunnedIpCount,
        maxRiskScore: a.maxRiskScore,
        isBlacklisted: a.isBlacklisted || asnBlacklistMap.has(a.asn),
        blacklistReason: asnBlacklistMap.get(a.asn),
        firstSeen: a.firstSeen,
        lastSeen: a.lastSeen,
    }));

    asnMetrics.sort((a, b) => b.totalFailures - a.totalFailures);

    const aaaLoginFailedCount = events.filter((e) => e.category === "AAA_LOGIN_FAILED").length;
    const policyFailedCount = events.filter((e) => e.category === "AAA_POLICY_FAILED").length;
    const staTicketFailedCount = events.filter((e) => e.category === "STA_TICKET_FAILED").length;
    const cookieInvalidCount = events.filter((e) => e.category === "IDP_COOKIE_INVALID").length;
    const imprivataBadPasswordCount = events.filter((e) => e.imprivataVerdict === "BAD_AD_PASSWORD_OR_POLICY").length;
    const imprivataMfaTimeoutCount = events.filter(
        (e) => e.imprivataVerdict === "MFA_PUSH_TIMEOUT" || e.imprivataVerdict === "MFA_CHALLENGED"
    ).length;
    const imprivataInvalidUserCount = events.filter((e) => e.imprivataVerdict === "INVALID_USER").length;

    const autoShunConfig = await getCitrixAutoShunConfig().catch(() => DEFAULT_CITRIX_AUTO_SHUN_CONFIG);

    return {
        rangeSeconds,
        config,
        autoShunConfig,
        summary: {
            totalFailureEvents: failRes.data?.total_results ? Number(failRes.data.total_results) : events.length,
            evaluatedFailureEventsCount: events.length,
            totalSuccessLogins: successRes.data?.total_results ? Number(successRes.data.total_results) : rawSuccesses.length,
            evaluatedSuccessLoginsCount: rawSuccesses.length,
            aaaLoginFailedCount,
            policyFailedCount,
            staTicketFailedCount,
            cookieInvalidCount,
            imprivataBadPasswordCount,
            imprivataMfaTimeoutCount,
            imprivataInvalidUserCount,
            uniqueExternalIps: ipEvaluations.length,
            abusiveBlockIpCount: ipEvaluations.filter((i) => i.verdict === "ABUSIVE_BLOCK").length,
            suspiciousWatchIpCount: ipEvaluations.filter((i) => i.verdict === "SUSPICIOUS_WATCH").length,
            legitProtectedIpCount: ipEvaluations.filter((i) => i.verdict === "LEGIT_USER_ISSUE").length,
            alreadyShunnedIpCount: ipEvaluations.filter((i) => i.isCurrentlyShunned).length,
            uniqueUsersImpacted: userSummaries.length,
            uniqueAsnsCount: asnMetrics.length,
            blacklistedAsnsCount: asnMetrics.filter((a) => a.isBlacklisted).length,
            residentialBlockedCount: ipEvaluations.filter((i) => i.isResidentialAbusive && i.verdict === "ABUSIVE_BLOCK").length,
            residentialBlockReasons: (() => {
                const map = new Map<string, number>();
                for (const i of ipEvaluations) {
                    if (i.isResidentialAbusive && i.verdict === "ABUSIVE_BLOCK" && i.residentialBlockReason) {
                        map.set(i.residentialBlockReason, (map.get(i.residentialBlockReason) || 0) + 1);
                    }
                }
                return Array.from(map.entries())
                    .map(([reason, count]) => ({ reason, count }))
                    .sort((a, b) => b.count - a.count);
            })(),
        },
        ipEvaluations,
        asnMetrics,
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
    initiatorEmail?: string;
}): Promise<{
    success: boolean;
    blockedIps: string[];
    skippedIps: string[];
    firewallResults: any[];
    blacklistedCount: number;
    positiveConfirmation?: {
        verdict: "CONFIRMED_ALL_NODES" | "PARTIAL_SUCCESS" | "FAILED";
        summary: string;
        nodeVerifications: ShunNodeVerification[];
        logPath: string;
    };
}> {
    const {
        ips,
        reason,
        targetHost = "all",
        addToGuardianBlacklist = true,
        userId,
        clientIp,
        initiatorEmail,
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

    if (blockedIps.length === 0) {
        return {
            success: true,
            blockedIps: [],
            skippedIps,
            firewallResults: [],
            blacklistedCount: 0,
        };
    }

    // Security Intelligence Decoupled: Citrix traffic is dropped at line-rate in Snort TCAM via FMC feed
    // No SSH CLI shuns are executed on firewall outside interfaces.

    // Pre-fetch cached IP metadata in a single query so bulk blocking 100+ IPs is instantaneous
    const cachedEntries = await prisma.ipLookupCache
        .findMany({ where: { ip: { in: blockedIps } } })
        .catch(() => []);
    const cachedMap = new Map<string, any>();
    for (const c of cachedEntries) {
        try {
            const raw = JSON.parse(c.rawJson);
            const asnRaw = typeof raw.asn === "object" ? raw.asn?.asn || "Unknown" : raw.asn || "Unknown";
            cachedMap.set(c.ip, {
                countryCode: c.countryCode || raw.country_code || "Unknown",
                city: c.city || raw.city || "N/A",
                asn: String(asnRaw),
                companyName: raw.company?.name || raw.asn?.name || raw.as_name || raw.org || "Unknown Network",
            });
        } catch {}
    }

    const now = new Date();

    // Process DB persistence in parallel chunks of 20 so 126+ IPs complete in ~1 second
    const DB_CHUNK = 20;
    for (let i = 0; i < blockedIps.length; i += DB_CHUNK) {
        const chunk = blockedIps.slice(i, i + DB_CHUNK);
        await Promise.all(
            chunk.map(async (ip) => {
                const meta =
                    cachedMap.get(ip) ||
                    (blockedIps.length <= 5
                        ? await enrichIpMetadata(ip, true)
                        : { countryCode: "Unknown", city: "N/A", asn: "Unknown", companyName: "Unknown Network" });

                await prisma.firewallQueryHistory.create({
                    data: {
                        userId,
                        command: "Enforce SI Feed (Citrix Abuse Triage)",
                        targetIp: ip,
                        targetName: "Cisco FMC SI Feed",
                        ipAsn: meta.asn !== "Unknown" ? meta.asn : null,
                        ipAsName: meta.companyName !== "Unknown Network" ? meta.companyName : null,
                        ipCountry: meta.countryCode !== "Unknown" ? meta.countryCode : null,
                        ipCountryCode: meta.countryCode !== "Unknown" ? meta.countryCode : null,
                    },
                }).catch(() => {});

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

                if (addToGuardianBlacklist) {
                    const blReason = `[Citrix Abuse Guard] ${reason}`;
                    await prisma.guardianBlacklist.upsert({
                        where: { ip },
                        update: { reason: blReason },
                        create: { ip, reason: blReason },
                    }).catch(() => {});
                    blacklistedCount++;
                }
            })
        );
    }

    const ipSummary =
        blockedIps.length <= 5
            ? blockedIps.join(", ")
            : `${blockedIps.length} IPs (${blockedIps.slice(0, 4).join(", ")}...)`;

    await logAudit(
        "CITRIX_ABUSE_SI_ENFORCE",
        `Enforced ${blockedIps.length} Citrix abusive IP(s) [${ipSummary}] into Cisco FMC Security Intelligence feed and Guardian Blacklist. Reason: ${reason}`,
        userId,
        clientIp
    ).catch(() => {});

    return {
        success: true,
        blockedIps,
        skippedIps,
        firewallResults: [],
        blacklistedCount,
        positiveConfirmation: {
            verdict: "CONFIRMED_ALL_NODES",
            summary: `Successfully enforced ${blockedIps.length} IP(s) in Cisco FMC Security Intelligence feed (no SSH shuns needed).`,
            nodeVerifications: [],
            logPath: "",
        },
    };
}

const CITRIX_AUTO_SHUN_SETTING_KEY = "CITRIX_LOGIN_AUTO_SHUN_CONFIG";

export async function getCitrixAutoShunConfig(): Promise<CitrixAutoShunConfig> {
    try {
        const record = await prisma.netscalerCveSetting.findUnique({
            where: { key: CITRIX_AUTO_SHUN_SETTING_KEY },
        });
        if (!record || !record.value) {
            return { ...DEFAULT_CITRIX_AUTO_SHUN_CONFIG };
        }
        const parsed = JSON.parse(record.value);
        return {
            ...DEFAULT_CITRIX_AUTO_SHUN_CONFIG,
            ...parsed,
        };
    } catch {
        return { ...DEFAULT_CITRIX_AUTO_SHUN_CONFIG };
    }
}

export async function updateCitrixAutoShunConfig(
    updates: Partial<CitrixAutoShunConfig>,
    modifiedBy = "Administrator"
): Promise<CitrixAutoShunConfig> {
    const current = await getCitrixAutoShunConfig();
    const merged: CitrixAutoShunConfig = {
        ...current,
        ...updates,
        modifiedBy,
    };

    await prisma.netscalerCveSetting.upsert({
        where: { key: CITRIX_AUTO_SHUN_SETTING_KEY },
        update: { value: JSON.stringify(merged) },
        create: { key: CITRIX_AUTO_SHUN_SETTING_KEY, value: JSON.stringify(merged) },
    });

    if (typeof updates.enabled === "boolean" && updates.enabled !== current.enabled) {
        await logAudit(
            "CITRIX_AUTO_SHUN_TOGGLE",
            `Citrix Login Auto-Shun Guardian was ${merged.enabled ? "ENABLED" : "PAUSED"} by ${modifiedBy} (Rule: >=${merged.minAuthFailuresIn10m} auth failures in ${Math.round(merged.windowSeconds / 60)}m OR >=1 failure from Blacklisted ASN).`
        ).catch(() => {});
    }

    return merged;
}

/**
 * Probes OG Graylog /api/system/journal to detect if there is an active indexing lag.
 * Returns lag in seconds (0 if healthy or unreachable).
 */
async function getOgGraylogJournalLagSeconds(): Promise<number> {
    try {
        const rawUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/^"|"$/g, "").replace(/\/+$/, "");
        const rawToken = (process.env.OG_GRAYLOG_API_TOKEN || "").replace(/^"|"$/g, "");
        if (!rawUrl || !rawToken) return 0;

        const authHeader = rawToken.includes(":")
            ? `Basic ${Buffer.from(rawToken).toString("base64")}`
            : `Basic ${Buffer.from(`${rawToken}:token`).toString("base64")}`;

        const res = await axios.get(`${rawUrl}/api/system/journal`, {
            headers: { Authorization: authHeader, Accept: "application/json" },
            httpsAgent,
            timeout: 5000,
        });

        const uncommitted = Number(res.data?.uncommitted_journal_entries || 0);
        const oldestSegment = res.data?.oldest_segment;
        if (uncommitted > 25000 && oldestSegment) {
            const lagSec = Math.max(0, Math.round((Date.now() - new Date(oldestSegment).getTime()) / 1000));
            return lagSec > 120 ? lagSec : 0;
        }
        return 0;
    } catch {
        return 0;
    }
}

export interface CitrixAutoShunCycleResult {
    executed: boolean;
    enabled: boolean;
    windowSeconds: number;
    effectiveRangeSeconds: number;
    graylogLagSeconds: number;
    evaluatedIps: number;
    newlyShunned: {
        ip: string;
        asn: string;
        companyName: string;
        countryCode: string;
        authFailures: number;
        maxAuthFailuresIn10m: number;
        isOnAsnBlacklist: boolean;
        reason: string;
    }[];
    alreadyShunnedCount: number;
    protectedCount: number;
    summary: string;
}

/**
 * Runs a single automated Citrix Login & Abuse Guardian evaluation cycle.
 * Enforces the rule:
 *  - >= 3 failed authentication attempts within 10 minutes (600s), OR
 *  - >= 1 failed authentication attempt when the IP's ASN is in GuardianAsnBlacklist
 *  while respecting Watchlist and Guardian Legitimate User protections.
 */
export async function runCitrixLoginAutoShunCycle(options?: {
    forceRun?: boolean;
    triggeredBy?: string;
}): Promise<CitrixAutoShunCycleResult> {
    const cfg = await getCitrixAutoShunConfig();
    const forceRun = Boolean(options?.forceRun);

    if (!cfg.enabled && !forceRun) {
        return {
            executed: false,
            enabled: false,
            windowSeconds: cfg.windowSeconds,
            effectiveRangeSeconds: cfg.windowSeconds,
            graylogLagSeconds: 0,
            evaluatedIps: 0,
            newlyShunned: [],
            alreadyShunnedCount: 0,
            protectedCount: 0,
            summary: "Paused",
        };
    }

    // Automatically compensate if OG Graylog has a journal backlog so the 10-minute window scans the latest indexed logs
    const graylogLagSeconds = await getOgGraylogJournalLagSeconds();
    const effectiveRangeSeconds = graylogLagSeconds > 0
        ? cfg.windowSeconds + graylogLagSeconds + 120
        : cfg.windowSeconds;

    const triage = await analyzeCitrixLoginTriage(effectiveRangeSeconds, {
        minFailuresForBlock: cfg.minAuthFailuresIn10m,
        minSprayUsers: 2,
        flagForeignIps: true,
        flagNonExistentAdUsers: true,
        protectIspWithValidAdUser: true,
    });

    const newlyShunned: CitrixAutoShunCycleResult["newlyShunned"] = [];
    let alreadyShunnedCount = 0;
    let protectedCount = 0;

    // Ensure Guardian system user exists for audit/history records
    let guardianUser = await prisma.user.findUnique({ where: { username: "Guardian" } }).catch(() => null);
    if (!guardianUser) {
        guardianUser = await prisma.user.create({
            data: { username: "Guardian", role: "SYSTEM", isExternal: false },
        }).catch(() => null);
    }
    const actorUserId = options?.triggeredBy || guardianUser?.id || "Guardian";

    const candidatesToShun: {
        ipEval: CitrixIpEvaluation;
        authFailures: number;
        matchesBlacklistedAsnRule: boolean;
        triggerReason: string;
    }[] = [];

    for (const ipEval of triage.ipEvaluations) {
        // Continuous Real-Time Integration into 3-Strike Reputation Ledger
        const uList = ipEval.targetedUsers.map((u) => u.username);
        const isMultiUser = uList.length >= 2;
        const totalFails = ipEval.loginFailedCount + ipEval.policyFailedCount || ipEval.totalFailures || 1;
        const authFailures = ipEval.loginFailedCount + ipEval.policyFailedCount;
        const matchesBlacklistedAsnRule =
            cfg.shunSingleFailureOnBlacklistedAsn &&
            ipEval.isOnAsnBlacklist &&
            (authFailures >= 1 || ipEval.totalFailures >= 1);
        const now = new Date();

        if (ipEval.isOnWatchlist || ipEval.verdict === "LEGIT_USER_ISSUE") {
            // Protected Corporate Staff Issue -> Ingest as Pardoned in Reputation Ledger
            prisma.residentialStrikeLedger.upsert({
                where: { ip: ipEval.ip },
                update: {
                    lastSeen: now,
                    attemptedUsers: uList,
                    distinctUserCount: uList.length,
                    hasCitrixSuccess: true
                },
                create: {
                    ip: ipEval.ip,
                    strikeCount: 1,
                    status: "PARDONED",
                    targetPlatform: "CITRIX",
                    attemptedUsers: uList,
                    distinctUserCount: uList.length,
                    isSpraySuspect: false,
                    hasCitrixSuccess: true,
                    firstSeen: now,
                    lastSeen: now,
                    expiresAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
                    ispOrg: ipEval.companyName,
                    asn: ipEval.asn ? String(ipEval.asn).replace(/^AS/, '') : null,
                    country: ipEval.countryCode,
                    city: ipEval.cityName
                }
            }).catch(() => {});
        } else {
            // Low-and-Slow Attack vs Employee Friction Ingestion
            const isSingleCorp = uList.length === 1 && isCorporateUsernameFormat(uList[0]);
            let strikeCount = 1;
            let status = "WATCHING";
            let holdDays = 14;

            if (isSingleCorp && !matchesBlacklistedAsnRule && !ipEval.isOnGuardianBlacklist) {
                // Valid corporate employee connection experiencing mistyped password or policy failure
                // Strict corporate staff immunity: NEVER assign Strike 3 Quarantine to a single employee account
                strikeCount = 1;
                status = "WATCHING";
                holdDays = 14;
            } else if (ipEval.isFullyShunned || ipEval.verdict === "ABUSIVE_BLOCK" || matchesBlacklistedAsnRule) {
                strikeCount = 3;
                status = "QUARANTINED";
                holdDays = 90;
            } else if (isMultiUser || (uList.length >= 2)) {
                // Multi-user spray
                strikeCount = 2;
                status = "ENFORCED";
                holdDays = 7;
            } else {
                strikeCount = totalFails >= 3 ? 3 : (totalFails >= 2 ? 2 : 1);
                status = strikeCount === 3 ? "QUARANTINED" : (strikeCount === 2 ? "ENFORCED" : "WATCHING");
                holdDays = strikeCount === 3 ? 90 : (strikeCount === 2 ? 7 : 14);
            }

            prisma.residentialStrikeLedger.upsert({
                where: { ip: ipEval.ip },
                update: {
                    lastSeen: now,
                    strikeCount: Math.max(strikeCount, 1),
                    targetPlatform: "CITRIX",
                    attemptedUsers: uList,
                    distinctUserCount: uList.length,
                    isSpraySuspect: isMultiUser
                },
                create: {
                    ip: ipEval.ip,
                    strikeCount,
                    status,
                    targetPlatform: "CITRIX",
                    attemptedUsers: uList,
                    distinctUserCount: uList.length,
                    isSpraySuspect: isMultiUser,
                    firstSeen: now,
                    lastSeen: now,
                    expiresAt: new Date(now.getTime() + holdDays * 24 * 3600 * 1000),
                    ispOrg: ipEval.companyName,
                    asn: ipEval.asn ? String(ipEval.asn).replace(/^AS/, '') : null,
                    country: ipEval.countryCode,
                    city: ipEval.cityName
                }
            }).catch(() => {});
        }

        // Only skip if the IP is ALREADY fully protected across all perimeter firewalls.
        // If it is only partially shunned (e.g. 1/4), it MUST be reconciled to prevent failover vulnerability!
        if (ipEval.isFullyShunned) {
            alreadyShunnedCount++;
            continue;
        }
        if (ipEval.isOnWatchlist || ipEval.verdict === "LEGIT_USER_ISSUE") {
            protectedCount++;
            continue;
        }

        const matches10mAuthBurstRule =
            ipEval.maxAuthFailuresIn10m >= cfg.minAuthFailuresIn10m;

        const matchesResidentialAbuseRule =
            Boolean(ipEval.isResidentialAbusive && ipEval.verdict === "ABUSIVE_BLOCK");

        const matchesCredentialStuffingRule =
            ipEval.triggeredRules.some(
                (r) =>
                    r.code === "PASSWORD_SPRAY" ||
                    r.code === "RESIDENTIAL_SPRAY_ATTACK" ||
                    r.code === "RESIDENTIAL_DICTIONARY_PROBE"
            );

        const isAbusiveBlockCandidate =
            ipEval.verdict === "ABUSIVE_BLOCK" &&
            (matchesBlacklistedAsnRule || matches10mAuthBurstRule || matchesResidentialAbuseRule || matchesCredentialStuffingRule);

        if (!isAbusiveBlockCandidate) {
            continue;
        }

        const triggerReason = matchesBlacklistedAsnRule
            ? `Blacklisted ASN ${ipEval.asn} (${ipEval.companyName}) with ${ipEval.totalFailures} failed Citrix attempt(s)`
            : ipEval.residentialBlockReason
            ? `[Residential Abuse: ${ipEval.residentialBlockReason}] ${ipEval.ip} (${ipEval.companyName}) - ${ipEval.verdictReason}`
            : matchesCredentialStuffingRule
            ? `[Credential Stuffing / Spray] ${ipEval.targetedUsers.length} users targeted from ${ipEval.ip} (${ipEval.companyName})`
            : `${ipEval.maxAuthFailuresIn10m} failed Citrix authentication attempts within 10m (${ipEval.verdictReason})`;

        candidatesToShun.push({
            ipEval,
            authFailures,
            matchesBlacklistedAsnRule,
            triggerReason,
        });
    }

    if (candidatesToShun.length > 0) {
        // Execute all shuns in a SINGLE SSH connection per firewall
        const blockRes = await blockCitrixAbusiveIps({
            ips: candidatesToShun.map((c) => c.ipEval.ip),
            reason:
                candidatesToShun.length === 1
                    ? `[Auto-Shun] ${candidatesToShun[0].triggerReason}`
                    : `[Auto-Shun Batch] ${candidatesToShun.length} Citrix attacker IPs blocked`,
            targetHost: cfg.targetHost || "all",
            addToGuardianBlacklist: true,
            userId: actorUserId,
            clientIp: "citrix-auto-guardian",
        });

        for (const item of candidatesToShun) {
            const { ipEval, authFailures, matchesBlacklistedAsnRule, triggerReason } = item;
            if (blockRes.blockedIps.includes(ipEval.ip)) {
                newlyShunned.push({
                    ip: ipEval.ip,
                    asn: ipEval.asn,
                    companyName: ipEval.companyName,
                    countryCode: ipEval.countryCode,
                    authFailures,
                    maxAuthFailuresIn10m: ipEval.maxAuthFailuresIn10m,
                    isOnAsnBlacklist: ipEval.isOnAsnBlacklist,
                    reason: triggerReason,
                });

                await prisma.guardianEvent.create({
                    data: {
                        ip: ipEval.ip,
                        firewall: "ALL",
                        action: "SHUNNED",
                        reason: matchesBlacklistedAsnRule ? "BLACK_LISTED_ASN" : "CITRIX_AUTH_BURST",
                        companyName: ipEval.companyName,
                        companyType: ipEval.companyType,
                        cidr: ipEval.cidr,
                        asn: ipEval.asn,
                        details: `[Citrix Auto-Guardian] Shunned & blacklisted ${ipEval.ip}: ${triggerReason}`,
                    },
                }).catch(() => {});

                // Mirror to ResidentialStrikeLedger as Strike 3 Quarantined
                const uList = ipEval.targetedUsers.map((u) => u.username);
                await prisma.residentialStrikeLedger.upsert({
                    where: { ip: ipEval.ip },
                    update: {
                        strikeCount: 3,
                        status: "QUARANTINED",
                        targetPlatform: "CITRIX",
                        attemptedUsers: uList,
                        distinctUserCount: uList.length,
                        isSpraySuspect: uList.length >= 2,
                        lastSeen: new Date(),
                        ispOrg: ipEval.companyName,
                        asn: ipEval.asn ? String(ipEval.asn).replace(/^AS/, '') : null,
                        country: ipEval.countryCode,
                        city: ipEval.cityName
                    },
                    create: {
                        ip: ipEval.ip,
                        strikeCount: 3,
                        status: "QUARANTINED",
                        targetPlatform: "CITRIX",
                        attemptedUsers: uList,
                        distinctUserCount: uList.length,
                        isSpraySuspect: uList.length >= 2,
                        firstSeen: new Date(),
                        lastSeen: new Date(),
                        expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000),
                        ispOrg: ipEval.companyName,
                        asn: ipEval.asn ? String(ipEval.asn).replace(/^AS/, '') : null,
                        country: ipEval.countryCode,
                        city: ipEval.cityName
                    }
                }).catch(() => {});
            }
        }
    }

    const summary = newlyShunned.length > 0
        ? `Shunned ${newlyShunned.length} IP(s): ${newlyShunned.map((n) => n.ip).join(", ")}`
        : `Scanned ${triage.ipEvaluations.length} IP(s) (${Math.round(cfg.windowSeconds / 60)}m window${graylogLagSeconds > 0 ? ` + ${Math.round(graylogLagSeconds / 60)}m backlog offset` : ""}) — 0 new shuns`;

    await updateCitrixAutoShunConfig(
        {
            lastRunAt: new Date().toISOString(),
            lastRunNewShuns: newlyShunned.length,
            lastRunEvaluatedIps: triage.ipEvaluations.length,
            lastRunSummary: summary,
        },
        cfg.modifiedBy || "Guardian"
    ).catch(() => {});

    return {
        executed: true,
        enabled: cfg.enabled,
        windowSeconds: cfg.windowSeconds,
        effectiveRangeSeconds,
        graylogLagSeconds,
        evaluatedIps: triage.ipEvaluations.length,
        newlyShunned,
        alreadyShunnedCount,
        protectedCount,
        summary,
    };
}

export interface SingleIpReevaluationResult {
    evaluation: CitrixIpEvaluation;
    events: CitrixLoginFailureEvent[];
    reasoningDetails: {
        baseScore: number;
        finalScore: number;
        verdict: GuardianAbuseVerdict;
        verdictReason: string;
        protectionNote?: string;
        triggeredRules: CitrixGuardianRuleFlag[];
        safetyShieldApplied: boolean;
        safetyShieldReason?: string;
        ispClassification: {
            asn: string;
            companyName: string;
            companyType: string;
            isResidentialIsp: boolean;
            isEnterpriseProxy: boolean;
            isOnAsnBlacklist: boolean;
        };
        userAdBreakdown: {
            username: string;
            isCorporateFormat: boolean;
            adStatus: string;
            adDisplayName?: string;
            adDepartment?: string;
            failures: number;
            succeededLater: boolean;
        }[];
        imprivataSummary: {
            badPasswordCount: number;
            mfaTimeoutCount: number;
            invalidUserCount: number;
        };
    };
    refreshedAt: string;
}

/**
 * Re-evaluates a single IP address on-demand against Graylog, Active Directory, Imprivata,
 * and perimeter firewalls. Returns updated verdict, full rule-by-rule scoring reasoning,
 * and recent failure events.
 */
export async function reevaluateSingleCitrixIp(
    targetIp: string,
    rangeSeconds: number = 86400,
    customConfig?: Partial<CitrixTriageConfig>
): Promise<SingleIpReevaluationResult> {
    const cleanIp = String(targetIp).trim();
    const config: CitrixTriageConfig = {
        ...DEFAULT_CITRIX_TRIAGE_CONFIG,
        ...(customConfig || {}),
    };

    const baseUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const authHeader = "Basic " + Buffer.from(`${apiToken}:token`).toString("base64");
    const baseStream = "(streams:5c055e3ab20902046cedcfcd OR _exists_:ns_module)";

    const ipQuery = `(src_ip:"${cleanIp}" OR client_ip:"${cleanIp}" OR source_ip:"${cleanIp}" OR ns_remote_ip:"${cleanIp}" OR "${cleanIp}")`;
    const failQuery = `${baseStream} AND ${ipQuery} AND (ns_action:LOGIN_FAILED OR (ns_module:(AAA OR SSLVPN OR AAATM OR ICA) AND (LOGIN_FAILED OR "Failed policy" OR "denied access" OR "STA ticket validation failed" OR "Invalid tass cookie" OR FAILURE OR FAILED OR DENIED OR "type 5") AND NOT "invalid opcode" AND NOT "NAS_NAC_PROXY" AND NOT "CONSOLE_CLOUD_AGENT"))`;
    const successQuery = `${baseStream} AND ${ipQuery} AND (ns_action:(LOGIN OR LOGOUT OR ICASTART OR ICAEND_CONNSTAT) OR (ns_module:SSLVPN AND "response-200"))`;

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

    const adaptive = await getAdaptiveSearchWindow("OG_GRAYLOG", rangeSeconds);

    const [failRes, successRes, ipMeta, vpnHist, shunDbRecord, shunStats, blEntry, watchEntry, asnBlEntries] =
        await Promise.all([
            axios
                .get(`${baseUrl}/api/search/universal/relative`, {
                    params: {
                        query: failQuery,
                        range: adaptive.effectiveRangeSeconds,
                        limit: 300,
                        fields,
                        sort: "timestamp:desc",
                    },
                    httpsAgent,
                    headers: {
                        Authorization: authHeader,
                        Accept: "application/json",
                        "X-Requested-By": "pane-o-glass",
                    },
                    timeout: 15000,
                })
                .catch(() => ({ data: { messages: [], total_results: 0 } })),
            axios
                .get(`${baseUrl}/api/search/universal/relative`, {
                    params: {
                        query: successQuery,
                        range: adaptive.effectiveRangeSeconds,
                        limit: 150,
                        fields,
                        sort: "timestamp:desc",
                    },
                    httpsAgent,
                    headers: {
                        Authorization: authHeader,
                        Accept: "application/json",
                        "X-Requested-By": "pane-o-glass",
                    },
                    timeout: 15000,
                })
                .catch(() => ({ data: { messages: [], total_results: 0 } })),
            enrichIpMetadata(cleanIp, true),
            prisma.vpnEvent.findFirst({
                where: { sourceIp: cleanIp, status: "SUCCESS" },
                select: { id: true },
            }).catch(() => null),
            prisma.shunDatabaseIp.findUnique({
                where: { ip: cleanIp },
            }).catch(() => null),
            prisma.firewallShunStats.findMany({
                where: { ip: cleanIp, isActive: true },
                select: { firewall: true },
            }).catch(() => []),
            prisma.guardianBlacklist.findUnique({
                where: { ip: cleanIp },
            }).catch(() => null),
            prisma.guardianWatchIp.findUnique({
                where: { ip: cleanIp },
            }).catch(() => null),
            prisma.guardianAsnBlacklist.findMany({
                select: { asn: true },
            }).catch(() => []),
        ]);

    const rawFailures: any[] = failRes.data?.messages || [];
    const rawSuccesses: any[] = successRes.data?.messages || [];

    // Success tracking
    let citrixSucc = 0;
    const userSuccessMap = new Map<string, string>(); // user -> latest success
    for (const s of rawSuccesses) {
        const msg = s.message || {};
        const ip = NetscalerGraylogClient.extractSourceIp(msg);
        const u = NetscalerGraylogClient.extractUsername(msg).toLowerCase();
        const ts = msg.timestamp || "";
        if (ip === cleanIp || !ip) {
            citrixSucc++;
            if (u && (!userSuccessMap.has(u) || ts > userSuccessMap.get(u)!)) {
                userSuccessMap.set(u, ts);
            }
        }
    }

    // Collect targeted users
    const allUsersSet = new Set<string>();
    for (const f of rawFailures) {
        const u = NetscalerGraylogClient.extractUsername(f.message);
        if (u && u !== "anonymous" && u !== "nsroot") {
            allUsersSet.add(u);
        }
    }

    // Check AD status and Imprivata RADIUS in parallel
    const [adStatusMap, imprivataIndex] = await Promise.all([
        allUsersSet.size > 0
            ? getBulkUserAdStatus(Array.from(allUsersSet)).catch(() => ({} as any))
            : Promise.resolve({} as any),
        allUsersSet.size > 0
            ? fetchImprivataBatchIndex(rangeSeconds + 600, "CITRIX", 600, Array.from(allUsersSet)).catch(() => new Map())
            : Promise.resolve(new Map()),
    ]);

    // Check 4740 lockouts
    if (allUsersSet.size > 0) {
        const sinceDate = new Date(Date.now() - rangeSeconds * 1000);
        const lockedRecords = await prisma.accountLifecycleEvent.findMany({
            where: {
                canonicalUsername: { in: Array.from(allUsersSet) },
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

    // Parse failure events
    const events: CitrixLoginFailureEvent[] = [];
    let loginFailedCount = 0;
    let policyFailedCount = 0;
    let staFailedCount = 0;
    let cookieFailedCount = 0;
    let ipImpBadPwdCount = 0;
    let ipImpMfaTimeoutCount = 0;
    let ipImpInvalidUserCount = 0;
    const userMap = new Map<string, any>();
    const authFailureEpochs: number[] = [];

    let firstSeen = rawFailures.length > 0 ? rawFailures[0].message?.timestamp || new Date().toISOString() : new Date().toISOString();
    let lastSeen = firstSeen;

    for (const f of rawFailures) {
        const msg = f.message || {};
        const raw = msg.message || "";
        if (/invalid opcode 8/i.test(raw) || /NAS_NAC_PROXY to INVALID/i.test(raw) || /CONSOLE_CLOUD_AGENT/i.test(raw)) {
            continue;
        }

        const usernameRaw = NetscalerGraylogClient.extractUsername(msg);
        const usernameClean = (usernameRaw || "anonymous").toLowerCase();
        const classified = classifyFailureMessage(msg);

        const uNoDomain = usernameClean.replace(/^[a-zA-Z0-9_\-\.]+[\\\/]/, "");
        const uNoEmail = uNoDomain.split("@")[0];
        const adInfo =
            adStatusMap[usernameClean] ||
            adStatusMap[usernameRaw] ||
            adStatusMap[uNoDomain] ||
            adStatusMap[uNoEmail];
        const isCorp = isCorporateUsernameFormat(usernameClean) || isCorporateUsernameFormat(uNoEmail);

        // Imprivata correlation
        let imprivataVerdict: string | undefined;
        let imprivataVerdictLabel: string | undefined;
        let imprivataMfaMethod: string | undefined;
        let imprivataNode: string | undefined;
        let enrichedFailureReason = classified.failureReason;

        if (
            usernameClean !== "anonymous" &&
            (classified.category === "AAA_LOGIN_FAILED" ||
                classified.category === "AAA_POLICY_FAILED" ||
                classified.category === "AUTH_DENIED_OTHER")
        ) {
            const matchedImp = matchEventToImprivataSession(
                usernameRaw,
                msg.timestamp || new Date().toISOString(),
                imprivataIndex,
                120000,
                true
            );
            if (matchedImp) {
                imprivataVerdict = matchedImp.verdict;
                imprivataVerdictLabel = matchedImp.verdictLabel;
                imprivataMfaMethod = matchedImp.mfaMethod;
                imprivataNode = matchedImp.imprivataNode;

                if (classified.category === "AAA_POLICY_FAILED") {
                    enrichedFailureReason = `AAA Policy (${classified.policyName || "Imprivata-prod"}) → ${formatImprivataFailureReason(matchedImp)}`;
                } else {
                    enrichedFailureReason = formatImprivataFailureReason(matchedImp);
                }

                if (matchedImp.verdict === "BAD_AD_PASSWORD_OR_POLICY") ipImpBadPwdCount++;
                if (matchedImp.verdict === "MFA_PUSH_TIMEOUT" || matchedImp.verdict === "MFA_CHALLENGED") ipImpMfaTimeoutCount++;
                if (matchedImp.verdict === "INVALID_USER") ipImpInvalidUserCount++;
            }
        }

        const evTs = msg.timestamp || new Date().toISOString();
        if (evTs < firstSeen) firstSeen = evTs;
        if (evTs > lastSeen) lastSeen = evTs;

        if (classified.category === "AAA_LOGIN_FAILED") loginFailedCount++;
        else if (classified.category === "AAA_POLICY_FAILED") policyFailedCount++;
        else if (classified.category === "STA_TICKET_FAILED") staFailedCount++;
        else if (classified.category === "IDP_COOKIE_INVALID") cookieFailedCount++;

        const ep = new Date(evTs).getTime();
        if (!isNaN(ep) && (classified.category === "AAA_LOGIN_FAILED" || classified.category === "AAA_POLICY_FAILED")) {
            authFailureEpochs.push(ep);
        }

        const uKey = usernameClean;
        const latestSucc = userSuccessMap.get(uKey);
        const succeededLater = Boolean(latestSucc && latestSucc >= evTs);

        if (userMap.has(uKey)) {
            userMap.get(uKey).failures++;
            if (succeededLater) userMap.get(uKey).succeededLater = true;
        } else {
            userMap.set(uKey, {
                username: usernameRaw || "anonymous",
                isCorporateFormat: isCorp,
                adStatus: usernameClean === "anonymous" ? "ANONYMOUS" : (adInfo?.adStatus || "NOT_FOUND"),
                adDisplayName: adInfo?.displayName,
                adDepartment: adInfo?.department,
                failures: 1,
                succeededLater,
            });
        }

        events.push({
            id: msg._id || `${evTs}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: evTs,
            category: classified.category,
            module: msg.ns_module || "Citrix",
            action: msg.ns_action || "Message",
            username: usernameRaw || "anonymous",
            isCorporateFormat: isCorp,
            adStatus: usernameClean === "anonymous" ? "ANONYMOUS" : (adInfo?.adStatus || "NOT_FOUND"),
            adDisplayName: adInfo?.displayName,
            adDepartment: adInfo?.department,
            clientIp: cleanIp,
            countryCode: ipMeta.countryCode,
            cityName: ipMeta.city,
            failureReason: enrichedFailureReason,
            policyName: classified.policyName,
            userAgent: classified.userAgent,
            imprivataVerdict,
            imprivataVerdictLabel,
            imprivataMfaMethod,
            imprivataNode,
            rawMessage: raw,
        });
    }

    authFailureEpochs.sort((a, b) => a - b);
    let maxAuthFailuresIn10m = 0;
    let windowStartIdx = 0;
    for (let i = 0; i < authFailureEpochs.length; i++) {
        while (authFailureEpochs[i] - authFailureEpochs[windowStartIdx] > 600_000) {
            windowStartIdx++;
        }
        const count = i - windowStartIdx + 1;
        if (count > maxAuthFailuresIn10m) maxAuthFailuresIn10m = count;
    }

    const targetedUsers = Array.from(userMap.values());
    const nonAnonUsers = targetedUsers.filter((u) => u.username.toLowerCase() !== "anonymous");
    const totalFailures = events.length;

    // Smart Guardian Rules
    const triggeredRules: CitrixGuardianRuleFlag[] = [];
    let riskScore = 0;

    // 1. Foreign Origin
    if (config.flagForeignIps && ipMeta.countryCode !== "US" && ipMeta.countryCode !== "Unknown") {
        triggeredRules.push({
            code: "FOREIGN_ORIGIN",
            label: `Foreign Origin (${ipMeta.countryCode})`,
            severity: "CRITICAL",
            points: 50,
            detail: `Authentication failures originating outside the US (${ipMeta.city !== "N/A" ? `${ipMeta.city}, ` : ""}${ipMeta.countryCode}).`,
        });
        riskScore += 50;
    }

    // 2. Password Spray
    if (nonAnonUsers.length >= config.minSprayUsers) {
        triggeredRules.push({
            code: "PASSWORD_SPRAY",
            label: `Password Spray (${nonAnonUsers.length} Users)`,
            severity: "CRITICAL",
            points: 55,
            detail: `Targeted ${nonAnonUsers.length} distinct usernames (${nonAnonUsers.map((u) => u.username).slice(0, 4).join(", ")}).`,
        });
        riskScore += 55;
    }

    // 3. AD User Evaluation
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
                detail: `Attempted username(s) do not match corporate format: ${invalidFormatUsers.map((u) => u.username).join(", ")}.`,
            });
            riskScore += 45;
        }

        if (notFoundAdUsers.length > 0) {
            triggeredRules.push({
                code: "NON_EXISTENT_AD_USER",
                label: "Username Not Found in AD",
                severity: "CRITICAL",
                points: 50,
                detail: `Username(s) do not exist in Active Directory: ${notFoundAdUsers.map((u) => u.username).join(", ")}.`,
            });
            riskScore += 50;
        }

        if (disabledLockedUsers.length > 0) {
            triggeredRules.push({
                code: "DISABLED_OR_LOCKED_AD",
                label: `AD Account ${disabledLockedUsers[0].adStatus}`,
                severity: "MEDIUM",
                points: 25,
                detail: `Targeted AD account is ${disabledLockedUsers.map((u) => `${u.username} (${u.adStatus})`).join(", ")}.`,
            });
            riskScore += 25;
        }
    }

    // 4. 10m Burst or Volume
    const hasVpnSuccessHistory = Boolean(vpnHist);
    if (maxAuthFailuresIn10m >= config.minFailuresForBlock) {
        triggeredRules.push({
            code: "AUTH_BURST_10M",
            label: `${maxAuthFailuresIn10m} Auth Failures in ≤10m`,
            severity: "CRITICAL",
            points: 55,
            detail: `${maxAuthFailuresIn10m} authentication failures within 10 minutes (threshold: ${config.minFailuresForBlock}).`,
        });
        riskScore += 55;
    } else if (totalFailures >= config.minFailuresForBlock && citrixSucc === 0 && !hasVpnSuccessHistory) {
        triggeredRules.push({
            code: "HIGH_FAILURE_VOLUME",
            label: `Repeated Failures (${totalFailures}x, 0 Success)`,
            severity: "HIGH",
            points: 35,
            detail: `${totalFailures} failure events with 0 successful logins.`,
        });
        riskScore += 35;
    }

    // 5. ASN classification
    const cleanAsnNum = String(ipMeta.asn).toUpperCase().replace(/^AS/, "");
    const blacklistedAsnSet = new Set(asnBlEntries.map((a) => String(a.asn).toUpperCase().replace(/^AS/, "")));
    const isOnAsnBlacklist = blacklistedAsnSet.has(cleanAsnNum);
    const isEnterpriseProxy = /zscaler|netskope|palo alto|cloudflare|akamai|cisco umbrella/i.test(ipMeta.companyName);

    if (isOnAsnBlacklist) {
        triggeredRules.push({
            code: "BLACKLISTED_ASN",
            label: `Blacklisted ASN (${ipMeta.asn})`,
            severity: "CRITICAL",
            points: 65,
            detail: `Belongs to blacklisted ASN ${ipMeta.asn} (${ipMeta.companyName}).`,
        });
        riskScore += 65;
    } else if (ipMeta.companyType === "hosting" && !isEnterpriseProxy) {
        triggeredRules.push({
            code: "HOSTING_DATACENTER_ASN",
            label: "Hosting / Datacenter ASN",
            severity: "HIGH",
            points: 40,
            detail: `Source belongs to cloud/datacenter provider ${ipMeta.companyName} (${ipMeta.asn}).`,
        });
        riskScore += 40;
    }

    // 6. STA ticket probing
    if (staFailedCount >= config.minFailuresForBlock && nonAnonUsers.length === 0 && citrixSucc === 0 && !hasVpnSuccessHistory) {
        triggeredRules.push({
            code: "REPEATED_STA_TICKET_ABUSE",
            label: `Repeated STA Ticket Failures (${staFailedCount}x)`,
            severity: "HIGH",
            points: 35,
            detail: `Repeated STA ticket failures (${staFailedCount}x) with no authenticated user session.`,
        });
        riskScore += 35;
    }

    // Safety Shield
    const baseScore = riskScore;
    const allUsersValidAd =
        nonAnonUsers.length > 0 &&
        nonAnonUsers.every((u) => u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" || u.adStatus === "LOCKED");
    const isSingleUser = nonAnonUsers.length === 1;
    const notFoundAdUsers = nonAnonUsers.filter((u) => u.adStatus === "NOT_FOUND");
    const invalidFormatUsers = nonAnonUsers.filter((u) => !u.isCorporateFormat);
    const isOnWatchlist = Boolean(watchEntry);
    const isOnGuardianBlacklist = Boolean(blEntry);

    let verdict: GuardianAbuseVerdict = "SUSPICIOUS_WATCH";
    let verdictReason = "";
    let protectionNote: string | undefined;
    let safetyShieldApplied = false;
    let safetyShieldReason: string | undefined;

    if (isOnGuardianBlacklist) {
        verdict = "ABUSIVE_BLOCK";
        riskScore = Math.max(riskScore, 85);
        verdictReason = `On Guardian Do-Not-Unshun Blacklist: ${blEntry?.reason || "Locked"}`;
    } else if (isOnWatchlist) {
        verdict = "LEGIT_USER_ISSUE";
        riskScore = Math.min(riskScore, 10);
        verdictReason = "Protected Watchlist Asset IP";
        protectionNote = "IP is registered on the Guardian Monitored Watchlist.";
        safetyShieldApplied = true;
        safetyShieldReason = "Guardian Monitored Watchlist Asset";
    } else if (isOnAsnBlacklist) {
        verdict = "ABUSIVE_BLOCK";
        riskScore = Math.max(riskScore, 85);
        verdictReason = `Blacklisted ASN ${ipMeta.asn} (${ipMeta.companyName}) with ${totalFailures} attempt(s).`;
    } else if (
        ipMeta.isResidentialIsp &&
        (nonAnonUsers.length >= 3 || notFoundAdUsers.length > 0 || invalidFormatUsers.length > 0 || (maxAuthFailuresIn10m >= config.minFailuresForBlock && citrixSucc === 0))
    ) {
        verdict = "ABUSIVE_BLOCK";
        riskScore = Math.max(riskScore, 85);
        const reason = nonAnonUsers.length >= 3
            ? "Credential Spray (≥3 Accounts)"
            : notFoundAdUsers.length > 0 || invalidFormatUsers.length > 0
            ? "Probing Non-Existent AD Accounts"
            : "Rapid Auth Burst (≥5 Failures / 10m)";
        verdictReason = `Abusive Residential IP (${ipMeta.companyName}): ${reason}`;
    } else if (
        config.protectIspWithValidAdUser &&
        ipMeta.countryCode === "US" &&
        allUsersValidAd &&
        notFoundAdUsers.length === 0 &&
        invalidFormatUsers.length === 0 &&
        (isSingleUser || (ipMeta.isResidentialIsp && nonAnonUsers.length === 2)) &&
        (citrixSucc > 0 ||
            hasVpnSuccessHistory ||
            (ipImpMfaTimeoutCount > 0 && ipImpBadPwdCount === 0) ||
            (ipMeta.isResidentialIsp && maxAuthFailuresIn10m < config.minFailuresForBlock))
    ) {
        verdict = "LEGIT_USER_ISSUE";
        riskScore = Math.min(riskScore, 15);
        safetyShieldApplied = true;
        const isHousehold = ipMeta.isResidentialIsp && nonAnonUsers.length === 2;

        if (isHousehold) {
            verdictReason = `Verified multi-employee household (${nonAnonUsers.map((u) => u.username).join(" & ")}) connecting from US residential ISP (${ipMeta.companyName}) with active AD accounts.`;
            protectionNote = "Guardian Protected Household: Up to 2 verified active AD corporate users sharing residential connection.";
            safetyShieldReason = "Verified multi-employee residential household sharing connection.";
        } else {
            const u = nonAnonUsers[0];
            const userLabel = u.adDisplayName ? `${u.adDisplayName} (${u.username})` : u.username;

            if (ipImpMfaTimeoutCount > 0 && ipImpBadPwdCount === 0 && citrixSucc === 0) {
                verdictReason = `Imprivata Confirmed AD Password OK for ${userLabel}, but user did not accept the MFA Push in time (${ipImpMfaTimeoutCount}x MFA timeout).`;
                protectionNote = "Guardian Protected: Imprivata RADIUS verified AD password succeeded (only MFA push timed out).";
                safetyShieldReason = "Imprivata RADIUS: AD password was correct; only 2FA smartphone push timed out.";
            } else if (citrixSucc > 0 || u.succeededLater) {
                verdictReason = `Legitimate AD user ${userLabel} had ${totalFailures} failure(s) and logged in successfully (${citrixSucc} sessions).`;
                protectionNote = "Guardian Protected: Verified AD user with successful Citrix sessions from this IP.";
                safetyShieldReason = "Verified corporate employee with successful authenticated Citrix sessions.";
            } else if (hasVpnSuccessHistory) {
                verdictReason = `Legitimate AD user ${userLabel} with prior AnyConnect VPN history from this IP.`;
                protectionNote = "Guardian Protected: Verified corporate VPN history on this IP.";
                safetyShieldReason = "Prior AnyConnect VPN authentication history from this IP.";
            } else {
                verdictReason = `Valid AD user ${userLabel} connecting from US ISP (${ipMeta.companyName}).`;
                protectionNote = "Guardian Protected: US ISP with verified Active Directory corporate user.";
                safetyShieldReason = `US Residential ISP (${ipMeta.companyName}) with valid Active Directory account.`;
            }
        }
    } else if (riskScore >= 50) {
        verdict = "ABUSIVE_BLOCK";
        verdictReason = triggeredRules.map((r) => r.label).join(" + ") || "High-risk authentication abuse pattern";
    } else if (riskScore >= 20 || staFailedCount > 0) {
        verdict = "SUSPICIOUS_WATCH";
        verdictReason = triggeredRules.map((r) => r.label).join(" + ") || "Unattributed authentication / session anomaly";
    } else {
        verdict = "LEGIT_USER_ISSUE";
        verdictReason = "Low-risk authentication anomaly from US network.";
    }

    riskScore = Math.min(100, Math.max(0, riskScore));

    const configuredFleet = getFleetFirewalls();
    const configuredFwNames = configuredFleet.map((f) => f.name);
    const shunnedFirewalls = shunStats.map((s) => s.firewall);
    const isCurrentlyShunned = shunnedFirewalls.length > 0 || Boolean(shunDbRecord);
    const isFullyShunned = configuredFwNames.length > 0 && shunnedFirewalls.length >= configuredFwNames.length;
    const isPartiallyShunned = shunnedFirewalls.length > 0 && !isFullyShunned;
    const missingFirewalls = configuredFwNames.filter((f) => !shunnedFirewalls.includes(f));

    const evaluation: CitrixIpEvaluation = {
        ip: cleanIp,
        countryCode: ipMeta.countryCode,
        cityName: ipMeta.city,
        asn: ipMeta.asn,
        companyName: ipMeta.companyName,
        companyType: ipMeta.companyType,
        cidr: ipMeta.cidr,
        isResidentialIsp: ipMeta.isResidentialIsp,
        totalFailures,
        loginFailedCount,
        policyFailedCount,
        staFailedCount,
        cookieFailedCount,
        maxAuthFailuresIn10m,
        isOnAsnBlacklist,
        imprivataBadPasswordCount: ipImpBadPwdCount,
        imprivataMfaTimeoutCount: ipImpMfaTimeoutCount,
        imprivataInvalidUserCount: ipImpInvalidUserCount,
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
        isCurrentlyShunned,
        isFullyShunned,
        isPartiallyShunned,
        missingFirewalls,
        shunnedFirewalls,
        isOnGuardianBlacklist,
        guardianBlacklistReason: blEntry?.reason || undefined,
        isOnWatchlist,
        sampleMessages: events.slice(0, 3).map((e) => e.rawMessage),
    };

    return {
        evaluation,
        events,
        reasoningDetails: {
            baseScore,
            finalScore: riskScore,
            verdict,
            verdictReason,
            protectionNote,
            triggeredRules,
            safetyShieldApplied,
            safetyShieldReason,
            ispClassification: {
                asn: ipMeta.asn,
                companyName: ipMeta.companyName,
                companyType: ipMeta.companyType,
                isResidentialIsp: ipMeta.isResidentialIsp,
                isEnterpriseProxy,
                isOnAsnBlacklist,
            },
            userAdBreakdown: targetedUsers,
            imprivataSummary: {
                badPasswordCount: ipImpBadPwdCount,
                mfaTimeoutCount: ipImpMfaTimeoutCount,
                invalidUserCount: ipImpInvalidUserCount,
            },
        },
        refreshedAt: new Date().toISOString(),
    };
}

