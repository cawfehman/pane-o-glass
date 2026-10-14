import { PrismaClient } from "@prisma/client";
import path from "path";
import https from "https";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const prisma = new PrismaClient();

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

const OG_GRAYLOG_AD_STREAM_ID = "5d72ac00b209026ab42decf9";

function log(msg: string) {
    const timestamp = new Date().toISOString();
    console.log(`[LIFECYCLE-SYNC][${timestamp}] ${msg}`);
}

function errorLog(msg: string, err?: any) {
    const timestamp = new Date().toISOString();
    console.error(`[LIFECYCLE-SYNC-ERROR][${timestamp}] ${msg}`, err?.message || err || "");
}

export interface SyncResult {
    totalFetched: number;
    totalInserted: number;
    durationMs: number;
    error?: string;
}

/**
 * Main Sync Routine: Fetches AD account lifecycle & password change events from Graylog and persists to PostgreSQL.
 */
export async function syncAccountLifecycleEvents(rangeSeconds: number = 900): Promise<SyncResult> {
    const startTime = Date.now();
    const ogUrl = (process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000").replace(/\/$/, "");
    const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";

    if (!ogToken) {
        throw new Error("OG_GRAYLOG_API_TOKEN is not configured in environment.");
    }

    const authHeader = "Basic " + Buffer.from(`${ogToken}:token`).toString("base64");

    // Events:
    // 4723: User Self-Service Password Change Attempt
    // 4724: Administrative Password Reset Attempt
    // 4738: User Account Modified (flags, expiration, etc.)
    // 4767: Account Unlocked
    // 4722: Account Enabled
    // 4725: Account Disabled
    // 4720: Account Created
    // 4726: Account Deleted
    const query = `winlog_event_id:(4723 OR 4724 OR 4738 OR 4767 OR 4722 OR 4725 OR 4720 OR 4726)`;

    log(`Fetching AD lifecycle events from Graylog (Stream: ${OG_GRAYLOG_AD_STREAM_ID}, Range: ${rangeSeconds}s)...`);

    // Graylog relative search endpoint
    const limit = rangeSeconds > 3600 ? 5000 : 500;
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
            "X-Requested-By": "pane-o-glass-cron"
        },
        timeout: 30000
    });

    const rawMessages = res.data.messages || [];
    log(`Retrieved ${rawMessages.length} raw lifecycle messages from Graylog.`);

    if (rawMessages.length === 0) {
        // Record heartbeat
        await updateJobStatus("SUCCESS", `No new lifecycle events in the last ${rangeSeconds}s.`);
        return {
            totalFetched: 0,
            totalInserted: 0,
            durationMs: Date.now() - startTime
        };
    }

    const eventsToInsert: any[] = [];

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

        // Failure detection
        const rawKeywords = m.winlog_keywords || [];
        const isFailure = Array.isArray(rawKeywords)
            ? rawKeywords.some(k => /fail/i.test(String(k)))
            : /Audit Failure/i.test(String(m.message || ""));
        const status = isFailure ? "FAILURE" : "SUCCESS";

        // Event classification
        let eventType = "UNKNOWN";
        let eventTitle = `Event ${evId}`;

        if (evId === "4723") {
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

        const callerComputer = m.winlog_event_data_Workstation || m.winlog_event_data_CallerComputerName || m.winlog_event_data_WorkstationName || null;
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

    log(`Prepared ${eventsToInsert.length} validated events for database insertion.`);

    // Batch insertion with skipDuplicates for idempotency
    let insertedCount = 0;
    if (eventsToInsert.length > 0) {
        // Chunk inserts into batches of 100 to adhere to PostgreSQL parameter boundaries
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
    log(`Sync completed: ${insertedCount} new events inserted (${eventsToInsert.length - insertedCount} duplicates skipped) in ${durationMs}ms.`);

    await updateJobStatus("SUCCESS", `Synced ${insertedCount} new AD lifecycle events (${eventsToInsert.length} evaluated).`);

    return {
        totalFetched: rawMessages.length,
        totalInserted: insertedCount,
        durationMs
    };
}

async function updateJobStatus(status: "SUCCESS" | "FAILURE", message: string) {
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
    } catch (e: any) {
        errorLog("Failed to update background job status:", e);
    }
}

// CLI Execution Handlers
if (require.main === module) {
    const isOnce = process.argv.includes("--once") || process.argv.includes("--seed");
    const rangeArgIdx = process.argv.indexOf("--range");
    const daysArgIdx = process.argv.indexOf("--days") !== -1 ? process.argv.indexOf("--days") : process.argv.indexOf("--seed");
    
    let customRange = 900;
    if (daysArgIdx !== -1 && process.argv[daysArgIdx + 1] && !isNaN(parseInt(process.argv[daysArgIdx + 1], 10))) {
        customRange = parseInt(process.argv[daysArgIdx + 1], 10) * 86400;
    } else if (rangeArgIdx !== -1 && process.argv[rangeArgIdx + 1]) {
        customRange = parseInt(process.argv[rangeArgIdx + 1], 10);
    }

    if (isOnce) {
        log(`Executing single sync pass (range: ${customRange}s / ${(customRange / 3600).toFixed(1)}h)...`);
        syncAccountLifecycleEvents(customRange)
            .then(res => {
                log(`Single pass completed successfully. Inserted: ${res.totalInserted}`);
                return prisma.$disconnect().then(() => process.exit(0));
            })
            .catch(err => {
                errorLog("Single pass failed:", err);
                return prisma.$disconnect().then(() => process.exit(1));
            });
    } else {
        // Daemon mode: Every 10 minutes (600,000 ms)
        const INTERVAL_MS = 10 * 60 * 1000;
        log(`Starting background AD Lifecycle & Password Sync Daemon (interval: 10m, sliding lookback: 15m)...`);

        const runLoop = async () => {
            try {
                await syncAccountLifecycleEvents(900);
            } catch (err) {
                errorLog("Daemon polling cycle failed:", err);
                await updateJobStatus("FAILURE", `Sync error: ${(err as any)?.message || err}`);
            }
        };

        // Initial run
        runLoop().then(() => {
            setInterval(runLoop, INTERVAL_MS);
        });
    }
}
