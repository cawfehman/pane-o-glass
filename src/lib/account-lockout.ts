import axios from "axios";
import * as https from "https";
import { parseStringPromise } from "xml2js";
import { parseCalledStationId, normalizeMacAddress, getIseUrls, executeWithPanFailover } from "./ise";
import { resolveIpHostname } from "./ise";
import { getUserDetails } from "./ldap";
import { prisma } from "./prisma";
import {
    queryImprivataForUser,
    ImprivataUserCorrelationSummary,
    OG_GRAYLOG_IMPRIVATA_RADIUS_STREAM_ID,
} from "./imprivata-graylog";
import { getAdaptiveSearchWindow } from "./graylog-backlog-guardian";
import { NetscalerGraylogClient } from "./netscaler-graylog";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export const OG_GRAYLOG_AD_STREAM_ID = "5d72ac00b209026ab42decf9";
export const OG_GRAYLOG_ISE_STREAM_ID = "60ff11b8950aa8572f333457";

export interface AdUserDetails {
    exists: boolean;
    sAMAccountName?: string;
    userPrincipalName?: string;
    displayName: string;
    department: string;
    title: string;
    phone: string;
    email: string;
    isEnabled?: boolean;
    isLockedOut: boolean;
    pwdLastSet?: string | null;
    passwordAgeDays?: number | null;
    mustChangePassword?: boolean;
    passwordNeverExpires?: boolean;
    smartcardRequired?: boolean;
    accountExpires?: string | null;
    isExpired?: boolean;
    memberOf?: string[];
    manager?: string | null;
    whenCreated?: string | null;
}

export interface EdgeAccessVpnSession {
    id: string;
    sourceIp: string;
    assignedIp?: string | null;
    status: string;
    duration?: number | null;
    failureReason?: string | null;
    vpnType?: string | null;
    vpnStream?: string | null;
    ipCountry?: string | null;
    ipCountryCode?: string | null;
    createdAt: string;
}

export interface EdgeAccessCitrixLogin {
    timestamp: string;
    clientIp: string;
    action: string;
    status: "SUCCESS" | "FAILURE" | "INFO";
    countryCode?: string;
    countryName?: string;
    failureReason?: string;
}

export interface PerimeterIpPosture {
    ip: string;
    source: "VPN" | "CITRIX";
    isBlocked: boolean;
    inThreatFeed: boolean;
    inPerimeterVpnShun: boolean;
    activeShunNodes: string[];
    isFmcGeoBlocked: boolean;
    strikeCount: number;
    strikeStatus: string;
    countryCode?: string | null;
    countryName?: string | null;
    asn?: string | null;
    org?: string | null;
}

export interface AccountEdgeAccess {
    vpn: {
        activeSession: EdgeAccessVpnSession | null;
        recentSessions: EdgeAccessVpnSession[];
    };
    citrix: {
        recentAttempts: EdgeAccessCitrixLogin[];
    };
    perimeterPosture: PerimeterIpPosture | null;
    reputationStrikes: {
        hasStrikes: boolean;
        ipCount: number;
        records: Array<{
            ip: string;
            strikeCount: number;
            status: string;
            lastSeen: string;
        }>;
    };
}

export interface AdSecurityEvent {
    id: string;
    timestamp: string;
    eventId: "4740" | "4625" | "4771" | "4776" | "4767" | "4723" | "4724" | "4768" | "4769" | "4648" | string;
    eventTitle: string;
    targetUser: string;
    callerDevice: string;
    sourceIp: string;
    domainController: string;
    logonType?: number;
    logonTypeDesc?: string;
    subStatus?: string;
    subStatusDesc?: string;
    failureReason?: string;
    subjectUser?: string;
    serviceName?: string;
    processName?: string;
    rawMessage: string;
}

export interface AccountLifecycleHistoryItem {
    id: string;
    timestamp: string;
    eventId: string;
    eventType: string;
    eventTitle: string;
    targetUsername: string;
    canonicalUsername: string;
    performedBy: string | null;
    domainController: string | null;
    callerComputer: string | null;
    status: "SUCCESS" | "FAILURE";
    subStatus?: string | null;
    rawMessage?: string | null;
}

export interface RecentLockoutEvent {
    id: string;
    timestamp: string;
    username: string;
    displayName?: string;
    callerDevice: string;
    isIsePsn: boolean;
    domainController: string;
    sourceIp?: string;
    logonId?: string;
    userLockoutCountInWindow: number;
    rawMessage?: string;
}

export interface RecentLockoutsOverview {
    rangeHours: number;
    totalCount: number;
    uniqueUsersCount: number;
    wirelessCount: number;
    workstationCount: number;
    latestLockoutTimestamp: string | null;
    lockouts: RecentLockoutEvent[];
}

export interface PasswordChangeActivity {
    detected: boolean;
    type: "USER_CHANGE" | "ADMIN_RESET" | null;
    timestamp: string | null;
    performedBy: string | null;
    lockoutsAfterChange: number;
    failuresAfterChange: number;
    minutesBeforeFirstLockout: number | null;
    isHistorical?: boolean;
    daysSinceChange?: number;
    hoursSinceChange?: number;
}

export interface UnlockActivity {
    detected: boolean;
    unlockCount: number;
    latestUnlockTimestamp: string | null;
    unlockedBy: string | null;
    isLoop: boolean;
    relockTimeSeconds: number | null;
}

export interface IseWirelessDetails {
    source: "ISE_MNT" | "GRAYLOG_ISE";
    endpointMac: string;
    ssid: string;
    apName: string;
    siteCode: string;
    deviceProfile?: string;
    failureReason?: string;
    failureCode?: string;
    nasIp?: string;
    nasPortId?: string;
    callingStationId?: string;
    calledStationId?: string;
    authTimestamp?: string;
}

export interface WorkstationDetails {
    hostname: string;
    ipAddress?: string;
    resolvedHostname?: string;
    logonType?: number;
    logonTypeDesc?: string;
    likelyCause?: string;
}

export interface FailureTimelineBucket {
    time: string;
    timestamp: number;
    lockouts: number;
    failedLogons: number;
    kerberosFailures: number;
    ntlmFailures: number;
    unlocks: number;
    passwordChanges: number;
    total: number;
}

export interface LockoutInvestigationResult {
    searchedUser: string;
    canonicalUser?: string;
    adUserDetails?: AdUserDetails | null;
    rangeHours: number;
    hasLockout: boolean;
    lockoutCount: number;
    latestLockoutTimestamp: string | null;
    totalFailureEvents: number;
    passwordChangeActivity: PasswordChangeActivity;
    unlockActivity: UnlockActivity;
    rootCauseCategory:
        | "WIRELESS_EAP_ISE"
        | "IMPRIVATA_VPN_RADIUS"
        | "IMPRIVATA_CITRIX_RADIUS"
        | "IMPRIVATA_WORKSTATION_ESSO"
        | "WORKSTATION_RDP"
        | "WORKSTATION_NETWORK_SHARE"
        | "WORKSTATION_SERVICE"
        | "WORKSTATION_INTERACTIVE"
        | "WORKSTATION_OTHER"
        | "EXCHANGE_ACTIVESYNC"
        | "POST_PASSWORD_CHANGE_STALE"
        | "LOCKOUT_LOOP"
        | "EXPLICIT_CREDENTIALS"
        | "NO_FAILURES_FOUND"
        | "UNKNOWN";
    executiveSummary: string;
    recommendation: string;
    primaryCulprit: {
        type: "ISE_WIRELESS" | "IMPRIVATA_RADIUS" | "WORKSTATION" | "UNKNOWN";
        callerName: string;
        isIsePsn: boolean;
        isImprivata?: boolean;
        iseDetails?: IseWirelessDetails | null;
        workstationDetails?: WorkstationDetails | null;
    };
    imprivataDetails?: ImprivataUserCorrelationSummary | null;
    uniqueCallers: string[];
    timeline: FailureTimelineBucket[];
    events: AdSecurityEvent[];
    lifecycleHistory: AccountLifecycleHistoryItem[];
    edgeAccess?: AccountEdgeAccess;
    queriedSources: {
        adGraylogStream: string;
        imprivataGraylogStream?: string;
        iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED";
        adEventsCount: number;
        iseEventsCount: number;
        imprivataRadiusEventsCount?: number;
        imprivataEssoEventsCount?: number;
    };
}

/**
 * Checks whether a calling device hostname or string indicates an ISE Policy Service Node.
 * Per Cooper Health infrastructure: ise-psn01 through ise-psn04.
 */
export function isIsePsn(callerName?: string | null): boolean {
    if (!callerName) return false;
    return /ise-psn0[1-4]/i.test(callerName);
}

/**
 * Translates Windows Logon Types into human-readable descriptions and operational context.
 */
