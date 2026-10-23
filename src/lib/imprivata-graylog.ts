import axios from "axios";
import https from "https";
import { prisma } from "@/lib/prisma";
import { NetscalerGraylogClient } from "@/lib/netscaler-graylog";
import { getIpInfoLite, isPrivateIp } from "@/lib/ipinfo";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export const OG_GRAYLOG_IMPRIVATA_RADIUS_STREAM_ID = "5cb4d070b2090233f76b8852";
export const OG_GRAYLOG_IMPRIVATA_ESSO_STREAM_ID = "5d0127d2b20902acd15b35d8";

export type ImprivataGatewayCategory = "VPN" | "CITRIX" | "OTHER";

export interface ImprivataNasClientInfo {
    ip: string;
    name: string;
    shortLabel: string;
    category: ImprivataGatewayCategory;
}

export const IMPRIVATA_NAS_CLIENTS: Record<string, ImprivataNasClientInfo> = {
    "172.16.1.249": {
        ip: "172.16.1.249",
        name: "Keleman FTD VPN (Kel-3140)",
        shortLabel: "Keleman VPN (172.16.1.249)",
        category: "VPN",
    },
    "172.18.166.138": {
        ip: "172.18.166.138",
        name: "Wilmington FTD VPN (WDC-FTD)",
        shortLabel: "Wilmington VPN (172.18.166.138)",
        category: "VPN",
    },
    "172.18.221.60": {
        ip: "172.18.221.60",
        name: "Citrix NetScaler Gateway (External ADC)",
        shortLabel: "Citrix NetScaler (172.18.221.60)",
        category: "CITRIX",
    },
    "172.16.32.224": {
        ip: "172.16.32.224",
        name: "Citrix StoreFront / Internal Gateway",
        shortLabel: "Citrix StoreFront (172.16.32.224)",
        category: "CITRIX",
    },
};

export function resolveNasClient(nasIp?: string | null): ImprivataNasClientInfo {
    const clean = (nasIp || "").trim();
    if (!clean) {
        return {
            ip: "Unknown",
            name: "Imprivata RADIUS Gateway",
            shortLabel: "Imprivata RADIUS",
            category: "OTHER",
        };
    }
    if (IMPRIVATA_NAS_CLIENTS[clean]) {
        return IMPRIVATA_NAS_CLIENTS[clean];
    }
    if (clean.startsWith("172.18.221.") || clean.startsWith("172.16.32.")) {
        return {
            ip: clean,
            name: `Citrix Gateway (${clean})`,
            shortLabel: `Citrix (${clean})`,
            category: "CITRIX",
        };
    }
    if (clean.startsWith("172.16.1.") || clean.startsWith("172.18.166.")) {
        return {
            ip: clean,
            name: `Cisco FTD VPN (${clean})`,
            shortLabel: `VPN (${clean})`,
            category: "VPN",
        };
    }
    return {
        ip: clean,
        name: `RADIUS Client (${clean})`,
        shortLabel: `RADIUS (${clean})`,
        category: "OTHER",
    };
}

export type ImprivataVerdict =
    | "BAD_AD_PASSWORD_OR_POLICY"
    | "INVALID_USER"
    | "MFA_PUSH_TIMEOUT"
    | "MFA_CHALLENGED"
    | "AUTH_SUCCESS"
    | "UNKNOWN_FAILURE";

export interface ImprivataRadiusSession {
    id: string;
    timestamp: string;
    imprivataNode: string;
    sessionTag: string;
    username: string;
    cleanUsername: string;
    nasClientIp: string;
    nasClientName: string;
    nasShortLabel: string;
    nasCategory: ImprivataGatewayCategory;
    status: "SUCCESS" | "FAILED" | "CHALLENGED";
    verdict: ImprivataVerdict;
    verdictLabel: string;
    errorReason: string;
    mfaMethod?: string;
    externalClientIp?: string;
    externalCountry?: string;
    externalCity?: string;
    externalIsp?: string;
    rawMessage: string;
}

export interface ImprivataEssoEvent {
    id: string;
    timestamp: string;
    eventType: string;
    username: string;
    serverIp: string;
    workstationHostname?: string;
    workstationIp?: string;
    workstationMac?: string;
    authMethod?: string;
    result: string;
    isFailure: boolean;
    rawMessage: string;
}

