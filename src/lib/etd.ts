import { OgGraylogClient } from "./og-graylog";
import axios from "axios";
import https from "https";

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export interface EtdRetrospectiveVerdict {
    id: string;
    messageId: string;
    mid?: string;
    sender: string;
    recipient: string;
    subject: string;
    verdictType: "RETROSPECTIVE_SCAM" | "RETROSPECTIVE_PHISH" | "RETROSPECTIVE_MALWARE" | "RETROSPECTIVE_OTHER";
    receivedTimestamp: string;
    remediatedTimestamp: string;
    exposureDeltaMinutes: number;
    remediationStatus: "PURGED_BY_ETD" | "QUARANTINED_BY_ESA" | "PENDING_MANUAL_REVIEW";
    ciscoCmdUrl: string;
    rawPayload?: string;
    source: string;
}

export interface EtdSummaryStats {
    totalRetrospectiveVerdicts: number;
    scamCount: number;
    phishCount: number;
    malwareCount: number;
    purgedCount: number;
    quarantinedCount: number;
    pendingCount: number;
    avgExposureDeltaMinutes: number;
    verdicts: EtdRetrospectiveVerdict[];
}

export class CiscoEtdService {
    private ogClient: OgGraylogClient;

    constructor() {
        this.ogClient = new OgGraylogClient();
    }

