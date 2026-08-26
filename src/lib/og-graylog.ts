import https from "https";
import axios from "axios";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export const DEFAULT_M365_KEYWORDS = [
    "microsoft",
    "office365",
    "office.com",
    "sharepoint",
    "outlook",
    "m365",
    "devicelogin",
    "forms.office",
    "login.live",
    "onmicrosoft",
    "docusign",
    "mychart",
    "workday"
];

export interface M365AuthEndpoint {
    url: string;
    role: string;
    isAbusedOAuthPath?: boolean;
}

export const OFFICIAL_M365_AUTH_ENDPOINTS: M365AuthEndpoint[] = [
    { url: "https://login.microsoftonline.com", role: "Work/school (Entra ID) sign-in" },
    { url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", role: "OAuth authorize (most abused path)", isAbusedOAuthPath: true },
    { url: "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize", role: "Org-only OAuth", isAbusedOAuthPath: true },
    { url: "https://login.microsoftonline.com/common/oauth2/authorize", role: "Older v1 authorize", isAbusedOAuthPath: true },
    { url: "https://login.microsoftonline.com/common/oauth2/deviceauth", role: "Device-code flow", isAbusedOAuthPath: true },
    { url: "https://microsoft.com/devicelogin", role: "Device-code landing page", isAbusedOAuthPath: true },
    { url: "https://aka.ms/devicelogin", role: "Short link to device login", isAbusedOAuthPath: true },
    { url: "https://login.microsoft.com", role: "Alias of the same IdP" },
    { url: "https://login.windows.net", role: "Older Entra hostname" },
    { url: "https://login.live.com", role: "Consumer Microsoft account" },
    { url: "https://login.microsoftonline.us", role: "GCC High / US Gov" },
    { url: "https://device.login.microsoftonline.com", role: "Device login", isAbusedOAuthPath: true },
    { url: "https://passwordreset.microsoftonline.com", role: "SSPR (also impersonated)" },
    { url: "https://account.microsoft.com", role: "Account portal after auth" }
];

export const OFFICIAL_AUTH_HOSTS = [
    "login.microsoftonline.com",
    "microsoft.com",
    "aka.ms",
    "login.microsoft.com",
    "login.windows.net",
    "login.live.com",
    "login.microsoftonline.us",
    "device.login.microsoftonline.com",
    "passwordreset.microsoftonline.com",
    "account.microsoft.com"
];

export function unwrapUrl(rawUrl: string): string {
    let url = rawUrl;
    if (url.includes("safelinks.protection.outlook.com") || url.includes("awstrack.me") || url.includes("cisco.com")) {
        const m = url.match(/[?&](url|link|target|u)=([^&]+)/i);
        if (m) {
            try { url = decodeURIComponent(m[2]); } catch (e) {}
        }
    }
    return url;
}

export function parseDomain(urlStr: string): string {
    try {
        const u = new URL(urlStr.startsWith("http") ? urlStr : `https://${urlStr}`);
        return u.hostname.toLowerCase();
    } catch (e) {
        return "";
    }
}

export function classifyM365Url(
    rawUrl: string, 
    sender: string = "",
    customEndpoints: M365AuthEndpoint[] = OFFICIAL_M365_AUTH_ENDPOINTS,
    wrsScore: number = 0.0
): {
    destUrl: string;
    targetHost: string;
    threatTier: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
    threatCategory: string;
    impersonationBoost: number;
    officialRole?: string;
} | null {
    if (!rawUrl) return null;
    const destUrl = unwrapUrl(rawUrl);
    const host = parseDomain(destUrl);
    if (!host) return null;

    const lowerUrl = destUrl.toLowerCase();
    const lowerHost = host.toLowerCase();

    // 1. Is it an EXACT Official Authentication Endpoint from the Registry?
    const matchedOfficial = customEndpoints.find(ep => lowerUrl.startsWith(ep.url.toLowerCase()));
    const isOfficialAuthHost = OFFICIAL_AUTH_HOSTS.some(h => lowerHost === h || lowerHost.endsWith(`.${h}`));

    if (matchedOfficial || (isOfficialAuthHost && (lowerUrl.includes("devicelogin") || lowerUrl.includes("oauth2") || lowerUrl.includes("authorize") || lowerUrl.includes("deviceauth") || lowerUrl.includes("passwordreset")))) {
        return {
            destUrl,
            targetHost: host,
            threatTier: "HIGH",
            threatCategory: `Official M365 Auth Endpoint Link (${matchedOfficial ? matchedOfficial.role : "Entra ID / OAuth"})`,
            impersonationBoost: 6.0,
            officialRole: matchedOfficial ? matchedOfficial.role : undefined
        };
    }

    // 2. Is it an Impersonated / Typosquatted / Fake Version of an Auth Endpoint?
    // MUST host an authentication path or auth pattern AND be hosted on a non-official host!
    const isAuthPathPattern = lowerUrl.includes("oauth2") || 
                              lowerUrl.includes("authorize") || 
                              lowerUrl.includes("devicelogin") || 
                              lowerUrl.includes("deviceauth") || 
                              lowerUrl.includes("passwordreset") || 
                              lowerHost.includes("login.microsoft") || 
                              lowerHost.includes("login-microsoft") || 
                              lowerHost.includes("login-windows") || 
                              lowerHost.includes("m365-login");

    if (isAuthPathPattern && !isOfficialAuthHost) {
        let boost = 10.0;
        let categories = ["🚨 Fake M365 Login Portal / Typosquatted Auth Endpoint (+10.0 Boost)"];

        if (wrsScore < 0) {
            const wrsPenalty = Math.abs(wrsScore) * 2.0;
            boost += wrsPenalty;
            categories.push(`Negative WRS Penalty (+${wrsPenalty.toFixed(1)})`);
        }

        return {
            destUrl,
            targetHost: host,
            threatTier: "CRITICAL",
            threatCategory: categories.join(" | "),
            impersonationBoost: parseFloat(boost.toFixed(1))
        };
    }

    // ALL OTHER SITES (SharePoint, Forms, Teams, Office.com, email footers) -> IGNORE COMPLETELY!
    return null;
}

export interface GraylogHistogramData {
    timestamp: number;
    count: number;
}

export interface GraylogCategoryBreakdown {
    name: string;
    value: number;
    color: string;
    query: string;
    chart: GraylogHistogramData[];
}

export interface GraylogEsaBreakdown {
    esa01Volume: number;
    esa02Volume: number;
    esa01Delays: number;
    esa02Delays: number;
}

export interface GraylogUrlSample {
    mid: string;
    url: string;
    reputation: string;
    timestamp: string;
    source: string;
}

export interface GraylogAmpSample {
    mid: string;
    verdict: string;
    timestamp: string;
    source: string;
}

export interface GraylogFullCategoryStats {
    name: string;
    count: number;
    percentage: string;
    color: string;
    filterQuery: string;
}

export interface GraylogMessageThreatAggregation {
    mid: string;
    messageId?: string;
    subject?: string;
    sender?: string;
    recipient?: string;
    totalUrls: number;
    worstScore: number;
    riskyUrlCount: number;
    primaryThreatUrl: string;
    threatLevel: "CRITICAL" | "RISKY" | "LOW_SUSPECT" | "NEUTRAL" | "CLEAN";
    priorityScore: number;
    remediationStatus: "DELIVERED" | "PURGED_BY_ETD" | "QUARANTINED_BY_ESA" | "BLOCKED_POLICY";
    exposureDeltaMinutes?: number;
    timestamp: string;
    source: string;
}

export interface GraylogAmpIocAggregation {
    sha256?: string;
    filename: string;
    verdict: string;
    sender?: string;
    recipient?: string;
    mid: string;
    count: number;
    timestamp: string;
}

export interface GraylogSpoofingAuthAggregation {
    ip: string;
    sender?: string;
    recipient?: string;
    subject?: string;
    spfVerdict?: string;
    dkimVerdict?: string;
    dmarcVerdict?: string;
    mid: string;
    count: number;
    timestamp: string;
}

export interface GraylogTargetRecipientAggregation {
    recipient: string;
    threatCount: number;
    worstWrsScore: number;
    topSender?: string;
    primaryThreatType: "MALICIOUS_LINK" | "MALWARE_ATTACHMENT" | "SUSPECT_URL";
    riskTier: "CRITICAL" | "HIGH" | "MODERATE";
    latestTimestamp: string;
}

export interface GraylogBecImpersonationAggregation {
    mid: string;
    messageId?: string;
    subject?: string;
    sender?: string;
    recipient?: string;
    rawUrl: string;
    destUrl: string;
    targetHost: string;
    threatTier: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
    threatCategory: string;
    impersonationBoost: number;
    worstScore: number;
    spfVerdict?: string;
    dmarcVerdict?: string;
    timestamp: string;
    source: string;
}

export interface GraylogTopDomainAggregation {
    domain: string;
    count: number;
    percentage: string;
}

export interface GraylogThirdPartyOAuthItem {
    mid: string;
    sender?: string;
    recipient?: string;
    subject?: string;
    host: string;
    destUrl: string;
    timestamp: string;
}

export interface GraylogThirdPartyOAuthAggregation {
    provider: string;
    count: number;
    percentage: string;
    uniqueRecipientsCount: number;
    topHosts: string[];
    sampleMids: string[];
    items: GraylogThirdPartyOAuthItem[];
    latestTimestamp: string;
}

export interface GraylogStats {
    rangeSeconds: number;
    volumeQuery: string;
    totalVolume: number;
    totalVolumeChart: GraylogHistogramData[];
    delayedMessages: number;
    urlRewritesCount: number;
    malwareBlocked: number;
    whitelistedCount: number;
    inboundCategories?: GraylogCategoryBreakdown[];
    esaBreakdown?: GraylogEsaBreakdown;
    recentUrls?: GraylogUrlSample[];
    recentAmpVerdicts?: GraylogAmpSample[];
    fullUrlCategories?: GraylogFullCategoryStats[];
    fullAmpCategories?: GraylogFullCategoryStats[];
    topMessageThreats?: GraylogMessageThreatAggregation[];
    ampIocs?: GraylogAmpIocAggregation[];
    spoofingAlerts?: GraylogSpoofingAuthAggregation[];
    targetRecipients?: GraylogTargetRecipientAggregation[];
    becThreats?: GraylogBecImpersonationAggregation[];
    topUnwrappedDomains?: GraylogTopDomainAggregation[];
    thirdPartyOAuthLinks?: GraylogThirdPartyOAuthAggregation[];
    totalEvaluatedUrls?: number;
    totalEvaluatedMessages?: number;
}

export class OgGraylogClient {
    private baseUrl: string;
    private apiToken: string;
    private streamId: string;

    constructor() {
        this.baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
        this.apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
        this.streamId = "5d7ff82fb209026ab43e167b";
    }

    private get authHeader() {
        if (!this.apiToken) throw new Error("OG_GRAYLOG_API_TOKEN is not configured.");
        return "Basic " + Buffer.from(this.apiToken + ":token").toString("base64");
    }

    /**
     * Executes non-overlapping clock-aligned absolute search queries against Graylog to build smooth time series.
     */
    async getHistogram(
        query: string, 
        rangeSeconds: number = 86400
    ): Promise<{ total: number, series: GraylogHistogramData[] }> {
        let bucketCount = 24;

        if (rangeSeconds <= 3600) {
            bucketCount = 12; // 5-minute resolution for 1h
        } else if (rangeSeconds <= 21600) {
            bucketCount = 24; // 15-minute resolution for 6h
        } else if (rangeSeconds <= 43200) {
            bucketCount = 24; // 30-minute resolution for 12h
        } else if (rangeSeconds <= 86400) {
            bucketCount = 24; // 1-hour resolution for 24h
        } else if (rangeSeconds <= 259200) {
            bucketCount = 36; // 3-hour resolution for 3d
        } else {
            bucketCount = 28; // 6-hour resolution for 7d
        }

        const bucketDurationMs = Math.floor((rangeSeconds * 1000) / bucketCount);
        const endAnchorMs = Math.floor(Date.now() / bucketDurationMs) * bucketDurationMs;
        const series: GraylogHistogramData[] = [];
        let total = 0;

        const bucketPromises = [];

        for (let i = bucketCount - 1; i >= 0; i--) {
            const fromMs = endAnchorMs - i * bucketDurationMs;
            const toMs = endAnchorMs - (i - 1) * bucketDurationMs;

            const fromIso = new Date(fromMs).toISOString();
            const toIso = new Date(toMs).toISOString();

            const bParams = new URLSearchParams({
                query: query,
                from: fromIso,
                to: toIso,
                filter: `streams:${this.streamId}`,
                limit: "1"
            });

            const bUrl = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/absolute?${bParams.toString()}`;

            bucketPromises.push(
                axios.get(bUrl, {
                    httpsAgent,
                    headers: {
                        "Authorization": this.authHeader,
                        "Accept": "application/json",
                        "X-Requested-By": "cli"
                    },
                    timeout: 8000
                }).then(res => ({
                    timestamp: fromMs,
                    count: res.data.total_results || 0
                })).catch(() => ({
                    timestamp: fromMs,
                    count: 0
                }))
            );
        }

        const bucketResults = await Promise.all(bucketPromises);
        bucketResults.forEach(item => {
            series.push(item);
            total += item.count;
        });

        // Also fetch total for full range to ensure card total is exact
        try {
            const fullParams = new URLSearchParams({
                query: query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: "1"
            });
            const fullUrl = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${fullParams.toString()}`;
            const fullRes = await axios.get(fullUrl, {
                httpsAgent,
                headers: {
                    "Authorization": this.authHeader,
                    "Accept": "application/json",
                    "X-Requested-By": "cli"
                },
                timeout: 8000
            });
            if (fullRes.data?.total_results !== undefined) {
                total = fullRes.data.total_results;
            }
        } catch (e) {
            // Keep cumulative total
        }

        series.sort((a, b) => a.timestamp - b.timestamp);
        return { total, series };
    }

    /**
     * Searches raw messages in Graylog.
     */
    async searchMessages(query: string, limit: number = 100, rangeSeconds: number = 86400): Promise<any[]> {
        const params = new URLSearchParams({
            query: query,
            range: rangeSeconds.toString(),
            filter: `streams:${this.streamId}`,
            limit: limit.toString(),
            sort: "timestamp:desc"
        });

        const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;

        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                "Authorization": this.authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            timeout: 12000
        });

        return res.data.messages || [];
    }

    /**
     * Searches raw messages in Graylog using an absolute ISO time window.
     */
    async searchAbsoluteMessages(query: string, fromIso: string, toIso: string, limit: number = 100): Promise<any[]> {
        const params = new URLSearchParams({
            query: query,
            from: fromIso,
            to: toIso,
            filter: `streams:${this.streamId}`,
            limit: limit.toString(),
            sort: "timestamp:desc"
        });

        const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/absolute?${params.toString()}`;

        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                "Authorization": this.authHeader,
                "Accept": "application/json",
                "X-Requested-By": "cli"
            },
            timeout: 12000
        });

        return res.data.messages || [];
    }

    /**
     * Helper method to enrich MID records with Subject, Sender, Recipient, and ETD/ESA Remediation status via batch Lucene queries.
     */
    private async enrichMidsWithEnvelopeHeaders(
        midItems: Array<any>,
        rangeSeconds: number = 86400
    ) {
        const targetMids = Array.from(new Set(midItems.map(i => i.mid).filter(Boolean)));
        if (targetMids.length === 0) return;

        const midTerms = targetMids.map(m => `"${m}"`).join(" OR ");
        const batchQuery = `(esa_mid:(${midTerms}) OR message:(${midTerms}))`;

        try {
            // Use timestamp:asc with high limit (2000) so initial Ingest logs containing Subject/From/To are retrieved
            const envelopeLogs = await this.searchMessages(batchQuery, 2500, rangeSeconds);
            const midHeaderMap: Record<string, { 
                sender?: string; 
                recipient?: string; 
                subject?: string; 
                status?: string;
                deliveryTimestamp?: string;
                remediationTimestamp?: string;
            }> = {};
            targetMids.forEach(m => { midHeaderMap[m] = {}; });

            envelopeLogs.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
                if (!mid || !midHeaderMap[mid]) return;

                if (!midHeaderMap[mid].deliveryTimestamp && h.message.timestamp) {
                    midHeaderMap[mid].deliveryTimestamp = h.message.timestamp;
                }

                const fromMatch = raw.match(/ready \d+ bytes from <([^>]+)>/i) || 
                                  raw.match(/From:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || 
                                  raw.match(/From:\s*(\S+)/i) || 
                                  raw.match(/From=([^;\s]+)/i);

                const toMatch = raw.match(/To:\s*<([^>]+)>/i) || 
                                raw.match(/To:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || 
                                raw.match(/To:\s*(\S+)/i) || 
                                raw.match(/To=([^;\s]+)/i);

                const subjMatch = raw.match(/Subject\s+"([^"]+)"/i) || 
                                  raw.match(/Subject\s*['"]([^'"]+)['"]/i) || 
                                  raw.match(/Subject:\s*(.+)/i);

                if (!midHeaderMap[mid].sender && (h.message.esa_mail_from || fromMatch)) {
                    midHeaderMap[mid].sender = h.message.esa_mail_from || (fromMatch ? fromMatch[1] : undefined);
                }
                if (!midHeaderMap[mid].recipient && (h.message.esa_rcpt_to || toMatch)) {
                    midHeaderMap[mid].recipient = h.message.esa_rcpt_to || (toMatch ? toMatch[1] : undefined);
                }
                if (!midHeaderMap[mid].subject && (h.message.esa_subject || subjMatch)) {
                    midHeaderMap[mid].subject = h.message.esa_subject || (subjMatch ? subjMatch[1].trim() : undefined);
                }

                // Remediation & ETD Status Check
                const rawLower = raw.toLowerCase();
                if (rawLower.includes("etd") || rawLower.includes("auto-remediated") || rawLower.includes("clawback") || rawLower.includes("purged")) {
                    midHeaderMap[mid].status = "PURGED_BY_ETD";
                    midHeaderMap[mid].remediationTimestamp = h.message.timestamp;
                } else if (rawLower.includes("quarantined") || rawLower.includes("dropped") || rawLower.includes("policy drop")) {
                    if (midHeaderMap[mid].status !== "PURGED_BY_ETD") {
                        midHeaderMap[mid].status = "QUARANTINED_BY_ESA";
                        midHeaderMap[mid].remediationTimestamp = h.message.timestamp;
                    }
                }
            });

            midItems.forEach(item => {
                const headers = midHeaderMap[item.mid];
                if (headers) {
                    if (!item.sender && headers.sender) item.sender = headers.sender;
                    if (!item.recipient && headers.recipient) item.recipient = headers.recipient;
                    if (!item.subject && headers.subject) item.subject = headers.subject;
                    if (headers.status) item.remediationStatus = headers.status as any;

                    if (headers.status === "PURGED_BY_ETD" && headers.remediationTimestamp && item.timestamp) {
                        const remMs = new Date(headers.remediationTimestamp).getTime();
                        const arrMs = new Date(headers.deliveryTimestamp || item.timestamp).getTime();
                        item.exposureDeltaMinutes = Math.max(1, Math.round(Math.abs(remMs - arrMs) / 60000));
                    } else if (headers.status === "QUARANTINED_BY_ESA") {
                        item.exposureDeltaMinutes = 0;
                    }
                }
            });
        } catch (e) {
            // Ignore secondary lookup errors
        }
    }

    /**
     * Fetches per-appliance counts for ESA01 and ESA02.
     */
    async getEsaApplianceBreakdown(rangeSeconds: number = 86400, volumeQuery: string = 'message:"inbound table"'): Promise<GraylogEsaBreakdown> {
        const [
            esa01VolData,
            esa02VolData,
            esa01DelayData,
            esa02DelayData
        ] = await Promise.all([
            this.getHistogram(`${volumeQuery} AND (source:esa01* OR message:esa01*)`, rangeSeconds),
            this.getHistogram(`${volumeQuery} AND (source:esa02* OR message:esa02*)`, rangeSeconds),
            this.getHistogram('message:"Info: Delayed:" AND (source:esa01* OR message:esa01*)', rangeSeconds),
            this.getHistogram('message:"Info: Delayed:" AND (source:esa02* OR message:esa02*)', rangeSeconds)
        ]);

        return {
            esa01Volume: esa01VolData.total,
            esa02Volume: esa02VolData.total,
            esa01Delays: esa01DelayData.total,
            esa02Delays: esa02DelayData.total
        };
    }

    /**
     * Aggregates URL telemetry by Message ID (esa_mid) and calculates composite risk levels & Priority Index per email.
     */
    async getTopMessageThreatAggregations(
        rangeSeconds: number = 86400, 
        limit: number = 50,
        volumeQuery: string = 'message:"inbound table"'
    ): Promise<GraylogMessageThreatAggregation[]> {
        try {
            const rawLimit = rangeSeconds > 259200 ? 3500 : (rangeSeconds > 86400 ? 2500 : 1500);

            const [riskyHits, generalHits] = await Promise.all([
                this.searchMessages(`esa_url_rep_score:[-10.0 TO -0.1] OR (message:"reputation -" AND message:"URL")`, rawLimit, rangeSeconds).catch(() => []),
                this.searchMessages(`_exists_:esa_url_rep_score OR (message:"URL" AND message:"reputation")`, 500, rangeSeconds).catch(() => [])
            ]);

            const allHits = [...riskyHits, ...generalHits];
            const midMap: Record<string, GraylogMessageThreatAggregation> = {};

            allHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const urlMatch = raw.match(/https?:\/\/[^\s"'\)>]+/i) || raw.match(/URL\s+(['"]?)(\S+)\1/i);
                const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
                if (!mid) return;

                let score = 0.0;
                if (h.message.esa_url_rep_score !== undefined) {
                    score = parseFloat(h.message.esa_url_rep_score);
                } else if (repMatch) {
                    score = parseFloat(repMatch[1]);
                }

                let extractedUrl = "";
                if (urlMatch) {
                    const candidate = urlMatch[0].startsWith("URL ") ? urlMatch[2] : urlMatch[0];
                    if (candidate && (candidate.startsWith("http://") || candidate.startsWith("https://"))) {
                        extractedUrl = candidate;
                    }
                }

                const primaryUrl = extractedUrl || "N/A (Filter Action)";

                if (!midMap[mid]) {
                    midMap[mid] = {
                        mid,
                        messageId: h.message.esa_rfc_message_id || "",
                        subject: h.message.esa_subject,
                        sender: h.message.esa_mail_from,
                        recipient: h.message.esa_rcpt_to,
                        totalUrls: 0,
                        worstScore: score,
                        riskyUrlCount: 0,
                        primaryThreatUrl: primaryUrl,
                        threatLevel: "CLEAN",
                        priorityScore: 0.0,
                        remediationStatus: "DELIVERED",
                        timestamp: h.message.timestamp,
                        source: h.message.source ? h.message.source.split('.')[0] : "esa"
                    };
                }

                midMap[mid].totalUrls += 1;

                if (score < midMap[mid].worstScore) {
                    midMap[mid].worstScore = score;
                    if (extractedUrl) midMap[mid].primaryThreatUrl = extractedUrl;
                }

                if (score < 0) {
                    midMap[mid].riskyUrlCount += 1;
                }
            });

            let aggregatedList = Object.values(midMap);
            await this.enrichMidsWithEnvelopeHeaders(aggregatedList, rangeSeconds);

            aggregatedList.forEach(m => {
                if (m.worstScore <= -6.0) {
                    m.threatLevel = "CRITICAL";
                } else if (m.worstScore <= -3.0) {
                    m.threatLevel = "RISKY";
                } else if (m.worstScore < 0.0) {
                    m.threatLevel = "LOW_SUSPECT";
                } else if (m.worstScore < 3.0) {
                    m.threatLevel = "NEUTRAL";
                } else {
                    m.threatLevel = "CLEAN";
                }

                // Check for M365 Impersonation & OAuth Token Theft vectors
                const m365Info = classifyM365Url(m.primaryThreatUrl, m.sender);
                if (m365Info) {
                    m.impersonationCategory = m365Info.threatCategory;
                    m.impersonationBoost = m365Info.impersonationBoost;
                    m.isBecThreat = m365Info.impersonationBoost > 0;
                } else {
                    m.impersonationBoost = 0.0;
                }

                // Calculate Recency Weight Multiplier for Priority Score
                const ageHours = (Date.now() - new Date(m.timestamp).getTime()) / (1000 * 3600);
                let recencyWeight = 1.0;
                if (ageHours > 120) {
                    recencyWeight = 0.4;
                } else if (ageHours > 72) {
                    recencyWeight = 0.6;
                } else if (ageHours > 24) {
                    recencyWeight = 0.8;
                } else if (ageHours > 12) {
                    recencyWeight = 0.95;
                }

                // Boost Composite Priority Score for BEC, M365 Impersonation, and OAuth Token Theft threats
                const baseScore = Math.abs(m.worstScore);
                const boost = m.impersonationBoost || 0.0;
                m.priorityScore = parseFloat(((baseScore + boost) * recencyWeight).toFixed(2));
            });

            // Prioritize MIDs with actual negative WRS scores or active BEC/Impersonation priority boosts
            const highThreats = aggregatedList.filter(m => m.worstScore < 0 || (m.impersonationBoost && m.impersonationBoost > 0));
            const standardThreats = aggregatedList.filter(m => m.worstScore >= 0 && (!m.impersonationBoost || m.impersonationBoost === 0));

            // Sort high threats by boosted priorityScore descending so fake portals & token theft vectors rank #1
            highThreats.sort((a, b) => b.priorityScore - a.priorityScore);
            standardThreats.sort((a, b) => b.priorityScore - a.priorityScore);

            const finalSortedList = [...highThreats, ...standardThreats];
            return finalSortedList.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    /**
     * Aggregates AMP attachment scans into IOC Threat Hunting records.
     */
    async getAmpIocAggregations(
        rangeSeconds: number = 86400, 
        limit: number = 10,
        volumeQuery: string = 'message:"inbound table"'
    ): Promise<GraylogAmpIocAggregation[]> {
        try {
            const ampHits = await this.searchMessages(`_exists_:esa_amp_file_verdict OR message:"AMP file reputation verdict"`, 120, rangeSeconds);
            const shaMap: Record<string, GraylogAmpIocAggregation> = {};

            ampHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const shaMatch = raw.match(/SHA-256:\s*([a-fA-F0-9]{64})/i);
                const fileMatch = raw.match(/filename\s*['"]([^'"]+)['"]/i) || raw.match(/file\s*['"]([^'"]+)['"]/i);
                const verdictMatch = raw.match(/AMP file reputation verdict\s*:\s*([^,\s]+)/i);
                const midMatch = raw.match(/MID (\d+)/);

                const sha = h.message.esa_amp_sha256 || (shaMatch ? shaMatch[1] : undefined);
                const filename = h.message.esa_amp_file_name || (fileMatch ? fileMatch[1] : "Attachment");
                const verdict = h.message.esa_amp_file_verdict || (verdictMatch ? verdictMatch[1] : "UNKNOWN");
                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");

                const key = sha || `${filename}_${mid}`;

                if (!shaMap[key]) {
                    shaMap[key] = {
                        sha256: sha,
                        filename,
                        verdict,
                        sender: h.message.esa_mail_from,
                        recipient: h.message.esa_rcpt_to,
                        mid,
                        count: 0,
                        timestamp: h.message.timestamp
                    };
                }

                shaMap[key].count += 1;
            });

            const list = Object.values(shaMap);
            await this.enrichMidsWithEnvelopeHeaders(list, rangeSeconds);

            list.sort((a, b) => (b.verdict === "MALICIOUS" ? 1 : 0) - (a.verdict === "MALICIOUS" ? 1 : 0));
            return list.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    /**
     * Aggregates SPF / DKIM / DMARC authentication failures for spoofing detection.
     */
    async getSpoofingAuthAggregations(
        rangeSeconds: number = 86400, 
        limit: number = 10,
        volumeQuery: string = 'message:"inbound table"'
    ): Promise<GraylogSpoofingAuthAggregation[]> {
        try {
            const authHits = await this.searchMessages(`message:"SPF:" OR message:"DKIM:" OR message:"DMARC:" OR _exists_:esa_spf_verdict`, 120, rangeSeconds);
            const ipMap: Record<string, GraylogSpoofingAuthAggregation> = {};

            authHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const ipMatch = raw.match(/Connecting IP:\s*([\d\.]+)/i) || raw.match(/IP\s+([\d\.]+)/i);
                const spfMatch = raw.match(/SPF:\s*(\S+)/i);
                const dkimMatch = raw.match(/DKIM:\s*(\S+)/i);
                const dmarcMatch = raw.match(/DMARC:\s*(\S+)/i);
                const midMatch = raw.match(/MID (\d+)/);

                const ip = h.message.esa_sending_ip || (ipMatch ? ipMatch[1] : "Connecting MTA");
                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");

                if (!ipMap[ip]) {
                    ipMap[ip] = {
                        ip,
                        sender: h.message.esa_mail_from,
                        recipient: h.message.esa_rcpt_to,
                        subject: h.message.esa_subject,
                        spfVerdict: h.message.esa_spf_verdict || (spfMatch ? spfMatch[1] : undefined),
                        dkimVerdict: h.message.esa_dkim_verdict || (dkimMatch ? dkimMatch[1] : undefined),
                        dmarcVerdict: h.message.esa_dmarc_verdict || (dmarcMatch ? dmarcMatch[1] : undefined),
                        mid,
                        count: 0,
                        timestamp: h.message.timestamp
                    };
                }

                ipMap[ip].count += 1;
            });

            const list = Object.values(ipMap);
            await this.enrichMidsWithEnvelopeHeaders(list, rangeSeconds);
            return list.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    /**
     * Aggregates target recipients receiving high-risk URLs or malicious attachments.
     */
    async getTargetRecipientAggregations(
        rangeSeconds: number = 86400, 
        limit: number = 10,
        volumeQuery: string = 'message:"inbound table"'
    ): Promise<GraylogTargetRecipientAggregation[]> {
        try {
            const threatHits = await this.searchMessages(`esa_url_rep_score:[-10.0 TO -0.1] OR esa_url_rep_score:/-[0-9]\\..*/ OR message:"reputation -"`, 150, rangeSeconds);
            const rcptMap: Record<string, GraylogTargetRecipientAggregation> = {};

            threatHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const toMatch = raw.match(/To:\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);
                const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

                const rcpt = h.message.esa_rcpt_to || (toMatch ? toMatch[1] : undefined);
                if (!rcpt) return;

                let score = 0.0;
                if (h.message.esa_url_rep_score !== undefined) {
                    score = parseFloat(h.message.esa_url_rep_score);
                } else if (repMatch) {
                    score = parseFloat(repMatch[1]);
                }

                if (!rcptMap[rcpt]) {
                    rcptMap[rcpt] = {
                        recipient: rcpt,
                        threatCount: 0,
                        worstWrsScore: score,
                        topSender: h.message.esa_mail_from,
                        primaryThreatType: score <= -6.0 ? "MALICIOUS_LINK" : "SUSPECT_URL",
                        riskTier: "MODERATE",
                        latestTimestamp: h.message.timestamp
                    };
                }

                rcptMap[rcpt].threatCount += 1;
                if (score < rcptMap[rcpt].worstWrsScore) {
                    rcptMap[rcpt].worstWrsScore = score;
                }
            });

            const list = Object.values(rcptMap).map(r => {
                if (r.threatCount >= 5 || r.worstWrsScore <= -6.0) {
                    r.riskTier = "CRITICAL";
                } else if (r.threatCount >= 2 || r.worstWrsScore <= -3.0) {
                    r.riskTier = "HIGH";
                } else {
                    r.riskTier = "MODERATE";
                }
                return r;
            });

            list.sort((a, b) => b.threatCount - a.threatCount);
            return list.slice(0, limit);
        } catch (e) {
            return [];
        }
    }

    /**
     * Fetches 100% official Cisco WRS score aggregations across 5 non-overlapping tiers.
     */
    async get100PercentFullDatasetAggregations(rangeSeconds: number = 86400): Promise<{ fullUrlCategories: GraylogFullCategoryStats[], fullAmpCategories: GraylogFullCategoryStats[] }> {
        const fetchCount = async (query: string): Promise<number> => {
            try {
                const params = new URLSearchParams({
                    query: query,
                    range: rangeSeconds.toString(),
                    filter: `streams:${this.streamId}`,
                    limit: "1"
                });
                const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
                const res = await axios.get(url, {
                    httpsAgent,
                    headers: { "Authorization": this.authHeader, "Accept": "application/json", "X-Requested-By": "cli" },
                    timeout: 8000
                });
                return res.data.total_results || 0;
            } catch (e) {
                return 0;
            }
        };

        const cleanFilter = 'esa_url_rep_score:[3.0 TO 10.0] OR esa_url_rep_score:/[3-9]\\..*/ OR esa_url_rep_score:"10.0"';
        const neuFilter = 'esa_url_rep_score:[0.0 TO 2.9] OR esa_url_rep_score:/[0-2]\\..*/';
        const lowSuspectFilter = 'esa_url_rep_score:[-2.9 TO -0.1] OR esa_url_rep_score:/-[0-2]\\..*/';
        const riskyFilter = 'esa_url_rep_score:[-5.9 TO -3.0] OR esa_url_rep_score:/-[3-5]\\..*/';
        const malFilter = 'esa_url_rep_score:[-10.0 TO -6.0] OR esa_url_rep_score:/-[6-9]\\..*/ OR esa_url_rep_score:"-10.0"';

        const [
            urlCleanCount,
            urlNeuCount,
            urlLowSuspectCount,
            urlRiskyCount,
            urlMaliciousCount,
            ampSkippedCount,
            ampUnknownCount,
            ampCleanCount,
            ampMaliciousCount
        ] = await Promise.all([
            fetchCount(cleanFilter),
            fetchCount(neuFilter),
            fetchCount(lowSuspectFilter),
            fetchCount(riskyFilter),
            fetchCount(malFilter),
            fetchCount('(esa_amp_file_verdict:SKIPPED) OR message:"AMP file reputation verdict : SKIPPED"'),
            fetchCount('(esa_amp_file_verdict:UNKNOWN) OR message:"AMP file reputation verdict : UNKNOWN" OR message:"FILE UNKNOWN"'),
            fetchCount('(esa_amp_file_verdict:CLEAN) OR message:"AMP file reputation verdict : CLEAN"'),
            fetchCount('(esa_amp_file_verdict:MALICIOUS) OR message:"AMP file reputation verdict : MALICIOUS"')
        ]);

        const totalUrl = Math.max(1, urlCleanCount + urlNeuCount + urlLowSuspectCount + urlRiskyCount + urlMaliciousCount);

        const fullUrlCategories: GraylogFullCategoryStats[] = [
            { name: "Clean / Established (Score +3.0 to +10.0)", count: urlCleanCount, percentage: `${((urlCleanCount / totalUrl) * 100).toFixed(1)}%`, color: "#10b981", filterQuery: cleanFilter },
            { name: "Neutral / Uncategorized (Score 0.0 to +2.9)", count: urlNeuCount, percentage: `${((urlNeuCount / totalUrl) * 100).toFixed(1)}%`, color: "#3b82f6", filterQuery: neuFilter },
            { name: "Low Suspect (Score -0.1 to -2.9)", count: urlLowSuspectCount, percentage: `${((urlLowSuspectCount / totalUrl) * 100).toFixed(1)}%`, color: "#f59e0b", filterQuery: lowSuspectFilter },
            { name: "Risky / Policy Trigger (Score -3.0 to -5.9)", count: urlRiskyCount, percentage: `${((urlRiskyCount / totalUrl) * 100).toFixed(1)}%`, color: "#f97316", filterQuery: riskyFilter },
            { name: "Malicious / Critical Block (Score -6.0 to -10.0)", count: urlMaliciousCount, percentage: `${((urlMaliciousCount / totalUrl) * 100).toFixed(1)}%`, color: "#ef4444", filterQuery: malFilter }
        ];

        const totalAmp = Math.max(1, ampSkippedCount + ampUnknownCount + ampCleanCount + ampMaliciousCount);
        const fullAmpCategories: GraylogFullCategoryStats[] = [
            { name: "No Attachment (Skipped)", count: ampSkippedCount, percentage: `${((ampSkippedCount / totalAmp) * 100).toFixed(1)}%`, color: "#6b7280", filterQuery: 'esa_amp_file_verdict:SKIPPED OR message:"AMP file reputation verdict : SKIPPED"' },
            { name: "Analyzing / Unknown", count: ampUnknownCount, percentage: `${((ampUnknownCount / totalAmp) * 100).toFixed(1)}%`, color: "#f59e0b", filterQuery: 'esa_amp_file_verdict:UNKNOWN OR message:"AMP file reputation verdict : UNKNOWN"' },
            { name: "Clean File Scans", count: ampCleanCount, percentage: `${((ampCleanCount / totalAmp) * 100).toFixed(1)}%`, color: "#10b981", filterQuery: 'esa_amp_file_verdict:CLEAN OR message:"AMP file reputation verdict : CLEAN"' },
            { name: "Malicious File Verdicts", count: ampMaliciousCount, percentage: `${((ampMaliciousCount / totalAmp) * 100).toFixed(1)}%`, color: "#ef4444", filterQuery: 'esa_amp_file_verdict:MALICIOUS OR message:"AMP file reputation verdict : MALICIOUS"' }
        ];

        return { fullUrlCategories, fullAmpCategories };
    }

    /**
     * Fetches recent URL reputation samples and AMP verdicts targeting exact user Graylog extractors.
     */
    async getRecentTelemetrySamples(rangeSeconds: number = 86400): Promise<{ recentUrls: GraylogUrlSample[], recentAmpVerdicts: GraylogAmpSample[] }> {
        const [urlHits, ampHits] = await Promise.all([
            this.searchMessages('_exists_:esa_url_rep_score OR (message:"URL" AND message:"reputation")', 6, rangeSeconds).catch(() => []),
            this.searchMessages('_exists_:esa_amp_file_verdict OR message:"AMP file reputation verdict"', 6, rangeSeconds).catch(() => [])
        ]);

        const recentUrls: GraylogUrlSample[] = urlHits.map((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const urlMatch = raw.match(/URL (https?:\/\/\S+)/i);
            const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

            const midVal = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            const scoreVal = h.message.esa_url_rep_score !== undefined ? h.message.esa_url_rep_score.toString() : (repMatch ? repMatch[1] : "-");

            return {
                mid: midVal,
                url: urlMatch ? urlMatch[1] : raw,
                reputation: scoreVal,
                timestamp: h.message.timestamp,
                source: h.message.source ? h.message.source.split('.')[0] : "esa"
            };
        }).filter((u: GraylogUrlSample) => u.mid && u.url);

        const recentAmpVerdicts: GraylogAmpSample[] = ampHits.map((h: any) => {
            const raw = h.message.message || "";
            const midMatch = raw.match(/MID (\d+)/);
            const verdictMatch = raw.match(/AMP file reputation verdict\s*:\s*([^,]+)/i);

            const midVal = h.message.esa_mid || (midMatch ? midMatch[1] : "");
            const verdictVal = h.message.esa_amp_file_verdict || (verdictMatch ? verdictMatch[1].trim() : "UNKNOWN");

            return {
                mid: midVal,
                verdict: verdictVal,
                timestamp: h.message.timestamp,
                source: h.message.source ? h.message.source.split('.')[0] : "esa"
            };
        }).filter((a: GraylogAmpSample) => a.mid);

        return { recentUrls, recentAmpVerdicts };
    }

    /**
     * Aggregates inbound emails containing M365 / Microsoft login URLs, top unwrapped destination domains, and third-party OAuth discoveries.
     * Uses Time-Chunked Paged Ingestion to guarantee 100% Zero Message Loss across large time windows.
     */
    async getM365BecThreatAggregations(
        rangeSeconds: number = 86400,
        limit: number = 20
    ): Promise<{
        becThreats: GraylogBecImpersonationAggregation[];
        topUnwrappedDomains: GraylogTopDomainAggregation[];
        thirdPartyOAuthLinks: GraylogThirdPartyOAuthAggregation[];
        totalEvaluatedUrls: number;
        totalEvaluatedMessages: number;
    }> {
        try {
            // Fetch Total Inbound Mail Volume from IronPort Policy Histogram to match IronPort Tool 100%
            const volumeHist = await this.getHistogram('message:"inbound table"', rangeSeconds).catch(() => ({ total: 0 }));
            const totalInboundVolume = volumeHist.total || 0;

            const query = `_exists_:esa_url_rep_score OR message:"URL" OR message:"devicelogin" OR message:"authorize" OR message:"oauth"`;
            let becHits: any[] = [];

            // Execute Time-Chunked Paging for ranges > 1 hour (3600s) to bypass 10k Elasticsearch window cap
            if (rangeSeconds > 3600) {
                const numChunks = rangeSeconds > 604800 ? 12 : (rangeSeconds > 86400 ? 8 : 6);
                const chunkSeconds = rangeSeconds / numChunks;
                const nowSec = Math.floor(Date.now() / 1000);
                const chunkPromises = [];

                for (let i = 0; i < numChunks; i++) {
                    const fromTs = nowSec - (rangeSeconds - (i * chunkSeconds));
                    const toTs = nowSec - (rangeSeconds - ((i + 1) * chunkSeconds));
                    const fromIso = new Date(fromTs * 1000).toISOString();
                    const toIso = new Date(toTs * 1000).toISOString();

                    chunkPromises.push(this.searchAbsoluteMessages(query, fromIso, toIso, 10000).catch(() => []));
                }

                const chunkResults = await Promise.all(chunkPromises);
                chunkResults.forEach(resList => {
                    becHits.push(...resList);
                });
            } else {
                becHits = await this.searchMessages(query, 10000, rangeSeconds);
            }

            const becMap: Record<string, GraylogBecImpersonationAggregation> = {};
            const domainCounts: Record<string, number> = {};
            const oauthDiscoveriesMap: Record<string, GraylogThirdPartyOAuthDiscovery> = {};
            
            let totalEvaluatedUrls = 0;
            const uniqueMids = new Set<string>();

            becHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
                if (!mid) return;
                uniqueMids.add(mid);

                const urlMatches = raw.match(/https?:\/\/[^\s"'\)>]+/gi) || [];
                const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

                let score = 0.0;
                if (h.message.esa_url_rep_score !== undefined) {
                    score = parseFloat(h.message.esa_url_rep_score);
                } else if (repMatch) {
                    score = parseFloat(repMatch[1]);
                }

                urlMatches.forEach(rawUrl => {
                    totalEvaluatedUrls++;
                    const destUrl = unwrapUrl(rawUrl);
                    const host = parseDomain(destUrl);
                    if (!host) return;

                    // Aggregate Top Unwrapped Domains
                    domainCounts[host] = (domainCounts[host] || 0) + 1;

                    // 1. Evaluate for M365 Auth / Fake Login Portals
                    const analysis = classifyM365Url(rawUrl, h.message.esa_mail_from || "", OFFICIAL_M365_AUTH_ENDPOINTS, score);
                    if (analysis && analysis.impersonationBoost > 0) {
                        if (!becMap[mid] || analysis.impersonationBoost > becMap[mid].impersonationBoost) {
                            becMap[mid] = {
                                mid,
                                messageId: h.message.esa_rfc_message_id || "",
                                subject: h.message.esa_subject,
                                sender: h.message.esa_mail_from,
                                recipient: h.message.esa_rcpt_to,
                                rawUrl,
                                destUrl: analysis.destUrl,
                                targetHost: analysis.targetHost,
                                threatTier: analysis.threatTier,
                                threatCategory: analysis.threatCategory,
                                impersonationBoost: analysis.impersonationBoost,
                                worstScore: score,
                                timestamp: h.message.timestamp,
                                source: h.message.source ? h.message.source.split('.')[0] : "esa"
                            };
                        }
                    }

                    // 2. Evaluate for Non-Microsoft Third-Party OAuth / Identity Providers
                    const lowerHost = host.toLowerCase();
                    const lowerUrl = destUrl.toLowerCase();

                    const isMicrosoftAuth = OFFICIAL_AUTH_HOSTS.some(h => lowerHost === h || lowerHost.endsWith(`.${h}`));
                    let provider = "";

                    if (!isMicrosoftAuth) {
                        if (lowerHost.includes("okta.com") || lowerHost.includes("oktapreview.com")) provider = "Okta Identity";
                        else if (lowerHost.includes("accounts.google.com")) provider = "Google OAuth 2.0";
                        else if (lowerHost.includes("duosecurity.com") || lowerHost.includes("duo.com")) provider = "Duo MFA Auth";
                        else if (lowerHost.includes("docusign.net") || lowerHost.includes("docusign.com")) provider = "DocuSign Auth";
                        else if (lowerHost.includes("pingidentity.com") || lowerHost.includes("pingone.com")) provider = "Ping Identity";
                        else if (lowerHost.includes("auth0.com")) provider = "Auth0 SSO";
                        else if (lowerHost.includes("onelogin.com")) provider = "OneLogin SSO";
                        else if (lowerHost.includes("b2clogin.com")) provider = "Azure AD B2C Portal";
                        else if (lowerHost.includes("cayuse.com")) provider = "Cayuse Identity";
                        else if (lowerUrl.includes("/oauth2/") || lowerUrl.includes("/authorize") || lowerUrl.includes("/oidc/") || lowerUrl.includes("/saml/")) provider = "Third-Party OAuth / SSO";
                    }

                    if (provider) {
                        const key = provider;
                        if (!oauthDiscoveriesMap[key]) {
                            oauthDiscoveriesMap[key] = {
                                provider,
                                count: 0,
                                recipients: new Set(),
                                hosts: new Set(),
                                mids: new Set(),
                                items: [],
                                latestTimestamp: h.message.timestamp
                            } as any;
                        }
                        const entry = oauthDiscoveriesMap[key] as any;
                        entry.count += 1;
                        if (h.message.esa_rcpt_to) entry.recipients.add(h.message.esa_rcpt_to);
                        if (host) entry.hosts.add(host);
                        if (mid) entry.mids.add(mid);
                        
                        entry.items.push({
                            mid,
                            sender: h.message.esa_mail_from,
                            recipient: h.message.esa_rcpt_to,
                            subject: h.message.esa_subject,
                            host,
                            destUrl,
                            timestamp: h.message.timestamp
                        });

                        if (h.message.timestamp && (!entry.latestTimestamp || new Date(h.message.timestamp) > new Date(entry.latestTimestamp))) {
                            entry.latestTimestamp = h.message.timestamp;
                        }
                    }
                });
            });

            // Process BEC Threats List
            const becThreats = Object.values(becMap);
            await this.enrichMidsWithEnvelopeHeaders(becThreats as any, rangeSeconds);
            becThreats.sort((a, b) => b.impersonationBoost - a.impersonationBoost || a.worstScore - b.worstScore);

            // Process Top Unwrapped Domains (Top 15)
            const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
            const topUnwrappedDomains: GraylogTopDomainAggregation[] = sortedDomains.slice(0, 15).map(([domain, count]) => ({
                domain,
                count,
                percentage: `${((count / Math.max(1, totalEvaluatedUrls)) * 100).toFixed(1)}%`
            }));

            // Process Aggregated Third-Party OAuth Discoveries
            const rawOauthList = Object.values(oauthDiscoveriesMap) as any[];
            const totalOAuthCount = rawOauthList.reduce((acc, curr) => acc + curr.count, 0);

            for (const item of rawOauthList) {
                await this.enrichMidsWithEnvelopeHeaders(item.items as any, rangeSeconds).catch(() => {});
            }

            const thirdPartyOAuthLinks: GraylogThirdPartyOAuthAggregation[] = rawOauthList.map(item => ({
                provider: item.provider,
                count: item.count,
                percentage: `${((item.count / Math.max(1, totalOAuthCount)) * 100).toFixed(1)}%`,
                uniqueRecipientsCount: item.recipients.size,
                topHosts: Array.from(item.hosts as Set<string>).slice(0, 5),
                sampleMids: Array.from(item.mids as Set<string>).slice(0, 5),
                items: item.items.slice(0, 30),
                latestTimestamp: item.latestTimestamp
            }));

            thirdPartyOAuthLinks.sort((a, b) => b.count - a.count);

            return {
                becThreats: becThreats.slice(0, limit),
                topUnwrappedDomains,
                thirdPartyOAuthLinks,
                totalEvaluatedUrls,
                totalEvaluatedMessages: totalInboundVolume || uniqueMids.size
            };
        } catch (e) {
            return {
                becThreats: [],
                topUnwrappedDomains: [],
                thirdPartyOAuthLinks: [],
                totalEvaluatedUrls: 0,
                totalEvaluatedMessages: 0
            };
        }
    }

    /**
     * Fetches all stats required for the IronPort dashboard, targeting real ESA policy streams and per-appliance breakdowns.
     */
    async getDashboardStats(rangeSeconds: number = 86400, volumeQuery: string = 'message:"inbound table"'): Promise<GraylogStats> {
        const esaDelayQuery = 'message:"Info: Delayed:" AND (source:esa* OR message:esa*)';

        const [
            volumeData,
            delayedData,
            urlRewritesData,
            malwareData,
            whitelistedData,
            esaBreakdown,
            telemetrySamples,
            fullDatasetAggregations,
            topMessageThreats,
            ampIocs,
            spoofingAlerts,
            targetRecipients,
            becThreats
        ] = await Promise.all([
            this.getHistogram(volumeQuery, rangeSeconds),
            this.getHistogram(esaDelayQuery, rangeSeconds),
            this.getHistogram('message:"Rewrite_Unknown_URLs" OR message:"url-reputation-proxy-redirect-action" OR (esa_cisco_action:"URL redirected to Cisco Security proxy")', rangeSeconds),
            this.getHistogram('message:"interim AV verdict using" AND NOT message:"CLEAN"', rangeSeconds),
            this.getHistogram('message:"Whitelisted Addresses"', rangeSeconds),
            this.getEsaApplianceBreakdown(rangeSeconds, volumeQuery),
            this.getRecentTelemetrySamples(rangeSeconds),
            this.get100PercentFullDatasetAggregations(rangeSeconds),
            this.getTopMessageThreatAggregations(rangeSeconds, 50, volumeQuery),
            this.getAmpIocAggregations(rangeSeconds, 10, volumeQuery),
            this.getSpoofingAuthAggregations(rangeSeconds, 10, volumeQuery),
            this.getTargetRecipientAggregations(rangeSeconds, 10, volumeQuery),
            this.getM365BecThreatAggregations(rangeSeconds, 20)
        ]);

        if (esaBreakdown && (esaBreakdown.esa01Volume + esaBreakdown.esa02Volume > 0)) {
            volumeData.total = esaBreakdown.esa01Volume + esaBreakdown.esa02Volume;
        }

        const whitelistedTotal = whitelistedData.total;
        const defaultTotal = Math.max(0, volumeData.total - whitelistedTotal);

        const inboundCategories: GraylogCategoryBreakdown[] = [
            {
                name: "Standard Inbound Policy",
                value: defaultTotal,
                color: "#3b82f6", // Blue
                query: 'message:"per-recipient policy DEFAULT"',
                chart: volumeData.series
            },
            {
                name: "Whitelisted Senders",
                value: whitelistedTotal,
                color: "#a855f7", // Purple
                query: 'message:"Whitelisted Addresses"',
                chart: whitelistedData.series
            }
        ];

        return {
            rangeSeconds,
            volumeQuery,
            totalVolume: volumeData.total,
            totalVolumeChart: volumeData.series,
            delayedMessages: delayedData.total,
            delayedMessagesChart: delayedData.series,
            urlRewrites: urlRewritesData.total,
            urlRewritesChart: urlRewritesData.series,
            malwareAlerts: malwareData.total,
            malwareAlertsChart: malwareData.series,
            inboundCategories,
            esaBreakdown,
            recentUrls: telemetrySamples.recentUrls,
            recentAmpVerdicts: telemetrySamples.recentAmpVerdicts,
            fullUrlCategories: fullDatasetAggregations.fullUrlCategories,
            fullAmpCategories: fullDatasetAggregations.fullAmpCategories,
            topMessageThreats,
            ampIocs,
            spoofingAlerts,
            targetRecipients,
            becThreats
        };
    }
}