export function describeLogonType(type?: number | string | null): { name: string; description: string } {
    const num = typeof type === "string" ? parseInt(type, 10) : type;
    switch (num) {
        case 2:
            return {
                name: "Interactive (Console)",
                description: "User logged on locally via keyboard/monitor at physical computer."
            };
        case 3:
            return {
                name: "Network (SMB/Share)",
                description: "Connection over network (mapped drive, printer, shared folder, or IIS web auth)."
            };
        case 4:
            return {
                name: "Batch / Scheduled Task",
                description: "Windows Scheduled Task configured with this account's credentials."
            };
        case 5:
            return {
                name: "Windows Service",
                description: "Windows background service configured to Run As this account."
            };
        case 7:
            return {
                name: "Unlock Workstation",
                description: "User attempted to unlock an already running workstation session."
            };
        case 8:
            return {
                name: "Network Cleartext",
                description: "Basic authentication over network (e.g. IIS basic auth or legacy app)."
            };
        case 10:
            return {
                name: "Remote Interactive (RDP)",
                description: "Remote Desktop (RDP / Terminal Services) logon attempt."
            };
        case 11:
            return {
                name: "Cached Interactive",
                description: "Logon using cached domain credentials without contacting domain controller."
            };
        default:
            return {
                name: num !== undefined && !isNaN(Number(num)) ? `Logon Type ${num}` : "Unknown Logon Type",
                description: "Standard authentication request."
            };
    }
}

/**
 * Translates common Windows NTSTATUS / Kerberos error codes into clear explanations.
 */
/**
 * Translates common Windows NTSTATUS / Kerberos error codes into clear explanations.
 */
export function describeSubStatus(code?: string | null): string {
    if (!code) return "Authentication Failure";
    const clean = code.trim().toUpperCase();
    switch (clean) {
        case "0XC000006A":
            return "Bad Password (User name is correct, password was wrong)";
        case "0XC0000064":
            return "User account does not exist";
        case "0XC0000234":
            return "Account is currently locked out";
        case "0XC0000072":
            return "Account is currently disabled";
        case "0XC0000193":
            return "Account has expired";
        case "0XC0000071":
            return "Password has expired";
        case "0XC000006F":
            return "Logon outside authorized hours";
        case "0XC0000070":
            return "Logon from unauthorized workstation";
        case "0X0":
        case "0X00":
            return "Success / Validated";
        case "0X6":
            return "Kerberos: Client not found in Kerberos database";
        case "0X18":
            return "Kerberos Pre-Auth Failed: Bad password entered";
        case "0X12":
            return "Kerberos Ticket Failed: Account locked, disabled, or unauthorized";
        case "0X17":
            return "Kerberos Ticket Failed: Password expired";
        case "0X19":
        case "0X25":
            return "Kerberos Ticket Failed: Workstation clock skew too great";
        case "0X1B":
            return "Kerberos Ticket Failed: Server / Service not found";
        case "0X20":
            return "Kerberos Ticket Failed: Ticket expired";
        default:
            return `Status Code ${clean}`;
    }
}

/**
 * Extracts Subject User Name (e.g. administrator or service performing an action) from Winlogbeat message.
 */
function extractSubjectUser(msg: any): string | undefined {
    if (msg.winlog_event_data_SubjectUserName && String(msg.winlog_event_data_SubjectUserName).trim() !== "-") {
        return String(msg.winlog_event_data_SubjectUserName).trim();
    }
    const raw = String(msg.message || "");
    const match = raw.match(/Subject:\s*[\s\S]*?Account Name:\s*([^\r\n\t]+)/i);
    if (match && match[1].trim() && match[1].trim() !== "-") {
        return match[1].trim();
    }
    return undefined;
}

/**
 * Extracts requested Kerberos Service Name / SPN or Target Server from Winlogbeat message.
 */
function extractServiceName(msg: any): string | undefined {
    if (msg.winlog_event_data_ServiceName && String(msg.winlog_event_data_ServiceName).trim() !== "-") {
        return String(msg.winlog_event_data_ServiceName).trim();
    }
    if (msg.winlog_event_data_TargetServerName && String(msg.winlog_event_data_TargetServerName).trim() !== "-") {
        return String(msg.winlog_event_data_TargetServerName).trim();
    }
    const raw = String(msg.message || "");
    const match = raw.match(/Service Name:\s*([^\r\n\t]+)/i) || raw.match(/Target Server Name:\s*([^\r\n\t]+)/i);
    if (match && match[1].trim() && match[1].trim() !== "-") {
        return match[1].trim();
    }
    return undefined;
}

/**
 * Extracts Calling Process Name (for Event 4648 explicit credentials) from Winlogbeat message.
 */
function extractProcessName(msg: any): string | undefined {
    if (msg.winlog_event_data_ProcessName && String(msg.winlog_event_data_ProcessName).trim() !== "-") {
        return String(msg.winlog_event_data_ProcessName).trim();
    }
    const raw = String(msg.message || "");
    const match = raw.match(/Process Name:\s*([^\r\n\t]+)/i);
    if (match && match[1].trim() && match[1].trim() !== "-") {
        return match[1].trim();
    }
    return undefined;
}

/**
 * Extracts the calling computer name from Winlogbeat messages or raw Windows Event text.
 */
function extractCallerName(msg: any): string {
    // 1. Direct extracted Winlogbeat fields
    if (msg.winlog_event_data_CallerComputerName && String(msg.winlog_event_data_CallerComputerName).trim() !== "-") {
        return String(msg.winlog_event_data_CallerComputerName).trim();
    }
    if (msg.winlog_event_data_WorkstationName && String(msg.winlog_event_data_WorkstationName).trim() !== "-") {
        return String(msg.winlog_event_data_WorkstationName).trim();
    }
    if (msg.winlog_event_data_Workstation && String(msg.winlog_event_data_Workstation).trim() !== "-") {
        return String(msg.winlog_event_data_Workstation).trim();
    }

    // 2. Winlogbeat event 4740 mapping: TargetDomainName frequently holds Caller Computer Name in Winlogbeat
    const evId = String(msg.winlog_event_id || msg.event_id || "");
    if (evId === "4740" && msg.winlog_event_data_TargetDomainName && !/^chsmail$/i.test(msg.winlog_event_data_TargetDomainName)) {
        return String(msg.winlog_event_data_TargetDomainName).trim();
    }

    // 3. For administrative events (4767, 4723, 4724), if no caller device exists, fallback to Subject Domain / DC
    if (evId === "4767" || evId === "4723" || evId === "4724") {
        if (msg.winlog_computer_name) return String(msg.winlog_computer_name).trim();
        if (msg.source) return String(msg.source).trim();
    }

    // 4. Regex parser directly on the raw Event Log body
    const raw = String(msg.message || "");
    const callerMatch = raw.match(/Caller Computer Name:\s*([^\r\n\t]+)/i);
    if (callerMatch && callerMatch[1].trim() && callerMatch[1].trim() !== "-") {
        return callerMatch[1].trim();
    }

    const workstationMatch = raw.match(/Workstation Name:\s*([^\r\n\t]+)/i);
    if (workstationMatch && workstationMatch[1].trim() && workstationMatch[1].trim() !== "-") {
        return workstationMatch[1].trim();
    }

    return "Unknown Caller";
}

/**
 * Extracts Source IP Address from Winlogbeat message or body.
 */
function extractSourceIp(msg: any): string {
    if (msg.winlog_event_data_IpAddress && String(msg.winlog_event_data_IpAddress).trim() !== "-") {
        return String(msg.winlog_event_data_IpAddress).trim();
    }
    if (msg.source_ip && String(msg.source_ip).trim() !== "-") {
        return String(msg.source_ip).trim();
    }

    const raw = String(msg.message || "");
    const srcMatch = raw.match(/Source Network Address:\s*([^\r\n\t]+)/i) || raw.match(/Client Address:\s*::ffff:([^\r\n\t]+)/i) || raw.match(/Client Address:\s*([^\r\n\t]+)/i);
    if (srcMatch && srcMatch[1].trim() && srcMatch[1].trim() !== "-") {
        return srcMatch[1].trim().replace(/^::ffff:/, "");
    }
    return "-";
}

/**
 * Searches OG Graylog for AD security events (Stream: 5d72ac00b209026ab42decf9)
 */
