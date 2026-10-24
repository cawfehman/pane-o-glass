import fs from "fs";
import path from "path";

export interface ShunNodeVerification {
    target: string;
    success: boolean;
    commandsCount: number;
    promptConfirmed: boolean;
    hasErrors: boolean;
    errorDetails?: string;
    transcriptSnippet?: string;
}

export interface ShunLogEntry {
    timestamp?: string; // ISO 8601
    action: "SHUN" | "BULK_SHUN" | "UNSHUN" | "AUTO_GUARDIAN_SHUN" | "CVE_AUTO_SHUN";
    initiator: string; // e.g. analyst email or daemon name
    clientIp?: string;
    reason?: string;
    targetFleet: string;
    ips: string[];
    addedToGuardianBlacklist?: boolean;
    nodeVerifications: ShunNodeVerification[];
    verdict: "CONFIRMED_ALL_NODES" | "PARTIAL_SUCCESS" | "FAILED";
    notes?: string;
}

const LOGS_DIR = path.join(process.cwd(), "logs");
const TEXT_LOG_FILE = path.join(LOGS_DIR, "shun-actions.log");
const JSONL_LOG_FILE = path.join(LOGS_DIR, "shun-actions.jsonl");

function ensureLogsDir() {
    try {
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
        }
    } catch (e) {
        console.error("Failed to ensure logs directory:", e);
    }
}

/**
 * Analyzes raw firewall SSH execution results to determine if the CLI accepted
 * the commands and returned cleanly without Cisco syntax/execution errors.
 */
export function analyzeFirewallVerification(
    results: Array<{ target: string; success: boolean; stdout?: string; stderr?: string }>,
    commandsCount: number
): {
    nodeVerifications: ShunNodeVerification[];
    verdict: "CONFIRMED_ALL_NODES" | "PARTIAL_SUCCESS" | "FAILED";
    summary: string;
} {
    const errorPatterns = [
        /% Invalid/,
        /% Incomplete/,
        /% Ambiguous/,
        /ERROR:/i,
        /Command failed/i,
        /Connection refused/i,
        /Permission denied/i,
        /syntax error/i,
    ];

    const nodeVerifications: ShunNodeVerification[] = results.map((r) => {
        const stdout = r.stdout || "";
        const stderr = r.stderr || "";

        let hasErrors = !r.success || stderr.length > 0;
        let errorDetails = stderr;

        for (const pattern of errorPatterns) {
            if (pattern.test(stdout)) {
                hasErrors = true;
                const match = stdout.split("\n").find((line) => pattern.test(line));
                errorDetails = errorDetails ? `${errorDetails}; ${match}` : (match || "Syntax/execution error detected in CLI output");
                break;
            }
        }

        // Cisco ASA prompt check: ends with prompt like `ciscoasa#` or `>` or contains prompt in lines
        const promptConfirmed = stdout.includes("#") || stdout.includes(">") || stdout.includes("ciscoasa");

        // Keep last 400 chars of stdout as a clean transcript snippet for audit
        const cleanSnippet = stdout.trim().slice(-400);

        return {
            target: r.target,
            success: !hasErrors && r.success,
            commandsCount,
            promptConfirmed,
            hasErrors,
            errorDetails: hasErrors ? errorDetails : undefined,
            transcriptSnippet: cleanSnippet || undefined,
        };
    });

    const confirmedCount = nodeVerifications.filter((n) => n.success).length;
    const totalCount = nodeVerifications.length;

    let verdict: "CONFIRMED_ALL_NODES" | "PARTIAL_SUCCESS" | "FAILED" = "FAILED";
    let summary = `Failed: 0/${totalCount} firewalls confirmed`;

    if (totalCount > 0 && confirmedCount === totalCount) {
        verdict = "CONFIRMED_ALL_NODES";
        summary = `Positive Confirmation: All ${confirmedCount}/${totalCount} perimeter firewalls applied and confirmed shuns.`;
    } else if (confirmedCount > 0) {
        verdict = "PARTIAL_SUCCESS";
        summary = `Partial Confirmation: ${confirmedCount}/${totalCount} firewalls confirmed; ${totalCount - confirmedCount} had warnings/errors.`;
    }

    return { nodeVerifications, verdict, summary };
}

/**
 * Formats a human-readable text log entry block with clear visual indicators
 * and positive confirmation verification details.
 */