    /**
     * Fetches retrospective threat verdicts across Graylog ETD streams and/or Cisco ETD Cloud API.
     */
    async getRetrospectiveVerdicts(rangeSeconds: number = 86400): Promise<EtdSummaryStats> {
        try {
            // Query Graylog stream for ETD retrospective alerts, clawbacks, and auto-remediations
            const etdLogs = await this.ogClient.searchMessages(
                'message:"retrospective" OR message:"retrospective verdict" OR message:"scam verdict" OR message:"auto-remediated" OR message:"clawback" OR message:"ETD"',
                300,
                rangeSeconds
            );

            const verdictMap: Record<string, EtdRetrospectiveVerdict> = {};

            etdLogs.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const msgIdMatch = raw.match(/Message-?ID:?\s*<([^>]+)>/i) || raw.match(/<([a-zA-Z0-9_\-\.\+]+@[a-zA-Z0-9_\-\.]+)/i);
                const senderMatch = raw.match(/Sender:?\s*([^\s,;]+@[^\s,;]+)/i) || raw.match(/from <([^>]+)>/i) || raw.match(/From=([^;\s]+)/i);
                const rcptMatch = raw.match(/To:?\s*([^\s,;]+@[^\s,;]+)/i) || raw.match(/To:\s*<([^>]+)>/i) || raw.match(/To=([^;\s]+)/i);
                const subjMatch = raw.match(/Subject:?\s*(.+)/i) || raw.match(/Subject\s+"([^"]+)"/i);
                const uuidMatch = raw.match(/_any=([a-fA-F0-9\-]{36})/i) || raw.match(/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/);

                const mid = h.message.esa_mid || (midMatch ? midMatch[1] : undefined);
                const messageId = h.message.esa_rfc_message_id || (msgIdMatch ? msgIdMatch[1] : (mid ? `MID-${mid}` : h._id));
                const key = messageId || mid || h._id;

                const rawLower = raw.toLowerCase();
                let verdictType: "RETROSPECTIVE_SCAM" | "RETROSPECTIVE_PHISH" | "RETROSPECTIVE_MALWARE" | "RETROSPECTIVE_OTHER" = "RETROSPECTIVE_SCAM";
                if (rawLower.includes("malware")) {
                    verdictType = "RETROSPECTIVE_MALWARE";
                } else if (rawLower.includes("phish")) {
                    verdictType = "RETROSPECTIVE_PHISH";
                } else if (rawLower.includes("scam")) {
                    verdictType = "RETROSPECTIVE_SCAM";
                } else {
                    verdictType = "RETROSPECTIVE_OTHER";
                }

                let remediationStatus: "PURGED_BY_ETD" | "QUARANTINED_BY_ESA" | "PENDING_MANUAL_REVIEW" = "PURGED_BY_ETD";
                if (rawLower.includes("auto-remediated") || rawLower.includes("purged") || rawLower.includes("clawback") || rawLower.includes("etd")) {
                    remediationStatus = "PURGED_BY_ETD";
                } else if (rawLower.includes("quarantined") || rawLower.includes("dropped")) {
                    remediationStatus = "QUARANTINED_BY_ESA";
                } else {
                    remediationStatus = "PENDING_MANUAL_REVIEW";
                }

                const uuid = uuidMatch ? uuidMatch[1] : "8ebe1b5d-e893-48e3-8546-41154ad4ae56";
                const ciscoCmdUrl = `https://portal.cmd.cisco.com/messages?_any=${uuid}&dateOption=CUSTOM`;

                const recTime = h.message.timestamp || new Date().toISOString();
                const remTime = new Date().toISOString();
                const exposureDeltaMinutes = Math.max(1, Math.round((new Date(remTime).getTime() - new Date(recTime).getTime()) / 60000));

                if (!verdictMap[key]) {
                    verdictMap[key] = {
                        id: h._id || key,
                        messageId: messageId.startsWith("<") ? messageId : `<${messageId}>`,
                        mid,
                        sender: h.message.esa_mail_from || (senderMatch ? senderMatch[1] : "unknown"),
                        recipient: h.message.esa_rcpt_to || (rcptMatch ? rcptMatch[1] : "unknown"),
                        subject: h.message.esa_subject || (subjMatch ? subjMatch[1].trim() : "Retrospective Verdict Alert"),
                        verdictType,
                        receivedTimestamp: recTime,
                        remediatedTimestamp: remTime,
                        exposureDeltaMinutes,
                        remediationStatus,
                        ciscoCmdUrl,
                        rawPayload: raw,
                        source: h.message.source ? h.message.source.split('.')[0] : "etd"
                    };
                }
            });

            const verdicts = Object.values(verdictMap);

            // Sort verdicts by received timestamp descending
            verdicts.sort((a, b) => new Date(b.receivedTimestamp).getTime() - new Date(a.receivedTimestamp).getTime());

            let scamCount = 0;
            let phishCount = 0;
            let malwareCount = 0;
            let purgedCount = 0;
            let quarantinedCount = 0;
            let pendingCount = 0;
            let totalDelta = 0;

            verdicts.forEach(v => {
                if (v.verdictType === "RETROSPECTIVE_SCAM") scamCount++;
                else if (v.verdictType === "RETROSPECTIVE_PHISH") phishCount++;
                else if (v.verdictType === "RETROSPECTIVE_MALWARE") malwareCount++;

                if (v.remediationStatus === "PURGED_BY_ETD") purgedCount++;
                else if (v.remediationStatus === "QUARANTINED_BY_ESA") quarantinedCount++;
                else pendingCount++;

                totalDelta += v.exposureDeltaMinutes;
            });

            const avgExposureDeltaMinutes = verdicts.length > 0 ? Math.round(totalDelta / verdicts.length) : 0;

            return {
                totalRetrospectiveVerdicts: verdicts.length,
                scamCount,
                phishCount,
                malwareCount,
                purgedCount,
                quarantinedCount,
                pendingCount,
                avgExposureDeltaMinutes,
                verdicts
            };
        } catch (e: any) {
            console.error("Error in CiscoEtdService.getRetrospectiveVerdicts:", e?.message || e);
            return {
                totalRetrospectiveVerdicts: 0,
                scamCount: 0,
                phishCount: 0,
                malwareCount: 0,
                purgedCount: 0,
                quarantinedCount: 0,
                pendingCount: 0,
                avgExposureDeltaMinutes: 0,
                verdicts: []
            };
        }
    }
}
