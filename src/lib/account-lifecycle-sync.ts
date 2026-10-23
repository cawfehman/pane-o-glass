import https from "https";
import axios from "axios";
import { prisma } from "@/lib/prisma";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

export const OG_GRAYLOG_AD_STREAM_ID = "5d72ac00b209026ab42decf9";

export interface LifecycleSyncResult {
    totalFetched: number;
    totalInserted: number;
    lockoutsFetched: number;
    durationMs: number;
}

function extractCallerComputerFromMsg(m: any, evId: string): string | null {
    if (m.winlog_event_data_CallerComputerName && String(m.winlog_event_data_CallerComputerName).trim() !== "-") {
        return String(m.winlog_event_data_CallerComputerName).trim();
    }
    if (m.winlog_event_data_WorkstationName && String(m.winlog_event_data_WorkstationName).trim() !== "-") {
        return String(m.winlog_event_data_WorkstationName).trim();
    }
    if (m.winlog_event_data_Workstation && String(m.winlog_event_data_Workstation).trim() !== "-") {
        return String(m.winlog_event_data_Workstation).trim();
    }

    // Winlogbeat Event 4740 often stores Caller Computer Name in TargetDomainName
    if (evId === "4740" && m.winlog_event_data_TargetDomainName && !/^chsmail$/i.test(String(m.winlog_event_data_TargetDomainName).trim())) {
        const td = String(m.winlog_event_data_TargetDomainName).trim();
        if (td !== "-") return td;
    }

    const raw = String(m.message || "");
    const callerMatch = raw.match(/Caller Computer Name:\s*([^\r\n\t]+)/i);
    if (callerMatch && callerMatch[1].trim() && callerMatch[1].trim() !== "-") {
        return callerMatch[1].trim();
    }

    const workstationMatch = raw.match(/Workstation Name:\s*([^\r\n\t]+)/i);
    if (workstationMatch && workstationMatch[1].trim() && workstationMatch[1].trim() !== "-") {
        return workstationMatch[1].trim();
    }

    return null;
}

/**
 * Fetches AD account lockout (4740), unlock (4767), password change/reset (4723/4724),
 * and account lifecycle (4738/4722/4725/4720/4726) events from Graylog and persists to PostgreSQL.
 */
