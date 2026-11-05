"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ShieldAlert, ShieldCheck, AlertTriangle, UserCheck, Search,
    RefreshCw, Check, X, ExternalLink, Send, Sparkles, Filter,
    Eye, Building2, MapPin, Laptop, Shield, MessageSquare, Clock,
    Unlock, Lock, CheckCircle2, ChevronRight
} from "lucide-react";

interface CitrixLoginAnomaly {
    id: string;
    anomalyKey: string;
    ip: string;
    flagReason: string;
    triggerSignals: string[];
    suggestedTag: string | null;
    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
    status: string;
    currentDecision: "BLOCKED" | "ALLOWED";
    decisionDetails: string | null;
    ispOrg: string | null;
    asn: string | null;
    cityName: string | null;
    countryCode: string | null;
    isResidential: boolean;
    anchorUsername: string | null;
    anchorDisplayName: string | null;
    anchorDepartment: string | null;
    targetedUsers: string[];
    variantStrings: string[];
    failureCount: number;
    citrixSuccesses: number;
    hasPriorVpn: boolean;
    firstSeen: string;
    lastSeen: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    analystNotes: string | null;
    notifiedAt: string | null;
    notifiedBy: string | null;
}

interface CitrixAnomalyQueueTabProps {
    timeframe: number;
    onInvestigateTarget: (term: string) => void;
    onCountChange?: (count: number) => void;
}

