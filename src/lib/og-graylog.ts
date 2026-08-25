import https from "https";
import axios from "axios";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

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

export interface GraylogStats {
    rangeSeconds: number;
    volumeQuery: string;
    totalVolume: number;
    totalVolumeChart: GraylogHistogramData[];
    delayedMessages: number;
    delayedMessagesChart: GraylogHistogramData[];
    urlRewrites: number;
    urlRewritesChart: GraylogHistogramData[];
    malwareAlerts: number;
    malwareAlertsChart: GraylogHistogramData[];
    inboundCategories: GraylogCategoryBreakdown[];
    esaBreakdown?: GraylogEsaBreakdown;
    recentUrls?: GraylogUrlSample[];
    recentAmpVerdicts?: GraylogAmpSample[];
    fullUrlCategories?: GraylogFullCategoryStats[];
    fullAmpCategories?: GraylogFullCategoryStats[];
    topMessageThreats?: GraylogMessageThreatAggregation[];
    ampIocs?: GraylogAmpIocAggregation[];
    spoofingAlerts?: GraylogSpoofingAuthAggregation[];
    targetRecipients?: GraylogTargetRecipientAggregation[];
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
     * Helper method to enrich MID records with Subject, Sender, and Recipient envelope headers via batch Lucene queries.
     */
    private async enrichMidsWithEnvelopeHeaders(
        midItems: Array<{ mid: string; sender?: string; recipient?: string; subject?: string }>,
        rangeSeconds: number = 86400
    ) {
        const targetMids = Array.from(new Set(midItems.map(i => i.mid).filter(Boolean)));
        if (targetMids.length === 0) return;

        const midTerms = targetMids.map(m => `"${m}"`).join(" OR ");
        const batchQuery = `(esa_mid:(${midTerms}) OR message:(${midTerms})) AND NOT message:"URL"`;

        try {
            const envelopeLogs = await this.searchMessages(batchQuery, 300, rangeSeconds);
            const midHeaderMap: Record<string, { sender?: string; recipient?: string; subject?: string }> = {};
            targetMids.forEach(m => { midHeaderMap[m] = {}; });

            envelopeLogs.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
                if (!mid || !midHeaderMap[mid]) return;

                const fromMatch = raw.match(/From:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/bytes from <([^>]+)>/i) || raw.match(/From:\s*(\S+)/i);
                const toMatch = raw.match(/To:?\s*=?\s*["']?[^<]*["']?\s*<([^>]+)>/i) || raw.match(/To:\s*(\S+)/i);
                const subjMatch = raw.match(/Subject\s*['"]([^'"]+)['"]/i) || raw.match(/Subject\s*:?\s*(.+)/i);

                if (!midHeaderMap[mid].sender && (h.message.esa_mail_from || fromMatch)) {
                    midHeaderMap[mid].sender = h.message.esa_mail_from || (fromMatch ? fromMatch[1] : undefined);
                }
                if (!midHeaderMap[mid].recipient && (h.message.esa_rcpt_to || toMatch)) {
                    midHeaderMap[mid].recipient = h.message.esa_rcpt_to || (toMatch ? toMatch[1] : undefined);
                }
                if (!midHeaderMap[mid].subject && (h.message.esa_subject || subjMatch)) {
                    midHeaderMap[mid].subject = h.message.esa_subject || (subjMatch ? subjMatch[1].trim() : undefined);
                }
            });

            midItems.forEach(item => {
                const headers = midHeaderMap[item.mid];
                if (headers) {
                    if (!item.sender && headers.sender) item.sender = headers.sender;
                    if (!item.recipient && headers.recipient) item.recipient = headers.recipient;
                    if (!item.subject && headers.subject) item.subject = headers.subject;
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
     * Aggregates URL telemetry by Message ID (esa_mid) and calculates composite risk levels per email.
     * Strictly scopes to the active flow stream (e.g. Inbound vs Outbound).
     */
    async getTopMessageThreatAggregations(
        rangeSeconds: number = 86400, 
        limit: number = 10,
        volumeQuery: string = 'message:"inbound table"'
    ): Promise<GraylogMessageThreatAggregation[]> {
        try {
            const scopePrefix = volumeQuery ? `(${volumeQuery}) AND ` : '';

            const [riskyHits, generalHits] = await Promise.all([
                this.searchMessages(`${scopePrefix}(esa_url_rep_score:[-10.0 TO -0.1] OR esa_url_rep_score:/-[0-9]\\..*/ OR (message:"reputation -" AND message:"URL"))`, 350, rangeSeconds).catch(() => []),
                this.searchMessages(`${scopePrefix}(_exists_:esa_url_rep_score OR (message:"URL" AND message:"reputation"))`, 200, rangeSeconds).catch(() => [])
            ]);

            const allHits = [...riskyHits, ...generalHits];
            const midMap: Record<string, GraylogMessageThreatAggregation> = {};

            allHits.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const urlMatch = raw.match(/URL (https?:\/\/\S+)/i);
                const repMatch = raw.match(/reputation ([\-\d\.]+)/i);

                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : "");
                if (!mid) return;

                let score = 0.0;
                if (h.message.esa_url_rep_score !== undefined) {
                    score = parseFloat(h.message.esa_url_rep_score);
                } else if (repMatch) {
                    score = parseFloat(repMatch[1]);
                }

                const url = urlMatch ? urlMatch[1] : raw;

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
                        primaryThreatUrl: url,
                        threatLevel: "CLEAN",
                        timestamp: h.message.timestamp,
                        source: h.message.source ? h.message.source.split('.')[0] : "esa"
                    };
                }

                midMap[mid].totalUrls += 1;

                if (score < midMap[mid].worstScore) {
                    midMap[mid].worstScore = score;
                    midMap[mid].primaryThreatUrl = url;
                }

                if (score < 0) {
                    midMap[mid].riskyUrlCount += 1;
                }
            });

            const aggregatedList = Object.values(midMap);
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
            });