export async function syncAccountLifecycleAndLockouts(rangeSeconds: number = 900): Promise<LifecycleSyncResult> {
    const startTime = Date.now();
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";

    if (!ogToken) {
        throw new Error("OG_GRAYLOG_API_TOKEN is not configured in environment.");
    }

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");

    // Events:
    // 4740: Account Locked Out
    // 4723: User Self-Service Password Change Attempt
    // 4724: Administrative Password Reset Attempt
    // 4738: User Account Modified
    // 4767: Account Unlocked
    // 4722: Account Enabled
    // 4725: Account Disabled
    // 4720: Account Created
    // 4726: Account Deleted
    const query = `winlog_event_id:(4740 OR 4723 OR 4724 OR 4738 OR 4767 OR 4722 OR 4725 OR 4720 OR 4726)`;

    const limit = rangeSeconds > 86400 ? 10000 : rangeSeconds > 3600 ? 5000 : 1000;
    const params = new URLSearchParams({
        query,
        range: rangeSeconds.toString(),
        filter: `streams:${OG_GRAYLOG_AD_STREAM_ID}`,
        limit: limit.toString(),
        sort: "timestamp:desc"
    });

    const url = `${ogUrl}/api/search/universal/relative?${params.toString()}`;

    const res = await axios.get(url, {
        httpsAgent,
        headers: {
            Authorization: authHeader,
            Accept: "application/json",
            "X-Requested-By": "pane-o-glass"
        },
        timeout: 30000
    });

    const rawMessages = res.data.messages || [];
    if (rawMessages.length === 0) {
        await updateLifecycleJobStatus("SUCCESS", `No new lifecycle/lockout events in the last ${rangeSeconds}s.`);
        return {
            totalFetched: 0,
            totalInserted: 0,
            lockoutsFetched: 0,
            durationMs: Date.now() - startTime
        };
    }

    const eventsToInsert: any[] = [];
    let lockoutsFetched = 0;

    for (const item of rawMessages) {
        const m = item.message;
        if (!m) continue;

        const evId = String(m.winlog_event_id || m.event_id || "").trim();
        if (!evId) continue;

        const rawTarget = String(m.winlog_event_data_TargetUserName || m.TargetUserName || "").trim();
        if (!rawTarget || rawTarget === "-") continue;

        // Skip machine account changes ($)
        if (rawTarget.endsWith("$")) continue;

        const cleanTarget = rawTarget
            .toLowerCase()
            .replace(/^(?:chsmail|cooperhealth)\\/i, "")
            .replace(/@(?:chsmail\.root\.)?cooperhealth\.edu$/i, "");

        const canonicalTarget = rawTarget
            .replace(/^(?:chsmail|cooperhealth)\\/i, "")
            .replace(/@(?:chsmail\.root\.)?cooperhealth\.edu$/i, "");

        const rawSubject = String(m.winlog_event_data_SubjectUserName || m.SubjectUserName || "").trim();
        const performedBy = rawSubject && rawSubject !== "-" ? rawSubject : null;

        const rawKeywords = m.winlog_keywords || [];
        const isFailure = Array.isArray(rawKeywords)
            ? rawKeywords.some(k => /fail/i.test(String(k)))
            : /Audit Failure/i.test(String(m.message || ""));
        const status = evId === "4740" ? "FAILURE" : (isFailure ? "FAILURE" : "SUCCESS");

        let eventType = "UNKNOWN";
        let eventTitle = `Event ${evId}`;

        if (evId === "4740") {
            eventType = "ACCOUNT_LOCKOUT";
            eventTitle = "Account Locked Out";
            lockoutsFetched++;
        } else if (evId === "4723") {
            eventType = "USER_PWD_CHANGE";
            eventTitle = isFailure ? "User Password Change Failed" : "User Password Change";
        } else if (evId === "4724") {
            eventType = "ADMIN_PWD_RESET";
            eventTitle = isFailure ? "Admin Password Reset Failed" : "Administrative Password Reset";
        } else if (evId === "4738") {
            eventType = "ACCOUNT_MODIFIED";
            eventTitle = "User Account Modified";
        } else if (evId === "4767") {
            eventType = "ACCOUNT_UNLOCK";
            eventTitle = "Account Unlocked";
        } else if (evId === "4722") {
            eventType = "ACCOUNT_ENABLE";
            eventTitle = "Account Enabled";
        } else if (evId === "4725") {
            eventType = "ACCOUNT_DISABLE";
            eventTitle = "Account Disabled";
        } else if (evId === "4720") {
            eventType = "ACCOUNT_CREATE";
            eventTitle = "Account Created";
        } else if (evId === "4726") {
            eventType = "ACCOUNT_DELETE";
            eventTitle = "Account Deleted";
        }

        const callerComputer = extractCallerComputerFromMsg(m, evId);
        const domainController = m.source || m.agent_name || m.winlog_computer_name || null;
        const subStatus = m.winlog_event_data_SubStatus || m.winlog_event_data_Status || m.winlog_event_data_FailureCode || null;
        const id = String(m._id || m.gl2_message_id || `${evId}-${m.timestamp}-${cleanTarget}`);

        const eventTimestamp = m.timestamp ? new Date(m.timestamp) : new Date();

        eventsToInsert.push({
            id,
            timestamp: eventTimestamp,
            eventId: evId,
            eventType,
            eventTitle,
            targetUsername: cleanTarget,
            canonicalUsername: canonicalTarget,
            performedBy,
            domainController,
            callerComputer,
            status,
            subStatus: subStatus ? String(subStatus) : null,
            subStatusDesc: null,
            rawMessage: String(m.message || "")
        });
    }

    let insertedCount = 0;
    if (eventsToInsert.length > 0) {
        const CHUNK_SIZE = 100;
        for (let i = 0; i < eventsToInsert.length; i += CHUNK_SIZE) {
            const chunk = eventsToInsert.slice(i, i + CHUNK_SIZE);
            const res = await prisma.accountLifecycleEvent.createMany({
                data: chunk,
                skipDuplicates: true
            });
            insertedCount += res.count;
        }
    }

    const durationMs = Date.now() - startTime;
    await updateLifecycleJobStatus(
        "SUCCESS",
        `Synced ${insertedCount} new AD lifecycle/lockout events (${eventsToInsert.length} evaluated, ${lockoutsFetched} lockouts).`
    );

    return {
        totalFetched: rawMessages.length,
        totalInserted: insertedCount,
        lockoutsFetched,
        durationMs
    };
}

async function updateLifecycleJobStatus(status: "SUCCESS" | "FAILURE", message: string) {
    try {
        await prisma.backgroundJob.upsert({
            where: { name: "AD Lifecycle & Password Sync" },
            update: {
                lastRun: new Date(),
                status,
                message
            },
            create: {
                name: "AD Lifecycle & Password Sync",
                status,
                message
            }
        });
    } catch {
        // ignore background job status error
    }
}