async function fetchAdSecurityEventsFromGraylog(variants: string[], baseUser: string, rangeSeconds: number): Promise<AdSecurityEvent[]> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    if (!ogToken) {
        throw new Error("OG_GRAYLOG_API_TOKEN is not configured in environment.");
    }

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");

    // In Graylog / OpenSearch, winlog_event_data_TargetUserName is an exact keyword field.
    // Querying all case variants (canonical AD sAMAccountName, entered casing, lowercase, TitleCase)
    // combined with the fulltext message phrase matches all security events regardless of logging casing.
    const targetUserTerms = variants.map(v => `winlog_event_data_TargetUserName:"${v}"`).join(" OR ");
    const luceneQuery = `(${targetUserTerms} OR "${baseUser.toLowerCase()}") AND (winlog_event_id:(4740 OR 4625 OR 4771 OR 4776 OR 4767 OR 4723 OR 4724 OR 4648) OR (winlog_event_id:(4768 OR 4769) AND NOT winlog_event_data_Status:0x0))`;

    const adaptive = await getAdaptiveSearchWindow("OG_GRAYLOG", rangeSeconds);

    const params = new URLSearchParams({
        query: luceneQuery,
        range: adaptive.effectiveRangeSeconds.toString(),
        filter: `streams:${OG_GRAYLOG_AD_STREAM_ID}`,
        limit: "500",
        sort: "timestamp:desc"
    });

    const url = `${ogUrl}/api/search/universal/relative?${params.toString()}`;

    try {
        const res = await axios.get(url, {
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass"
            },
            timeout: 15000
        });

        const rawMessages = res.data.messages || [];
        const events: AdSecurityEvent[] = [];

        for (const item of rawMessages) {
            const m = item.message;
            if (!m) continue;

            const evId = String(m.winlog_event_id || m.event_id || "").trim();
            const caller = extractCallerName(m);
            const srcIp = extractSourceIp(m);
            const raw = String(m.message || "");

            // Logon Type
            let logonType: number | undefined;
            if (m.winlog_event_data_LogonType !== undefined && m.winlog_event_data_LogonType !== null) {
                const parsed = parseInt(String(m.winlog_event_data_LogonType), 10);
                if (!isNaN(parsed)) logonType = parsed;
            } else {
                const ltMatch = raw.match(/Logon Type:\s*(\d+)/i);
                if (ltMatch) logonType = parseInt(ltMatch[1], 10);
            }

            // SubStatus / Status / ResultCode
            let subStatus = m.winlog_event_data_SubStatus || m.winlog_event_data_Status || m.winlog_event_data_FailureCode || m.winlog_event_data_ResultCode;
            if (!subStatus) {
                const stMatch = raw.match(/Sub Status:\s*(0x[0-9a-fA-F]+)/i) || raw.match(/Failure Code:\s*(0x[0-9a-fA-F]+)/i) || raw.match(/Status:\s*(0x[0-9a-fA-F]+)/i);
                if (stMatch) subStatus = stMatch[1];
            }

            const cleanStatus = subStatus ? String(subStatus).trim() : undefined;

            // Skip successful Kerberos ticket events (0x0)
            if ((evId === "4768" || evId === "4769") && (cleanStatus === "0x0" || cleanStatus === "0X0" || cleanStatus === "0" || cleanStatus === "0x00")) {
                continue;
            }

            let eventTitle = `Event ${evId}`;
            if (evId === "4740") eventTitle = "Account Locked Out";
            else if (evId === "4625") eventTitle = "Failed Logon Attempt";
            else if (evId === "4771") eventTitle = "Kerberos Pre-Auth Failed";
            else if (evId === "4776") eventTitle = "NTLM Credential Validation Failed";
            else if (evId === "4767") eventTitle = "Account Unlocked";
            else if (evId === "4723") eventTitle = "User Password Change Attempt";
            else if (evId === "4724") eventTitle = "Administrative Password Reset";
            else if (evId === "4768") eventTitle = "Kerberos TGT Request Failed";
            else if (evId === "4769") eventTitle = "Kerberos Service Ticket (TGS) Failed";
            else if (evId === "4648") eventTitle = "Logon Attempt with Explicit Credentials";

            const dc = m.source || m.agent_name || m.winlog_computer_name || "Domain Controller";
            const subjectUser = extractSubjectUser(m);
            const serviceName = extractServiceName(m);
            const processName = extractProcessName(m);

            events.push({
                id: m._id || m.gl2_message_id || `${evId}-${m.timestamp}`,
                timestamp: m.timestamp || new Date().toISOString(),
                eventId: evId,
                eventTitle,
                targetUser: m.winlog_event_data_TargetUserName || m.TargetUserName || m.user_name || variants[0] || baseUser,
                callerDevice: caller,
                sourceIp: srcIp,
                domainController: dc,
                logonType,
                logonTypeDesc: logonType !== undefined ? describeLogonType(logonType).name : undefined,
                subStatus: cleanStatus,
                subStatusDesc: cleanStatus ? describeSubStatus(cleanStatus) : undefined,
                subjectUser,
                serviceName,
                processName,
                rawMessage: raw
            });
        }

        return events;
    } catch (err: any) {
        console.error("[Account-Lockout] Error fetching AD security events from Graylog:", err.message);
        throw err;
    }
}

/**
 * Queries Cisco ISE MnT REST API for live authentication telemetry (last 24h).
 */
async function queryIseMntForUser(usernames: string[]): Promise<IseWirelessDetails | null> {
    try {
        const { basicAuth } = getIseUrls();

        for (const user of usernames) {
            try {
                const xmlText = await executeWithPanFailover(async (baseUrl) => {
                    const endpoint = `${baseUrl}/admin/API/mnt/AuthStatus/userName/${encodeURIComponent(user)}/86400/50/All`;
                    const response = await axios.get(endpoint, {
                        headers: {
                            Authorization: `Basic ${basicAuth}`,
                            Accept: "application/xml",
                            "X-ERS-Internal-User": "true"
                        },
                        httpsAgent,
                        timeout: 5000
                    });
                    return response.data;
                });

                const parsed = await parseStringPromise(xmlText, {
                    explicitArray: false,
                    tagNameProcessors: [(name: string) => name.split(":").pop() || name]
                });

                const records = parsed?.authStatusList?.authStatusRecord;
                if (!records) continue;

                const recordList = Array.isArray(records) ? records : [records];
                if (recordList.length === 0) continue;

                // Prioritize failed attempts, or take most recent
                const failedRecord = recordList.find((r: any) => String(r.passed) === "false" || String(r.execution_steps).includes("5400")) || recordList[0];

                const rawMac = failedRecord.calling_station_id || failedRecord.mac || "";
                const endpointMac = normalizeMacAddress(rawMac) || rawMac;
                const calledStation = failedRecord.called_station_id || "";
                const { ssid, apName, siteCode } = parseCalledStationId(calledStation);

                return {
                    source: "ISE_MNT",
                    endpointMac,
                    ssid: ssid !== "N/A" ? ssid : "Corporate Wireless",
                    apName: apName !== "N/A" ? apName : (failedRecord.nas_identifier || "Unknown AP"),
                    siteCode: siteCode !== "N/A" ? siteCode : "CDC",
                    deviceProfile: failedRecord.endpoint_profile || failedRecord.identity_group || undefined,
                    failureReason: failedRecord.failure_reason || failedRecord.response || "Wireless EAP Authentication Failed",
                    nasIp: failedRecord.nas_ip_address,
                    nasPortId: failedRecord.nas_port_id,
                    callingStationId: rawMac,
                    calledStationId: calledStation,
                    authTimestamp: failedRecord.timestamp || failedRecord.time
                };
            } catch {
                continue;
            }
        }
        return null;
    } catch (e: any) {
        console.warn("[Account-Lockout] ISE MnT lookup note:", e.message);
        return null;
    }
}

/**
 * Historical Fallback: Queries Graylog ISE 3.0 Stream (Stream: 60ff11b8950aa8572f333457)
 * Used when events are > 24 hours old or ISE MnT API lacks records.
 */
async function queryGraylogIseStreamForUser(usernames: string[], rangeSeconds: number): Promise<IseWirelessDetails | null> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    if (!ogToken) return null;

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");
    const userPhrases = usernames.map(u => `"${u}"`).join(" OR ");
    const query = `(${userPhrases}) AND (CISE_Failed_Attempts OR CISE_Passed_Authentications OR "Radius-Accounting")`;

    const params = new URLSearchParams({
        query,
        range: rangeSeconds.toString(),
        filter: `streams:${OG_GRAYLOG_ISE_STREAM_ID}`,
        limit: "25",
        sort: "timestamp:desc"
    });

    try {
        const res = await axios.get(`${ogUrl}/api/search/universal/relative?${params.toString()}`, {
            httpsAgent,
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass"
            },
            timeout: 10000
        });

        const messages = res.data.messages || [];
        if (messages.length === 0) return null;

        for (const item of messages) {
            const raw = String(item.message?.message || "");

            // Extract Calling-Station-Id (MAC)
            const macMatch = raw.match(/Calling-Station-Id=([0-9a-fA-F:\.\-]+)/i) || raw.match(/([0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2}[:-][0-9a-fA-F]{2})/i);
            const rawMac = macMatch ? macMatch[1] : "";
            const endpointMac = normalizeMacAddress(rawMac) || rawMac;

            // Extract Called-Station-Id (AP & SSID)
            const calledMatch = raw.match(/Called-Station-Id=([^\s,]+)/i);
            const calledStation = calledMatch ? calledMatch[1] : "";
            const { ssid, apName, siteCode } = parseCalledStationId(calledStation);

            // Extract Device Type / Profile
            const profileMatch = raw.match(/Device-Type=([^\s,]+)/i) || raw.match(/EndPointProfile=([^\s,]+)/i);

            // Extract Failure Reason
            const reasonMatch = raw.match(/FailureReason=([^\r\n,]+)/i) || raw.match(/NOTICE\s+([^\r\n:]+):/i);

            if (endpointMac || ssid !== "N/A") {
                return {
                    source: "GRAYLOG_ISE",
                    endpointMac: endpointMac || "Unknown MAC",
                    ssid: ssid !== "N/A" ? ssid : "Wireless Network",
                    apName: apName !== "N/A" ? apName : "Cisco AP",
                    siteCode: siteCode !== "N/A" ? siteCode : "CDC",
                    deviceProfile: profileMatch ? profileMatch[1] : undefined,
                    failureReason: reasonMatch ? reasonMatch[1].trim() : "RADIUS Wireless 802.1X Failure",
                    callingStationId: rawMac,
                    calledStationId: calledStation,
                    authTimestamp: item.message?.timestamp
                };
            }
        }
    } catch (e: any) {
        console.warn("[Account-Lockout] Graylog ISE stream search note:", e.message);
    }
    return null;
}