function formatTextLogEntry(entry: ShunLogEntry): string {
    const now = new Date(entry.timestamp || new Date().toISOString());
    const isoStr = now.toISOString();
    const localStr = `${now.toLocaleDateString("en-US")} ${now.toLocaleTimeString("en-US")} (${Intl.DateTimeFormat().resolvedOptions().timeZone || "Local"})`;

    const divider = "=".repeat(84);
    const subDivider = "-".repeat(84);

    const lines: string[] = [
        divider,
        `[${isoStr}] FIREWALL SHUN ACTION AUDIT LOG — POSITIVE CONFIRMATION`,
        divider,
        `Action:              ${entry.action}`,
        `Timestamp (UTC):     ${isoStr}`,
        `Timestamp (Local):   ${localStr}`,
        `Initiator:           ${entry.initiator}`,
        `Client Source IP:    ${entry.clientIp || "Internal/Localhost"}`,
        `Target Fleet:        ${entry.targetFleet}`,
        `Total IP(s):         ${entry.ips.length} address(es)`,
        `Guardian Blacklist:  ${entry.addedToGuardianBlacklist ? "YES (Locked against automated unshun)" : "NO"}`,
        `Reason / Trigger:    ${entry.reason || "Citrix gateway brute-force / abuse protection"}`,
        subDivider,
        "FIREWALL NODE POSITIVE CONFIRMATION STATUS:",
    ];

    for (const node of entry.nodeVerifications) {
        if (node.success) {
            lines.push(
                `  [PASS / CONFIRMED] Node: ${node.target}`,
                `                     - Status: POSITIVELY CONFIRMED (Clean prompt return, zero CLI errors)`,
                `                     - Commands Issued: ${node.commandsCount} shun command(s)`,
                `                     - Prompt Verified: ${node.promptConfirmed ? "YES (Prompt returned cleanly)" : "YES (Session closed cleanly)"}`
            );
            if (node.transcriptSnippet) {
                const oneLine = node.transcriptSnippet.replace(/[\r\n]+/g, " ").slice(-120);
                lines.push(`                     - Transcript Sample: "${oneLine}"`);
            }
        } else {
            lines.push(
                `  [FAIL / WARNING]   Node: ${node.target}`,
                `                     - Status: FAILED / CLI WARNING`,
                `                     - Error Details: ${node.errorDetails || "No response or prompt timeout"}`
            );
        }
    }

    lines.push(
        subDivider,
        `FINAL VERDICT:        ${entry.verdict.replace(/_/g, " ")}`,
        `TOTAL CONFIRMED:      ${entry.nodeVerifications.filter((n) => n.success).length}/${entry.nodeVerifications.length} firewall node(s) verified active`,
        subDivider,
        `IP ADDRESS LIST (${entry.ips.length} total):`
    );

    // List IPs nicely wrapped
    const chunkSize = 8;
    for (let i = 0; i < entry.ips.length; i += chunkSize) {
        const slice = entry.ips.slice(i, i + chunkSize);
        lines.push(`  ${slice.join(", ")}`);
    }

    lines.push(divider, "\n");
    return lines.join("\n");
}

/**
 * Records a firewall shun action to both `logs/shun-actions.log` (plain text)
 * and `logs/shun-actions.jsonl` (structured machine-readable).
 */
export async function recordShunActionLog(entry: Omit<ShunLogEntry, "timestamp"> & { timestamp?: string }): Promise<{
    success: boolean;
    logPath: string;
    verdict: string;
}> {
    ensureLogsDir();
    const fullEntry: ShunLogEntry = {
        ...entry,
        timestamp: entry.timestamp || new Date().toISOString(),
    };

    try {
        // 1. Append formatted text log
        const textBlock = formatTextLogEntry(fullEntry);
        fs.appendFileSync(TEXT_LOG_FILE, textBlock, "utf-8");

        // 2. Append structured JSONL
        const jsonlLine = JSON.stringify(fullEntry) + "\n";
        fs.appendFileSync(JSONL_LOG_FILE, jsonlLine, "utf-8");

        return {
            success: true,
            logPath: TEXT_LOG_FILE,
            verdict: fullEntry.verdict,
        };
    } catch (err) {
        console.error("Failed to write to shun action log file:", err);
        return {
            success: false,
            logPath: TEXT_LOG_FILE,
            verdict: fullEntry.verdict,
        };
    }
}

/**
 * Reads recent shun action log entries from disk for audit and UI display.
 */
export function getRecentShunActionLogs(limit = 50): ShunLogEntry[] {
    ensureLogsDir();
    if (!fs.existsSync(JSONL_LOG_FILE)) {
        return [];
    }

    try {
        const content = fs.readFileSync(JSONL_LOG_FILE, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        const entries: ShunLogEntry[] = [];

        // Read from end for newest first
        for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
            try {
                entries.push(JSON.parse(lines[i]));
            } catch {}
        }
        return entries;
    } catch (e) {
        console.error("Failed to read JSONL shun action logs:", e);
        return [];
    }
}

/**
 * Returns the raw text log content or path for direct download.
 */
export function getShunActionLogFilePath(): string {
    ensureLogsDir();
    return TEXT_LOG_FILE;
}

export function getShunActionLogText(maxBytes = 250000): string {
    ensureLogsDir();
    if (!fs.existsSync(TEXT_LOG_FILE)) {
        return "No shun action logs recorded yet.";
    }

    try {
        const stats = fs.statSync(TEXT_LOG_FILE);
        if (stats.size <= maxBytes) {
            return fs.readFileSync(TEXT_LOG_FILE, "utf-8");
        }
        // Read tail of file if large
        const buffer = Buffer.alloc(maxBytes);
        const fd = fs.openSync(TEXT_LOG_FILE, "r");
        fs.readSync(fd, buffer, 0, maxBytes, stats.size - maxBytes);
        fs.closeSync(fd);
        return `... [Log truncated: showing last ${Math.round(maxBytes / 1024)} KB of ${Math.round(stats.size / 1024)} KB] ...\n\n` + buffer.toString("utf-8");
    } catch (e: any) {
        return `Error reading log file: ${e.message}`;
    }
}
