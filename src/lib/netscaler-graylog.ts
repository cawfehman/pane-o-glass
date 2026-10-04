import https from "https";
import axios from "axios";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export interface NetscalerHistogramData {
    timestamp: number;
    count: number;
}

export interface NetscalerGeoFailureLocation {
    name: string;
    count: number;
}

export interface NetscalerAggressiveIp {
    ip: string;
    countryCode: string;
    cityName: string;
    totalHits: number;
    failureCount: number;
    failureRate: number;
}

export interface NetscalerTargetedUser {
    username: string;
    totalHits: number;
    failureCount: number;
    topOrigins: string[];
}

export interface NetscalerGeoEvent {
    timestamp: string;
    sourceIp: string;
    countryCode: string;
    cityName: string;
    vserverIp?: string;
    vserverPort?: string;
    username?: string;
    message: string;
    facility?: string;
    level?: number;
    isFailure?: boolean;
}

export type NetscalerForeignEvent = NetscalerGeoEvent;

export interface NetscalerTimelineEvent {
    id: string;
    timestamp: string;
    eventType: "AUTH_SUCCESS" | "AUTH_FAILURE" | "HTTP_REQUEST" | "ICA_SESSION" | "CONN_TERMINATE" | "ADMIN_CMD" | "OTHER";
    username?: string;
    clientIp?: string;
    clientPort?: string;
    countryCode?: string;
    cityName?: string;
    sessionId?: string;
    deviceSerial?: string;
    action?: string;
    httpMethod?: string;
    httpPath?: string;
    target?: string;
    rawMessage: string;
}

export interface NetscalerIocRule {
    id: string;
    name: string;
    description: string;
    severity: "CRITICAL" | "HIGH" | "MEDIUM";
    query: string;
    category: "CITRIX_BLEED" | "RCE_WEBSHELL" | "NITRO_API" | "DTLS_CRASH" | "SESSION_HIJACK" | "ADMIN_PRIV" | "CUSTOM";
    cve?: string;
}

export interface NetscalerMatchedIp {
    ip: string;
    count: number;
    countryCode?: string;
    cityName?: string;
    firstSeen?: string;
    lastSeen?: string;
    sampleMessage?: string;
}

export interface NetscalerIocFinding {
    rule: NetscalerIocRule;
    matchCount: number;
    matchedExternalIps: NetscalerMatchedIp[];
    sampleEvents: {
        timestamp: string;
        sourceIp?: string;
        username?: string;
        httpMethod?: string;
        httpPath?: string;
        message: string;
        countryCode?: string;
    }[];
}