/**
 * Queries persistent AD account lifecycle events (password changes, resets, unlocks, etc.) from PostgreSQL.
 */
export async function getAccountLifecycleHistory(
    usernames: string | string[],
    limit: number = 20
): Promise<AccountLifecycleHistoryItem[]> {
    try {
        const usernameList = (Array.isArray(usernames) ? usernames : [usernames])
            .map(u => u.toLowerCase().replace(/^(?:chsmail|cooperhealth)\\/i, "").replace(/@(?:chsmail\.root\.)?cooperhealth\.edu$/i, "").trim())
            .filter(Boolean);

        if (usernameList.length === 0) return [];

        const records = await prisma.accountLifecycleEvent.findMany({
            where: {
                targetUsername: { in: usernameList }
            },
            orderBy: {
                timestamp: "desc"
            },
            take: limit
        });

        return records.map(r => ({
            id: r.id,
            timestamp: r.timestamp.toISOString(),
            eventId: r.eventId,
            eventType: r.eventType,
            eventTitle: r.eventTitle,
            targetUsername: r.targetUsername,
            canonicalUsername: r.canonicalUsername,
            performedBy: r.performedBy,
            domainController: r.domainController,
            callerComputer: r.callerComputer,
            status: r.status as "SUCCESS" | "FAILURE",
            subStatus: r.subStatus,
            rawMessage: r.rawMessage
        }));
    } catch (err: any) {
        console.warn("[Account-Lockout] Could not query lifecycle history from DB:", err?.message || err);
        return [];
    }
}

/**
 * Main Orchestrator: Conducts end-to-end investigation for a user account lockout.
 */