export interface ImprivataUserCorrelationSummary {
    hasImprivataActivity: boolean;
    isImprivataLockoutCulprit: boolean;
    primaryImprivataNode?: string;
    primaryGatewayName?: string;
    primaryGatewayIp?: string;
    primaryGatewayCategory?: ImprivataGatewayCategory | "WORKSTATION_ESSO";
    primaryVerdict?: ImprivataVerdict;
    primaryVerdictLabel?: string;
    primaryExternalIp?: string;
    primaryExternalLocation?: string;
    primaryExternalIsp?: string;
    primaryWorkstationHostname?: string;
    primaryWorkstationIp?: string;
    primaryWorkstationMac?: string;
    totalRadiusAttempts: number;
    radiusFailures: number;
    badPasswordCount: number;
    invalidUserCount: number;
    mfaTimeoutCount: number;
    mfaChallengedCount: number;
    radiusSuccesses: number;
    essoFailures: number;
    radiusSessions: ImprivataRadiusSession[];
    essoEvents: ImprivataEssoEvent[];
}

export function normalizeImprivataUsername(raw?: string | null): string {
    if (!raw) return "";
    return raw
        .trim()
        .replace(/^(?:chsmail|cooperhealth)\\/i, "")
        .replace(/@(?:chsmail\.root\.)?cooperhealth\.edu$/i, "")
        .toLowerCase();
}

/**
 * Parses Imprivata Confirm ID ChallengeText (either plain text or embedded JSON `<p>{...}</p>`)
 */
export function parseImprivataChallenge(challengeText: string): {
    isTimeoutOrError: boolean;
    mfaMethod: string;
    summaryText: string;
} {
    const trimmed = (challengeText || "").trim();
    if (!trimmed || trimmed === "null") {
        return { isTimeoutOrError: false, mfaMethod: "", summaryText: "" };
    }

    if (/didn't accept the push notification/i.test(trimmed)) {
        return {
            isTimeoutOrError: true,
            mfaMethod: "Imprivata ID Push",
            summaryText: "MFA Push notification timed out / not accepted on smartphone",
        };
    }

    const jsonMatch = trimmed.match(/<p>(\{[\s\S]*?\})<\/p>/i);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            const hasErr = typeof parsed.err === "number" && parsed.err > 0;
            const smsTarget = parsed?.ms?.S?.ac?.ts?.[0]?.n;
            const hasPush = Boolean(parsed?.ms?.I?.ac || parsed?.ms?.I?.f !== undefined);
            const hasSms = Boolean(smsTarget || parsed?.ms?.S?.ac);

            let mfaMethod = "Imprivata Confirm ID MFA";
            if (hasPush && hasSms && smsTarget) {
                mfaMethod = `Imprivata ID Push / SMS (**${smsTarget})`;
            } else if (hasSms && smsTarget) {
                mfaMethod = `SMS OTP (**${smsTarget})`;
            } else if (hasPush) {
                mfaMethod = "Imprivata ID Push / Token";
            }

            if (hasErr) {
                return {
                    isTimeoutOrError: true,
                    mfaMethod,
                    summaryText: `Imprivata MFA Challenge Error (Code ${parsed.err}) via ${mfaMethod}`,
                };
            }

            return {
                isTimeoutOrError: false,
                mfaMethod,
                summaryText: `MFA Challenge issued (${mfaMethod})`,
            };
        } catch {
            // Fall through
        }
    }

    return {
        isTimeoutOrError: false,
        mfaMethod: "Imprivata MFA Challenge",
        summaryText: trimmed.replace(/<[^>]+>/g, " ").trim().slice(0, 140),
    };
}

/**
 * Classifies an Imprivata RadiusRemoteAuthenticateVO outcome into a clear security/helpdesk verdict.
 */
