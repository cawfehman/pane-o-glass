import https from "https";
import axios from "axios";

const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

export type GraylogClusterId = "OG_GRAYLOG" | "NEW_GRAYLOG";

export type GraylogBacklogHealth =
    | "REALTIME"
    | "MINOR_LAG"
    | "BACKLOGGED"
    | "CRITICAL_FULL"
    | "OFFLINE";

export interface GraylogClusterJournalTelemetry {
    cluster: GraylogClusterId;
    label: string;
    host: string;
    reachable: boolean;
    status: GraylogBacklogHealth;
    uncommittedEntries: number;
    appendEventsPerSec: number;
    readEventsPerSec: number;
    netDrainRatePerSec: number;
    journalSizeBytes: number;
    journalLimitBytes: number;
    utilizationPct: number;
    oldestSegmentIso: string | null;
    lagSeconds: number;
    lagMinutes: number;
    etaClearMinutes: number | null;
    isFillingUp: boolean;
    newestIndexedEstimateIso: string;
    summaryText: string;
    checkedAt: string;
}

export interface GraylogBacklogGuardianReport {
    ogGraylog: GraylogClusterJournalTelemetry;
    newGraylog: GraylogClusterJournalTelemetry;
    anyBacklogged: boolean;
    maxLagSeconds: number;
    checkedAt: string;
}

export interface AdaptiveSearchWindow {
    cluster: GraylogClusterId;
    requestedRangeSeconds: number;
    effectiveRangeSeconds: number;
    lagSeconds: number;
    lagMinutes: number;
    isCompensated: boolean;
    anchoredEndMs: number;
    fromIso: string;
    toIso: string;
    telemetry: GraylogClusterJournalTelemetry;
    compensationNote?: string;
}

const CACHE_TTL_MS = 20_000;
let cachedReport: { expiresAt: number; report: GraylogBacklogGuardianReport } | null = null;
let inflightPromise: Promise<GraylogBacklogGuardianReport> | null = null;

function cleanEnv(val?: string): string {
    return (val || "").replace(/^"|"$/g, "").trim();
}