export async function investigateAccountLockout(
    username: string,
    rangeHours: number = 24
): Promise<LockoutInvestigationResult> {
    const trimmedInput = username.trim();
    const baseUser = trimmedInput
        .replace(/^(?:chsmail|cooperhealth)\\/i, "")
        .replace(/@(?:chsmail\.root\.)?cooperhealth\.edu$/i, "");

    // 1. Resolve Active Directory canonical account details & real-time lockout status via LDAP
    let adUserDetails: AdUserDetails | null = null;
    try {
        const ldapRes = await getUserDetails(baseUser);
        if (ldapRes && ldapRes.exists) {
            adUserDetails = ldapRes as AdUserDetails;
        }
    } catch (err: any) {
        console.warn("[Account-Lockout] LDAP user lookup note:", err.message);
    }

    const canonicalUser = adUserDetails?.sAMAccountName || baseUser;

    // Generate comprehensive case variations for keyword-indexed fields in Graylog
    const titleCased = baseUser
        .split(/([-_])/)
        .map(part => (part === '-' || part === '_') ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join("");

    const variants = Array.from(new Set([
        canonicalUser,
        baseUser,
        baseUser.toLowerCase(),
        baseUser.toUpperCase(),
        titleCased
    ].filter(Boolean) as string[]));

    const rangeSeconds = Math.max(3600, rangeHours * 3600);

    // 2. Fetch AD Security Events, persistent lifecycle events, Imprivata, Cisco VPN, NetScaler, and Threat strikes in parallel
    const [events, lifecycleHistory, imprivataDetails, vpnEvents, citrixTimeline, strikeRecords] = await Promise.all([
        fetchAdSecurityEventsFromGraylog(variants, baseUser, rangeSeconds),
        getAccountLifecycleHistory([baseUser, canonicalUser, ...variants], 20),
        queryImprivataForUser(variants, rangeSeconds).catch((err) => {
            console.warn("[Account-Lockout] Imprivata correlation note:", err?.message || err);
            return null;
        }),
        prisma.vpnEvent.findMany({
            where: { username: { in: variants } },
            orderBy: { createdAt: "desc" },
            take: 10
        }).catch(() => []),
        (async () => {
            try {
                const nsClient = new NetscalerGraylogClient();
                const res = await nsClient.investigate(canonicalUser, rangeSeconds, 15);
                return res;
            } catch {
                return [];
            }
        })(),
        prisma.residentialStrikeLedger.findMany({
            where: {
                attemptedUsers: { hasSome: variants }
            },
            take: 5
        }).catch(() => [])
    ]);

    // 2c. Correlate opaque AD events (where Caller is 'Unknown Caller', '-', a Domain Controller, or an Imprivata node)
    // with exact Imprivata RADIUS [Session.XX] events within ±20 seconds!
    if (imprivataDetails && imprivataDetails.radiusSessions.length > 0) {
        for (const ev of events) {
            if (ev.eventId !== "4740" && ev.eventId !== "4625" && ev.eventId !== "4776" && ev.eventId !== "4771") {
                continue;
            }
            const caller = ev.callerDevice || "";
            const isOpaqueDcOrImprivataCaller =
                caller === "Unknown Caller" ||
                caller === "-" ||
                /^(?:cdc|wdc|cdr)-(?:chs|root)0[1-9]/i.test(caller) ||
                /^(?:as07[a-c]|cdr-impr0[1-2])/i.test(caller);

            if (!isOpaqueDcOrImprivataCaller) continue;

            const evMs = new Date(ev.timestamp).getTime();
            if (isNaN(evMs)) continue;

            let bestSession = null;
            let bestDiff = 20000; // ±20 seconds correlation window
            for (const sess of imprivataDetails.radiusSessions) {
                const sessMs = new Date(sess.timestamp).getTime();
                const diff = Math.abs(sessMs - evMs);
                if (diff <= bestDiff) {
                    bestDiff = diff;
                    bestSession = sess;
                }
            }

            if (bestSession) {
                ev.callerDevice = `${bestSession.nasShortLabel} → Imprivata (${bestSession.imprivataNode})`;
                if (ev.sourceIp === "-" || !ev.sourceIp) {
                    ev.sourceIp = bestSession.externalClientIp || bestSession.nasClientIp;
                }
                ev.failureReason = `[Imprivata ${bestSession.imprivataNode} ${bestSession.sessionTag}] ${bestSession.verdictLabel}: ${bestSession.errorReason}${
                    bestSession.externalClientIp ? ` (Client IP: ${bestSession.externalClientIp})` : ""
                }`;
            }
        }
    }

    // Also correlate internal clinical workstation (WKSX...) events with Imprivata ESSO Stream 2
    if (imprivataDetails && imprivataDetails.essoEvents.length > 0) {
        for (const ev of events) {
            const callerUpper = (ev.callerDevice || "").toUpperCase();
            if (!callerUpper || callerUpper === "UNKNOWN CALLER") continue;
            const matchedEsso = imprivataDetails.essoEvents.find(
                (es) => es.workstationHostname && es.workstationHostname.toUpperCase() === callerUpper
            );
            if (matchedEsso) {
                if ((ev.sourceIp === "-" || !ev.sourceIp) && matchedEsso.workstationIp) {
                    ev.sourceIp = matchedEsso.workstationIp;
                }
                if (!ev.failureReason) {
                    ev.failureReason = `[Imprivata OneSign ESSO] ${matchedEsso.eventType} (${matchedEsso.authMethod || "Password"}) on ${matchedEsso.workstationHostname}`;
                }
            }
        }
    }

    // Filter lockouts, failures, unlocks, and password changes
    const lockoutEvents = events.filter(e => e.eventId === "4740");
    const failureEvents = events.filter(e => e.eventId === "4625" || e.eventId === "4771" || e.eventId === "4776" || e.eventId === "4768" || e.eventId === "4769");
    const unlockEvents = events.filter(e => e.eventId === "4767");
    const pwdChangeEvents = events.filter(e => e.eventId === "4723" || e.eventId === "4724");
    const explicitLogons = events.filter(e => e.eventId === "4648");

    const hasLockout = lockoutEvents.length > 0;
    const lockoutCount = lockoutEvents.length;
    const latestLockoutTimestamp = lockoutEvents.length > 0 ? lockoutEvents[0].timestamp : null;

    // Analyze Password Change Activity (4723/4724)
    const sortedPwdChanges = [...pwdChangeEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latestPwd = sortedPwdChanges[0];

    const passwordChangeActivity: PasswordChangeActivity = {
        detected: false,
        type: null,
        timestamp: null,
        performedBy: null,
        lockoutsAfterChange: 0,
        failuresAfterChange: 0,
        minutesBeforeFirstLockout: null,
        isHistorical: false,
        daysSinceChange: undefined,
        hoursSinceChange: undefined
    };

    if (latestPwd?.timestamp) {
        // Real-time detection within the Graylog search window
        const pwdMs = new Date(latestPwd.timestamp).getTime();
        const subsequentLockouts = lockoutEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);
        const subsequentFailures = failureEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);
        const ageHours = (Date.now() - pwdMs) / (3600 * 1000);

        passwordChangeActivity.detected = true;
        passwordChangeActivity.type = latestPwd.eventId === "4723" ? "USER_CHANGE" : "ADMIN_RESET";
        passwordChangeActivity.timestamp = latestPwd.timestamp;
        passwordChangeActivity.performedBy = latestPwd.subjectUser || null;
        passwordChangeActivity.lockoutsAfterChange = subsequentLockouts.length;
        passwordChangeActivity.failuresAfterChange = subsequentFailures.length;
        passwordChangeActivity.isHistorical = false;
        passwordChangeActivity.hoursSinceChange = Math.round(ageHours * 10) / 10;
        passwordChangeActivity.daysSinceChange = Math.round((ageHours / 24) * 10) / 10;

        if (subsequentLockouts.length > 0) {
            const earliestPostLockout = [...subsequentLockouts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
            const diffMs = new Date(earliestPostLockout.timestamp).getTime() - pwdMs;
            passwordChangeActivity.minutesBeforeFirstLockout = Math.max(0, Math.round(diffMs / 60000));
        }
    } else if (lifecycleHistory.length > 0) {
        // Fallback: Check persistent PostgreSQL database for recent password changes (up to 30 days)
        const latestDbPwd = lifecycleHistory.find(e =>
            (e.eventType === "USER_PWD_CHANGE" || e.eventType === "ADMIN_PWD_RESET" || e.eventId === "4723" || e.eventId === "4724") &&
            e.status === "SUCCESS"
        );

        if (latestDbPwd) {
            const pwdMs = new Date(latestDbPwd.timestamp).getTime();
            const ageHours = (Date.now() - pwdMs) / (3600 * 1000);
            const ageDays = Math.round((ageHours / 24) * 10) / 10;

            // Correlate if changed within the last 30 days (720h)
            if (ageHours <= 720) {
                const subsequentLockouts = lockoutEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);
                const subsequentFailures = failureEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);

                passwordChangeActivity.detected = true;
                passwordChangeActivity.type = (latestDbPwd.eventType === "USER_PWD_CHANGE" || latestDbPwd.eventId === "4723") ? "USER_CHANGE" : "ADMIN_RESET";
                passwordChangeActivity.timestamp = latestDbPwd.timestamp;
                passwordChangeActivity.performedBy = latestDbPwd.performedBy || null;
                passwordChangeActivity.lockoutsAfterChange = subsequentLockouts.length > 0 ? subsequentLockouts.length : lockoutEvents.length;
                passwordChangeActivity.failuresAfterChange = subsequentFailures.length > 0 ? subsequentFailures.length : failureEvents.length;
                passwordChangeActivity.isHistorical = true;
                passwordChangeActivity.hoursSinceChange = Math.round(ageHours * 10) / 10;
                passwordChangeActivity.daysSinceChange = ageDays;

                if (lockoutEvents.length > 0) {
                    const earliestPostLockout = [...lockoutEvents].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
                    const diffMs = new Date(earliestPostLockout.timestamp).getTime() - pwdMs;
                    if (diffMs > 0) {
                        passwordChangeActivity.minutesBeforeFirstLockout = Math.round(diffMs / 60000);
                    }
                }
            }
        }
    }

    // Analyze Unlock & Lockout Loop Activity (4767)
    const sortedUnlocks = [...unlockEvents].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const latestUnlock = sortedUnlocks[0];

    const unlockActivity: UnlockActivity = {
        detected: sortedUnlocks.length > 0,
        unlockCount: sortedUnlocks.length,
        latestUnlockTimestamp: latestUnlock?.timestamp || null,
        unlockedBy: latestUnlock?.subjectUser || null,
        isLoop: false,
        relockTimeSeconds: null
    };

    if (latestUnlock?.timestamp) {
        const unlockMs = new Date(latestUnlock.timestamp).getTime();
        const relockEvent = lockoutEvents.find(e => new Date(e.timestamp).getTime() > unlockMs);
        if (relockEvent) {
            unlockActivity.isLoop = true;
            const relockMs = new Date(relockEvent.timestamp).getTime();
            unlockActivity.relockTimeSeconds = Math.max(0, Math.round((relockMs - unlockMs) / 1000));
        }
    }

    // Tally unique callers across events
    const callerCountMap = new Map<string, number>();
    const lockoutCallerMap = new Map<string, number>();

    for (const e of events) {
        if (e.callerDevice && e.callerDevice !== "Unknown Caller") {
            callerCountMap.set(e.callerDevice, (callerCountMap.get(e.callerDevice) || 0) + 1);
            if (e.eventId === "4740") {
                lockoutCallerMap.set(e.callerDevice, (lockoutCallerMap.get(e.callerDevice) || 0) + 1);
            }
        }
    }

    const uniqueCallers = Array.from(callerCountMap.keys()).sort((a, b) => (callerCountMap.get(b) || 0) - (callerCountMap.get(a) || 0));

    // Determine the Primary Culprit:
    // 1. Authoritative: If 4740 lockout events specify a caller that isn't a domain controller, use it!
    // 2. High priority: If any caller is an ISE PSN, prioritize it (wireless EAP spam causes cascading lockouts)
    // 3. Fallback: Most frequent non-DC caller, or highest frequency caller overall
    let primaryCaller = "Unknown Caller";

    const lockoutCallers = Array.from(lockoutCallerMap.keys()).sort((a, b) => (lockoutCallerMap.get(b) || 0) - (lockoutCallerMap.get(a) || 0));
    const iseCallers = uniqueCallers.filter(c => isIsePsn(c));

    if (iseCallers.length > 0) {
        primaryCaller = iseCallers[0];
    } else if (lockoutCallers.length > 0) {
        primaryCaller = lockoutCallers[0];
    } else if (uniqueCallers.length > 0) {
        // Demote domain controllers that merely validated NTLM (e.g. -chs01, -chs02)
        const nonDcCallers = uniqueCallers.filter(c => !/-chs0[1-9]/i.test(c));
        primaryCaller = nonDcCallers.length > 0 ? nonDcCallers[0] : uniqueCallers[0];
    } else if (events[0]?.callerDevice) {
        primaryCaller = events[0].callerDevice;
    }

    const callerIsIse = isIsePsn(primaryCaller) || events.some(e => isIsePsn(e.callerDevice));
    const isDcOnlyCaller = /^(?:cdc|wdc|cdr)-(?:chs|root)0[1-9]/i.test(primaryCaller) || primaryCaller === "Unknown Caller";
    const callerIsImprivata =
        !callerIsIse &&
        (/Imprivata|as07[a-c]|cdr-impr/i.test(primaryCaller) ||
            (isDcOnlyCaller && Boolean(imprivataDetails?.isImprivataLockoutCulprit)));

    if (callerIsImprivata && isDcOnlyCaller && imprivataDetails?.primaryGatewayName) {
        primaryCaller = `${imprivataDetails.primaryGatewayName}${
            imprivataDetails.primaryImprivataNode ? ` → Imprivata (${imprivataDetails.primaryImprivataNode})` : ""
        }`;
    }

    let iseDetails: IseWirelessDetails | null = null;
    let iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED" = "SKIPPED";
    let workstationDetails: WorkstationDetails | null = null;

    // 2. Pivot to ISE if caller is an ISE PSN
    if (callerIsIse) {
        // Smart routing: Check age of latest event
        const latestTime = latestLockoutTimestamp ? new Date(latestLockoutTimestamp).getTime() : Date.now();
        const ageHours = (Date.now() - latestTime) / (3600 * 1000);

        if (ageHours <= 24) {
            iseDetails = await queryIseMntForUser(variants);
            if (iseDetails) {
                iseQueryMode = "ISE_MNT";
            }
        }

        // Fallback to Graylog ISE Stream if MnT yielded nothing or event is older
        if (!iseDetails) {
            iseDetails = await queryGraylogIseStreamForUser(variants, rangeSeconds);
            if (iseDetails) {
                iseQueryMode = "GRAYLOG_ISE";
            }
        }
    } else if (primaryCaller && primaryCaller !== "Unknown Caller") {
        // 3. Workstation Triage if caller is a PC/Server
        const primaryEv = events.find(e => e.callerDevice === primaryCaller);
        let resolvedHost: string | undefined;

        if (primaryEv?.sourceIp && primaryEv.sourceIp !== "-") {
            try {
                const dnsRes = await resolveIpHostname(primaryEv.sourceIp);
                if (dnsRes) resolvedHost = dnsRes;
            } catch {}
        }

        const logonTypeDesc = primaryEv?.logonType !== undefined ? describeLogonType(primaryEv.logonType) : undefined;

        let likelyCause = "Stale or cached credentials on machine.";
        if (primaryEv?.logonType === 10) {
            likelyCause = "Disconnected or locked Remote Desktop (RDP) session with old password.";
        } else if (primaryEv?.logonType === 3) {
            likelyCause = "Mapped network share, persistent drive connection, or background SMB request.";
        } else if (primaryEv?.logonType === 4) {
            likelyCause = "Scheduled Task running under this user account.";
        } else if (primaryEv?.logonType === 5) {
            likelyCause = "Windows Service configured to run under this user account.";
        } else if (primaryEv?.logonType === 2) {
            likelyCause = "Physical workstation interactive session.";
        }

        workstationDetails = {
            hostname: primaryCaller,
            ipAddress: primaryEv?.sourceIp !== "-" ? primaryEv?.sourceIp : undefined,
            resolvedHostname: resolvedHost,
            logonType: primaryEv?.logonType,
            logonTypeDesc: logonTypeDesc?.name,
            likelyCause
        };
    }

    // 4. Determine Root Cause Category & Summary
    let rootCauseCategory: LockoutInvestigationResult["rootCauseCategory"] = "UNKNOWN";
    let executiveSummary = "";
    let recommendation = "";

    if (!hasLockout && events.length === 0) {
        rootCauseCategory = "NO_FAILURES_FOUND";
        if (adUserDetails?.isLockedOut) {
            executiveSummary = `Account '${canonicalUser}' is currently LOCKED OUT in Active Directory (lockout flag is active), but no new lockout events (4740) or logon failures were recorded in the last ${rangeHours} hours.`;
            recommendation = `The account has an active lockout flag in Active Directory that originated prior to the last ${rangeHours} hour(s). Expand the search timeframe (e.g. 7 days / 168h) to view the initial lockout event and originating device.`;
        } else {
            executiveSummary = `No account lockout events (4740) or logon failures recorded for '${canonicalUser}' in the last ${rangeHours} hours.`;
            recommendation = "The account is not showing recent authentication failures on Domain Controllers. Verify the username spelling or expand the time window.";
        }
    } else if (unlockActivity.isLoop) {
        rootCauseCategory = "LOCKOUT_LOOP";
        executiveSummary = `Active Lockout Loop: Account was unlocked by '${unlockActivity.unlockedBy || "Helpdesk"}' at ${new Date(unlockActivity.latestUnlockTimestamp!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, but immediately re-locked ${unlockActivity.relockTimeSeconds !== null ? `${unlockActivity.relockTimeSeconds} seconds later` : "shortly after"} due to rapid authentication failures from '${primaryCaller}'.`;
        recommendation = `CRITICAL: Do not unlock the account again until device '${primaryCaller}' is disconnected from the network, has its wireless connection forgotten, or stale session terminated.`;
    } else if (callerIsIse) {
        rootCauseCategory = "WIRELESS_EAP_ISE";
        const apText = iseDetails?.apName ? `via AP '${iseDetails.apName}'` : "";
        const ssidText = iseDetails?.ssid ? `on SSID '${iseDetails.ssid}'` : "on corporate wireless";
        const macText = iseDetails?.endpointMac ? `(MAC: ${iseDetails.endpointMac})` : "";
        const profileText = iseDetails?.deviceProfile ? `[${iseDetails.deviceProfile}]` : "mobile device/laptop";

        const pwdNote = passwordChangeActivity.detected && passwordChangeActivity.lockoutsAfterChange > 0
            ? (passwordChangeActivity.isHistorical
                ? ` Password was updated ${passwordChangeActivity.daysSinceChange && passwordChangeActivity.daysSinceChange >= 1 ? `${passwordChangeActivity.daysSinceChange} days ago` : `${passwordChangeActivity.hoursSinceChange || 1} hr(s) ago`} (from lifecycle history); wireless device is likely caching the old credentials.`
                : ` Password was updated ${passwordChangeActivity.minutesBeforeFirstLockout !== null ? `${passwordChangeActivity.minutesBeforeFirstLockout} min before lockouts` : "recently"}; device continues using the old password.`)
            : "";

        executiveSummary = hasLockout
            ? `Account '${canonicalUser}' locked out ${lockoutCount} time(s). Root cause: Rapid 802.1X wireless EAP authentication failures originating from an ISE Policy Service Node (${primaryCaller}). Device: ${profileText} ${macText} ${apText} ${ssidText}.${pwdNote}`
            : `Multiple wireless authentication failures detected from ISE PSN (${primaryCaller}) for '${canonicalUser}' ${macText} ${ssidText}. Risk of account lockout if cached credentials are not updated.${pwdNote}`;

        recommendation = `Have the user locate their wireless device ${macText ? `(${macText})` : ""} connected ${ssidText}. Instruct them to 'Forget' the network or re-enter their current Active Directory password to stop continuous failed auth probes.`;
    } else if (callerIsImprivata && imprivataDetails) {
        const gwCat = imprivataDetails.primaryGatewayCategory;
        rootCauseCategory =
            gwCat === "VPN"
                ? "IMPRIVATA_VPN_RADIUS"
                : gwCat === "CITRIX"
                ? "IMPRIVATA_CITRIX_RADIUS"
                : "IMPRIVATA_WORKSTATION_ESSO";

        const gwLabel = imprivataDetails.primaryGatewayName || primaryCaller;
        const impNode = imprivataDetails.primaryImprivataNode || "as07a";
        const extIpText = imprivataDetails.primaryExternalIp
            ? ` from external Client IP ${imprivataDetails.primaryExternalIp}${
                  imprivataDetails.primaryExternalLocation ? ` (${imprivataDetails.primaryExternalLocation})` : ""
              }${imprivataDetails.primaryExternalIsp ? ` [${imprivataDetails.primaryExternalIsp}]` : ""}`
            : "";

        executiveSummary = hasLockout
            ? `Account '${canonicalUser}' locked out ${lockoutCount} time(s). Root cause traced through Imprivata RADIUS (${impNode}) to '${gwLabel}'${extIpText}. Imprivata recorded ${imprivataDetails.badPasswordCount} bad AD password failure(s)${
                  imprivataDetails.mfaTimeoutCount > 0 ? ` and ${imprivataDetails.mfaTimeoutCount} MFA push timeout(s)` : ""
              }.`
            : `Detected ${imprivataDetails.radiusFailures} Imprivata RADIUS failure(s) for '${canonicalUser}' via '${gwLabel}' (${impNode})${extIpText}. Primary verdict: ${
                  imprivataDetails.primaryVerdictLabel || "Authentication Failed"
              }.`;

        recommendation =
            gwCat === "VPN"
                ? `User or external client${extIpText} is submitting invalid AD credentials through Cisco AnyConnect VPN (${gwLabel}) → Imprivata (${impNode}). Verify if the user has a disconnected AnyConnect client auto-retrying an old password, or check VPN Reporting if the external IP is unfamiliar.`
                : gwCat === "CITRIX"
                ? `User or external client${extIpText} is failing authentication on Citrix Gateway (${gwLabel}) → Imprivata (${impNode}). Have the user sign out of Citrix Workspace / Receiver apps caching an old password, or inspect the external IP in Citrix Login & Abuse Triage.`
                : `Check clinical workstation '${imprivataDetails.primaryWorkstationHostname || primaryCaller}' where Imprivata OneSign recorded failed primary login attempts.`;
    } else if (passwordChangeActivity.detected && passwordChangeActivity.lockoutsAfterChange > 0) {
        rootCauseCategory = "POST_PASSWORD_CHANGE_STALE";
        const performedStr = passwordChangeActivity.performedBy ? ` (by ${passwordChangeActivity.performedBy})` : "";
        if (passwordChangeActivity.isHistorical) {
            const timeAgoStr = passwordChangeActivity.daysSinceChange && passwordChangeActivity.daysSinceChange >= 1 
                ? `${passwordChangeActivity.daysSinceChange} day(s) ago` 
                : `${passwordChangeActivity.hoursSinceChange || 1} hour(s) ago`;
            executiveSummary = `Stale Credentials Post-Password Reset (Historical): Password was changed ${timeAgoStr}${performedStr} on ${new Date(passwordChangeActivity.timestamp!).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Lockouts from '${primaryCaller}' are persisting due to cached/stale credentials.`;
        } else {
            executiveSummary = `Stale Credentials Post-Password Reset: Password was changed at ${new Date(passwordChangeActivity.timestamp!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${performedStr}. Following the change, ${passwordChangeActivity.lockoutsAfterChange} lockout(s) and ${passwordChangeActivity.failuresAfterChange} failure(s) occurred from '${primaryCaller}'.`;
        }
        recommendation = `Instruct the user to reboot or log off '${primaryCaller}' and clear any cached credentials in Windows Credential Manager.`;
    } else if (explicitLogons.length > 0 && primaryCaller !== "Unknown Caller") {
        rootCauseCategory = "EXPLICIT_CREDENTIALS";
        const proc = explicitLogons[0].processName || "Background Process";
        executiveSummary = `Account authentication failed during explicit credential logon (Event 4648) from '${proc}' on '${primaryCaller}'.`;
        recommendation = `Check background scheduled tasks, batch scripts, or RunAs configurations executing '${proc}' on '${primaryCaller}'.`;
    } else if (workstationDetails?.logonType === 10) {
        rootCauseCategory = "WORKSTATION_RDP";
        executiveSummary = `Account locked out by Remote Desktop (RDP / Logon Type 10) session on workstation '${primaryCaller}'.`;
        recommendation = `Log into workstation '${primaryCaller}' or ask an administrator to disconnect/log off stale RDP sessions for '${canonicalUser}'.`;
    } else if (workstationDetails?.logonType === 3) {
        rootCauseCategory = "WORKSTATION_NETWORK_SHARE";
        executiveSummary = `Account locked out by network resource / SMB connection (Logon Type 3) originating from '${primaryCaller}'.`;
        recommendation = `Check Windows Credential Manager on '${primaryCaller}' for saved network drive or printer credentials associated with '${canonicalUser}'.`;
    } else if (workstationDetails?.logonType === 4 || workstationDetails?.logonType === 5) {
        rootCauseCategory = "WORKSTATION_SERVICE";
        executiveSummary = `Account locked out by a background Scheduled Task or Windows Service (Logon Type ${workstationDetails.logonType}) on '${primaryCaller}'.`;
        recommendation = `Check Task Scheduler and Windows Services on '${primaryCaller}' for any entries configured to run under '${canonicalUser}' with an outdated password.`;
    } else if (workstationDetails?.logonType === 2) {
        rootCauseCategory = "WORKSTATION_INTERACTIVE";
        executiveSummary = `Account locked out by physical console / interactive logon attempts (Logon Type 2) on workstation '${primaryCaller}'.`;
        recommendation = `Check physical computer '${primaryCaller}'. A locked session or background application on this machine is submitting incorrect credentials.`;
    } else if (hasLockout) {
        rootCauseCategory = "WORKSTATION_OTHER";
        executiveSummary = `Account locked out ${lockoutCount} time(s). Calling machine identified as '${primaryCaller}'.`;
        recommendation = `Investigate workstation/server '${primaryCaller}'. Check for cached credentials, background processes, or mapped resources.`;
    } else {
        rootCauseCategory = "UNKNOWN";
        executiveSummary = `Detected ${events.length} authentication events for '${canonicalUser}' across ${uniqueCallers.length || 1} source devices.`;
        recommendation = "Review the failure event timeline below to identify repeating patterns and source machines.";
    }

    // 4b. Correlate Edge Access & Perimeter Posture (VPN, Citrix, and Perimeter blocks)
    const latestVpn = vpnEvents[0];
    const latestCitrix = citrixTimeline[0];
    let mostRecentRemoteIp: { ip: string; source: "VPN" | "CITRIX"; countryCode?: string; countryName?: string } | null = null;

    if (latestVpn && latestCitrix) {
        if (new Date(latestVpn.createdAt).getTime() >= new Date(latestCitrix.timestamp).getTime()) {
            mostRecentRemoteIp = {
                ip: latestVpn.sourceIp,
                source: "VPN",
                countryCode: latestVpn.ipCountryCode || undefined,
                countryName: latestVpn.ipCountry || undefined
            };
        } else {
            mostRecentRemoteIp = {
                ip: latestCitrix.clientIp || "",
                source: "CITRIX",
                countryCode: latestCitrix.countryCode,
                countryName: latestCitrix.cityName
            };
        }
    } else if (latestVpn) {
        mostRecentRemoteIp = {
            ip: latestVpn.sourceIp,
            source: "VPN",
            countryCode: latestVpn.ipCountryCode || undefined,
            countryName: latestVpn.ipCountry || undefined
        };
    } else if (latestCitrix && latestCitrix.clientIp) {
        mostRecentRemoteIp = {
            ip: latestCitrix.clientIp,
            source: "CITRIX",
            countryCode: latestCitrix.countryCode,
            countryName: latestCitrix.cityName
        };
    }

    let perimeterPosture: PerimeterIpPosture | null = null;
    if (mostRecentRemoteIp && mostRecentRemoteIp.ip && !mostRecentRemoteIp.ip.startsWith("10.") && !mostRecentRemoteIp.ip.startsWith("172.") && !mostRecentRemoteIp.ip.startsWith("192.168.")) {
        const ip = mostRecentRemoteIp.ip;
        const [shunStats, blacklist, strikeLedger, cache] = await Promise.all([
            prisma.firewallShunStats.findMany({ where: { ip, isActive: true } }).catch(() => []),
            prisma.guardianBlacklist.findUnique({ where: { ip } }).catch(() => null),
            prisma.residentialStrikeLedger.findUnique({ where: { ip } }).catch(() => null),
            prisma.ipLookupCache.findUnique({ where: { ip } }).catch(() => null)
        ]);

        const activeShunNodes = (shunStats || []).map(s => s.firewall || "Perimeter ASA");
        const inPerimeterVpnShun = activeShunNodes.length > 0;
        const isStrikeEnforced = Boolean(strikeLedger && strikeLedger.strikeCount >= 2 && strikeLedger.status !== "PARDONED");
        const isBlacklisted = Boolean(blacklist);
        const inThreatFeed = isStrikeEnforced || isBlacklisted;

        // Filter out placeholder strings like "Unknown", "N/A"
        let geoCountry = mostRecentRemoteIp.countryCode && !["UNKNOWN", "N/A", "UNRESOLVED"].includes(mostRecentRemoteIp.countryCode.toUpperCase())
            ? mostRecentRemoteIp.countryCode.toUpperCase()
            : null;
        let geoCountryName = mostRecentRemoteIp.countryName && !["UNKNOWN", "N/A"].includes(mostRecentRemoteIp.countryName.toUpperCase())
            ? mostRecentRemoteIp.countryName
            : null;
        let asn: string | null = null;
        let org: string | null = null;

        if (cache?.rawJson) {
            try {
                const geo = JSON.parse(cache.rawJson);
                const code = geo.country_code || geo.countryCode;
                if (!geoCountry && code && !["UNKNOWN", "N/A", "UNRESOLVED"].includes(code.toUpperCase())) {
                    geoCountry = code.toUpperCase();
                }
                geoCountryName = geoCountryName || geo.country || geo.country_name || null;
                asn = geo.asn || geo.as || null;
                org = geo.org || geo.isp || null;
            } catch {}
        }

        // If country is still not resolved and IP is a public address, enrich via IPLocate / subnet cache
        if (!geoCountry) {
            try {
                const { enrichIp } = await import("@/lib/iplocate");
                const enriched = await enrichIp(ip);
                if (enriched) {
                    const code = enriched.country_code || enriched.countryCode;
                    if (code && !["UNKNOWN", "N/A", "UNRESOLVED"].includes(code.toUpperCase())) {
                        geoCountry = code.toUpperCase();
                    }
                    geoCountryName = geoCountryName || enriched.country || enriched.country_name || null;
                    asn = asn || enriched.asn || enriched.as || null;
                    org = org || enriched.org || enriched.isp || null;
                }
            } catch {}
        }

        // FMC Geo-Fence only blocks verified foreign (non-US) countries with a valid 2-letter ISO code.
        // Placeholder strings like "Unknown", "N/A", or unresolved values must NEVER trigger a perimeter block.
        const isFmcGeoBlocked = Boolean(geoCountry && geoCountry.length === 2 && geoCountry !== "US" && !["UNKNOWN", "N/A", "UNRESOLVED"].includes(geoCountry));
        const isBlocked = inThreatFeed || inPerimeterVpnShun || isFmcGeoBlocked;

        perimeterPosture = {
            ip,
            source: mostRecentRemoteIp.source,
            isBlocked,
            inThreatFeed,
            inPerimeterVpnShun,
            activeShunNodes,
            isFmcGeoBlocked,
            strikeCount: strikeLedger?.strikeCount ?? 0,
            strikeStatus: strikeLedger?.status ?? "CLEAN",
            countryCode: geoCountry,
            countryName: geoCountryName,
            asn,
            org
        };
    }

    // Active AnyConnect VPN: status === "SUCCESS" and recent (last 12h) without explicit disconnect
    const activeVpn = (vpnEvents || []).find(v => v.status === "SUCCESS" && (!v.duration || v.duration === 0) && (Date.now() - new Date(v.createdAt).getTime()) < 43200000) || null;

    const edgeAccess: AccountEdgeAccess = {
        vpn: {
            activeSession: activeVpn ? {
                id: activeVpn.id,
                sourceIp: activeVpn.sourceIp,
                assignedIp: activeVpn.assignedIp,
                status: activeVpn.status,
                duration: activeVpn.duration,
                failureReason: activeVpn.failureReason,
                vpnType: activeVpn.vpnType,
                vpnStream: activeVpn.vpnStream,
                ipCountry: activeVpn.ipCountry,
                ipCountryCode: activeVpn.ipCountryCode,
                createdAt: activeVpn.createdAt.toISOString()
            } : null,
            recentSessions: (vpnEvents || []).map(v => ({
                id: v.id,
                sourceIp: v.sourceIp,
                assignedIp: v.assignedIp,
                status: v.status,
                duration: v.duration,
                failureReason: v.failureReason,
                vpnType: v.vpnType,
                vpnStream: v.vpnStream,
                ipCountry: v.ipCountry,
                ipCountryCode: v.ipCountryCode,
                createdAt: v.createdAt.toISOString()
            }))
        },
        citrix: {
            recentAttempts: (citrixTimeline || []).map(c => ({
                timestamp: c.timestamp,
                clientIp: c.clientIp || "",
                action: c.action || c.eventType || "GATEWAY_EVENT",
                status: (c.eventType === "AUTH_SUCCESS" ? "SUCCESS" : c.eventType === "AUTH_FAILURE" ? "FAILURE" : "INFO") as "SUCCESS" | "FAILURE" | "INFO",
                countryCode: c.countryCode,
                countryName: c.cityName,
                failureReason: c.eventType === "AUTH_FAILURE" ? (c.action || "Authentication Denied") : undefined
            }))
        },
        perimeterPosture,
        reputationStrikes: {
            hasStrikes: (strikeRecords || []).length > 0,
            ipCount: (strikeRecords || []).length,
            records: (strikeRecords || []).map(s => ({
                ip: s.ip,
                strikeCount: s.strikeCount,
                status: s.status,
                lastSeen: s.lastSeen.toISOString()
            }))
        }
    };

    // If perimeter IP is blocked, surface warning in recommendation
    if (perimeterPosture && perimeterPosture.isBlocked) {
        const blockReason = perimeterPosture.inPerimeterVpnShun
            ? `Perimeter ASA Shun on ${perimeterPosture.activeShunNodes.join(", ") || "firewalls"}`
            : perimeterPosture.inThreatFeed
            ? "FMC Security Intelligence Threat Feed"
            : `FMC Geo-Fence (Non-US location: ${perimeterPosture.countryCode || "Foreign"})`;
        recommendation = `⚠️ PERIMETER BLOCK DETECTED: User's remote IP (${perimeterPosture.ip}) is blocked via ${blockReason}. Even if AD is unlocked, perimeter firewalls will drop connection attempts before authentication reaches domain controllers. ${recommendation}`;
    }

    // 5. Construct Chronological Timeline Buckets (grouped by ~15m or 1h intervals)
    const timeline = buildTimelineBuckets(events, rangeHours);

    return {
        searchedUser: canonicalUser,
        canonicalUser,
        adUserDetails,
        rangeHours,
        hasLockout,
        lockoutCount,
        latestLockoutTimestamp,
        totalFailureEvents: failureEvents.length,
        passwordChangeActivity,
        unlockActivity,
        rootCauseCategory,
        executiveSummary,
        recommendation,
        primaryCulprit: {
            type: callerIsIse
                ? "ISE_WIRELESS"
                : callerIsImprivata
                ? "IMPRIVATA_RADIUS"
                : primaryCaller !== "Unknown Caller"
                ? "WORKSTATION"
                : "UNKNOWN",
            callerName: primaryCaller,
            isIsePsn: callerIsIse,
            isImprivata: callerIsImprivata,
            iseDetails,
            workstationDetails
        },
        imprivataDetails,
        uniqueCallers,
        timeline,
        events,
        lifecycleHistory,
        edgeAccess,
        queriedSources: {
            adGraylogStream: OG_GRAYLOG_AD_STREAM_ID,
            imprivataGraylogStream: OG_GRAYLOG_IMPRIVATA_RADIUS_STREAM_ID,
            iseQueryMode,
            adEventsCount: events.length,
            iseEventsCount: iseDetails ? 1 : 0,
            imprivataRadiusEventsCount: imprivataDetails?.radiusSessions.length || 0,
            imprivataEssoEventsCount: imprivataDetails?.essoEvents.length || 0
        }
    };
}