export function classifyImprivataOutcome(params: {
    rawMessage: string;
    statusField: string;
    errorReasonField: string;
    challengeTextField: string;
    challengeResultField: string;
}): {
    status: "SUCCESS" | "FAILED" | "CHALLENGED";
    verdict: ImprivataVerdict;
    verdictLabel: string;
    errorReason: string;
    mfaMethod?: string;
} {
    const {
        rawMessage,
        statusField,
        errorReasonField,
        challengeTextField,
        challengeResultField,
    } = params;

    const cleanErr = (errorReasonField || "").trim();
    const cleanStatus = (statusField || "").trim();
    const challengeInfo = parseImprivataChallenge(challengeTextField);

    if (/Passcode for Remote Authentication was VALID/i.test(rawMessage) || /^pass$/i.test(challengeResultField)) {
        return {
            status: "SUCCESS",
            verdict: "AUTH_SUCCESS",
            verdictLabel: "2FA Passcode / Push Validated",
            errorReason: "Authentication Succeeded (2FA Validated)",
            mfaMethod: challengeInfo.mfaMethod || "Imprivata 2FA",
        };
    }

    if (cleanStatus.toLowerCase() === "failed" || /Remote Authentication FAILED/i.test(rawMessage)) {
        if (/Invalid user name/i.test(cleanErr)) {
            return {
                status: "FAILED",
                verdict: "INVALID_USER",
                verdictLabel: "Invalid Username (Not in AD/OneSign)",
                errorReason: cleanErr,
            };
        }
        if (/credentials failed/i.test(cleanErr) || /no permission configured/i.test(cleanErr)) {
            return {
                status: "FAILED",
                verdict: "BAD_AD_PASSWORD_OR_POLICY",
                verdictLabel: "Bad AD Password or Missing Policy",
                errorReason: "AD Primary Password Failed (or User Lacks Imprivata Remote Access Policy)",
            };
        }
        return {
            status: "FAILED",
            verdict: "UNKNOWN_FAILURE",
            verdictLabel: "Imprivata Auth Failed",
            errorReason: cleanErr && cleanErr !== "null" ? cleanErr : "Remote Authentication Failed",
        };
    }

    if (challengeInfo.isTimeoutOrError) {
        return {
            status: "FAILED",
            verdict: "MFA_PUSH_TIMEOUT",
            verdictLabel: "AD Password OK → MFA Push Timeout / Denied",
            errorReason: challengeInfo.summaryText,
            mfaMethod: challengeInfo.mfaMethod,
        };
    }

    if (challengeInfo.summaryText) {
        return {
            status: "CHALLENGED",
            verdict: "MFA_CHALLENGED",
            verdictLabel: "AD Password OK → MFA Challenge Sent",
            errorReason: challengeInfo.summaryText,
            mfaMethod: challengeInfo.mfaMethod,
        };
    }

    return {
        status: "SUCCESS",
        verdict: "AUTH_SUCCESS",
        verdictLabel: "Primary Auth Validated",
        errorReason: "Authentication Succeeded",
    };
}

/**
 * Parses raw ssoradius SERVERLOG messages and groups paired [Session.XX] lines
 * (Attempt/Proxy line with NAS Client IP + Response=RadiusRemoteAuthenticateVO line)
 * into unified ImprivataRadiusSession records.
 */
