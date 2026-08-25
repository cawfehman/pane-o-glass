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
    private static cachedStats: Record<number, EtdSummaryStats> = {};
    private static lastCacheTime: number = 0;
    private static cacheIntervalMs: number = 10000; // 10 seconds

    constructor() {
        this.ogClient = new OgGraylogClient();
    }

    /**
     * Helper to check if ETD API credentials are provided in environment variables.
     */
    static hasApiCredentials(): boolean {
        return !!(process.env.ETD_CLIENT_ID && process.env.ETD_CLIENT_SECRET);
    }

    /**
     * Fetches retrospective threat verdicts across Graylog ETD streams and/or Cisco ETD Cloud API.
     */
    async getRetrospectiveVerdicts(rangeSeconds: number = 86400): Promise<EtdSummaryStats> {
        const now = Date.now();

        // Check if cached result exists and is fresh (under 10 seconds old)
        if (CiscoEtdService.cachedStats[rangeSeconds] && (now - CiscoEtdService.lastCacheTime < CiscoEtdService.cacheIntervalMs)) {
            return CiscoEtdService.cachedStats[rangeSeconds];
        }

        try {
            // Target official Cisco ETD Retrospective Notification & Clawback syslog events
            const query = 'message:"Retrospective Verdict Applied" OR message:"retrospective scam" OR message:"retrospective verdict" OR message:"retrospective phish" OR message:"retrospective malware" OR message:"clawback"';
            
            const etdLogs = await this.ogClient.searchMessages(query, 500, rangeSeconds);

            const verdictMap: Record<string, EtdRetrospectiveVerdict> = {};

            etdLogs.forEach((h: any) => {
                const raw = h.message.message || "";
                const midMatch = raw.match(/MID (\d+)/);
                const msgIdMatch = raw.match(/Message ID:\s*<([^>]+)>/i) || raw.match(/Message-?ID:?\s*<([^>]+)>/i) || raw.match(/<([a-zA-Z0-9_\-\.\+]+@[a-zA-Z0-9_\-\.]+)/i);
                const uuidMatch = raw.match(/_any=([a-fA-F0-9\-]{36})/i) || raw.match(/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/);
                const startDateMatch = raw.match(/startDate=([^&%\s]+)/i);

                const alertMid = h.message.esa_mid || (midMatch ? midMatch[1] : undefined);
                const messageId = h.message.esa_rfc_message_id || (msgIdMatch ? `<${msgIdMatch[1]}>` : (alertMid ? `MID-${alertMid}` : h._id));
                const key = messageId || alertMid || h._id;

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
                    remediationStatus = "PURGED_BY_ETD";
                }

                const uuid = uuidMatch ? uuidMatch[1] : "8ebe1b5d-e893-48e3-8546-41154ad4ae56";
                const ciscoCmdUrl = `https://portal.cmd.cisco.com/messages?_any=${uuid}&dateOption=CUSTOM`;

                const alertTimeStr = h.message.timestamp || new Date().toISOString();
                let startDateIso = startDateMatch ? decodeURIComponent(startDateMatch[1]) : null;
                
                // If startDateIso was double encoded or raw URL encoded
                if (startDateIso && startDateIso.includes("%")) {
                    try { startDateIso = decodeURIComponent(startDateIso); } catch (e) {}
                }

                const alertMs = new Date(alertTimeStr).getTime();
                const arrivalMs = (startDateIso && !isNaN(new Date(startDateIso).getTime())) ? new Date(startDateIso).getTime() : alertMs;
                const exposureDeltaMinutes = Math.max(1, Math.round(Math.abs(alertMs - arrivalMs) / 60000));

                // Clean up display strings so alert distribution lists & alert services aren't shown as the threat sender/recipient
                let senderVal = h.message.esa_mail_from || "";
                let rcptVal = h.message.esa_rcpt_to || "";
                let subjVal = h.message.esa_subject || "";

                if (!senderVal || senderVal.includes("amazonses") || senderVal.includes("Cisco Cloud") || senderVal === "ETD Alert Service (Cisco Cloud)") {
                    senderVal = "External Threat Sender (Cisco Cloud Verdict)";
                }
                if (!rcptVal || rcptVal.includes("Alerts-CiscoETD")) {
                    rcptVal = "Target M365 User Inbox";
                }
                if (!subjVal || subjVal.includes("Retrospective Verdict Applied") || subjVal.includes("[Secure Email Threat Defense]")) {
                    subjVal = `Retrospective ${verdictType.replace("RETROSPECTIVE_", "")} Threat Verdict (M365 Auto-Clawback)`;
                }

                if (!verdictMap[key]) {
                    verdictMap[key] = {
                        id: h._id || key,
                        messageId: messageId.startsWith("<") ? messageId : `<${messageId}>`,
                        mid: alertMid,
                        sender: senderVal,
                        recipient: rcptVal,
                        subject: subjVal,
                        verdictType,
                        receivedTimestamp: startDateIso || alertTimeStr,
                        remediatedTimestamp: alertTimeStr,
                        exposureDeltaMinutes,
                        remediationStatus,
                        ciscoCmdUrl,
                        rawPayload: raw,
                        source: h.message.source ? h.message.source.split('.')[0] : "etd"
                    };
                }
            });

            // Perform candidate envelope correlation search for each verdict to extract real threat headers
            for (const v of Object.values(verdictMap)) {
                const alertTimeMs = new Date(v.remediatedTimestamp).getTime();
                const threatArrivalMs = (v.receivedTimestamp && !isNaN(new Date(v.receivedTimestamp).getTime())) ? new Date(v.receivedTimestamp).getTime() : alertTimeMs;

                const fromIso = new Date(threatArrivalMs - 180000).toISOString();
                const toIso = new Date(threatArrivalMs + 60000).toISOString();

                try {
                    const searchHits = await this.ogClient.searchAbsoluteMessages('message:"Subject \\"" AND NOT message:"[Secure Email Threat Defense]"', fromIso, toIso, 150);

                    const candidatesMap: Record<string, { mid: string; subject: string; timestamp: string }> = {};
                    searchHits.forEach((sh: any) => {
                        const rawMsg = sh.message.message || "";
                        const midMatch = rawMsg.match(/MID (\d+)/);
                        const subjMatch = rawMsg.match(/Subject\s+"([^"]+)"/i);
                        if (midMatch && subjMatch) {
                            const tmid = midMatch[1];
                            if (!candidatesMap[tmid]) {
                                candidatesMap[tmid] = { mid: tmid, subject: subjMatch[1], timestamp: sh.message.timestamp };
                            }
                        }
                    });

                    const candidateList = Object.values(candidatesMap);
                    if (candidateList.length > 0) {
                        candidateList.sort((a, b) => Math.abs(new Date(a.timestamp).getTime() - threatArrivalMs) - Math.abs(new Date(b.timestamp).getTime() - threatArrivalMs));
                        const match = candidateList[0];

                        const envHits = await this.ogClient.searchMessages(`message:"MID ${match.mid}"`, 30, rangeSeconds);
                        let origSender = "";
                        let origRecipient = "";
                        let rfcMsgId = "";

                        envHits.forEach((em: any) => {
                            const eraw = em.message.message || "";
                            const senderMatch = eraw.match(/from <([^>]+)>/i) || eraw.match(/From:\s*<([^>]+)>/i) || eraw.match(/From=([^\s;]+)/i);
                            const rcptMatch = eraw.match(/To:\s*<([^>]+)>/i) || eraw.match(/To:\s*(\S+)/i);
                            const msgIdMatch = eraw.match(/Message-ID\s*'([^']+)'/i) || eraw.match(/Message-ID:\s*<([^>]+)>/i);

                            if (senderMatch && !senderMatch[1].includes("amazonses")) origSender = senderMatch[1];
                            if (rcptMatch && !rcptMatch[1].includes("Alerts-CiscoETD")) origRecipient = rcptMatch[1];
                            if (msgIdMatch) rfcMsgId = msgIdMatch[1].startsWith("<") ? msgIdMatch[1] : `<${msgIdMatch[1]}>`;
                        });

                        v.mid = match.mid;
                        if (origSender) v.sender = origSender;
                        if (origRecipient) v.recipient = origRecipient;
                        if (match.subject) v.subject = match.subject;
                        if (rfcMsgId) v.messageId = rfcMsgId;
                        v.receivedTimestamp = match.timestamp;
                        v.exposureDeltaMinutes = Math.max(1, Math.round(Math.abs(alertTimeMs - new Date(match.timestamp).getTime()) / 60000));
                    }
                } catch (e2) {}
            }

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

            const summaryStats: EtdSummaryStats = {
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

            CiscoEtdService.cachedStats[rangeSeconds] = summaryStats;
            CiscoEtdService.lastCacheTime = now;

            return summaryStats;
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
