import { prisma } from "@/lib/prisma";
import {
    isCorporateUsernameFormat,
    stripDomainSuffix,
    isNearTypoOfAnchor
} from "@/lib/netscaler-login-triage";

/**
 * Strike Evidence Engine
 *
 * Reconstructs *why* an IP accumulated strikes / blocks by correlating every
 * persisted signal we have for it:
 *   - ResidentialStrikeLedger flags (spray suspect, attempted users, success history, pardons)
 *   - Reputation engine audit trail (AuditLog rows written by recordAuthFailure / recordAuthSuccess)
 *   - Firewall command queue (SHUN / UNSHUN reasons pushed to the perimeter)
 *   - Guardian events (Citrix Auto-Guardian shuns, auto-unshuns)
 *   - Guardian IP blacklist + NetScaler CVE exploit shuns
 *   - AnyConnect VPN failures (failure reasons, per-user breakdown, AD snapshot, burst rate)
 */

// Keep in sync with HONEYPOT_USERNAMES in reputation-ledger.ts
const HONEYPOT_USERNAMES = new Set([
    "admin", "administrator", "root", "guest", "test", "testuser", "service",
    "svc_account", "support", "backup", "scan", "cisco", "citrix", "user", "demo"
]);

const AUDIT_LOOKBACK_DAYS = 180;
const BURST_WINDOW_MS = 10 * 60 * 1000;

export type EvidenceSeverity = "critical" | "high" | "medium" | "info" | "mitigating";

export interface StrikeDriver {
    code: string;
    label: string;
    severity: EvidenceSeverity;
    detail: string;
}

export interface StrikeTimelineEvent {
    at: string;
    source: "REPUTATION_ENGINE" | "FIREWALL_QUEUE" | "GUARDIAN" | "LEDGER" | "BLACKLIST" | "CVE" | "VPN";
    title: string;
    detail: string;
    severity: EvidenceSeverity;
}

export interface AttemptedUserInsight {
    username: string;
    isCorporateFormat: boolean;
    isHoneypot: boolean;
    vpnFailures: number;
    vpnSuccesses: number;
    lastFailureAt: string | null;
    lastSuccessAt: string | null;
    adStatus: string | null;
    adDisplayName: string | null;
    adDepartment: string | null;
    flags: string[];
}