async function probeClusterJournal(
    cluster: GraylogClusterId,
    label: string,
    rawBaseUrl: string,
    rawToken: string
): Promise<GraylogClusterJournalTelemetry> {
    const baseUrl = cleanEnv(rawBaseUrl).replace(/\/+$/, "");
    const token = cleanEnv(rawToken);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    let host = baseUrl;
    try {
        host = new URL(baseUrl).hostname;
    } catch {}

    if (!baseUrl || !token) {
        return {
            cluster,
            label,
            host,
            reachable: false,
            status: "OFFLINE",
            uncommittedEntries: 0,
            appendEventsPerSec: 0,
            readEventsPerSec: 0,
            netDrainRatePerSec: 0,
            journalSizeBytes: 0,
            journalLimitBytes: 0,
            utilizationPct: 0,
            oldestSegmentIso: null,
            lagSeconds: 0,
            lagMinutes: 0,
            etaClearMinutes: null,
            isFillingUp: false,
            newestIndexedEstimateIso: nowIso,
            summaryText: `${label}: Not configured`,
            checkedAt: nowIso,
        };
    }

    const authHeader = token.includes(":")
        ? `Basic ${Buffer.from(token).toString("base64")}`
        : `Basic ${Buffer.from(`${token}:token`).toString("base64")}`;

    try {
        const res = await axios.get(`${baseUrl}/api/system/journal`, {
            headers: {
                Authorization: authHeader,
                Accept: "application/json",
                "X-Requested-By": "pane-o-glass-backlog-guardian",
            },
            httpsAgent,
            timeout: 4500,
        });

        const d = res.data || {};
        const uncommittedEntries = Number(d.uncommitted_journal_entries || 0);
        const appendEventsPerSec = Number(d.append_events_per_second || 0);
        const readEventsPerSec = Number(d.read_events_per_second || 0);
        const netDrainRatePerSec = readEventsPerSec - appendEventsPerSec;
        const journalSizeBytes = Number(d.journal_size || 0);
        const journalLimitBytes = Number(d.journal_size_limit || d.journal_config?.max_size || 1);
        const utilizationPct =
            journalLimitBytes > 0
                ? Math.min(100, Math.round((journalSizeBytes / journalLimitBytes) * 1000) / 10)
                : 0;
        const oldestSegmentIso: string | null = d.oldest_segment || null;

        // Calculate actual indexing lag when uncommitted journal entries are backed up
        let lagSeconds = 0;
        if (uncommittedEntries > 15_000 && oldestSegmentIso) {
            const oldestMs = new Date(oldestSegmentIso).getTime();
            if (!isNaN(oldestMs)) {
                lagSeconds = Math.max(0, Math.round((nowMs - oldestMs) / 1000));
            }
        } else if (uncommittedEntries > 5_000 && readEventsPerSec > 0) {
            lagSeconds = Math.round(uncommittedEntries / Math.max(readEventsPerSec, 1));
        }

        const lagMinutes = Math.round((lagSeconds / 60) * 10) / 10;
        const isFillingUp = uncommittedEntries > 25_000 && netDrainRatePerSec < 0;

        let etaClearMinutes: number | null = null;
        if (uncommittedEntries > 15_000 && netDrainRatePerSec > 0) {
            etaClearMinutes = Math.max(1, Math.ceil(uncommittedEntries / netDrainRatePerSec / 60));
        }

        let status: GraylogBacklogHealth = "REALTIME";
        if (utilizationPct >= 92) {
            status = "CRITICAL_FULL";
        } else if (lagSeconds >= 180 || uncommittedEntries >= 250_000) {
            status = "BACKLOGGED";
        } else if (lagSeconds >= 60 || uncommittedEntries >= 25_000) {
            status = "MINOR_LAG";
        }

        const newestIndexedEstimateIso = new Date(nowMs - lagSeconds * 1000).toISOString();

        let summaryText = `${label}: Real-Time (0m lag)`;
        if (status !== "REALTIME") {
            const entriesM =
                uncommittedEntries >= 1_000_000
                    ? `${(uncommittedEntries / 1_000_000).toFixed(1)}M`
                    : `${Math.round(uncommittedEntries / 1000)}k`;
            const rateStr =
                netDrainRatePerSec >= 0
                    ? `draining +${Math.round(netDrainRatePerSec).toLocaleString()}/s${
                          etaClearMinutes ? `, ETA ~${etaClearMinutes}m` : ""
                      }`
                    : `filling ${Math.round(Math.abs(netDrainRatePerSec)).toLocaleString()}/s`;
            summaryText = `${label}: ~${Math.round(lagMinutes)}m lag (${entriesM} queued, ${utilizationPct}% journal, ${rateStr})`;
        }

        return {
            cluster,
            label,
            host,
            reachable: true,
            status,
            uncommittedEntries,
            appendEventsPerSec,
            readEventsPerSec,
            netDrainRatePerSec,
            journalSizeBytes,
            journalLimitBytes,
            utilizationPct,
            oldestSegmentIso,
            lagSeconds,
            lagMinutes,
            etaClearMinutes,
            isFillingUp,
            newestIndexedEstimateIso,
            summaryText,
            checkedAt: nowIso,
        };
    } catch {
        return {
            cluster,
            label,
            host,
            reachable: false,
            status: "OFFLINE",
            uncommittedEntries: 0,
            appendEventsPerSec: 0,
            readEventsPerSec: 0,
            netDrainRatePerSec: 0,
            journalSizeBytes: 0,
            journalLimitBytes: 0,
            utilizationPct: 0,
            oldestSegmentIso: null,
            lagSeconds: 0,
            lagMinutes: 0,
            etaClearMinutes: null,
            isFillingUp: false,
            newestIndexedEstimateIso: nowIso,
            summaryText: `${label}: Telemetry unreachable`,
            checkedAt: nowIso,
        };
    }
}