export function parseSsoRadiusMessages(rawGraylogMessages: any[]): ImprivataRadiusSession[] {
    interface RawLine {
        id: string;
        timestamp: string;
        timeMs: number;
        source: string;
        sessionTag: string;
        raw: string;
    }

    const lines: RawLine[] = [];
    for (const item of rawGraylogMessages) {
        const m = item.message || item;
        if (!m || !m.message) continue;
        const raw = String(m.message);
        const sessMatch = raw.match(/\[(Session\.\d+)\]/i);
        const sessionTag = sessMatch ? sessMatch[1] : "Session.0";
        const ts = m.timestamp || new Date().toISOString();
        const timeMs = new Date(ts).getTime();

        lines.push({
            id: m._id || m.gl2_message_id || `${ts}-${Math.random()}`,
            timestamp: ts,
            timeMs: isNaN(timeMs) ? 0 : timeMs,
            source: m.source || "as07a",
            sessionTag,
            raw,
        });
    }

    // Sort chronologically ascending so Request/Proxy lines precede Response lines
    lines.sort((a, b) => a.timeMs - b.timeMs);

    // Track most recent NAS Client IP seen per (source + sessionTag + cleanUsername) and per (source + sessionTag)
    const pendingNasBySessionUser = new Map<string, { nasIp: string; timeMs: number; username: string }>();
    const pendingNasBySession = new Map<string, { nasIp: string; timeMs: number; username: string }>();

    const sessions: ImprivataRadiusSession[] = [];
    const seenOutcomeKeys = new Set<string>();

    for (const line of lines) {
        const { raw, source, sessionTag, timestamp, timeMs, id } = line;

        // 1. Check if this is an incoming Proxy / Attempt line carrying NAS Client IP
        const proxyMatch = raw.match(/Proxy request for Username=([^\s]+)\s+from\s+NAS Client=([0-9.]+)/i);
        const attemptMatch = raw.match(/Attempt Remote Authentication\s*--\s*UserName=([^\s]+).*?Client IPAddress=([0-9.]+)/i);

        if (proxyMatch || attemptMatch) {
            const u = (proxyMatch?.[1] || attemptMatch?.[1] || "").trim();
            const nasIp = (proxyMatch?.[2] || attemptMatch?.[2] || "").trim();
            const cleanU = normalizeImprivataUsername(u);
            if (nasIp) {
                pendingNasBySession.set(`${source}:${sessionTag}`, { nasIp, timeMs, username: u });
                if (cleanU) {
                    pendingNasBySessionUser.set(`${source}:${sessionTag}:${cleanU}`, { nasIp, timeMs, username: u });
                    pendingNasBySessionUser.set(`${source}:*:${cleanU}`, { nasIp, timeMs, username: u });
                }
            }
            continue;
        }

        // 2. Check if this is a RadiusRemoteAuthenticateVO outcome line
        if (!raw.includes("RadiusRemoteAuthenticateVO")) continue;

        const userMatch = raw.match(/UserName:([^\t\r\n]*)/i);
        const statusMatch = raw.match(/Status:([^\t\r\n]*)/i);
        const errMatch = raw.match(/ErrorReason:([^\t\r\n]*)/i);
        const challTextMatch = raw.match(/ChallengeText:([^\t\r\n]*)/i);
        const challResMatch = raw.match(/ChallengeResult:([^\t\r\n]*)/i);

        const rawUser = (userMatch?.[1] || "").trim();
        const cleanUser = normalizeImprivataUsername(rawUser);
        if (!cleanUser) continue;

        const statusField = (statusMatch?.[1] || "").trim();
        const errorReasonField = (errMatch?.[1] || "").trim();
        const challengeTextField = (challTextMatch?.[1] || "").trim();
        const challengeResultField = (challResMatch?.[1] || "").trim();

        // Skip empty intermediate SOAP debug echoes when a SERVERLOG line exists for the same second
        if (statusField === "null" && errorReasonField === "null" && challengeTextField === "null") {
            continue;
        }

        // Deduplicate DEBUGLOG + SERVERLOG pairs emitted in the same millisecond
        const dedupKey = `${source}:${sessionTag}:${cleanUser}:${Math.floor(timeMs / 2000)}:${statusField}:${errorReasonField.slice(0, 32)}`;
        if (seenOutcomeKeys.has(dedupKey)) continue;
        seenOutcomeKeys.add(dedupKey);

        // Look up matching NAS Client IP within ±30 seconds
        let matchedNasIp = "";
        const exactUserSession = pendingNasBySessionUser.get(`${source}:${sessionTag}:${cleanUser}`);
        const anySessionForUser = pendingNasBySessionUser.get(`${source}:*:${cleanUser}`);
        const exactSession = pendingNasBySession.get(`${source}:${sessionTag}`);

        if (exactUserSession && Math.abs(timeMs - exactUserSession.timeMs) <= 30000) {
            matchedNasIp = exactUserSession.nasIp;
        } else if (anySessionForUser && Math.abs(timeMs - anySessionForUser.timeMs) <= 15000) {
            matchedNasIp = anySessionForUser.nasIp;
        } else if (exactSession && Math.abs(timeMs - exactSession.timeMs) <= 5000) {
            matchedNasIp = exactSession.nasIp;
        }

        const nasInfo = resolveNasClient(matchedNasIp);
        const outcome = classifyImprivataOutcome({
            rawMessage: raw,
            statusField,
            errorReasonField,
            challengeTextField,
            challengeResultField,
        });

        sessions.push({
            id,
            timestamp,
            imprivataNode: source,
            sessionTag,
            username: rawUser,
            cleanUsername: cleanUser,
            nasClientIp: nasInfo.ip,
            nasClientName: nasInfo.name,
            nasShortLabel: nasInfo.shortLabel,
            nasCategory: nasInfo.category,
            status: outcome.status,
            verdict: outcome.verdict,
            verdictLabel: outcome.verdictLabel,
            errorReason: outcome.errorReason,
            mfaMethod: outcome.mfaMethod,
            rawMessage: raw,
        });
    }

    // Sort newest first for UI display
    return sessions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Queries OG Graylog Stream 1 (5cb4d070b2090233f76b8852) and Stream 2 (5d0127d2b20902acd15b35d8)
 * for a specific user, and correlates VPN / Citrix external client IPs.
 */
export async function queryImprivataForUser(
    usernames: string[],
    rangeSeconds: number = 86400
): Promise<ImprivataUserCorrelationSummary> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || process.env.OG_GRAYLOG_API_URL || "https://graylog.cooperhealth.edu:9000")
        .replace(/\/api\/?$/, "")
        .replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";

    const emptySummary: ImprivataUserCorrelationSummary = {
        hasImprivataActivity: false,
        isImprivataLockoutCulprit: false,
        totalRadiusAttempts: 0,
        radiusFailures: 0,
        badPasswordCount: 0,
        invalidUserCount: 0,
        mfaTimeoutCount: 0,
        mfaChallengedCount: 0,
        radiusSuccesses: 0,
        essoFailures: 0,
        radiusSessions: [],
        essoEvents: [],
    };

    if (!ogToken || usernames.length === 0) return emptySummary;

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");
    const cleanVariants = Array.from(
        new Set(
            usernames
                .map((u) => normalizeImprivataUsername(u))
                .filter(Boolean)
        )
    );
    if (cleanVariants.length === 0) return emptySummary;

    const userQueryTerms = cleanVariants.map((u) => `"${u}"`).join(" OR ");
    const radiusQuery = `(${userQueryTerms}) AND ("SERVERLOG" OR "RadiusRemoteAuthenticateVO")`;
    const essoQuery = `(${userQueryTerms}) AND "Event Occurrence Notification-Start"`;

    const [radiusRes, essoRes] = await Promise.all([
        axios
            .get(`${ogUrl}/api/search/universal/relative`, {
                httpsAgent,
                params: {
                    query: radiusQuery,
                    range: rangeSeconds.toString(),
                    filter: `streams:${OG_GRAYLOG_IMPRIVATA_RADIUS_STREAM_ID}`,
                    limit: "350",
                    sort: "timestamp:desc",
                },
                headers: {
                    Authorization: authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass",
                },
                timeout: 12000,
            })
            .catch((err) => {
                console.warn("[Imprivata Graylog] RADIUS stream query warning:", err.message);
                return { data: { messages: [] } };
            }),
        axios
            .get(`${ogUrl}/api/search/universal/relative`, {
                httpsAgent,
                params: {
                    query: essoQuery,
                    range: rangeSeconds.toString(),
                    filter: `streams:${OG_GRAYLOG_IMPRIVATA_ESSO_STREAM_ID}`,
                    limit: "100",
                    sort: "timestamp:desc",
                },
                headers: {
                    Authorization: authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass",
                },
                timeout: 10000,
            })
            .catch((err) => {
                console.warn("[Imprivata Graylog] ESSO stream query warning:", err.message);
                return { data: { messages: [] } };
            }),
    ]);

    const radiusSessions = parseSsoRadiusMessages(radiusRes.data?.messages || []);

    // Parse Stream 2 (esso Event Occurrence Notification blocks)
    const essoEvents: ImprivataEssoEvent[] = [];
    for (const item of essoRes.data?.messages || []) {
        const m = item.message || item;
        if (!m || !m.message) continue;
        const raw = String(m.message);
        const evMatch = raw.match(/Event:\s*([^\r\n]+)/i);
        const srvMatch = raw.match(/ServerIP:\s*([^\r\n]+)/i);
        const userMatch = raw.match(/User:\s*([^\r\n]+)/i);
        const hostMatch = raw.match(/Hostname:\s*([^\r\n]+)/i);
        const ipMatch = raw.match(/\bIP:\s*([^\r\n]+)/i);
        const macMatch = raw.match(/MAC:\s*([^\r\n]+)/i);
        const methodMatch = raw.match(/AuthenticationMethod:\s*([^\r\n]+)/i);
        const resMatch = raw.match(/Result:\s*([^\r\n]+)/i);

        const eventType = (evMatch?.[1] || "Imprivata SSO Event").trim();
        const result = (resMatch?.[1] || (eventType.toLowerCase().includes("failure") ? "Failed" : "Successful")).trim();
        const isFailure = /fail|denied|error|reject/i.test(eventType) || /fail|denied|error/i.test(result);

        essoEvents.push({
            id: m._id || m.gl2_message_id || `${m.timestamp}-${Math.random()}`,
            timestamp: m.timestamp || new Date().toISOString(),
            eventType,
            username: (userMatch?.[1] || cleanVariants[0]).trim(),
            serverIp: (srvMatch?.[1] || m.gl2_remote_ip || "").trim(),
            workstationHostname: hostMatch?.[1]?.trim(),
            workstationIp: ipMatch?.[1]?.trim(),
            workstationMac: macMatch?.[1]?.trim(),
            authMethod: methodMatch?.[1]?.trim(),
            result,
            isFailure,
            rawMessage: raw,
        });
    }

    if (radiusSessions.length === 0 && essoEvents.length === 0) {
        return emptySummary;
    }

    // Hop from Imprivata RADIUS sessions to VPN (PostgreSQL VpnEvent) and Citrix NetScaler (Graylog)
    // to resolve the external Public IP, Country, City, and ISP!
    const hasVpnSessions = radiusSessions.some((s) => s.nasCategory === "VPN" || s.nasClientIp === "Unknown");
    const hasCitrixSessions = radiusSessions.some((s) => s.nasCategory === "CITRIX" || s.nasClientIp === "Unknown");

    const sinceDate = new Date(Date.now() - rangeSeconds * 1000 - 3600 * 1000);
    const [vpnEvents, citrixTimeline] = await Promise.all([
        hasVpnSessions
            ? prisma.vpnEvent
                  .findMany({
                      where: {
                          OR: cleanVariants.map((u) => ({
                              username: { contains: u, mode: "insensitive" as const },
                          })),
                          createdAt: { gte: sinceDate },
                      },
                      orderBy: { createdAt: "desc" },
                      take: 100,
                  })
                  .catch(() => [])
            : Promise.resolve([]),
        hasCitrixSessions
            ? new NetscalerGraylogClient()
                  .investigate(cleanVariants[0], rangeSeconds, 150)
                  .catch(() => [])
            : Promise.resolve([]),
    ]);

    // Attach external Client IP to each Imprivata RADIUS session by closest timestamp match (±120s)
    const externalIpsToEnrich = new Set<string>();

    for (const sess of radiusSessions) {
        const sessMs = new Date(sess.timestamp).getTime();

        if (sess.nasCategory === "VPN" || sess.nasClientIp === "Unknown") {
            let bestVpn: any = null;
            let bestDiff = 180000; // 3 minutes max window
            for (const v of vpnEvents) {
                const diff = Math.abs(new Date(v.createdAt).getTime() - sessMs);
                if (diff < bestDiff && v.sourceIp && !isPrivateIp(v.sourceIp)) {
                    bestDiff = diff;
                    bestVpn = v;
                }
            }
            if (bestVpn) {
                sess.externalClientIp = bestVpn.sourceIp;
                sess.externalCountry = bestVpn.ipCountryCode || bestVpn.ipCountry || undefined;
                sess.externalIsp = bestVpn.ipAsName || bestVpn.ipAsn || undefined;
                externalIpsToEnrich.add(bestVpn.sourceIp);
            }
        }

        if (!sess.externalClientIp && (sess.nasCategory === "CITRIX" || sess.nasClientIp === "Unknown")) {
            let bestCtx: any = null;
            let bestDiff = 180000;
            for (const c of citrixTimeline) {
                const diff = Math.abs(new Date(c.timestamp).getTime() - sessMs);
                if (diff < bestDiff && c.clientIp && !isPrivateIp(c.clientIp)) {
                    bestDiff = diff;
                    bestCtx = c;
                }
            }
            if (bestCtx) {
                sess.externalClientIp = bestCtx.clientIp;
                sess.externalCountry = bestCtx.countryCode !== "Unknown" ? bestCtx.countryCode : undefined;
                sess.externalCity = bestCtx.cityName !== "N/A" ? bestCtx.cityName : undefined;
                externalIpsToEnrich.add(bestCtx.clientIp);
            }
        }
    }

    // Fallback: if a user has Citrix or VPN events in the window with a single external IP, backfill on same-gateway sessions
    const fallbackCitrixIp = citrixTimeline.find((c: any) => c.clientIp && !isPrivateIp(c.clientIp))?.clientIp;
    const fallbackVpnIp = vpnEvents.find((v: any) => v.sourceIp && !isPrivateIp(v.sourceIp))?.sourceIp;

    for (const sess of radiusSessions) {
        if (!sess.externalClientIp) {
            if (sess.nasCategory === "CITRIX" && fallbackCitrixIp) {
                sess.externalClientIp = fallbackCitrixIp;
                externalIpsToEnrich.add(fallbackCitrixIp);
            } else if (sess.nasCategory === "VPN" && fallbackVpnIp) {
                sess.externalClientIp = fallbackVpnIp;
                externalIpsToEnrich.add(fallbackVpnIp);
            }
        }
    }

    // Enrich external IPs with IPinfo / IpLookupCache for ISP & Location
    const ipMetaMap = new Map<string, { country: string; city: string; isp: string }>();
    await Promise.all(
        Array.from(externalIpsToEnrich)
            .slice(0, 15)
            .map(async (ip) => {
                try {
                    const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
                    if (cached) {
                        const raw = JSON.parse(cached.rawJson || "{}");
                        ipMetaMap.set(ip, {
                            country: cached.countryCode || raw.country_code || "US",
                            city: cached.city || raw.city || "",
                            isp: raw.company?.name || raw.asn?.name || raw.as_name || raw.org || "",
                        });
                        return;
                    }
                    const lite = await getIpInfoLite(ip);
                    if (lite) {
                        ipMetaMap.set(ip, {
                            country: lite.country_code || lite.country || "Unknown",
                            city: "",
                            isp: lite.as_name ? `${lite.asn || ""} ${lite.as_name}`.trim() : "",
                        });
                    }
                } catch {}
            })
    );

    for (const sess of radiusSessions) {
        if (sess.externalClientIp && ipMetaMap.has(sess.externalClientIp)) {
            const meta = ipMetaMap.get(sess.externalClientIp)!;
            if (!sess.externalCountry && meta.country) sess.externalCountry = meta.country;
            if (!sess.externalCity && meta.city) sess.externalCity = meta.city;
            if (!sess.externalIsp && meta.isp) sess.externalIsp = meta.isp;
        }
    }

    const badPasswordCount = radiusSessions.filter((s) => s.verdict === "BAD_AD_PASSWORD_OR_POLICY").length;
    const invalidUserCount = radiusSessions.filter((s) => s.verdict === "INVALID_USER").length;
    const mfaTimeoutCount = radiusSessions.filter((s) => s.verdict === "MFA_PUSH_TIMEOUT").length;
    const mfaChallengedCount = radiusSessions.filter((s) => s.verdict === "MFA_CHALLENGED").length;
    const radiusFailures = radiusSessions.filter((s) => s.status === "FAILED").length;
    const radiusSuccesses = radiusSessions.filter((s) => s.status === "SUCCESS").length;
    const essoFailures = essoEvents.filter((e) => e.isFailure).length;

    // Identify the primary failed Imprivata session (prioritize BAD_AD_PASSWORD_OR_POLICY which locks out AD)
    const primaryFailedSession =
        radiusSessions.find((s) => s.verdict === "BAD_AD_PASSWORD_OR_POLICY") ||
        radiusSessions.find((s) => s.status === "FAILED") ||
        radiusSessions[0];

    const primaryFailedEsso = essoEvents.find((e) => e.isFailure && e.workstationHostname);

    const isImprivataLockoutCulprit = badPasswordCount > 0 || radiusFailures > 0 || essoFailures > 0;

    let primaryExternalLocation: string | undefined;
    if (primaryFailedSession?.externalCountry) {
        primaryExternalLocation = primaryFailedSession.externalCity
            ? `${primaryFailedSession.externalCity}, ${primaryFailedSession.externalCountry}`
            : primaryFailedSession.externalCountry;
    }

    return {
        hasImprivataActivity: true,
        isImprivataLockoutCulprit,
        primaryImprivataNode: primaryFailedSession?.imprivataNode,
        primaryGatewayName:
            primaryFailedSession?.nasClientName ||
            (primaryFailedEsso?.workstationHostname
                ? `Clinical Workstation (${primaryFailedEsso.workstationHostname})`
                : undefined),
        primaryGatewayIp: primaryFailedSession?.nasClientIp,
        primaryGatewayCategory:
            primaryFailedSession?.nasCategory ||
            (primaryFailedEsso ? "WORKSTATION_ESSO" : undefined),
        primaryVerdict: primaryFailedSession?.verdict,
        primaryVerdictLabel: primaryFailedSession?.verdictLabel,
        primaryExternalIp: primaryFailedSession?.externalClientIp,
        primaryExternalLocation,
        primaryExternalIsp: primaryFailedSession?.externalIsp,
        primaryWorkstationHostname: primaryFailedEsso?.workstationHostname,
        primaryWorkstationIp: primaryFailedEsso?.workstationIp,
        primaryWorkstationMac: primaryFailedEsso?.workstationMac,
        totalRadiusAttempts: radiusSessions.length,
        radiusFailures,
        badPasswordCount,
        invalidUserCount,
        mfaTimeoutCount,
        mfaChallengedCount,
        radiusSuccesses,
        essoFailures,
        radiusSessions: radiusSessions.slice(0, 100),
        essoEvents: essoEvents.slice(0, 50),
    };
}