export function CitrixAnomalyQueueTab({
    timeframe,
    onInvestigateTarget,
    onCountChange,
}: CitrixAnomalyQueueTabProps) {
    const router = useRouter();

    const [anomalies, setAnomalies] = useState<CitrixLoginAnomaly[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("PENDING_REVIEW");
    const [decisionFilter, setDecisionFilter] = useState<string>("ALL");
    const [page, setPage] = useState(1);
    const [counts, setCounts] = useState<{
        totalMatching: number;
        pendingCount: number;
        blockedCount: number;
        allowedCount: number;
        acknowledgedCount: number;
    }>({
        totalMatching: 0,
        pendingCount: 0,
        blockedCount: 0,
        allowedCount: 0,
        acknowledgedCount: 0,
    });

    // Whitelist Modal State (Requires Mandatory Business Justification)
    const [whitelistModal, setWhitelistModal] = useState<{
        anomaly: CitrixLoginAnomaly;
        justification: string;
        submitting: boolean;
        error: string | null;
    } | null>(null);

    // Acknowledge Notes Modal State (Close without notification)
    const [ackModal, setAckModal] = useState<{
        anomaly: CitrixLoginAnomaly;
        notes: string;
        submitting: boolean;
    } | null>(null);

    // Quick Advisory Dispatching State
    const [sendingAdvisoryId, setSendingAdvisoryId] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Fetch Anomalies
    const fetchAnomalies = useCallback(async (syncFromGraylog = false) => {
        if (syncFromGraylog) setSyncing(true);
        else setLoading(true);

        try {
            const params = new URLSearchParams({
                status: statusFilter,
                decision: decisionFilter,
                page: String(page),
                pageSize: "25",
                lookback: String(timeframe || 604800),
            });
            if (search.trim()) params.append("search", search.trim());
            if (syncFromGraylog) params.append("sync", "true");

            const res = await fetch(`/api/netscaler/anomalies?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setAnomalies(data.anomalies || []);
                setCounts(data.counts || {
                    totalMatching: 0,
                    pendingCount: 0,
                    blockedCount: 0,
                    allowedCount: 0,
                    acknowledgedCount: 0,
                });
                if (onCountChange && typeof data.counts?.pendingCount === "number") {
                    onCountChange(data.counts.pendingCount);
                }
            }
        } catch (err: any) {
            console.error("Failed to fetch anomalies:", err);
        } finally {
            setLoading(false);
            setSyncing(false);
        }
    }, [statusFilter, decisionFilter, page, timeframe, search, onCountChange]);

    useEffect(() => {
        fetchAnomalies(false);
    }, [fetchAnomalies]);

    // Action 1: Acknowledge & Close (No notification sent)
    const handleConfirmAcknowledge = async () => {
        if (!ackModal) return;
        setAckModal((prev) => prev ? { ...prev, submitting: true } : null);
        try {
            const res = await fetch("/api/netscaler/anomalies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ACKNOWLEDGE",
                    id: ackModal.anomaly.id,
                    ip: ackModal.anomaly.ip,
                    notes: ackModal.notes,
                }),
            });
            if (res.ok) {
                setToastMessage({ type: "success", text: `Anomaly on ${ackModal.anomaly.ip} acknowledged and closed.` });
                setAckModal(null);
                fetchAnomalies(false);
            }
        } catch (e: any) {
            alert(`Error acknowledging anomaly: ${e.message}`);
        }
    };

    // Action 2: Pardon & Allow (Leave Unblocked)
    const handlePardon = async (anomaly: CitrixLoginAnomaly) => {
        if (!confirm(`Pardon ${anomaly.ip} across all perimeter firewalls, FMC SI feed, and Reputation Ledger?`)) {
            return;
        }

        try {
            const res = await fetch("/api/netscaler/anomalies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "PARDON",
                    ip: anomaly.ip,
                    reason: `SOC Anomaly Review Pardon: ${anomaly.flagReason}`,
                }),
            });
            if (res.ok) {
                setToastMessage({ type: "success", text: `IP ${anomaly.ip} pardoned with 30-day immunity.` });
                fetchAnomalies(false);
            }
        } catch (e: any) {
            alert(`Error pardoning IP: ${e.message}`);
        }
    };

    // Action 3: Confirm Block / Enforce
    const handleEnforceBlock = async (anomaly: CitrixLoginAnomaly) => {
        if (!confirm(`Permanently enforce block on ${anomaly.ip} via Guardian Blacklist?`)) {
            return;
        }

        try {
            const res = await fetch("/api/netscaler/anomalies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "ENFORCE_BLOCK",
                    ip: anomaly.ip,
                    reason: `[Citrix Abuse Guard] Confirmed via Anomaly Review: ${anomaly.flagReason}`,
                }),
            });
            if (res.ok) {
                setToastMessage({ type: "success", text: `IP ${anomaly.ip} locked into Guardian Blacklist.` });
                fetchAnomalies(false);
            }
        } catch (e: any) {
            alert(`Error enforcing block: ${e.message}`);
        }
    };

    // Action 4: Whitelist on GuardianWatchIp (Requires Mandatory Business Justification)
    const handleConfirmWhitelist = async () => {
        if (!whitelistModal) return;
        if (!whitelistModal.justification.trim()) {
            setWhitelistModal((prev) => prev ? { ...prev, error: "A business justification is required for whitelisting." } : null);
            return;
        }

        setWhitelistModal((prev) => prev ? { ...prev, submitting: true, error: null } : null);
        try {
            const res = await fetch("/api/netscaler/anomalies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "WHITELIST",
                    ip: whitelistModal.anomaly.ip,
                    justification: whitelistModal.justification.trim(),
                }),
            });
            if (res.ok) {
                setToastMessage({
                    type: "success",
                    text: `IP ${whitelistModal.anomaly.ip} added to Guardian Watch List (Auto-Unshun Whitelist).`,
                });
                setWhitelistModal(null);
                fetchAnomalies(false);
            } else {
                const data = await res.json();
                setWhitelistModal((prev) => prev ? { ...prev, submitting: false, error: data.error || "Failed to whitelist IP" } : null);
            }
        } catch (e: any) {
            setWhitelistModal((prev) => prev ? { ...prev, submitting: false, error: e.message } : null);
        }
    };

    // Action 5: Pivot to Notification Center (Stages data & redirects)
    const handlePivotToNotificationCenter = (anomaly: CitrixLoginAnomaly) => {
        if (!anomaly.anchorUsername) {
            alert("No corporate user account is associated with this anomaly.");
            return;
        }

        const cleanUsername = anomaly.anchorUsername.replace(/@.*$/, "").toLowerCase();
        const recipientEmail = `${cleanUsername}@cooperhealth.edu`;
        const displayName = anomaly.anchorDisplayName || cleanUsername;

        sessionStorage.setItem("pane_staged_notification", JSON.stringify({
            name: `Citrix Remote Access Advisory - ${cleanUsername}`,
            breachName: "Citrix Gateway Remote Access",
            templateId: "",
            sourceType: "CITRIX_ANOMALY",
            sourceQuery: anomaly.ip,
            recipients: [
                {
                    email: recipientEmail,
                    name: displayName,
                    adName: displayName,
                    accountStatus: "Active",
                    breachName: "Citrix Gateway Remote Access Guidance",
                    breachDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                    breachDetails: anomaly.flagReason,
                    variablesJson: JSON.stringify({
                        Name: displayName,
                        Email: recipientEmail,
                        Username: cleanUsername,
                        CurrentDate: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
                    }),
                },
            ],
        }));

        router.push("/notifications");
    };

    // Action 6: 1-Click Send Advisory (Instant SMTP Dispatch)
    const handleOneClickSendAdvisory = async (anomaly: CitrixLoginAnomaly) => {
        if (!anomaly.anchorUsername) {
            alert("No corporate username associated with this anomaly.");
            return;
        }

        const cleanUsername = anomaly.anchorUsername.replace(/@.*$/, "").toLowerCase();
        const confirmMsg = `Send official Citrix Gateway Remote Access Guidance email directly to ${cleanUsername}@cooperhealth.edu?`;
        if (!confirm(confirmMsg)) return;

        setSendingAdvisoryId(anomaly.id);
        try {
            const res = await fetch("/api/netscaler/anomalies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "SEND_ONE_CLICK_ADVISORY",
                    id: anomaly.id,
                }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setToastMessage({
                    type: "success",
                    text: `Official remote access advisory sent to ${data.recipient}.`,
                });
                fetchAnomalies(false);
            } else {
                alert(`Failed to send advisory: ${data.error || "Unknown error"}`);
            }
        } catch (e: any) {
            alert(`Execution error: ${e.message}`);
        } finally {
            setSendingAdvisoryId(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* Toast Alert */}
            {toastMessage && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs flex items-center justify-between shadow-lg">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{toastMessage.text}</span>
                    </div>
                    <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-emerald-900 rounded">
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* KPI Summary Header */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div
                    onClick={() => { setStatusFilter("PENDING_REVIEW"); setDecisionFilter("ALL"); }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        statusFilter === "PENDING_REVIEW"
                            ? "bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-950/20"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold">Pending Review</span>
                        <Clock className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-1.5">{counts.pendingCount}</div>
                    <div className="text-[11px] text-amber-400/90 mt-0.5">Awaiting SOC analyst triage</div>
                </div>

                <div
                    onClick={() => { setStatusFilter("PENDING_REVIEW"); setDecisionFilter("BLOCKED"); }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        decisionFilter === "BLOCKED"
                            ? "bg-red-950/30 border-red-500/50 shadow-md shadow-red-950/20"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold">Decision: Blocked</span>
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-1.5">{counts.blockedCount}</div>
                    <div className="text-[11px] text-red-400/90 mt-0.5">System blocked • Review for false positive</div>
                </div>

                <div
                    onClick={() => { setStatusFilter("PENDING_REVIEW"); setDecisionFilter("ALLOWED"); }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        decisionFilter === "ALLOWED"
                            ? "bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/20"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold">Decision: Allowed</span>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-1.5">{counts.allowedCount}</div>
                    <div className="text-[11px] text-emerald-400/90 mt-0.5">System allowed • Review for compromise</div>
                </div>

                <div
                    onClick={() => { setStatusFilter("ACKNOWLEDGED"); setDecisionFilter("ALL"); }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                        statusFilter === "ACKNOWLEDGED"
                            ? "bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-950/20"
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold">Acknowledged & Closed</span>
                        <Check className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-1.5">{counts.acknowledgedCount}</div>
                    <div className="text-[11px] text-indigo-400/90 mt-0.5">Analyst reviewed • Closed without notification</div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                    {/* Status Select */}
                    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                        {[
                            { id: "PENDING_REVIEW", label: "Pending Review" },
                            { id: "ACKNOWLEDGED", label: "Acknowledged" },
                            { id: "PARDONED", label: "Pardoned" },
                            { id: "BLOCKED", label: "Blocked" },
                            { id: "WHITELISTED", label: "Whitelisted" },
                            { id: "ALL", label: "All Items" },
                        ].map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setStatusFilter(t.id)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                                    statusFilter === t.id
                                        ? "bg-indigo-600 text-white shadow-xs"
                                        : "text-slate-400 hover:text-white"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Decision Filter */}
                    <select
                        value={decisionFilter}
                        onChange={(e) => setDecisionFilter(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
                    >
                        <option value="ALL">All Decisions</option>
                        <option value="BLOCKED">Current Decision: Blocked</option>
                        <option value="ALLOWED">Current Decision: Allowed</option>
                    </select>
                </div>

                {/* Right side: Search + Sync */}
                <div className="flex items-center gap-2">
                    <div className="relative w-64">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Filter IP, user, department..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                    </div>

                    <button
                        onClick={() => fetchAnomalies(true)}
                        disabled={syncing}
                        title="Re-run Graylog anomaly correlation for the last 7 days and sync to queue."
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-lg text-xs font-semibold shadow-xs transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-white" : "text-indigo-400"}`} />
                        {syncing ? "Syncing 7D..." : "Sync Telemetry"}
                    </button>
                </div>
            </div>

            {/* Anomaly Cards List */}
            {loading ? (
                <div className="p-16 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col items-center justify-center text-center space-y-3">
                    <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
                    <div className="text-sm font-semibold text-white">Loading Anomaly Review Queue...</div>
                </div>
            ) : anomalies.length === 0 ? (
                <div className="p-16 bg-slate-900/40 border border-slate-800 rounded-xl text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">No Authentication Anomalies in Current View</div>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                        All Citrix login failure patterns and non-standard formats are either resolved, acknowledged, or within normal baseline thresholds.
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {anomalies.map((an) => {
                        const isBlocked = an.currentDecision === "BLOCKED";
                        return (
                            <div
                                key={an.id}
                                className={`p-4 rounded-xl border transition-all ${
                                    isBlocked
                                        ? "bg-slate-900/90 border-red-500/30 shadow-md shadow-red-950/10"
                                        : "bg-slate-900/90 border-emerald-500/30 shadow-md shadow-emerald-950/10"
                                }`}
                            >
                                {/* Row 1: Decision Banner + Timestamp */}
                                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                        {/* Prominent Current Decision Badge */}
                                        <span
                                            className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${
                                                isBlocked
                                                    ? "bg-red-600 text-white"
                                                    : "bg-emerald-600 text-white"
                                            }`}
                                        >
                                            {isBlocked ? (
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                            ) : (
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                            )}
                                            Current Decision: {an.currentDecision}
                                        </span>

                                        <span className="text-xs text-slate-400 truncate max-w-xl" title={an.decisionDetails || ""}>
                                            • {an.decisionDetails || "Evaluated by Guardian Engine"}
                                        </span>
                                    </div>

                                    {/* Suggested Tag (Advisory Only) */}
                                    {an.suggestedTag && (
                                        <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-indigo-950/60 text-indigo-300 border border-indigo-500/40">
                                            Suggested Tag: {an.suggestedTag}
                                        </span>
                                    )}
                                </div>

                                {/* Row 2: Objective Anomaly Reason (No Forced Categories) */}
                                <div className="mt-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Objective Flag Reason:
                                    </div>
                                    <div className="text-sm font-semibold text-slate-200 mt-0.5">
                                        {an.flagReason}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {an.triggerSignals.map((sig) => (
                                            <span
                                                key={sig}
                                                className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800 text-slate-300 border border-slate-700"
                                            >
                                                {sig}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Row 3: Employee Details + Network Metadata */}
                                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                    {/* Left: Account Identity */}
                                    <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-lg space-y-1.5">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase">
                                            Corporate Account Identity
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <UserCheck className="w-4 h-4 text-emerald-400" />
                                            <span className="font-semibold text-white">{an.anchorUsername || "Unverified User"}</span>
                                            {an.anchorDisplayName && (
                                                <span className="text-slate-400">• {an.anchorDisplayName}</span>
                                            )}
                                        </div>
                                        {an.anchorDepartment && (
                                            <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                                                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                                <span>{an.anchorDepartment}</span>
                                            </div>
                                        )}
                                        {an.variantStrings.length > 0 && (
                                            <div className="pt-1 flex flex-wrap items-center gap-1">
                                                <span className="text-slate-500 text-[11px]">Offending inputs:</span>
                                                {an.variantStrings.map((v) => (
                                                    <span
                                                        key={v}
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-950/60 text-red-300 border border-red-500/30"
                                                    >
                                                        {/^\d+$/.test(v) ? `Badge ID: ${v}` : v}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: Network & Telemetry */}
                                    <div className="p-3 bg-slate-950/40 border border-slate-800/60 rounded-lg space-y-1.5">
                                        <div className="text-[11px] font-bold text-slate-400 uppercase">
                                            Connection & Telemetry
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-indigo-400" />
                                            <span className="font-mono font-bold text-white">{an.ip}</span>
                                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                                {an.asn || "ASN N/A"}
                                            </span>
                                            <span className="text-slate-400">{an.ispOrg} ({an.cityName})</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                                            <span>Failures: <strong className="text-amber-400">{an.failureCount}</strong></span>
                                            <span>•</span>
                                            <span>Citrix Successes: <strong className="text-emerald-400">{an.citrixSuccesses}</strong></span>
                                            {an.hasPriorVpn && (
                                                <>
                                                    <span>•</span>
                                                    <span className="text-emerald-300 font-medium">Prior AnyConnect VPN OK</span>
                                                </>
                                            )}
                                        </div>
                                        {an.analystNotes && (
                                            <div className="pt-1 text-[11px] text-slate-300 bg-slate-900 p-2 rounded border border-slate-800">
                                                <strong>Analyst Notes:</strong> {an.analystNotes}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Row 4: Action Toolbar */}
                                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    {/* Left Actions: Decision Overrides */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Pardon / Leave Unblocked */}
                                        <button
                                            onClick={() => handlePardon(an)}
                                            title="Un-shun across firewalls, remove from FMC SI feed, and set Strike 0 with 30-day immunity."
                                            className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                            Pardon & Allow
                                        </button>

                                        {/* Confirm Block */}
                                        <button
                                            onClick={() => handleEnforceBlock(an)}
                                            title="Enforce on Guardian Blacklist and FMC SI feed."
                                            className="px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            <Lock className="w-3.5 h-3.5 text-red-400" />
                                            Confirm Block
                                        </button>

                                        {/* Whitelist (GuardianWatchIp) - Requires Justification */}
                                        <button
                                            onClick={() => setWhitelistModal({ anomaly: an, justification: "", submitting: false, error: null })}
                                            title="Add to Guardian Watch List (Auto-Unshun Whitelist). Requires mandatory justification."
                                            className="px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-semibold flex items-center gap-1.5 transition-colors"
                                        >
                                            <Shield className="w-3.5 h-3.5 text-purple-400" />
                                            Whitelist (Watch List)
                                        </button>

                                        {/* Acknowledge (Close without notification) */}
                                        <button
                                            onClick={() => setAckModal({ anomaly: an, notes: "", submitting: false })}
                                            title="Keep decision as-is and archive from pending queue. No notification sent."
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 font-medium flex items-center gap-1.5 transition-colors"
                                        >
                                            <Check className="w-3.5 h-3.5 text-indigo-400" />
                                            Acknowledge & Close
                                        </button>
                                    </div>

                                    {/* Right Actions: Notification Center Outreach */}
                                    <div className="flex items-center gap-2">
                                        {/* Pivot to Notification Center */}
                                        <button
                                            onClick={() => handlePivotToNotificationCenter(an)}
                                            title="Open the Notification Center with recipient and Remote Access Guidance template pre-staged."
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-medium flex items-center gap-1.5 transition-colors"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                                            Pivot to Notification Center
                                        </button>

                                        {/* 1-Click Send Advisory */}
                                        <button
                                            onClick={() => handleOneClickSendAdvisory(an)}
                                            disabled={sendingAdvisoryId === an.id}
                                            title="Directly dispatch official Citrix Remote Access Guidance to employee's Cooper email via SMTP."
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-40"
                                        >
                                            <Send className={`w-3.5 h-3.5 ${sendingAdvisoryId === an.id ? "animate-spin" : ""}`} />
                                            {sendingAdvisoryId === an.id ? "Sending..." : "1-Click Send Advisory"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* WHITELIST MODAL (MANDATORY BUSINESS JUSTIFICATION) */}
            {whitelistModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-purple-400" />
                                <h4 className="text-sm font-bold text-white">Whitelist on Guardian Watch List</h4>
                            </div>
                            <button
                                onClick={() => setWhitelistModal(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="text-xs text-slate-300">
                            Adding <strong className="font-mono text-purple-300">{whitelistModal.anomaly.ip}</strong> to the Guardian Watch List ensures the firewall auto-unshun engine continuously un-shuns this IP.
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-200">
                                Mandatory Business Justification: <span className="text-red-400">*</span>
                            </label>
                            <textarea
                                rows={3}
                                value={whitelistModal.justification}
                                onChange={(e) => setWhitelistModal({ ...whitelistModal, justification: e.target.value })}
                                placeholder="e.g., Verified partner clinic radiology terminal, authorized mobile cart hotspot, or executive static home IP..."
                                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                            />
                        </div>

                        {whitelistModal.error && (
                            <div className="text-xs text-red-400 bg-red-950/40 p-2 rounded border border-red-500/30">
                                {whitelistModal.error}
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                            <button
                                onClick={() => setWhitelistModal(null)}
                                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmWhitelist}
                                disabled={!whitelistModal.justification.trim() || whitelistModal.submitting}
                                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold text-xs shadow-md shadow-purple-600/20"
                            >
                                {whitelistModal.submitting ? "Whitelisting..." : "Confirm & Whitelist"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ACKNOWLEDGE MODAL (CLOSE WITHOUT NOTIFICATION) */}
            {ackModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Check className="w-5 h-5 text-indigo-400" />
                                <h4 className="text-sm font-bold text-white">Acknowledge & Close Anomaly</h4>
                            </div>
                            <button
                                onClick={() => setAckModal(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="text-xs text-slate-300">
                            This archives the anomaly on <strong className="font-mono text-indigo-300">{ackModal.anomaly.ip}</strong> from the pending queue.
                            <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/30 p-2 rounded border border-amber-500/30">
                                ℹ️ Current firewall decision ({ackModal.anomaly.currentDecision}) remains untouched. No notification will be sent.
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-200">
                                Analyst Notes (Optional):
                            </label>
                            <textarea
                                rows={2}
                                value={ackModal.notes}
                                onChange={(e) => setAckModal({ ...ackModal, notes: e.target.value })}
                                placeholder="e.g., Reviewed with user; confirmed password was updated; benign activity..."
                                className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                            <button
                                onClick={() => setAckModal(null)}
                                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAcknowledge}
                                disabled={ackModal.submitting}
                                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20"
                            >
                                {ackModal.submitting ? "Closing..." : "Confirm & Close"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