/**
 * Fetches live Graylog journal status from both OG_GRAYLOG and NEW_GRAYLOG
 * with a 20-second in-memory cache so frequent search calls incur zero extra latency.
 */
export async function getGraylogBacklogTelemetry(
    forceRefresh = false
): Promise<GraylogBacklogGuardianReport> {
    const now = Date.now();
    if (!forceRefresh && cachedReport && cachedReport.expiresAt > now) {
        return cachedReport.report;
    }

    if (!forceRefresh && inflightPromise) {
        return inflightPromise;
    }

    inflightPromise = (async () => {
        const ogUrl = process.env.OG_GRAYLOG_URL || "https://graylog.cooperhealth.edu:9000";
        const ogToken = process.env.OG_GRAYLOG_API_TOKEN || "";
        const newUrl = process.env.GRAYLOG_URL || "https://graylog-01.chsmail.root.cooperhealth.edu:9000";
        const newToken = process.env.GRAYLOG_API_TOKEN || "";

        const [ogGraylog, newGraylog] = await Promise.all([
            probeClusterJournal("OG_GRAYLOG", "OG Graylog (NetScaler / Imprivata)", ogUrl, ogToken),
            probeClusterJournal("NEW_GRAYLOG", "New Graylog (FTD VPN / AD Security)", newUrl, newToken),
        ]);

        const anyBacklogged =
            ogGraylog.status === "BACKLOGGED" ||
            ogGraylog.status === "CRITICAL_FULL" ||
            newGraylog.status === "BACKLOGGED" ||
            newGraylog.status === "CRITICAL_FULL";

        const maxLagSeconds = Math.max(ogGraylog.lagSeconds, newGraylog.lagSeconds);

        const report: GraylogBacklogGuardianReport = {
            ogGraylog,
            newGraylog,
            anyBacklogged,
            maxLagSeconds,
            checkedAt: new Date().toISOString(),
        };

        cachedReport = {
            expiresAt: Date.now() + CACHE_TTL_MS,
            report,
        };
        inflightPromise = null;
        return report;
    })();

    return inflightPromise;
}

/**
 * Computes real-time backlog-compensated search parameters for a target Graylog cluster.
 * - Expands relative `range` (`requestedRangeSeconds + lagSeconds + 120`) so relative queries
 *   don't scan an empty future window when Graylog is behind.
 * - Computes `anchoredEndMs`, `fromIso`, and `toIso` anchored at `now - lagSeconds` for
 *   histograms and absolute time-range queries.
 */
export async function getAdaptiveSearchWindow(
    cluster: GraylogClusterId,
    requestedRangeSeconds: number
): Promise<AdaptiveSearchWindow> {
    const report = await getGraylogBacklogTelemetry();
    const telemetry = cluster === "OG_GRAYLOG" ? report.ogGraylog : report.newGraylog;

    const lagSeconds = telemetry.lagSeconds;
    const isCompensated = lagSeconds >= 90;

    // Add lagSeconds + 120s buffer when backlogged so relative queries cover the full requested duration of indexed logs
    const effectiveRangeSeconds = isCompensated
        ? requestedRangeSeconds + lagSeconds + 120
        : requestedRangeSeconds;

    const anchoredEndMs = isCompensated
        ? Date.now() - lagSeconds * 1000
        : Date.now();

    const fromIso = new Date(anchoredEndMs - requestedRangeSeconds * 1000).toISOString();
    const toIso = new Date(anchoredEndMs + (isCompensated ? 60_000 : 0)).toISOString();

    const compensationNote = isCompensated
        ? `Backlog Guardian Active: ${telemetry.summaryText}. Search window automatically shifted/expanded by +${Math.round(
              telemetry.lagMinutes
          )}m to capture the latest indexed events.`
        : undefined;

    return {
        cluster,
        requestedRangeSeconds,
        effectiveRangeSeconds,
        lagSeconds,
        lagMinutes: telemetry.lagMinutes,
        isCompensated,
        anchoredEndMs,
        fromIso,
        toIso,
        telemetry,
        compensationNote,
    };
}