/**
 * Batch lookup helper for VPN Reporting and Citrix Login Triage:
 * Fetches recent Imprivata ssoradius failures/challenges across a time window
 * (optionally filtered to VPN or CITRIX NAS Client IPs and/or target usernames)
 * and indexes them by cleanUsername so hundreds of VPN or Citrix failure events
 * can be enriched in a single Graylog query!
 */
export async function fetchImprivataBatchIndex(
    rangeSeconds: number = 86400,
    gatewayCategory?: "VPN" | "CITRIX",
    limit: number = 900,
    targetUsernames?: string[]
): Promise<Map<string, ImprivataRadiusSession[]>> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || process.env.OG_GRAYLOG_API_URL || "https://graylog.cooperhealth.edu:9000")
        .replace(/\/api\/?$/, "")
        .replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const map = new Map<string, ImprivataRadiusSession[]>();
    if (!ogToken) return map;

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");

    const cleanTargets = (targetUsernames || [])
        .map((u) => normalizeImprivataUsername(u))
        .filter((u) => u && u !== "unknown" && u !== "n/a");
    const uniqueTargets = Array.from(new Set(cleanTargets)).slice(0, 65);

    const userFilterClause =
        uniqueTargets.length > 0
            ? `(${uniqueTargets.map((u) => `"${u}"`).join(" OR ")}) AND `
            : "";

    const query = `${userFilterClause}"SERVERLOG" AND ("Proxy request for Username=" OR "Attempt Remote Authentication" OR "RadiusRemoteAuthenticateVO")`;

    try {
        const res = await axios.get(`${ogUrl}/api/search/universal/relative`, {
            httpsAgent,
            params: {
                query,
                range: Math.max(300, Math.min(rangeSeconds, 30 * 86400)).toString(),
                filter: `streams:${OG_GRAYLOG_IMPRIVATA_RADIUS_STREAM_ID}`,
                limit: limit.toString(),
                sort: "timestamp:desc",
            },
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass",
            },
            timeout: 15000,
        });

        const sessions = parseSsoRadiusMessages(res.data?.messages || []);
        for (const sess of sessions) {
            if (gatewayCategory && sess.nasCategory !== "OTHER" && sess.nasCategory !== gatewayCategory) {
                continue;
            }
            const key = sess.cleanUsername;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(sess);
        }
    } catch (err: any) {
        console.warn("[Imprivata Graylog] Batch index query warning:", err.message);
    }

    return map;
}