export const DEFAULT_CITRIX_IOC_RULES: NetscalerIocRule[] = [
    {
        id: "cve-2026-88771-pitboss",
        name: "CISA Sigma: NetScaler Pitboss Crash & Anomaly (CVE-2026-88771)",
        description: "Detects abnormal Pitboss supervisor crashes and NSPPE deaths triggered by pre-auth command injection (CISA KEV / ByteRay SIGMA rule).",
        severity: "CRITICAL",
        category: "RCE_WEBSHELL",
        cve: "CVE-2026-88771",
        query: 'message:"pitboss" AND (message:"missed too many heartbeats" OR message:"unexpectedly died" OR message:"exited on signal" OR message:"signal 11" OR message:"signal 6" OR message:"abnormal exit" OR message:"ns_monuploadd_err.pl")'
    },
    {
        id: "cve-2026-88771-cmd-injection",
        name: "CISA Sigma: NetScaler Command Injection & Shell Evasion (CVE-2026-88771)",
        description: "Monitors for shell metacharacters, evasion techniques (${IFS}, base64, b64decode, INDEX:), and unexpected script execution attempting to exploit CVE-2026-88771.",
        severity: "CRITICAL",
        category: "RCE_WEBSHELL",
        cve: "CVE-2026-88771",
        query: 'message:"${IFS}" OR message:"b64decode" OR message:"INDEX:" OR (message:"base64" AND (message:"decode" OR message:"-d")) OR message:"ns_monuploadd_err.pl" OR (message:"pitboss" AND (message:"/bin/sh" OR message:"/bin/bash"))'
    },
    {
        id: "cve-2026-88772-dtls-overflow",
        name: "CISA Sigma: NetScaler DTLS Memory Overflow & Crash (CVE-2026-88772)",
        description: "Detects packet processing engine memory faults, segmentation faults, and core dumps triggered by DTLS datagram overflows on VPN virtual servers.",
        severity: "CRITICAL",
        category: "DTLS_CRASH",
        cve: "CVE-2026-88772",
        query: '(message:"DTLS" OR message:"dtls") AND (message:"crash" OR message:"overflow" OR message:"Segmentation fault" OR message:"core dumped" OR message:"failed to decrypt" OR message:"record length") OR (message:"NSPPE crash" AND (message:"DTLS" OR message:"dtls"))'
    },
    {
        id: "cve-2026-88771-whipshot-slapshot",
        name: "Citrix Post-Exploit Implants: WHIPSHOT & SLAPSHOT (CVE-2026-88771/72)",
        description: "Hunts for post-exploitation backdoors observed in CVE-2026-88771/72 intrusions, including WHIPSHOT PHP webshells and SLAPSHOT Python network tunnelers.",
        severity: "CRITICAL",
        category: "RCE_WEBSHELL",
        cve: "CVE-2026-88771",
        query: '(message:".php" AND (message:"/vpn/" OR message:"/ns_gui/" OR message:"/epa/" OR message:"WHIPSHOT" OR message:"eval(" OR message:"base64_decode")) OR (message:"SLAPSHOT" OR (message:"python" AND (message:"socket" OR message:"connect") AND message:"/var/vpn/")) OR (message:"httpd.conf" AND message:"AddType application/x-httpd-php")'
    },
    {
        id: "cve-2023-4966-bleed",
        name: "Citrix Bleed Sensitive Memory Leak (CVE-2023-4966)",
        description: "Checks for unauthenticated OpenID endpoint access used to bleed session tokens from NetScaler memory.",
        severity: "CRITICAL",
        category: "CITRIX_BLEED",
        cve: "CVE-2023-4966",
        query: 'ns_http_path:"*oauth/idp*" OR message:"/oauth/idp/.well-known/openid-configuration" OR message:"oauth/idp/oauth/token"'
    },
    {
        id: "cve-2023-3519-rce",
        name: "Citrix Unauthenticated RCE & Webshell Probes (CVE-2023-3519)",
        description: "Detects path traversal and unauthorized script execution targeting NetScaler gateway paths.",
        severity: "CRITICAL",
        category: "RCE_WEBSHELL",
        cve: "CVE-2023-3519",
        query: 'ns_http_path:"*gwtest*" OR ns_http_path:"*.php*" OR ns_http_path:"*..*" OR message:"/gwtest/formssso" OR message:"flApp.xml" OR (message:"/vpn/" AND (message:".php" OR message:".."))'
    },
    {
        id: "cve-2023-6548-nitro",
        name: "NITRO Management API Exploitation (CVE-2023-6548)",
        description: "Monitors for external access targeting the NITRO administrative configuration API.",
        severity: "HIGH",
        category: "NITRO_API",
        cve: "CVE-2023-6548",
        query: 'ns_http_path:"*nitro*" OR message:"/nitro/v1/config/"'
    },
    {
        id: "external-admin-cmd",
        name: "Untrusted / External Admin Command Execution",
        description: "Flags administrative CLI and API commands executed from external or unexpected IPs.",
        severity: "HIGH",
        category: "ADMIN_PRIV",
        query: '(message:"CMD_EXECUTED" OR message:"API CMD_EXECUTED") AND ((_exists_:ns_remote_ip AND NOT (ns_remote_ip:172.16.* OR ns_remote_ip:172.17.* OR ns_remote_ip:172.18.* OR ns_remote_ip:10.* OR ns_remote_ip:192.168.* OR ns_remote_ip:127.0.0.1)) OR (_exists_:src_ip AND NOT (src_ip:172.16.* OR src_ip:172.17.* OR src_ip:172.18.* OR src_ip:10.* OR src_ip:192.168.* OR src_ip:127.0.0.1)))'
    }
];

export interface NetscalerStats {
    rangeSeconds: number;
    totalVolume: number;
    totalVolumeChart: NetscalerHistogramData[];
    authVolume: number;
    authSuccessCount: number;
    authFailureCount: number;
    icaSessionCount: number;
    geoTrafficCount: number;
    usTrafficCount: number;
    foreignTrafficCount: number;
    topCountries: { country: string; count: number }[];
    topUsCities: { city: string; count: number }[];
    topForeignCountries: { country: string; count: number }[];
    topUsers: { username: string; count: number }[];
    topFailureForeignCountries: NetscalerGeoFailureLocation[];
    topFailureUsCities: NetscalerGeoFailureLocation[];
    topAggressiveIps: NetscalerAggressiveIp[];
    topTargetedUsers: NetscalerTargetedUser[];
    recentGeoEvents: NetscalerGeoEvent[];
    recentForeignEvents: NetscalerForeignEvent[];
}

export class NetscalerGraylogClient {
    private baseUrl: string;
    private apiToken: string;
    private streamId: string;

    constructor() {
        this.baseUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
        this.apiToken = process.env.OG_GRAYLOG_API_TOKEN || "";
        this.streamId = "5c055e3ab20902046cedcfcd";
    }