/**
 * Groups events into chronological time buckets for charting.
 */
function buildTimelineBuckets(events: AdSecurityEvent[], rangeHours: number): FailureTimelineBucket[] {
    if (events.length === 0) return [];

    // Bucket interval in minutes: 5m for <= 4h, 15m for <= 24h, 60m for > 24h
    const intervalMinutes = rangeHours <= 4 ? 5 : (rangeHours <= 24 ? 15 : 60);
    const intervalMs = intervalMinutes * 60 * 1000;

    const bucketsMap = new Map<number, FailureTimelineBucket>();

    for (const e of events) {
        const timeMs = new Date(e.timestamp).getTime();
        if (isNaN(timeMs)) continue;

        const bucketKey = Math.floor(timeMs / intervalMs) * intervalMs;

        let b = bucketsMap.get(bucketKey);
        if (!b) {
            b = {
                time: new Date(bucketKey).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                timestamp: bucketKey,
                lockouts: 0,
                failedLogons: 0,
                kerberosFailures: 0,
                ntlmFailures: 0,
                unlocks: 0,
                passwordChanges: 0,
                total: 0
            };
            bucketsMap.set(bucketKey, b);
        }

        if (e.eventId === "4740") b.lockouts += 1;
        else if (e.eventId === "4625") b.failedLogons += 1;
        else if (e.eventId === "4771" || e.eventId === "4768" || e.eventId === "4769") b.kerberosFailures += 1;
        else if (e.eventId === "4776") b.ntlmFailures += 1;
        else if (e.eventId === "4767") b.unlocks += 1;
        else if (e.eventId === "4723" || e.eventId === "4724") b.passwordChanges += 1;
        b.total += 1;
    }

    return Array.from(bucketsMap.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Fetches recent Event 4740 account lockouts across Active Directory in descending order.
 */
export async function fetchRecentAccountLockouts(
    rangeHours: number = 24,
    limit: number = 500
): Promise<RecentLockoutsOverview> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    const rangeSeconds = Math.max(300, rangeHours * 3600);

    const rawList: Array<{
        id: string;
        timestamp: string;
        username: string;
        callerDevice: string;
        isIsePsn: boolean;
        domainController: string;
        sourceIp?: string;
        rawMessage?: string;
    }> = [];

    let totalReported = 0;

    if (ogToken) {
        const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");
        const params = new URLSearchParams({
            query: "winlog_event_id:4740",
            range: rangeSeconds.toString(),
            filter: `streams:${OG_GRAYLOG_AD_STREAM_ID}`,
            limit: Math.min(limit, 1000).toString(),
            sort: "timestamp:desc"
        });

        try {
            const res = await axios.get(`${ogUrl}/api/search/universal/relative?${params.toString()}`, {
                httpsAgent,
                headers: {
                    Authorization: authHeader,
                    Accept: "application/json",
                    "X-Requested-By": "pane-o-glass"
                },
                timeout: 15000
            });

            totalReported = res.data.total_results || 0;
            const messages = res.data.messages || [];

            for (const item of messages) {
                const m = item.message;
                if (!m) continue;

                const username = String(m.winlog_event_data_TargetUserName || "").trim();
                if (!username) continue;

                const caller = extractCallerName(m);
                const callerPsn = isIsePsn(caller);
                const dc = String(m.winlog_computer_name || m.source || "Unknown DC").trim();
                const srcIp = extractSourceIp(m);
                const ts = m.timestamp || new Date().toISOString();
                const id = String(m.gl2_message_id || m._id || `${ts}-${username}-${caller}`);

                rawList.push({
                    id,
                    timestamp: ts,
                    username,
                    callerDevice: caller,
                    isIsePsn: callerPsn,
                    domainController: dc,
                    sourceIp: srcIp !== "-" ? srcIp : undefined,
                    rawMessage: typeof m.message === "string" ? m.message.slice(0, 1000) : undefined
                });
            }
        } catch (graylogErr: any) {
            console.warn("[Account-Lockout] Graylog 4740 stream fetch failed, falling back to DB:", graylogErr.message);
        }
    }

    // If Graylog returned nothing or failed, fallback to PostgreSQL Prisma cache
    if (rawList.length === 0) {
        const since = new Date(Date.now() - rangeSeconds * 1000);
        try {
            const dbEvents = await prisma.accountLifecycleEvent.findMany({
                where: {
                    timestamp: { gte: since },
                    eventId: "4740"
                },
                orderBy: { timestamp: "desc" },
                take: limit
            });

            totalReported = dbEvents.length;
            for (const e of dbEvents) {
                const caller = e.callerComputer && e.callerComputer !== "-" ? e.callerComputer : "Unknown Caller";
                rawList.push({
                    id: e.id,
                    timestamp: e.timestamp.toISOString(),
                    username: e.targetUsername,
                    callerDevice: caller,
                    isIsePsn: isIsePsn(caller),
                    domainController: e.domainController || "Unknown DC",
                    sourceIp: undefined,
                    rawMessage: e.rawMessage || undefined
                });
            }
        } catch (dbErr: any) {
            console.error("[Account-Lockout] Fallback DB query failed:", dbErr);
        }
    }

    // Sort strictly descending by timestamp
    rawList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate per-user frequencies in this timeframe
    const userCountMap = new Map<string, number>();
    for (const item of rawList) {
        const k = item.username.toLowerCase();
        userCountMap.set(k, (userCountMap.get(k) || 0) + 1);
    }

    const lockouts: RecentLockoutEvent[] = rawList.map(item => ({
        ...item,
        userLockoutCountInWindow: userCountMap.get(item.username.toLowerCase()) || 1
    }));

    const uniqueUsers = new Set(lockouts.map(l => l.username.toLowerCase()));
    const wirelessCount = lockouts.filter(l => l.isIsePsn).length;
    const workstationCount = lockouts.length - wirelessCount;

    return {
        rangeHours,
        totalCount: Math.max(totalReported, lockouts.length),
        uniqueUsersCount: uniqueUsers.size,
        wirelessCount,
        workstationCount,
        latestLockoutTimestamp: lockouts[0]?.timestamp || null,
        lockouts
    };
}