/**
 * Matches a VPN or Citrix event (by username and timestamp) against the pre-fetched Imprivata batch index
 */
export function matchEventToImprivataSession(
    username: string,
    eventTimestamp: string | Date,
    batchIndex: Map<string, ImprivataRadiusSession[]>,
    maxSkewMs: number = 120000,
    preferFailure: boolean = true
): ImprivataRadiusSession | null {
    const cleanU = normalizeImprivataUsername(username);
    if (!cleanU) return null;
    const candidates = batchIndex.get(cleanU);
    if (!candidates || candidates.length === 0) return null;

    const evMs = new Date(eventTimestamp).getTime();
    let best: ImprivataRadiusSession | null = null;
    let bestDiff = maxSkewMs;

    // First pass: if preferFailure is true, look for FAILED or CHALLENGED within maxSkewMs
    if (preferFailure) {
        for (const c of candidates) {
            if (c.status === "SUCCESS") continue;
            const diff = Math.abs(new Date(c.timestamp).getTime() - evMs);
            if (diff <= bestDiff) {
                bestDiff = diff;
                best = c;
            }
        }
    }

    // Second pass: any session within maxSkewMs
    if (!best) {
        bestDiff = maxSkewMs;
        for (const c of candidates) {
            const diff = Math.abs(new Date(c.timestamp).getTime() - evMs);
            if (diff <= bestDiff) {
                bestDiff = diff;
                best = c;
            }
        }
    }

    return best;
}

/**
 * Formats a concise human-readable failure reason string from an ImprivataRadiusSession
 */
export function formatImprivataFailureReason(sess: ImprivataRadiusSession): string {
    switch (sess.verdict) {
        case "BAD_AD_PASSWORD_OR_POLICY":
            return `Imprivata RADIUS: Bad AD Password or Policy Denied (${sess.imprivataNode})`;
        case "MFA_PUSH_TIMEOUT":
            return `Imprivata Confirm ID: MFA Push Timed Out / Not Accepted (AD Password OK)`;
        case "INVALID_USER":
            return `Imprivata RADIUS: Invalid Username "${sess.username}" (Not in AD)`;
        case "MFA_CHALLENGED":
            return `Imprivata Confirm ID: 2FA Challenge Uncompleted (${sess.mfaMethod || "2FA"})`;
        case "AUTH_SUCCESS":
            return `Imprivata Confirm ID: 2FA Verified (${sess.mfaMethod || "Push/Token"})`;
        default:
            return `Imprivata RADIUS: ${sess.verdictLabel}`;
    }
}