    private get authHeader() {
        if (!this.apiToken) throw new Error("OG_GRAYLOG_API_TOKEN is not configured.");
        return "Basic " + Buffer.from(this.apiToken + ":token").toString("base64");
    }

    /**
     * Executes non-overlapping clock-aligned absolute search queries to construct a smooth time series.
     */
    async getHistogram(
        query: string,
        rangeSeconds: number = 86400
    ): Promise<{ total: number; series: NetscalerHistogramData[] }> {
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
            bucketCount = 36; // 2-hour resolution for 3d
        } else {
            bucketCount = 28; // 6-hour resolution for 7d
        }

        const bucketDurationMs = Math.floor((rangeSeconds * 1000) / bucketCount);
        const endAnchorMs = Math.floor(Date.now() / bucketDurationMs) * bucketDurationMs;
        const series: NetscalerHistogramData[] = [];
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
                        Authorization: this.authHeader,
                        Accept: "application/json",
                        "X-Requested-By": "pane-o-glass"
                    },
                    timeout: 10000
                }).then(res => ({
                    timestamp: fromMs,
                    count: res.data.total_results || 0
                })).catch(err => {
                    console.warn(`[NetScaler Graylog] Histogram bucket error for ${fromIso}:`, err.message);
                    return { timestamp: fromMs, count: 0 };
                })
            );
        }

        const results = await Promise.all(bucketPromises);
        results.forEach(b => {
            series.push(b);
            total += b.count;
        });

        return { total, series };
    }

    /**
     * Retrieves overall NetScaler telemetry overview statistics.
     */
    async getOverviewStats(rangeSeconds: number = 86400): Promise<NetscalerStats> {
        // Query counts in parallel
        const countQueries = [
            { key: "total", q: "*" },
            { key: "auth", q: "SSLVPN OR AAA" },
            { key: "authSuccess", q: 'SSLVPN AND ("response-200" OR "LOGIN")' },
            { key: "authFailure", q: 'SSLVPN AND (FAILURE OR FAILED OR INVALID OR DENIED OR "type 5")' },
            { key: "ica", q: "ICA OR HDX" },
            { key: "foreign", q: "NOT src_ip_country_code:US AND _exists_:src_ip_country_code" }
        ];

        const [
            histogramRes,
            authRes,
            authSuccessRes,
            authFailureRes,
            icaRes,
            usRes,
            foreignRes,
            geoEventsRes,
            failureEventsRes,
            topUsersRes
        ] = await Promise.all([
            this.getHistogram("*", rangeSeconds),
            this.queryCount("SSLVPN OR AAA", rangeSeconds),
            this.queryCount('SSLVPN AND ("response-200" OR "LOGIN")', rangeSeconds),
            this.queryCount('SSLVPN AND (FAILURE OR FAILED OR INVALID OR DENIED OR "type 5")', rangeSeconds),
            this.queryCount("ICA OR HDX", rangeSeconds),
            this.queryCount("src_ip_country_code:US", rangeSeconds),
            this.queryCount("NOT src_ip_country_code:US AND _exists_:src_ip_country_code", rangeSeconds),
            this.getRecentGeoEvents(rangeSeconds, 250, "all"),
            this.getRecentFailureEvents(rangeSeconds, 250),
            this.getTopUsers(rangeSeconds, 10)
        ]);

        // Aggregate top countries, foreign countries, and US cities
        const countryMap: Record<string, number> = {};
        const foreignCountryMap: Record<string, number> = {};
        const usCityMap: Record<string, number> = {};

        geoEventsRes.forEach(ev => {
            if (ev.countryCode) {
                countryMap[ev.countryCode] = (countryMap[ev.countryCode] || 0) + 1;
                if (ev.countryCode !== "US") {
                    foreignCountryMap[ev.countryCode] = (foreignCountryMap[ev.countryCode] || 0) + 1;
                } else if (ev.cityName && ev.cityName !== "N/A") {
                    usCityMap[ev.cityName] = (usCityMap[ev.cityName] || 0) + 1;
                }
            }
        });

        const topCountries = Object.entries(countryMap)
            .map(([country, count]) => ({ country, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topForeignCountries = Object.entries(foreignCountryMap)
            .map(([country, count]) => ({ country, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topUsCities = Object.entries(usCityMap)
            .map(([city, count]) => ({ city, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // TOP 10 OPTION A TELEMETRY:
        // Combined pool of events for Failures, Aggressive IPs, and Targeted Users
        const combinedEvents = [...geoEventsRes, ...failureEventsRes];
        const failForeignMap: Record<string, number> = {};
        const failUsCityMap: Record<string, number> = {};
        const ipStatsMap: Record<string, { countryCode: string; cityName: string; totalHits: number; failureCount: number }> = {};
        const userTargetMap: Record<string, { totalHits: number; failureCount: number; origins: Set<string> }> = {};
        const seenEvents = new Set<string>();

        combinedEvents.forEach(ev => {
            const eventKey = `${ev.timestamp}-${ev.sourceIp}-${(ev.message || "").substring(0, 35)}`;
            const isFirst = !seenEvents.has(eventKey);
            seenEvents.add(eventKey);

            const isFail = ev.isFailure || /(?:FAILURE|FAILED|INVALID|DENIED|type 5)/i.test(ev.message);

            // Failure locations
            if (isFail && isFirst) {
                if (ev.countryCode && ev.countryCode !== "US" && ev.countryCode !== "Unknown") {
                    failForeignMap[ev.countryCode] = (failForeignMap[ev.countryCode] || 0) + 1;
                } else if (ev.countryCode === "US" && ev.cityName && ev.cityName !== "N/A") {
                    failUsCityMap[ev.cityName] = (failUsCityMap[ev.cityName] || 0) + 1;
                }
            }

            // Aggressive IPs
            if (ev.sourceIp) {
                if (!ipStatsMap[ev.sourceIp]) {
                    ipStatsMap[ev.sourceIp] = {
                        countryCode: ev.countryCode || "Unknown",
                        cityName: ev.cityName || "N/A",
                        totalHits: 0,
                        failureCount: 0
                    };
                }
                if (isFirst) {
                    ipStatsMap[ev.sourceIp].totalHits += 1;
                    if (isFail) {
                        ipStatsMap[ev.sourceIp].failureCount += 1;
                    }
                }
                if (ev.countryCode && ev.countryCode !== "Unknown") {
                    ipStatsMap[ev.sourceIp].countryCode = ev.countryCode;
                }
                if (ev.cityName && ev.cityName !== "N/A") {
                    ipStatsMap[ev.sourceIp].cityName = ev.cityName;
                }
            }

            // Targeted Users
            const u = ev.username;
            if (u && u !== "anonymous" && u.length > 1) {
                if (!userTargetMap[u]) {
                    userTargetMap[u] = {
                        totalHits: 0,
                        failureCount: 0,
                        origins: new Set<string>()
                    };
                }
                if (isFirst) {
                    userTargetMap[u].totalHits += 1;
                    if (isFail) {
                        userTargetMap[u].failureCount += 1;
                    }
                }
                const originLabel = ev.countryCode === "US"
                    ? (ev.cityName && ev.cityName !== "N/A" ? `${ev.cityName}, US` : "US")
                    : (ev.countryCode || "Unknown");
                if (originLabel !== "Unknown") {
                    userTargetMap[u].origins.add(originLabel);
                }
            }
        });

        const topFailureForeignCountries = Object.entries(failForeignMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topFailureUsCities = Object.entries(failUsCityMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const topAggressiveIps = Object.entries(ipStatsMap)
            .map(([ip, data]) => ({
                ip,
                countryCode: data.countryCode,
                cityName: data.cityName,
                totalHits: data.totalHits,
                failureCount: data.failureCount,
                failureRate: data.totalHits > 0 ? Math.round((data.failureCount / data.totalHits) * 100) : 0
            }))
            .sort((a, b) => {
                if (b.failureCount !== a.failureCount) {
                    return b.failureCount - a.failureCount;
                }
                return b.totalHits - a.totalHits;
            })
            .slice(0, 10);

        const topTargetedUsers = Object.entries(userTargetMap)
            .map(([username, data]) => ({
                username,
                totalHits: data.totalHits,
                failureCount: data.failureCount,
                topOrigins: Array.from(data.origins).slice(0, 3)
            }))
            .sort((a, b) => {
                if (b.failureCount !== a.failureCount) {
                    return b.failureCount - a.failureCount;
                }
                return b.totalHits - a.totalHits;
            })
            .slice(0, 10);

        const foreignEventsOnly = geoEventsRes.filter(ev => ev.countryCode !== "US");

        return {
            rangeSeconds,
            totalVolume: histogramRes.total,
            totalVolumeChart: histogramRes.series,
            authVolume: authRes,
            authSuccessCount: authSuccessRes,
            authFailureCount: authFailureRes,
            icaSessionCount: icaRes,
            geoTrafficCount: usRes + foreignRes,
            usTrafficCount: usRes,
            foreignTrafficCount: foreignRes,
            topCountries,
            topUsCities,
            topForeignCountries,
            topUsers: topUsersRes,
            topFailureForeignCountries,
            topFailureUsCities,
            topAggressiveIps,
            topTargetedUsers,
            recentGeoEvents: geoEventsRes.slice(0, 100),
            recentForeignEvents: foreignEventsOnly.slice(0, 50)
        };
    }

    /**
     * Quick query count helper using limit=1
     */
    async queryCount(query: string, rangeSeconds: number = 86400): Promise<number> {
        try {
            const params = new URLSearchParams({
                query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: "1"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 10000
            });
            return res.data.total_results || 0;
        } catch (err: any) {
            console.error(`[NetScaler Graylog] Count query failed for "${query}":`, err.message);
            return 0;
        }
    }

    /**
     * Retrieves top active Citrix users from extracted ns_username field.
     */
    async getTopUsers(rangeSeconds: number = 86400, limit: number = 10): Promise<{ username: string; count: number }[]> {
        try {
            const params = new URLSearchParams({
                query: "_exists_:ns_username",
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: "300",
                fields: "ns_username"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 10000
            });
            const counts: Record<string, number> = {};
            (res.data.messages || []).forEach((m: any) => {
                const u = m.message.ns_username;
                if (u && u !== "anonymous") {
                    counts[u] = (counts[u] || 0) + 1;
                }
            });
            return Object.entries(counts)
                .map(([username, count]) => ({ username, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);
        } catch (err: any) {
            console.error("[NetScaler Graylog] getTopUsers error:", err.message);
            return [];
        }
    }

    /**
     * Retrieves recent authentication failure events.
     */
    async getRecentFailureEvents(rangeSeconds: number = 86400, limit: number = 250): Promise<NetscalerGeoEvent[]> {
        const query = 'SSLVPN AND (FAILURE OR FAILED OR INVALID OR DENIED OR "type 5")';
        try {
            const params = new URLSearchParams({
                query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: limit.toString(),
                fields: "src_ip,ns_remote_ip,src_ip_country_code,src_ip_city_name,vserver_ip,vserver_port,ns_username,ns_action,ns_event_type,message,facility,level,timestamp",
                sort: "timestamp:desc"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 15000
            });

            return (res.data.messages || []).map((m: any) => {
                const msg = m.message;
                const raw = msg.message || "";
                let sourceIp = msg.ns_remote_ip || msg.src_ip || "";
                if (!sourceIp) {
                    const ipMatch = raw.match(/(?:Remote_ip|Remote ip\s*=|clientip|Source)\s*[:=]?\s*([0-9\.]+)/i);
                    if (ipMatch) sourceIp = ipMatch[1];
                }

                let username = msg.ns_username || "";
                if (!username) {
                    const userMatch = raw.match(/(?:Username\s*=\s*|\buser\s+|Context\s+)([a-zA-Z0-9_\-\.@]+)/i);
                    if (userMatch) username = userMatch[1].trim();
                }

                return {
                    timestamp: msg.timestamp,
                    sourceIp,
                    countryCode: msg.src_ip_country_code || "Unknown",
                    cityName: msg.src_ip_city_name || "N/A",
                    vserverIp: msg.vserver_ip || "",
                    vserverPort: msg.vserver_port || "",
                    username,
                    message: raw,
                    facility: msg.facility,
                    level: msg.level,
                    isFailure: true
                };
            });
        } catch (err: any) {
            console.error("[NetScaler Graylog] getRecentFailureEvents error:", err.message);
            return [];
        }
    }

    /**
     * Retrieves recent geo-enriched connection events (US, foreign, or all).
     */
    async getRecentGeoEvents(
        rangeSeconds: number = 86400,
        limit: number = 100,
        filter: "all" | "foreign" | "us" = "all"
    ): Promise<NetscalerGeoEvent[]> {
        let query = "_exists_:src_ip_country_code";
        if (filter === "foreign") {
            query = "NOT src_ip_country_code:US AND _exists_:src_ip_country_code";
        } else if (filter === "us") {
            query = "src_ip_country_code:US";
        }

        try {
            const params = new URLSearchParams({
                query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: limit.toString(),
                fields: "src_ip,ns_remote_ip,src_ip_country_code,src_ip_city_name,vserver_ip,vserver_port,ns_username,ns_action,ns_event_type,message,facility,level,timestamp",
                sort: "timestamp:desc"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 15000
            });

            return (res.data.messages || []).map((m: any) => {
                const msg = m.message;
                const raw = msg.message || "";
                let sourceIp = msg.ns_remote_ip || msg.src_ip || "";
                if (!sourceIp) {
                    const ipMatch = raw.match(/(?:Remote_ip|Remote ip\s*=|clientip|Source)\s*[:=]?\s*([0-9\.]+)/i);
                    if (ipMatch) sourceIp = ipMatch[1];
                }

                let username = msg.ns_username || "";
                if (!username) {
                    const userMatch = raw.match(/(?:Username\s*=\s*|\buser\s+|Context\s+)([a-zA-Z0-9_\-\.@]+)/i);
                    if (userMatch) username = userMatch[1].trim();
                }

                const isFailure = /(?:FAILURE|FAILED|INVALID|DENIED|type 5)/i.test(raw);

                return {
                    timestamp: msg.timestamp,
                    sourceIp,
                    countryCode: msg.src_ip_country_code || "Unknown",
                    cityName: msg.src_ip_city_name || "N/A",
                    vserverIp: msg.vserver_ip || "",
                    vserverPort: msg.vserver_port || "",
                    username,
                    message: raw,
                    facility: msg.facility,
                    level: msg.level,
                    isFailure
                };
            });
        } catch (err: any) {
            console.error("[NetScaler Graylog] getRecentGeoEvents error:", err.message);
            return [];
        }
    }

    /**
     * Retrieves recent foreign connection events (backward compatibility helper).
     */
    async getRecentForeignEvents(rangeSeconds: number = 86400, limit: number = 100): Promise<NetscalerGeoEvent[]> {
        return this.getRecentGeoEvents(rangeSeconds, limit, "foreign");
    }

    /**
     * Deep investigation search for a specific user, IP address, or session ID.
     */
    async investigate(searchTerm: string, rangeSeconds: number = 86400, limit: number = 150): Promise<NetscalerTimelineEvent[]> {
        const cleanTerm = searchTerm.trim();
        if (!cleanTerm) return [];

        let query = cleanTerm;
        // If it looks like an IP address, query src_ip specifically or broad
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleanTerm);
        if (isIp) {
            query = `src_ip:${cleanTerm} OR "${cleanTerm}"`;
        } else {
            query = `ns_username:${cleanTerm} OR ns_session_id:${cleanTerm} OR ns_client_device_serial:${cleanTerm} OR "${cleanTerm}"`;
        }

        try {
            const params = new URLSearchParams({
                query,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: limit.toString(),
                sort: "timestamp:desc"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 20000
            });

            const messages: any[] = res.data.messages || [];
            return messages.map((m: any) => this.parseTimelineEvent(m.message));
        } catch (err: any) {
            console.error("[NetScaler Graylog] investigate error:", err.message);
            throw err;
        }
    }

    /**
     * Helper to classify and extract fields from NetScaler messages.
     */
    private parseTimelineEvent(msg: any): NetscalerTimelineEvent {
        const raw = msg.message || "";
        const id = msg._id || Math.random().toString(36).substring(2);
        const timestamp = msg.timestamp || new Date().toISOString();

        let eventType: NetscalerTimelineEvent["eventType"] = "OTHER";
        let username: string | undefined = msg.ns_username;
        let clientIp: string | undefined = msg.src_ip || msg.ns_remote_ip;
        let clientPort: string | undefined = msg.src_port;
        let sessionId: string | undefined = msg.ns_session_id;
        const deviceSerial: string | undefined = msg.ns_client_device_serial || (raw.match(/device_serial_number\s+(\d+)/i) || [])[1];
        const action: string | undefined = msg.ns_action || msg.ns_event_type;
        let target: string | undefined = msg.vserver_ip ? `${msg.vserver_ip}:${msg.vserver_port || "443"}` : undefined;

        // Fallback extract Username if not in Graylog extracted field
        if (!username) {
            const userMatch = raw.match(/Username\s*=\s*([a-zA-Z0-9_\-\.@]+)/i) ||
                              raw.match(/\buser\s+([a-zA-Z0-9_\-\.@]+)/i) ||
                              raw.match(/Context\s+([a-zA-Z0-9_\-\.]+)(?:@|:)/i);
            if (userMatch) {
                username = userMatch[1].trim();
            }
        }

        // Fallback extract Session ID if not in Graylog extracted field
        if (!sessionId) {
            const sessMatch = raw.match(/SessionId:\s*(\d+)/i) ||
                              raw.match(/session-id-(\d+)/i) ||
                              raw.match(/session_guid\s+([0-9a-fx]+)/i);
            if (sessMatch) {
                sessionId = sessMatch[1].trim();
            }
        }

        // Extract Client IP from message if not extracted by Graylog
        if (!clientIp) {
            const ipMatch = raw.match(/Remote_ip\s+([0-9\.]+)/i) ||
                            raw.match(/Remote ip\s*=\s*([0-9\.]+)(?::(\d+))?/i) ||
                            raw.match(/clientip\s+([0-9\.]+)/i) ||
                            raw.match(/Source\s+([0-9\.]+)(?::(\d+))?/i);
            if (ipMatch) {
                clientIp = ipMatch[1];
                if (ipMatch[2]) clientPort = ipMatch[2];
            }
        }

        // Classify Event Type using extracted action or raw text
        const actUpper = (action || "").toUpperCase();
        if (actUpper.includes("CMD_EXECUTED") || raw.includes("CMD_EXECUTED") || raw.includes("API CMD")) {
            eventType = "ADMIN_CMD";
        } else if (raw.includes("response-200") || raw.includes("LOGIN") || (raw.includes("SSO") && !raw.includes("failed"))) {
            eventType = "AUTH_SUCCESS";
        } else if (raw.includes("FAILURE") || raw.includes("FAILED") || raw.includes("INVALID") || raw.includes("DENIED") || raw.includes("type 5") || raw.includes("Failed")) {
            eventType = "AUTH_FAILURE";
        } else if (actUpper.includes("HTTPREQUEST") || raw.includes("HTTPREQUEST") || raw.includes("HTTP")) {
            eventType = "HTTP_REQUEST";
        } else if (actUpper.includes("CHANNEL_UPDATE") || actUpper.includes("NETWORK_UPDATE") || raw.includes("ICA") || raw.includes("HDX") || raw.includes("CHANNEL_UPDATE")) {
            eventType = "ICA_SESSION";
        } else if (actUpper.includes("CONN_TERMINATE") || actUpper.includes("CONN_DELINK") || actUpper.includes("LOGOUT") || raw.includes("CONN_TERMINATE") || raw.includes("CONN_DELINK") || raw.includes("LOGOUT")) {
            eventType = "CONN_TERMINATE";
        }

        const httpMethod = msg.ns_http_method || (raw.match(/:\s+(GET|POST|HEAD|PUT|DELETE)\s+/i) || [])[1];
        const httpPath = msg.ns_http_path || (raw.match(/:\s+(?:GET|POST|HEAD|PUT|DELETE)\s+([^\s\?]+)/i) || [])[1];

        return {
            id,
            timestamp,
            eventType,
            username,
            clientIp,
            clientPort,
            countryCode: msg.src_ip_country_code,
            cityName: msg.src_ip_city_name,
            sessionId,
            deviceSerial,
            action,
            httpMethod,
            httpPath,
            target,
            rawMessage: raw
        };
    }

    /**
     * Executes parallel hunting scans across stream logs for known and custom Citrix IOC rules.
     */
    async scanIocs(
        rules: NetscalerIocRule[] = DEFAULT_CITRIX_IOC_RULES,
        rangeSeconds: number = 86400
    ): Promise<NetscalerIocFinding[]> {
        const isInternalIp = (ip?: string) => {
            if (!ip) return false;
            return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.)/.test(ip);
        };

        const scanPromises = rules.map(async (rule) => {
            try {
                // Fetch up to 200 matching messages to extract all involved external IPs
                const params = new URLSearchParams({
                    query: rule.query,
                    range: rangeSeconds.toString(),
                    filter: `streams:${this.streamId}`,
                    limit: "200",
                    fields: "src_ip,ns_remote_ip,src_ip_country_code,src_ip_city_name,ns_username,ns_http_method,ns_http_path,message,timestamp",
                    sort: "timestamp:desc"
                });
                const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
                const res = await axios.get(url, {
                    httpsAgent,
                    headers: {
                        Authorization: this.authHeader,
                        Accept: "application/json",
                        "X-Requested-By": "pane-o-glass"
                    },
                    timeout: 20000
                });

                const messages: any[] = res.data.messages || [];
                let total = res.data.total_results || 0;

                // Extract all unique external IPs across all matching messages
                const ipMap = new Map<string, NetscalerMatchedIp>();

                messages.forEach((m: any) => {
                    const rawMsg = m.message.message || "";
                    let ip = m.message.ns_remote_ip || m.message.src_ip;
                    if (!ip) {
                        const mMatch = rawMsg.match(/(?:Remote_ip|Remote ip\s*=|clientip|Source)\s*[:=]?\s*([0-9\.]+)/i);
                        if (mMatch) ip = mMatch[1];
                    }
                    if (!ip) {
                        // General IPv4 search in message if it's a command/shell event
                        const anyIp = rawMsg.match(/\b((?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\.(?:\d{1,3}\.){2}(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-5]))\b/);
                        if (anyIp && !isInternalIp(anyIp[1])) ip = anyIp[1];
                    }

                    if (ip && !isInternalIp(ip)) {
                        const existing = ipMap.get(ip);
                        const ts = m.message.timestamp;
                        const country = m.message.src_ip_country_code || existing?.countryCode;
                        const city = m.message.src_ip_city_name || existing?.cityName;

                        if (existing) {
                            existing.count += 1;
                            if (ts && (!existing.lastSeen || ts > existing.lastSeen)) existing.lastSeen = ts;
                            if (ts && (!existing.firstSeen || ts < existing.firstSeen)) existing.firstSeen = ts;
                            if (country) existing.countryCode = country;
                            if (city && city !== "N/A") existing.cityName = city;
                        } else {
                            ipMap.set(ip, {
                                ip,
                                count: 1,
                                countryCode: country || undefined,
                                cityName: city && city !== "N/A" ? city : undefined,
                                firstSeen: ts,
                                lastSeen: ts,
                                sampleMessage: rawMsg.substring(0, 150)
                            });
                        }
                    }
                });

                const matchedExternalIps = Array.from(ipMap.values()).sort((a, b) => b.count - a.count);

                let sampleEvents = messages.slice(0, 5).map((m: any) => {
                    const rawMsg = m.message.message || "";
                    let ip = m.message.src_ip ||
                               m.message.ns_remote_ip ||
                               (rawMsg.match(/Remote_ip\s+([0-9\.]+)/i) || [])[1] ||
                               (rawMsg.match(/Source\s+([0-9\.]+)/i) || [])[1];
                    return {
                        timestamp: m.message.timestamp,
                        sourceIp: ip,
                        username: m.message.ns_username,
                        httpMethod: m.message.ns_http_method,
                        httpPath: m.message.ns_http_path,
                        countryCode: m.message.src_ip_country_code,
                        message: rawMsg
                    };
                });

                // Post-filter safeguard: for external admin commands, ignore any false positives with internal IPs
                if (rule.id === "external-admin-cmd") {
                    sampleEvents = sampleEvents.filter(ev => !isInternalIp(ev.sourceIp));
                    if (sampleEvents.length === 0 && total > 0) {
                        total = 0;
                    }
                }

                return {
                    rule,
                    matchCount: total,
                    matchedExternalIps,
                    sampleEvents
                };
            } catch (err: any) {
                console.error(`[NetScaler Graylog] IOC scan error for "${rule.name}":`, err.message);
                return {
                    rule,
                    matchCount: 0,
                    matchedExternalIps: [],
                    sampleEvents: []
                };
            }
        });

        return await Promise.all(scanPromises);
    }

    /**
     * Deep extraction of all unique external IPs for a specific threat rule query.
     */
    async getRuleMatchedExternalIps(
        ruleQuery: string,
        rangeSeconds: number = 86400,
        limit: number = 500
    ): Promise<NetscalerMatchedIp[]> {
        const isInternalIp = (ip?: string) => {
            if (!ip) return false;
            return /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|127\.)/.test(ip);
        };

        try {
            const params = new URLSearchParams({
                query: ruleQuery,
                range: rangeSeconds.toString(),
                filter: `streams:${this.streamId}`,
                limit: limit.toString(),
                fields: "src_ip,ns_remote_ip,src_ip_country_code,src_ip_city_name,ns_username,message,timestamp",
                sort: "timestamp:desc"
            });
            const url = `${this.baseUrl.replace(/\/$/, '')}/api/search/universal/relative?${params.toString()}`;
            const res = await axios.get(url, {
                httpsAgent,
                headers: {
                    Authorization: this.authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 25000
            });

            const messages: any[] = res.data.messages || [];
            const ipMap = new Map<string, NetscalerMatchedIp>();

            messages.forEach((m: any) => {
                const rawMsg = m.message.message || "";
                let ip = m.message.ns_remote_ip || m.message.src_ip;
                if (!ip) {
                    const mMatch = rawMsg.match(/(?:Remote_ip|Remote ip\s*=|clientip|Source)\s*[:=]?\s*([0-9\.]+)/i);
                    if (mMatch) ip = mMatch[1];
                }
                if (!ip) {
                    const anyIp = rawMsg.match(/\b((?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-5])\.(?:\d{1,3}\.){2}(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-5]))\b/);
                    if (anyIp && !isInternalIp(anyIp[1])) ip = anyIp[1];
                }

                if (ip && !isInternalIp(ip)) {
                    const existing = ipMap.get(ip);
                    const ts = m.message.timestamp;
                    const country = m.message.src_ip_country_code || existing?.countryCode;
                    const city = m.message.src_ip_city_name || existing?.cityName;

                    if (existing) {
                        existing.count += 1;
                        if (ts && (!existing.lastSeen || ts > existing.lastSeen)) existing.lastSeen = ts;
                        if (ts && (!existing.firstSeen || ts < existing.firstSeen)) existing.firstSeen = ts;
                        if (country) existing.countryCode = country;
                        if (city && city !== "N/A") existing.cityName = city;
                    } else {
                        ipMap.set(ip, {
                            ip,
                            count: 1,
                            countryCode: country || undefined,
                            cityName: city && city !== "N/A" ? city : undefined,
                            firstSeen: ts,
                            lastSeen: ts,
                            sampleMessage: rawMsg.substring(0, 150)
                        });
                    }
                }
            });

            return Array.from(ipMap.values()).sort((a, b) => b.count - a.count);
        } catch (err: any) {
            console.error("[NetScaler Graylog] getRuleMatchedExternalIps error:", err.message);
            return [];
        }
    }
}