            // Sort deterministically: worst WRS score ascending (most dangerous first), then risky URL count descending, then timestamp descending
            aggregatedList.sort((a, b) => {
                if (a.worstScore !== b.worstScore) {
                    return a.worstScore - b.worstScore;
                }
                if (a.riskyUrlCount !== b.riskyUrlCount) {
                    return b.riskyUrlCount - a.riskyUrlCount;
                }
                return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
            });
            return aggregatedList.slice(0, limit);
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
            const scopePrefix = volumeQuery ? `(${volumeQuery}) AND ` : '';
            const ampHits = await this.searchMessages(`${scopePrefix}(_exists_:esa_amp_file_verdict OR message:"AMP file reputation verdict")`, 120, rangeSeconds);
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
            const scopePrefix = volumeQuery ? `(${volumeQuery}) AND ` : '';
            const authHits = await this.searchMessages(`${scopePrefix}(message:"SPF:" OR message:"DKIM:" OR message:"DMARC:" OR _exists_:esa_spf_verdict)`, 120, rangeSeconds);
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
            const scopePrefix = volumeQuery ? `(${volumeQuery}) AND ` : '';
            const threatHits = await this.searchMessages(`${scopePrefix}(esa_url_rep_score:[-10.0 TO -0.1] OR esa_url_rep_score:/-[0-9]\\..*/ OR message:"reputation -")`, 150, rangeSeconds);
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
     * Fetches 100% official Cisco WRS score aggregations across 5 non-overlapping tiers:
     * 1. Clean / Established (Score +3.0 to +10.0) -> Emerald Green (#10b981)
     * 2. Neutral / Uncategorized (Score 0.0 to +2.9) -> Blue (#3b82f6)
     * 3. Low Suspect (Score -0.1 to -2.9) -> Amber (#f59e0b)
     * 4. Risky / Threat (Score -3.0 to -5.9) -> Orange (#f97316)
     * 5. Malicious / Critical Block (Score -6.0 to -10.0) -> Deep Red (#ef4444)
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
            targetRecipients
        ] = await Promise.all([
            this.getHistogram(volumeQuery, rangeSeconds),
            this.getHistogram(esaDelayQuery, rangeSeconds),
            this.getHistogram('(esa_cisco_action:"URL redirected to Cisco Security proxy") OR message:"Action: URL redirected to Cisco Security proxy"', rangeSeconds),
            this.getHistogram('message:"interim AV verdict using" AND NOT message:"CLEAN"', rangeSeconds),
            this.getHistogram('message:"Whitelisted Addresses"', rangeSeconds),
            this.getEsaApplianceBreakdown(rangeSeconds, volumeQuery),
            this.getRecentTelemetrySamples(rangeSeconds),
            this.get100PercentFullDatasetAggregations(rangeSeconds),
            this.getTopMessageThreatAggregations(rangeSeconds, 8, volumeQuery),
            this.getAmpIocAggregations(rangeSeconds, 8, volumeQuery),
            this.getSpoofingAuthAggregations(rangeSeconds, 8, volumeQuery),
            this.getTargetRecipientAggregations(rangeSeconds, 8, volumeQuery)
        ]);

        // Ensure totalVolume equals exact sum of ESA01 + ESA02 appliance volumes for 100% mathematical match
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
            targetRecipients
        };
    }
}