export interface StrikeEvidence {
    ip: string;
    narrative: string;
    ledger: {
        strikeCount: number;
        status: string;
        targetPlatform: string;
        firstSeen: string;
        lastSeen: string;
        expiresAt: string;
        distinctUserCount: number;
        isSpraySuspect: boolean;
        hasVpnSuccess: boolean;
        hasCitrixSuccess: boolean;
        lastSuccessAt: string | null;
        shunPushedAt: string | null;
        siPushedAt: string | null;
        pardonReason: string | null;
    } | null;
    drivers: StrikeDriver[];
    attemptedUsers: AttemptedUserInsight[];
    vpnFailureReasons: Array<{ reason: string; count: number; lastAt: string | null }>;
    failureStats: {
        totalVpnFailures: number;
        totalVpnSuccesses: number;
        firstFailureAt: string | null;
        lastFailureAt: string | null;
        maxFailuresIn10m: number;
    };
    timeline: StrikeTimelineEvent[];
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

function auditSeverity(action: string): EvidenceSeverity {
    if (action.includes("STRIKE_3") || action.includes("CLOUD_VPS") || action.includes("AUTO_SHUN")) return "critical";
    if (action.includes("STRIKE_2") || action.includes("FAST_TRACK")) return "high";
    if (action.includes("STRIKE_1")) return "medium";
    if (action.includes("PARDON") || action.includes("REMOVAL") || action.includes("PROTECTED")) return "mitigating";
    return "info";
}

function humanizeAction(action: string): string {
    const map: Record<string, string> = {
        RESIDENTIAL_STRIKE_1_WATCH: "Strike 1 — Added to Watchlist (VPN)",
        RESIDENTIAL_FAST_TRACK_STRIKE_2: "Fast-tracked to Strike 2 (Recon username)",
        RESIDENTIAL_STRIKE_2_ENFORCED: "Escalated to Strike 2 (Enforced)",
        RESIDENTIAL_STRIKE_3_QUARANTINED: "Escalated to Strike 3 (90d Quarantine)",
        RESIDENTIAL_STRIKE_PARDONED: "Auto-Pardoned (MFA success)",
        AUTH_FAILURE_CLOUD_VPS_SHUNNED: "Cloud/VPS or Blacklisted ASN — Shunned indefinitely",
        CITRIX_STRIKE_1_WATCH: "Citrix Strike 1 — Added to Watchlist (14d)",
        CITRIX_STRIKE_2_ENFORCED: "Citrix Strike 2 — Enforced (7d)",
        CITRIX_STRIKE_3_QUARANTINED: "Citrix Strike 3 — Quarantined (90d)",
        CITRIX_AUTO_SHUN_STRIKE_3: "Citrix Auto-Guardian — Shunned & Quarantined (90d)",
        CITRIX_STRIKE_PROTECTED_PARDON: "Citrix Protected / Pardoned (Strike → 0)",
        SOC_FEED_REMOVAL_PARDON: "SOC manual pardon & feed removal",
        SOC_BULK_FEED_REMOVAL_PARDON: "SOC bulk pardon"
    };
    return map[action] || action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function computeMaxBurst(timestamps: Date[]): number {
    if (timestamps.length === 0) return 0;
    const sorted = timestamps.map(t => t.getTime()).sort((a, b) => a - b);
    let max = 1;
    let start = 0;
    for (let end = 0; end < sorted.length; end++) {
        while (sorted[end] - sorted[start] > BURST_WINDOW_MS) start++;
        max = Math.max(max, end - start + 1);
    }
    return max;
}

export async function getStrikeEvidence(ip: string): Promise<StrikeEvidence> {
    const cleanIp = ip.trim();
    const auditCutoff = new Date(Date.now() - AUDIT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [
        ledger,
        auditRows,
        queueRows,
        guardianEvents,
        blacklist,
        cve,
        failureReasonGroups,
        userStatusGroups,
        adSnapshots,
        recentFailureTimes,
        failureBounds
    ] = await Promise.all([
        prisma.residentialStrikeLedger.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.auditLog.findMany({
            where: { ipAddress: cleanIp, createdAt: { gte: auditCutoff } },
            orderBy: { createdAt: "desc" },
            take: 30,
            select: { action: true, details: true, createdAt: true }
        }).catch(() => []),
        prisma.firewallCommandQueue.findMany({
            where: { ip: cleanIp },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: { action: true, reason: true, status: true, targetHost: true, expiresAt: true, lastError: true, executedAt: true, createdAt: true }
        }).catch(() => []),
        prisma.guardianEvent.findMany({
            where: { ip: cleanIp },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: { action: true, reason: true, firewall: true, details: true, createdAt: true }
        }).catch(() => []),
        prisma.guardianBlacklist.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.netscalerCveShun.findUnique({ where: { ip: cleanIp } }).catch(() => null),
        prisma.vpnEvent.groupBy({
            by: ["failureReason"],
            where: { sourceIp: cleanIp, status: "FAILURE" },
            _count: { _all: true },
            _max: { createdAt: true }
        }).catch(() => [] as any[]),
        prisma.vpnEvent.groupBy({
            by: ["username", "status"],
            where: { sourceIp: cleanIp, status: { in: ["SUCCESS", "FAILURE"] } },
            _count: { _all: true },
            _max: { createdAt: true }
        }).catch(() => [] as any[]),
        prisma.vpnEvent.findMany({
            where: { sourceIp: cleanIp, adStatus: { not: null } },
            orderBy: { createdAt: "desc" },
            distinct: ["username"],
            take: 25,
            select: { username: true, adStatus: true, adDisplayName: true, adDepartment: true }
        }).catch(() => []),
        prisma.vpnEvent.findMany({
            where: { sourceIp: cleanIp, status: "FAILURE" },
            orderBy: { createdAt: "desc" },
            take: 500,
            select: { createdAt: true }
        }).catch(() => []),
        prisma.vpnEvent.aggregate({
            where: { sourceIp: cleanIp, status: "FAILURE" },
            _min: { createdAt: true },
            _max: { createdAt: true }
        }).catch(() => null)
    ]);

    // ---------- Per-user insights ----------
    const userMap = new Map<string, AttemptedUserInsight>();
    const ensureUser = (raw: string) => {
        const key = (raw || "unknown").trim().toLowerCase();
        if (!userMap.has(key)) {
            userMap.set(key, {
                username: key,
                isCorporateFormat: isCorporateUsernameFormat(key),
                isHoneypot: HONEYPOT_USERNAMES.has(key.replace(/@.*$/, "")),
                vpnFailures: 0,
                vpnSuccesses: 0,
                lastFailureAt: null,
                lastSuccessAt: null,
                adStatus: null,
                adDisplayName: null,
                adDepartment: null,
                flags: []
            });
        }
        return userMap.get(key)!;
    };

    (ledger?.attemptedUsers || []).forEach(u => ensureUser(u));
    for (const g of userStatusGroups as any[]) {
        const u = ensureUser(g.username);
        if (g.status === "FAILURE") {
            u.vpnFailures += g._count._all;
            u.lastFailureAt = iso(g._max.createdAt);
        } else if (g.status === "SUCCESS") {
            u.vpnSuccesses += g._count._all;
            u.lastSuccessAt = iso(g._max.createdAt);
        }
    }
    for (const snap of adSnapshots) {
        const u = userMap.get((snap.username || "").trim().toLowerCase());
        if (u) {
            u.adStatus = snap.adStatus;
            u.adDisplayName = snap.adDisplayName;
            u.adDepartment = snap.adDepartment;
        }
    }
    // Identify anchor users on this IP (active in AD or verified login success)
    const anchorUsers = Array.from(userMap.values()).filter(
        (u) => (u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" || u.vpnSuccesses > 0) && u.isCorporateFormat
    );

    for (const u of userMap.values()) {
        let matchedAnchor = "";
        if (u.adStatus === "NOT_FOUND" || !u.isCorporateFormat) {
            for (const a of anchorUsers) {
                if (isNearTypoOfAnchor(u.username, a.username)) {
                    matchedAnchor = a.username;
                    break;
                }
            }
        }

        if (matchedAnchor) {
            u.flags.push(`Typo of ${matchedAnchor}`);
        } else {
            if (u.isHoneypot) u.flags.push("Honeypot / generic account");
            else if (!u.isCorporateFormat) u.flags.push("Non-corporate username format");
            if (u.adStatus === "NOT_FOUND") u.flags.push("Account does not exist in AD");
            if (u.adStatus === "DISABLED") u.flags.push("Disabled AD account");
        }
        if (u.vpnSuccesses > 0) u.flags.push("Has successful logins");
    }
    const attemptedUsers = Array.from(userMap.values()).sort(
        (a, b) => b.vpnFailures - a.vpnFailures || a.username.localeCompare(b.username)
    );

    // ---------- Failure stats ----------
    const vpnFailureReasons = (failureReasonGroups as any[])
        .map(g => ({
            reason: g.failureReason || "Unspecified authentication failure",
            count: g._count._all as number,
            lastAt: iso(g._max.createdAt)
        }))
        .sort((a, b) => b.count - a.count);

    const totalVpnFailures = vpnFailureReasons.reduce((s, r) => s + r.count, 0);
    const totalVpnSuccesses = attemptedUsers.reduce((s, u) => s + u.vpnSuccesses, 0);
    const maxFailuresIn10m = computeMaxBurst(recentFailureTimes.map(r => r.createdAt));

    // ---------- Drivers (the "why") ----------
    const drivers: StrikeDriver[] = [];

    if (cve) {
        drivers.push({
            code: "CVE_EXPLOIT",
            label: `Exploit signature ${cve.cve}`,
            severity: cve.status === "ACTIVE" ? "critical" : "info",
            detail: `Matched rule "${cve.ruleName}" ${cve.matchCount}× (status ${cve.status}).${cve.samplePayload ? ` Sample: ${cve.samplePayload.slice(0, 180)}` : ""}`
        });
    }

    if (blacklist) {
        drivers.push({
            code: "GUARDIAN_BLACKLIST",
            label: "Guardian IP Blacklist (permanent)",
            severity: "critical",
            detail: blacklist.reason
        });
    }

    const citrixShun = guardianEvents.find(e => e.action === "SHUNNED");
    if (citrixShun) {
        drivers.push({
            code: "CITRIX_AUTO_GUARDIAN",
            label: citrixShun.reason === "BLACK_LISTED_ASN" ? "Citrix failures from Blacklisted ASN" : "Citrix authentication burst",
            severity: "critical",
            detail: citrixShun.details || "Shunned by Citrix Auto-Guardian"
        });
    }

    const honeypots = attemptedUsers.filter(u => u.isHoneypot);
    const nonCorp = attemptedUsers.filter(u => !u.isHoneypot && !u.isCorporateFormat && u.username !== "unknown" && !u.flags.some(f => f.startsWith("Typo of")));
    const notInAd = attemptedUsers.filter(u => u.adStatus === "NOT_FOUND" && !u.flags.some(f => f.startsWith("Typo of")));
    const disabledAd = attemptedUsers.filter(u => u.adStatus === "DISABLED");
    const typoUsers = attemptedUsers.filter(u => u.flags.some(f => f.startsWith("Typo of")));

    // Cluster genuine distinct identities (strip domains and exclude anchor typos)
    const genuineIdentities = new Set(
        attemptedUsers
            .filter(u => !u.flags.some(f => f.startsWith("Typo of")))
            .map(u => stripDomainSuffix(u.username).toLowerCase())
    );
    const distinctUsers = genuineIdentities.size;

    if (typoUsers.length > 0) {
        drivers.push({
            code: "USER_TYPO_OF_ANCHOR",
            label: "Username typo of verified corporate account",
            severity: "mitigating",
            detail: `Attempt(s) ${typoUsers.map(u => `${u.username} (${u.flags.find(f => f.startsWith("Typo of"))})`).join(", ")} matched an active corporate account on this IP. Not counted as a multi-user spray.`
        });
    }

    if (ledger?.isSpraySuspect && distinctUsers >= 2) {
        drivers.push({
            code: "MULTI_USER_SPRAY",
            label: `Password spray: ${distinctUsers} distinct usernames`,
            severity: "high",
            detail: `A single source IP attempted multiple accounts (${Array.from(genuineIdentities).slice(0, 6).join(", ")}${distinctUsers > 6 ? ", …" : ""}). Multi-user attempts disqualify auto-pardon.`
        });
    } else if (distinctUsers >= 2) {
        drivers.push({
            code: "MULTI_USER",
            label: `${distinctUsers} distinct usernames attempted`,
            severity: "medium",
            detail: "Multiple accounts were tried from this IP."
        });
    }

    if (honeypots.length > 0) {
        drivers.push({
            code: "HONEYPOT_USER",
            label: "Honeypot / generic account targeted",
            severity: "high",
            detail: `Attempted: ${honeypots.map(u => u.username).join(", ")}. Generic accounts are reconnaissance and fast-track to Strike 2.`
        });
    }

    if (nonCorp.length > 0) {
        drivers.push({
            code: "NON_CORPORATE_FORMAT",
            label: "Non-corporate username format",
            severity: "high",
            detail: `Attempted: ${nonCorp.slice(0, 6).map(u => u.username).join(", ")}. Formats like flastname / dot notation don't match Cooper accounts and fast-track to Strike 2.`
        });
    }

    if (notInAd.length > 0) {
        drivers.push({
            code: "AD_NOT_FOUND",
            label: "Non-existent AD accounts probed",
            severity: "high",
            detail: `No AD account exists for: ${notInAd.map(u => u.username).join(", ")}.`
        });
    }

    if (disabledAd.length > 0) {
        drivers.push({
            code: "AD_DISABLED",
            label: "Disabled AD accounts attempted",
            severity: "medium",
            detail: `Disabled accounts: ${disabledAd.map(u => u.username).join(", ")}.`
        });
    }

    if (maxFailuresIn10m >= 3) {
        drivers.push({
            code: "FAILURE_BURST",
            label: `${maxFailuresIn10m} VPN failures within 10 minutes`,
            severity: maxFailuresIn10m >= 10 ? "high" : "medium",
            detail: "Peak failure rate observed from this IP in a rolling 10-minute window."
        });
    }

    if (ledger) {
        if (ledger.strikeCount >= 3 && ledger.status === "QUARANTINED" && !citrixShun) {
            drivers.push({
                code: "HABITUAL_OFFENDER",
                label: "Repeat failures after Strike 2",
                severity: "critical",
                detail: "Additional failures arrived while already enforced at Strike 2, escalating to a 90-day quarantine."
            });
        } else if (ledger.strikeCount === 2 && distinctUsers < 2 && honeypots.length === 0 && nonCorp.length === 0) {
            drivers.push({
                code: "REPEAT_FAILURE",
                label: "Repeat failure on the same account",
                severity: "medium",
                detail: `Additional failure(s) for ${attemptedUsers[0]?.username || "the same user"} outside the protected retry window.`
            });
        } else if (ledger.strikeCount === 1 && ledger.status === "WATCHING") {
            drivers.push({
                code: "SINGLE_FAILURE_WATCH",
                label: "Single-account failure from residential ISP",
                severity: "medium",
                detail: "Observation only (no block). Escalates on another failure or a second username."
            });
        }

        if (ledger.hasVpnSuccess || ledger.hasCitrixSuccess || ledger.lastSuccessAt) {
            const platforms = [ledger.hasVpnSuccess && "VPN", ledger.hasCitrixSuccess && "Citrix"].filter(Boolean).join(" + ") || "auth";
            drivers.push({
                code: "PRIOR_SUCCESS",
                label: `Prior successful ${platforms} login`,
                severity: "mitigating",
                detail: `Last success ${ledger.lastSuccessAt ? new Date(ledger.lastSuccessAt).toLocaleString() : "recorded"}. Single isolated failures from this IP are protected.`
            });
        }
        if (ledger.pardonReason) {
            drivers.push({
                code: "PARDONED",
                label: "Pardon on record",
                severity: "mitigating",
                detail: ledger.pardonReason
            });
        }
    } else if (totalVpnSuccesses > 0) {
        drivers.push({
            code: "PRIOR_SUCCESS",
            label: `${totalVpnSuccesses} successful VPN login(s)`,
            severity: "mitigating",
            detail: `Users: ${attemptedUsers.filter(u => u.vpnSuccesses > 0).map(u => u.username).join(", ")}`
        });
    }

    // ---------- Timeline ----------
    const timeline: StrikeTimelineEvent[] = [];

    for (const a of auditRows) {
        timeline.push({
            at: a.createdAt.toISOString(),
            source: "REPUTATION_ENGINE",
            title: humanizeAction(a.action),
            detail: a.details,
            severity: auditSeverity(a.action)
        });
    }
    for (const q of queueRows) {
        timeline.push({
            at: q.createdAt.toISOString(),
            source: "FIREWALL_QUEUE",
            title: `${q.action} → ${q.targetHost} (${q.status})`,
            detail: q.reason + (q.lastError ? ` — ${q.lastError}` : "") + (q.expiresAt ? ` • hold until ${new Date(q.expiresAt).toLocaleString()}` : ""),
            severity: q.action === "SHUN" ? "high" : "mitigating"
        });
    }
    for (const g of guardianEvents) {
        timeline.push({
            at: g.createdAt.toISOString(),
            source: "GUARDIAN",
            title: `Guardian ${g.action}${g.firewall ? ` @ ${g.firewall}` : ""}${g.reason ? ` (${g.reason})` : ""}`,
            detail: g.details || "",
            severity: g.action === "SHUNNED" ? "critical" : (g.action.includes("UNSHUN") ? "mitigating" : "info")
        });
    }
    if (blacklist) {
        timeline.push({
            at: blacklist.createdAt.toISOString(),
            source: "BLACKLIST",
            title: "Added to Guardian IP Blacklist",
            detail: blacklist.reason,
            severity: "critical"
        });
    }
    if (cve) {
        timeline.push({
            at: cve.shunnedAt.toISOString(),
            source: "CVE",
            title: `CVE shun: ${cve.cve}`,
            detail: cve.ruleName,
            severity: "critical"
        });
    }
    if (ledger) {
        timeline.push({
            at: ledger.firstSeen.toISOString(),
            source: "LEDGER",
            title: "First seen by strike ledger",
            detail: `Platform: ${ledger.targetPlatform}`,
            severity: "info"
        });
        if (ledger.shunPushedAt && !auditRows.length && !queueRows.length) {
            timeline.push({
                at: ledger.shunPushedAt.toISOString(),
                source: "LEDGER",
                title: "Shun / SI push recorded",
                detail: `Strike ${ledger.strikeCount} (${ledger.status})`,
                severity: "high"
            });
        }
        if (ledger.lastSuccessAt) {
            timeline.push({
                at: ledger.lastSuccessAt.toISOString(),
                source: "LEDGER",
                title: "Successful authentication recorded",
                detail: ledger.pardonReason || "Success flag set on ledger",
                severity: "mitigating"
            });
        }
    }
    if (failureBounds?._min?.createdAt && totalVpnFailures > 0) {
        timeline.push({
            at: failureBounds._min.createdAt.toISOString(),
            source: "VPN",
            title: "First VPN failure from this IP",
            detail: `${totalVpnFailures} total failure(s) on record`,
            severity: "info"
        });
    }

    timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    // ---------- Narrative ----------
    const severityRank: Record<EvidenceSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3, mitigating: 4 };
    const causal = drivers.filter(d => d.severity !== "mitigating" && d.severity !== "info")
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
    const mitigating = drivers.filter(d => d.severity === "mitigating");

    let narrative: string;
    if (!ledger && causal.length === 0) {
        narrative = totalVpnFailures > 0
            ? `No strike record. ${totalVpnFailures} VPN failure(s) observed but none escalated.`
            : "No strike record or failure evidence found for this IP.";
    } else {
        const head = ledger
            ? `Strike ${ledger.strikeCount} (${ledger.status}) via ${ledger.targetPlatform}`
            : "Blocked";
        const why = causal.length > 0 ? causal.slice(0, 3).map(d => d.label).join("; ") : "no specific escalation trigger recorded";
        narrative = `${head} — ${why}.`;
        if (mitigating.length > 0) narrative += ` Mitigating: ${mitigating.map(d => d.label).join("; ")}.`;
    }

    return {
        ip: cleanIp,
        narrative,
        ledger: ledger ? {
            strikeCount: ledger.strikeCount,
            status: ledger.status,
            targetPlatform: ledger.targetPlatform,
            firstSeen: ledger.firstSeen.toISOString(),
            lastSeen: ledger.lastSeen.toISOString(),
            expiresAt: ledger.expiresAt.toISOString(),
            distinctUserCount: ledger.distinctUserCount,
            isSpraySuspect: ledger.isSpraySuspect,
            hasVpnSuccess: ledger.hasVpnSuccess,
            hasCitrixSuccess: ledger.hasCitrixSuccess,
            lastSuccessAt: iso(ledger.lastSuccessAt),
            shunPushedAt: iso(ledger.shunPushedAt),
            siPushedAt: iso(ledger.siPushedAt),
            pardonReason: ledger.pardonReason
        } : null,
        drivers: drivers.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]),
        attemptedUsers,
        vpnFailureReasons,
        failureStats: {
            totalVpnFailures,
            totalVpnSuccesses,
            firstFailureAt: iso(failureBounds?._min?.createdAt),
            lastFailureAt: iso(failureBounds?._max?.createdAt),
            maxFailuresIn10m
        },
        timeline: timeline.slice(0, 40)
    };
}
