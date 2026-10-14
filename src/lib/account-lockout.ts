import axios from "axios";
import * as https from "https";
import { parseStringPromise } from "xml2js";
import { parseCalledStationId, normalizeMacAddress, getIseUrls, executeWithPanFailover } from "./ise";
import { resolveIpHostname } from "./ise";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export const OG_GRAYLOG_AD_STREAM_ID = "5d72ac00b209026ab42decf9";
export const OG_GRAYLOG_ISE_STREAM_ID = "60ff11b8950aa8572f333457";

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

export interface PasswordChangeActivity {
    detected: boolean;
    type: "USER_CHANGE" | "ADMIN_RESET" | null;
    timestamp: string | null;
    performedBy: string | null;
    lockoutsAfterChange: number;
    failuresAfterChange: number;
    minutesBeforeFirstLockout: number | null;
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
    rangeHours: number;
    hasLockout: boolean;
    lockoutCount: number;
    latestLockoutTimestamp: string | null;
    totalFailureEvents: number;
    passwordChangeActivity: PasswordChangeActivity;
    unlockActivity: UnlockActivity;
    rootCauseCategory:
        | "WIRELESS_EAP_ISE"
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
        type: "ISE_WIRELESS" | "WORKSTATION" | "UNKNOWN";
        callerName: string;
        isIsePsn: boolean;
        iseDetails?: IseWirelessDetails | null;
        workstationDetails?: WorkstationDetails | null;
    };
    uniqueCallers: string[];
    timeline: FailureTimelineBucket[];
    events: AdSecurityEvent[];
    queriedSources: {
        adGraylogStream: string;
        iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED";
        adEventsCount: number;
        iseEventsCount: number;
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
async function fetchAdSecurityEventsFromGraylog(username: string, rangeSeconds: number): Promise<AdSecurityEvent[]> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    if (!ogToken) {
        throw new Error("OG_GRAYLOG_API_TOKEN is not configured in environment.");
    }

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");
    const cleanUser = username.trim().toLowerCase().replace(/^chsmail\\/i, "").replace(/@cooperhealth\.edu$/i, "");

    // Query targeting Event IDs:
    // - 4740: Account Locked Out
    // - 4625: Failed Logon Attempt
    // - 4771: Kerberos Pre-Auth Failed
    // - 4776: NTLM Credential Validation Failed
    // - 4767: Account Unlocked
    // - 4723: Password Change Attempt (User)
    // - 4724: Password Reset Attempt (Admin)
    // - 4648: Explicit Credential Logon
    // - 4768: Kerberos TGT Failed (Exclude 0x0 success)
    // - 4769: Kerberos Service Ticket Failed (Exclude 0x0 success)
    const luceneQuery = `winlog_event_data_TargetUserName:"${cleanUser}" AND (winlog_event_id:(4740 OR 4625 OR 4771 OR 4776 OR 4767 OR 4723 OR 4724 OR 4648) OR (winlog_event_id:(4768 OR 4769) AND NOT winlog_event_data_Status:0x0))`;

    const params = new URLSearchParams({
        query: luceneQuery,
        range: rangeSeconds.toString(),
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
                targetUser: m.winlog_event_data_TargetUserName || cleanUser,
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
async function queryIseMntForUser(username: string): Promise<IseWirelessDetails | null> {
    try {
        const { basicAuth } = getIseUrls();
        const cleanUser = username.trim().toLowerCase().replace(/^chsmail\\/i, "").replace(/@cooperhealth\.edu$/i, "");

        const xmlText = await executeWithPanFailover(async (baseUrl) => {
            const endpoint = `${baseUrl}/admin/API/mnt/AuthStatus/userName/${encodeURIComponent(cleanUser)}/86400/50/All`;
            const response = await axios.get(endpoint, {
                headers: {
                    Authorization: `Basic ${basicAuth}`,
                    Accept: "application/xml",
                    "X-ERS-Internal-User": "true"
                },
                httpsAgent,
                timeout: 6000
            });
            return response.data;
        });

        const parsed = await parseStringPromise(xmlText, {
            explicitArray: false,
            tagNameProcessors: [(name: string) => name.split(":").pop() || name]
        });

        const records = parsed?.authStatusList?.authStatusRecord;
        if (!records) return null;

        const recordList = Array.isArray(records) ? records : [records];
        if (recordList.length === 0) return null;

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
    } catch (e: any) {
        console.warn("[Account-Lockout] ISE MnT lookup note:", e.message);
        return null;
    }
}

/**
 * Historical Fallback: Queries Graylog ISE 3.0 Stream (Stream: 60ff11b8950aa8572f333457)
 * Used when events are > 24 hours old or ISE MnT API lacks records.
 */
async function queryGraylogIseStreamForUser(username: string, rangeSeconds: number): Promise<IseWirelessDetails | null> {
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
    if (!ogToken) return null;

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");
    const cleanUser = username.trim().toLowerCase().replace(/^chsmail\\/i, "").replace(/@cooperhealth\.edu$/i, "");

    const query = `"${cleanUser}" AND (CISE_Failed_Attempts OR CISE_Passed_Authentications OR "Radius-Accounting")`;

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
 * Main Orchestrator: Conducts end-to-end investigation for a user account lockout.
 */
export async function investigateAccountLockout(
    username: string,
    rangeHours: number = 24
): Promise<LockoutInvestigationResult> {
    const cleanUser = username.trim().toLowerCase().replace(/^chsmail\\/i, "").replace(/@cooperhealth\.edu$/i, "");
    const rangeSeconds = Math.max(3600, rangeHours * 3600);

    // 1. Fetch AD Security Events from Graylog
    const events = await fetchAdSecurityEventsFromGraylog(cleanUser, rangeSeconds);

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
        detected: sortedPwdChanges.length > 0,
        type: latestPwd ? (latestPwd.eventId === "4723" ? "USER_CHANGE" : "ADMIN_RESET") : null,
        timestamp: latestPwd?.timestamp || null,
        performedBy: latestPwd?.subjectUser || null,
        lockoutsAfterChange: 0,
        failuresAfterChange: 0,
        minutesBeforeFirstLockout: null
    };

    if (latestPwd?.timestamp) {
        const pwdMs = new Date(latestPwd.timestamp).getTime();
        const subsequentLockouts = lockoutEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);
        const subsequentFailures = failureEvents.filter(e => new Date(e.timestamp).getTime() >= pwdMs);

        passwordChangeActivity.lockoutsAfterChange = subsequentLockouts.length;
        passwordChangeActivity.failuresAfterChange = subsequentFailures.length;

        if (subsequentLockouts.length > 0) {
            const earliestPostLockout = [...subsequentLockouts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())[0];
            const diffMs = new Date(earliestPostLockout.timestamp).getTime() - pwdMs;
            passwordChangeActivity.minutesBeforeFirstLockout = Math.max(0, Math.round(diffMs / 60000));
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

    let iseDetails: IseWirelessDetails | null = null;
    let iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED" = "SKIPPED";
    let workstationDetails: WorkstationDetails | null = null;

    // 2. Pivot to ISE if caller is an ISE PSN
    if (callerIsIse) {
        // Smart routing: Check age of latest event
        const latestTime = latestLockoutTimestamp ? new Date(latestLockoutTimestamp).getTime() : Date.now();
        const ageHours = (Date.now() - latestTime) / (3600 * 1000);

        if (ageHours <= 24) {
            iseDetails = await queryIseMntForUser(cleanUser);
            if (iseDetails) {
                iseQueryMode = "ISE_MNT";
            }
        }

        // Fallback to Graylog ISE Stream if MnT yielded nothing or event is older
        if (!iseDetails) {
            iseDetails = await queryGraylogIseStreamForUser(cleanUser, rangeSeconds);
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
        executiveSummary = `No account lockout events (4740) or logon failures recorded for '${cleanUser}' in the last ${rangeHours} hours.`;
        recommendation = "The account is not showing recent authentication failures on Domain Controllers. Verify the username spelling or expand the time window.";
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
            ? ` Password was updated ${passwordChangeActivity.minutesBeforeFirstLockout !== null ? `${passwordChangeActivity.minutesBeforeFirstLockout} min before lockouts` : "recently"}; device continues using the old password.`
            : "";

        executiveSummary = hasLockout
            ? `Account '${cleanUser}' locked out ${lockoutCount} time(s). Root cause: Rapid 802.1X wireless EAP authentication failures originating from an ISE Policy Service Node (${primaryCaller}). Device: ${profileText} ${macText} ${apText} ${ssidText}.${pwdNote}`
            : `Multiple wireless authentication failures detected from ISE PSN (${primaryCaller}) for '${cleanUser}' ${macText} ${ssidText}. Risk of account lockout if cached credentials are not updated.${pwdNote}`;

        recommendation = `Have the user locate their wireless device ${macText ? `(${macText})` : ""} connected ${ssidText}. Instruct them to 'Forget' the network or re-enter their current Active Directory password to stop continuous failed auth probes.`;
    } else if (passwordChangeActivity.detected && passwordChangeActivity.lockoutsAfterChange > 0) {
        rootCauseCategory = "POST_PASSWORD_CHANGE_STALE";
        const performedStr = passwordChangeActivity.performedBy ? ` (by ${passwordChangeActivity.performedBy})` : "";
        executiveSummary = `Stale Credentials Post-Password Reset: Password was changed at ${new Date(passwordChangeActivity.timestamp!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${performedStr}. Following the change, ${passwordChangeActivity.lockoutsAfterChange} lockout(s) and ${passwordChangeActivity.failuresAfterChange} failure(s) occurred from '${primaryCaller}'.`;
        recommendation = `Instruct the user to reboot or log off '${primaryCaller}' and clear any cached credentials in Windows Credential Manager.`;
    } else if (explicitLogons.length > 0 && primaryCaller !== "Unknown Caller") {
        rootCauseCategory = "EXPLICIT_CREDENTIALS";
        const proc = explicitLogons[0].processName || "Background Process";
        executiveSummary = `Account authentication failed during explicit credential logon (Event 4648) from '${proc}' on '${primaryCaller}'.`;
        recommendation = `Check background scheduled tasks, batch scripts, or RunAs configurations executing '${proc}' on '${primaryCaller}'.`;
    } else if (workstationDetails?.logonType === 10) {
        rootCauseCategory = "WORKSTATION_RDP";
        executiveSummary = `Account locked out by Remote Desktop (RDP / Logon Type 10) session on workstation '${primaryCaller}'.`;
        recommendation = `Log into workstation '${primaryCaller}' or ask an administrator to disconnect/log off stale RDP sessions for '${cleanUser}'.`;
    } else if (workstationDetails?.logonType === 3) {
        rootCauseCategory = "WORKSTATION_NETWORK_SHARE";
        executiveSummary = `Account locked out by network resource / SMB connection (Logon Type 3) originating from '${primaryCaller}'.`;
        recommendation = `Check Windows Credential Manager on '${primaryCaller}' for saved network drive or printer credentials associated with '${cleanUser}'.`;
    } else if (workstationDetails?.logonType === 4 || workstationDetails?.logonType === 5) {
        rootCauseCategory = "WORKSTATION_SERVICE";
        executiveSummary = `Account locked out by a background Scheduled Task or Windows Service (Logon Type ${workstationDetails.logonType}) on '${primaryCaller}'.`;
        recommendation = `Check Task Scheduler and Windows Services on '${primaryCaller}' for any entries configured to run under '${cleanUser}' with an outdated password.`;
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
        executiveSummary = `Detected ${events.length} authentication events for '${cleanUser}' across ${uniqueCallers.length || 1} source devices.`;
        recommendation = "Review the failure event timeline below to identify repeating patterns and source machines.";
    }

    // 5. Construct Chronological Timeline Buckets (grouped by ~15m or 1h intervals)
    const timeline = buildTimelineBuckets(events, rangeHours);

    return {
        searchedUser: cleanUser,
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
            type: callerIsIse ? "ISE_WIRELESS" : (primaryCaller !== "Unknown Caller" ? "WORKSTATION" : "UNKNOWN"),
            callerName: primaryCaller,
            isIsePsn: callerIsIse,
            iseDetails,
            workstationDetails
        },
        uniqueCallers,
        timeline,
        events,
        queriedSources: {
            adGraylogStream: OG_GRAYLOG_AD_STREAM_ID,
            iseQueryMode,
            adEventsCount: events.length,
            iseEventsCount: iseDetails ? 1 : 0
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
