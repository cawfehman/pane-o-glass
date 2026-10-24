"use client";

import { useState, useEffect, useCallback } from "react";
import {
    ShieldAlert, ShieldCheck, AlertTriangle, Lock, Unlock, UserCheck, UserX,
    Globe, Server, RefreshCw, Search, CheckCircle2, Flame, Eye, ExternalLink,
    Sliders, Terminal, Laptop, FileSpreadsheet, Ban, Shield, ChevronRight, X
} from "lucide-react";
import Link from "next/link";
import type {
    CitrixLoginTriageResponse,
    CitrixIpEvaluation,
    CitrixUserIssueSummary,
    CitrixLoginFailureEvent,
    GuardianAbuseVerdict,
    CitrixIssueCategory,
} from "@/lib/netscaler-login-triage";

interface CitrixLoginTriageTabProps {
    timeframe: number;
    firewallHosts: { id: string; name: string }[];
    onInvestigateTarget: (term: string) => void;
}

export default function CitrixLoginTriageTab({
    timeframe,
    firewallHosts,
    onInvestigateTarget,
}: CitrixLoginTriageTabProps) {
    const [data, setData] = useState<CitrixLoginTriageResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sub-navigation inside the tab
    const [subView, setSubView] = useState<"ips" | "users" | "events">("ips");

    // Filters
    const [verdictFilter, setVerdictFilter] = useState<"ALL" | GuardianAbuseVerdict>("ALL");
    const [categoryFilter, setCategoryFilter] = useState<"ALL" | CitrixIssueCategory>("ALL");
    const [searchTerm, setSearchTerm] = useState("");

    // Configurable Smart Guardian Rules
    const [minFailures, setMinFailures] = useState<number>(3);
    const [minSprayUsers, setMinSprayUsers] = useState<number>(2);
    const [flagForeignIps, setFlagForeignIps] = useState<boolean>(true);
    const [flagNonExistentAdUsers, setFlagNonExistentAdUsers] = useState<boolean>(true);
    const [protectIspWithValidAdUser, setProtectIspWithValidAdUser] = useState<boolean>(true);
    const [showRulesPanel, setShowRulesPanel] = useState<boolean>(false);

    // Block / Shun Action Modal State
    const [blockModal, setBlockModal] = useState<{
        ips: string[];
        reason: string;
        targetHost: string;
        addToGuardianBlacklist: boolean;
        loading: boolean;
        result: any | null;
        error: string | null;
    } | null>(null);

    const [blacklistLoadingIp, setBlacklistLoadingIp] = useState<string | null>(null);
    const [autoShunToggling, setAutoShunToggling] = useState<boolean>(false);
    const [autoShunRunningCycle, setAutoShunRunningCycle] = useState<boolean>(false);
    const [cycleFeedback, setCycleFeedback] = useState<string | null>(null);

    const fetchTriage = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                range: String(timeframe),
                minFailures: String(minFailures),
                minSprayUsers: String(minSprayUsers),
                flagForeignIps: String(flagForeignIps),
                flagNonExistentAdUsers: String(flagNonExistentAdUsers),
                protectIspWithValidAdUser: String(protectIspWithValidAdUser),
            });
            const res = await fetch(`/api/netscaler/login-triage?${params.toString()}`);
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.details || json.error || "Failed to load Citrix login triage data");
            }
            setData(json);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [timeframe, minFailures, minSprayUsers, flagForeignIps, flagNonExistentAdUsers, protectIspWithValidAdUser]);

    useEffect(() => {
        fetchTriage();
    }, [fetchTriage]);

    const handleToggleGuardianBlacklist = async (ip: string, currentlyBlacklisted: boolean, reason: string) => {
        setBlacklistLoadingIp(ip);
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: currentlyBlacklisted ? "remove_guardian_blacklist" : "add_guardian_blacklist",
                    ip,
                    reason,
                }),
            });
            if (res.ok) {
                await fetchTriage();
            }
        } catch (e) {
            console.error("Failed to toggle Guardian blacklist:", e);
        } finally {
            setBlacklistLoadingIp(null);
        }
    };

    const handleToggleAutoShun = async () => {
        const currentEnabled = Boolean(data?.autoShunConfig?.enabled);
        setAutoShunToggling(true);
        setCycleFeedback(null);
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update_auto_shun_config",
                    enabled: !currentEnabled,
                }),
            });
            const json = await res.json();
            if (res.ok && json.autoShunConfig) {
                setData((prev) => (prev ? { ...prev, autoShunConfig: json.autoShunConfig } : prev));
                setCycleFeedback(
                    json.autoShunConfig.enabled
                        ? "Automated Citrix Login Shunning ENABLED."
                        : "Automated Citrix Login Shunning PAUSED."
                );
            }
        } catch (e) {
            console.error("Failed to toggle Citrix Auto-Shun:", e);
        } finally {
            setAutoShunToggling(false);
        }
    };

    const handleRunAutoShunCycle = async () => {
        setAutoShunRunningCycle(true);
        setCycleFeedback(null);
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "run_auto_shun_cycle",
                }),
            });
            const json = await res.json();
            if (res.ok && json.cycleResult) {
                setCycleFeedback(json.cycleResult.summary);
                await fetchTriage();
            }
        } catch (e) {
            console.error("Failed to run ad-hoc Citrix Auto-Shun cycle:", e);
        } finally {
            setAutoShunRunningCycle(false);
        }
    };

    const executeBlockAction = async () => {
        if (!blockModal) return;
        setBlockModal((prev) => (prev ? { ...prev, loading: true, error: null, result: null } : null));
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "block_ips",
                    ips: blockModal.ips,
                    reason: blockModal.reason,
                    targetHost: blockModal.targetHost,
                    addToGuardianBlacklist: blockModal.addToGuardianBlacklist,
                }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.details || json.error || "Failed to execute perimeter block");
            }
            setBlockModal((prev) => (prev ? { ...prev, loading: false, result: json } : null));
            await fetchTriage();
        } catch (err: any) {
            setBlockModal((prev) => (prev ? { ...prev, loading: false, error: err.message } : null));
        }
    };

    const exportEvaluationsCsv = () => {
        if (!data?.ipEvaluations.length) return;
        const headers = "IP,Verdict,RiskScore,Country,City,ASN,ISP_Company,CompanyType,Failures,CitrixSuccesses,TargetedUsers,TriggeredRules,Shunned,GuardianBlacklisted\n";
        const rows = data.ipEvaluations
            .map((e) =>
                [
                    `"${e.ip}"`,
                    `"${e.verdict}"`,
                    e.riskScore,
                    `"${e.countryCode}"`,
                    `"${e.cityName}"`,
                    `"${e.asn}"`,
                    `"${(e.companyName || "").replace(/"/g, '""')}"`,
                    `"${e.companyType}"`,
                    e.totalFailures,
                    e.citrixSuccessCount,
                    `"${e.targetedUsers.map((u) => `${u.username}(${u.adStatus})`).join("; ")}"`,
                    `"${e.triggeredRules.map((r) => r.label).join("; ")}"`,
                    e.isCurrentlyShunned ? "YES" : "NO",
                    e.isOnGuardianBlacklist ? "YES" : "NO",
                ].join(",")
            )
            .join("\n");
        const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `citrix-login-abuse-triage-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    const filteredIps: CitrixIpEvaluation[] = (data?.ipEvaluations || []).filter((item) => {
        if (verdictFilter !== "ALL" && item.verdict !== verdictFilter) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            item.ip.toLowerCase().includes(q) ||
            item.companyName.toLowerCase().includes(q) ||
            item.asn.toLowerCase().includes(q) ||
            item.countryCode.toLowerCase().includes(q) ||
            item.cityName.toLowerCase().includes(q) ||
            item.verdictReason.toLowerCase().includes(q) ||
            item.targetedUsers.some((u) => u.username.toLowerCase().includes(q) || (u.adDisplayName || "").toLowerCase().includes(q))
        );
    });

    const filteredUsers: CitrixUserIssueSummary[] = (data?.userSummaries || []).filter((u) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            u.username.toLowerCase().includes(q) ||
            (u.adDisplayName || "").toLowerCase().includes(q) ||
            (u.adDepartment || "").toLowerCase().includes(q) ||
            u.diagnosis.toLowerCase().includes(q) ||
            u.sourceIps.some((ip) => ip.includes(q))
        );
    });

    const filteredEvents: CitrixLoginFailureEvent[] = (data?.events || []).filter((ev) => {
        if (categoryFilter !== "ALL" && ev.category !== categoryFilter) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            ev.username.toLowerCase().includes(q) ||
            ev.clientIp.toLowerCase().includes(q) ||
            ev.failureReason.toLowerCase().includes(q) ||
            ev.rawMessage.toLowerCase().includes(q)
        );
    });

    const unshunnedAbusiveIps = (data?.ipEvaluations || [])
        .filter((i) => i.verdict === "ABUSIVE_BLOCK" && !i.isCurrentlyShunned)
        .map((i) => i.ip);

    const getVerdictBadge = (verdict: GuardianAbuseVerdict, score: number) => {
        if (verdict === "ABUSIVE_BLOCK") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30">
                    <Flame className="w-3.5 h-3.5" />
                    Abusive — Block ({score}/100)
                </span>
            );
        }
        if (verdict === "SUSPICIOUS_WATCH") {
            return (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Suspicious — Watch ({score}/100)
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Guardian Protected ({score}/100)
            </span>
        );
    };

    const getAdBadge = (status: string) => {
        switch (status) {
            case "ACTIVE":
            case "ENABLED":
                return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">AD: ACTIVE</span>;
            case "LOCKED":
                return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/40">AD: LOCKED</span>;
            case "DISABLED":
                return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-amber-500/20 text-amber-400 border border-amber-500/40">AD: DISABLED</span>;
            case "NOT_FOUND":
                return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">NOT IN AD</span>;
            default:
                return <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 text-slate-400 border border-slate-700">{status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Banner & Action Header */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                Citrix Login & Abuse Triage
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                                    Smart Guardian Engine
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Correlates 3rd-party NetScaler <code className="text-slate-300">AAA LOGIN_FAILED</code>, <code className="text-slate-300">Imprivata-prod</code> policy denials, and <code className="text-slate-300">STA/IDP</code> failures with Active Directory & ISP intelligence.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {unshunnedAbusiveIps.length > 0 && (
                        <button
                            onClick={() =>
                                setBlockModal({
                                    ips: unshunnedAbusiveIps,
                                    reason: `Batch Citrix Abuse Block (${unshunnedAbusiveIps.length} flagged IPs)`,
                                    targetHost: "all",
                                    addToGuardianBlacklist: true,
                                    loading: false,
                                    result: null,
                                    error: null,
                                })
                            }
                            title={`Multiplexes a single SSH session per firewall to issue 'shun <ip>' for all ${unshunnedAbusiveIps.length} un-shunned Abusive IPs at once, and adds them to Guardian Blacklist.`}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all"
                        >
                            <Flame className="w-4 h-4" />
                            Shun & Blacklist All Abusive IPs ({unshunnedAbusiveIps.length})
                        </button>
                    )}

                    <button
                        onClick={() => setShowRulesPanel(!showRulesPanel)}
                        title="Toggle the Smart Guardian scoring panel to adjust thresholds for foreign IPs, password sprays, and AD protection."
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                            showRulesPanel
                                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                : "bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white"
                        }`}
                    >
                        <Sliders className="w-3.5 h-3.5" />
                        Guardian Rules
                    </button>

                    <button
                        onClick={exportEvaluationsCsv}
                        disabled={!data?.ipEvaluations.length}
                        title="Download a CSV report containing all IP verdicts, risk scores, geolocation, ISP, failure counts, and triggered rules."
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-40"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Export CSV
                    </button>

                    <button
                        onClick={fetchTriage}
                        disabled={loading}
                        title="Re-query Graylog and recalculate Citrix login triage telemetry."
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Automated Citrix Login Guardian Control Bar */}
            <div
                className={`rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all ${
                    data?.autoShunConfig?.enabled
                        ? "bg-emerald-950/20 border-emerald-500/35"
                        : "bg-slate-900/60 border-amber-500/25"
                }`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`p-2 rounded-lg border mt-0.5 ${
                            data?.autoShunConfig?.enabled
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                : "bg-amber-500/15 border-amber-500/30 text-amber-400"
                        }`}
                    >
                        <Shield className="w-4 h-4" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                                Automated Citrix Login Guardian
                            </span>
                            {data?.autoShunConfig?.enabled ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    ACTIVE — AUTO-SHUNNING
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    PAUSED (MANUAL MODE)
                                </span>
                            )}
                            {data?.autoShunConfig?.lastRunAt && (
                                <span className="text-[11px] text-slate-400">
                                    • Last scan: {new Date(data.autoShunConfig.lastRunAt).toLocaleTimeString()}
                                    {data.autoShunConfig.lastRunSummary ? ` (${data.autoShunConfig.lastRunSummary})` : ""}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                            Rule:{" "}
                            <span className="text-slate-200 font-medium">
                                ≥{data?.autoShunConfig?.minAuthFailuresIn10m ?? 3} failed auth attempts within{" "}
                                {Math.round((data?.autoShunConfig?.windowSeconds ?? 600) / 60)} minutes
                            </span>{" "}
                            OR{" "}
                            <span className="text-slate-200 font-medium">
                                ≥1 failed attempt from a Blacklisted ASN
                            </span>{" "}
                            → Shuns across all perimeter firewalls + adds to Guardian Blacklist (protects verified AD users on US ISPs & Imprivata MFA push timeouts).
                        </p>
                        {cycleFeedback && (
                            <p className="text-xs text-indigo-300 font-medium mt-1">
                                ↳ {cycleFeedback}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                        onClick={handleRunAutoShunCycle}
                        disabled={autoShunRunningCycle}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
                        title="Execute an immediate 10-minute Citrix Login Guardian scan & auto-shun cycle"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${autoShunRunningCycle ? "animate-spin text-indigo-400" : "text-indigo-400"}`} />
                        {autoShunRunningCycle ? "Scanning 10m Window..." : "Run 10m Scan Now"}
                    </button>

                    <button
                        onClick={handleToggleAutoShun}
                        disabled={autoShunToggling}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 ${
                            data?.autoShunConfig?.enabled
                                ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-600/20"
                        }`}
                    >
                        {data?.autoShunConfig?.enabled ? (
                            <>
                                <Lock className="w-3.5 h-3.5" />
                                Pause Auto-Shun
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Enable Auto-Shun
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Configurable Smart Guardian Protection Rules Panel */}
            {showRulesPanel && (
                <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                <Shield className="w-4 h-4 text-indigo-400" />
                                Smart Guardian Protection & Abuse Scoring Thresholds
                            </h3>
                            <p className="text-xs text-slate-400">
                                Customize how Citrix client IPs are scored for perimeter shunning vs protected as legitimate Cooper remote workers.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 pt-1">
                        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Failure Threshold (0 Success)
                            </label>
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={minFailures}
                                    onChange={(e) => setMinFailures(Math.max(1, parseInt(e.target.value, 10) || 3))}
                                    className="w-20 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-white"
                                />
                                <span className="text-xs text-slate-400">failures</span>
                            </div>
                        </div>

                        <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
                            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Password Spray Users
                            </label>
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="number"
                                    min={2}
                                    max={25}
                                    value={minSprayUsers}
                                    onChange={(e) => setMinSprayUsers(Math.max(2, parseInt(e.target.value, 10) || 2))}
                                    className="w-20 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-sm text-white"
                                />
                                <span className="text-xs text-slate-400">distinct users</span>
                            </div>
                        </div>

                        <label className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={flagForeignIps}
                                onChange={(e) => setFlagForeignIps(e.target.checked)}
                                className="mt-1 rounded border-slate-700 bg-slate-900 text-indigo-600"
                            />
                            <div>
                                <div className="text-xs font-semibold text-white">Flag Non-US Origins</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">Immediately score foreign IPs (+50 risk)</div>
                            </div>
                        </label>

                        <label className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={flagNonExistentAdUsers}
                                onChange={(e) => setFlagNonExistentAdUsers(e.target.checked)}
                                className="mt-1 rounded border-slate-700 bg-slate-900 text-indigo-600"
                            />
                            <div>
                                <div className="text-xs font-semibold text-white">Validate AD Usernames</div>
                                <div className="text-[11px] text-slate-400 mt-0.5">Flag non-corporate or non-existent AD users</div>
                            </div>
                        </label>

                        <label className="bg-emerald-950/20 border border-emerald-500/30 rounded-lg p-3 flex items-start gap-2.5 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={protectIspWithValidAdUser}
                                onChange={(e) => setProtectIspWithValidAdUser(e.target.checked)}
                                className="mt-1 rounded border-emerald-700 bg-slate-900 text-emerald-500"
                            />
                            <div>
                                <div className="text-xs font-semibold text-emerald-300">Guardian ISP Shield</div>
                                <div className="text-[11px] text-emerald-400/80 mt-0.5">Protect US ISPs with 1 valid AD user / Citrix login</div>
                            </div>
                        </label>
                    </div>
                </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Citrix Auth & Session Failures</span>
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold text-white mt-1">
                        {loading ? "..." : (data?.summary.totalFailureEvents ?? 0).toLocaleString()}
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-slate-400">
                        <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20">
                            LOGIN_FAILED: {data?.summary.aaaLoginFailedCount ?? 0}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            Policy/Imprivata: {data?.summary.policyFailedCount ?? 0}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                            STA/Cookie: {(data?.summary.staTicketFailedCount ?? 0) + (data?.summary.cookieInvalidCount ?? 0)}
                        </span>
                        {(data?.summary.imprivataBadPasswordCount ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-semibold" title="Correlated via Imprivata RADIUS (ssoradius): Bad AD Password or Policy">
                                🔑 Bad AD Pwd: {data?.summary.imprivataBadPasswordCount}
                            </span>
                        )}
                        {(data?.summary.imprivataMfaTimeoutCount ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold" title="Correlated via Imprivata Confirm ID: AD Password OK, MFA Push Timed Out">
                                📱 MFA Timeout: {data?.summary.imprivataMfaTimeoutCount}
                            </span>
                        )}
                    </div>
                </div>

                <div
                    onClick={() => {
                        setSubView("ips");
                        setVerdictFilter(verdictFilter === "ABUSIVE_BLOCK" ? "ALL" : "ABUSIVE_BLOCK");
                    }}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        verdictFilter === "ABUSIVE_BLOCK"
                            ? "bg-red-950/30 border-red-500/60"
                            : "bg-slate-900/60 border-slate-800 hover:border-red-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-red-300">
                        <span>Abusive IPs (Block Recommended)</span>
                        <Flame className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-2xl font-bold text-red-400 mt-1">
                        {loading ? "..." : data?.summary.abusiveBlockIpCount ?? 0}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">
                        {data?.summary.alreadyShunnedIpCount ?? 0} currently shunned on perimeter firewalls
                    </div>
                </div>

                <div
                    onClick={() => {
                        setSubView("ips");
                        setVerdictFilter(verdictFilter === "SUSPICIOUS_WATCH" ? "ALL" : "SUSPICIOUS_WATCH");
                    }}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        verdictFilter === "SUSPICIOUS_WATCH"
                            ? "bg-amber-950/30 border-amber-500/60"
                            : "bg-slate-900/60 border-slate-800 hover:border-amber-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-amber-300">
                        <span>Suspicious Watch IPs</span>
                        <Eye className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold text-amber-400 mt-1">
                        {loading ? "..." : data?.summary.suspiciousWatchIpCount ?? 0}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">
                        Unauthenticated STA ticket / anomalous probes
                    </div>
                </div>

                <div
                    onClick={() => {
                        setSubView("ips");
                        setVerdictFilter(verdictFilter === "LEGIT_USER_ISSUE" ? "ALL" : "LEGIT_USER_ISSUE");
                    }}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        verdictFilter === "LEGIT_USER_ISSUE"
                            ? "bg-emerald-950/30 border-emerald-500/60"
                            : "bg-slate-900/60 border-slate-800 hover:border-emerald-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-emerald-300">
                        <span>Guardian Protected (Legit Users)</span>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 mt-1">
                        {loading ? "..." : data?.summary.legitProtectedIpCount ?? 0}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2">
                        Verified Cooper AD users on US ISPs (Protected from shun)
                    </div>
                </div>
            </div>

            {/* Sub-View Switcher & Search Filter Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setSubView("ips")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            subView === "ips"
                                ? "bg-indigo-600 text-white"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                    >
                        External IP Verdict Matrix ({data?.ipEvaluations.length ?? 0})
                    </button>
                    <button
                        onClick={() => setSubView("users")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            subView === "users"
                                ? "bg-indigo-600 text-white"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                    >
                        Impacted Citrix Users ({data?.userSummaries.length ?? 0})
                    </button>
                    <button
                        onClick={() => setSubView("events")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            subView === "events"
                                ? "bg-indigo-600 text-white"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                    >
                        Raw Failure & Policy Events ({data?.events.length ?? 0})
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {subView === "ips" && (
                        <select
                            value={verdictFilter}
                            onChange={(e) => setVerdictFilter(e.target.value as any)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        >
                            <option value="ALL">All Verdicts</option>
                            <option value="ABUSIVE_BLOCK">Abusive — Block Only</option>
                            <option value="SUSPICIOUS_WATCH">Suspicious — Watch Only</option>
                            <option value="LEGIT_USER_ISSUE">Guardian Protected Only</option>
                        </select>
                    )}

                    {subView === "events" && (
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value as any)}
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                        >
                            <option value="ALL">All Failure Categories</option>
                            <option value="AAA_LOGIN_FAILED">AAA LOGIN_FAILED</option>
                            <option value="AAA_POLICY_FAILED">AAA Policy Failed (Imprivata)</option>
                            <option value="STA_TICKET_FAILED">ICA STA Ticket Validation Failed</option>
                            <option value="IDP_COOKIE_INVALID">AAATM Invalid TASS Cookie</option>
                        </select>
                    )}

                    <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Filter IP, user, ISP, ASN, reason..."
                            className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 w-64"
                        />
                    </div>
                </div>
            </div>

            {error && (
                <div className="bg-red-950/30 border border-red-500/40 rounded-xl p-4 text-xs text-red-300">
                    {error}
                </div>
            )}

            {/* VIEW 1: EXTERNAL IP VERDICT MATRIX */}
            {subView === "ips" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            Evaluating Citrix authentication telemetry, Active Directory accounts, and ISP/ASN intelligence...
                        </div>
                    ) : filteredIps.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No external client IPs matched the current filter criteria in this timeframe.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Client IP & Geo</th>
                                        <th className="py-3 px-4">ISP / Network (ASN)</th>
                                        <th className="py-3 px-4">Guardian Verdict & Rules</th>
                                        <th className="py-3 px-4">Failures vs Success</th>
                                        <th className="py-3 px-4">Targeted Users & AD Status</th>
                                        <th className="py-3 px-4 text-right">Enforcement Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {filteredIps.map((item) => (
                                        <tr key={item.ip} className="hover:bg-slate-800/30 transition-colors align-top">
                                            {/* IP & Geo */}
                                            <td className="py-3.5 px-4">
                                                <div className="font-mono font-bold text-white text-sm flex items-center gap-2">
                                                    {item.ip}
                                                    {item.isCurrentlyShunned && (
                                                        <span className="px-1.5 py-0.5 text-[10px] font-sans font-semibold rounded bg-red-500/20 text-red-300 border border-red-500/40">
                                                            SHUNNED
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-slate-400 text-[11px] mt-1 flex items-center gap-1.5">
                                                    <Globe className="w-3 h-3 text-slate-500" />
                                                    <span className={item.countryCode !== "US" && item.countryCode !== "Unknown" ? "text-red-400 font-semibold" : ""}>
                                                        {item.cityName !== "N/A" ? `${item.cityName}, ` : ""}
                                                        {item.countryCode}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    Last seen: {new Date(item.lastSeen).toLocaleString()}
                                                </div>
                                            </td>

                                            {/* ISP / ASN */}
                                            <td className="py-3.5 px-4">
                                                <div className="font-medium text-slate-200">{item.companyName}</div>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                                        {item.asn}
                                                    </span>
                                                    {item.isResidentialIsp ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30">
                                                            ISP / Residential
                                                        </span>
                                                    ) : item.companyType !== "unknown" ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 uppercase">
                                                            {item.companyType}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {item.cidr !== "N/A" && (
                                                    <div className="text-[10px] font-mono text-slate-500 mt-1">CIDR: {item.cidr}</div>
                                                )}
                                            </td>

                                            {/* Guardian Verdict & Triggered Rules */}
                                            <td className="py-3.5 px-4 max-w-md">
                                                <div>{getVerdictBadge(item.verdict, item.riskScore)}</div>
                                                <p className="text-slate-300 text-[11px] mt-1.5 leading-relaxed">
                                                    {item.verdictReason}
                                                </p>
                                                {item.protectionNote && (
                                                    <div className="mt-1.5 text-[11px] text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 rounded px-2 py-1">
                                                        {item.protectionNote}
                                                    </div>
                                                )}
                                                {item.triggeredRules.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 mt-2">
                                                        {item.triggeredRules.map((r) => (
                                                            <span
                                                                key={r.code}
                                                                title={r.detail}
                                                                className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-300 border border-red-500/25"
                                                            >
                                                                {r.label} (+{r.points})
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Failure vs Success Counts */}
                                            <td className="py-3.5 px-4">
                                                <div className="space-y-1 text-[11px]">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-slate-400">Total Failures:</span>
                                                        <span className="font-bold text-red-400">{item.totalFailures}</span>
                                                    </div>
                                                    {item.loginFailedCount > 0 && (
                                                        <div className="flex items-center justify-between gap-3 text-slate-400">
                                                            <span>AAA LOGIN_FAILED:</span>
                                                            <span className="text-red-300 font-semibold">{item.loginFailedCount}</span>
                                                        </div>
                                                    )}
                                                    {item.policyFailedCount > 0 && (
                                                        <div className="flex items-center justify-between gap-3 text-slate-400">
                                                            <span>Policy / Imprivata:</span>
                                                            <span className="text-amber-300 font-semibold">{item.policyFailedCount}</span>
                                                        </div>
                                                    )}
                                                    {item.imprivataBadPasswordCount > 0 && (
                                                        <div className="flex items-center justify-between gap-3 text-rose-300/90">
                                                            <span>🔑 Imprivata Bad Pwd:</span>
                                                            <span className="text-rose-300 font-bold">{item.imprivataBadPasswordCount}</span>
                                                        </div>
                                                    )}
                                                    {item.imprivataMfaTimeoutCount > 0 && (
                                                        <div className="flex items-center justify-between gap-3 text-cyan-300/90">
                                                            <span>📱 MFA Push Timeout:</span>
                                                            <span className="text-cyan-300 font-bold">{item.imprivataMfaTimeoutCount}</span>
                                                        </div>
                                                    )}
                                                    {item.staFailedCount > 0 && (
                                                        <div className="flex items-center justify-between gap-3 text-slate-400">
                                                            <span>STA Ticket Failed:</span>
                                                            <span className="text-purple-300 font-semibold">{item.staFailedCount}</span>
                                                        </div>
                                                    )}
                                                    <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-3">
                                                        <span className="text-slate-400">Citrix Successes:</span>
                                                        <span className={item.citrixSuccessCount > 0 ? "text-emerald-400 font-bold" : "text-slate-500"}>
                                                            {item.citrixSuccessCount}
                                                        </span>
                                                    </div>
                                                    {item.hasVpnSuccessHistory && (
                                                        <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3 h-3" /> Prior AnyConnect VPN Success
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Targeted Users */}
                                            <td className="py-3.5 px-4">
                                                <div className="space-y-1.5">
                                                    {item.targetedUsers.map((u) => (
                                                        <div
                                                            key={u.username}
                                                            className="bg-slate-950/70 border border-slate-800 rounded px-2 py-1.5 flex flex-col gap-1"
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-mono font-semibold text-white">
                                                                    {u.username}
                                                                </span>
                                                                {getAdBadge(u.adStatus)}
                                                            </div>
                                                            {u.adDisplayName && (
                                                                <div className="text-[10px] text-slate-400">
                                                                    {u.adDisplayName} {u.adDepartment ? `• ${u.adDepartment}` : ""}
                                                                </div>
                                                            )}
                                                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                                <span>{u.failures} fail(s)</span>
                                                                {u.succeededLater && (
                                                                    <span className="text-emerald-400 font-medium">
                                                                        ✓ Logged in later
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <button
                                                        onClick={() =>
                                                            setBlockModal({
                                                                ips: [item.ip],
                                                                reason: item.verdictReason || "Citrix Login Abuse Triage",
                                                                targetHost: "all",
                                                                addToGuardianBlacklist: true,
                                                                loading: false,
                                                                result: null,
                                                                error: null,
                                                            })
                                                        }
                                                        title={
                                                            item.isCurrentlyShunned
                                                                ? "Pushes 'shun <ip>' again to all 4 perimeter firewalls and ensures IP is locked in the Guardian Do-Not-Unshun Blacklist."
                                                                : "Immediately executes 'shun <ip>' on all 4 perimeter firewalls AND adds the IP to Guardian Do-Not-Unshun Blacklist (prevents auto-unshun)."
                                                        }
                                                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                                            item.verdict === "LEGIT_USER_ISSUE"
                                                                ? "bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-700"
                                                                : "bg-red-600 hover:bg-red-500 text-white shadow-sm"
                                                        }`}
                                                    >
                                                        <Flame className="w-3.5 h-3.5" />
                                                        {item.isCurrentlyShunned ? "Re-Shun IP" : "Shun & Blacklist"}
                                                    </button>

                                                    <button
                                                        onClick={() =>
                                                            handleToggleGuardianBlacklist(
                                                                item.ip,
                                                                item.isOnGuardianBlacklist,
                                                                item.verdictReason || "Citrix Login Abuse"
                                                            )
                                                        }
                                                        disabled={blacklistLoadingIp === item.ip}
                                                        title={
                                                            item.isOnGuardianBlacklist
                                                                ? "Currently in Guardian Blacklist. Click to REMOVE from Do-Not-Unshun list (allows Guardian auto-unshun logic if legitimate)."
                                                                : "Adds IP to Guardian Do-Not-Unshun Blacklist in the database WITHOUT executing a firewall shun right now (protects against future auto-unshun)."
                                                        }
                                                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all flex items-center gap-1 ${
                                                            item.isOnGuardianBlacklist
                                                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25"
                                                                : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                                                        }`}
                                                    >
                                                        <Ban className="w-3 h-3" />
                                                        {item.isOnGuardianBlacklist ? "On Do-Not-Unshun" : "Add Do-Not-Unshun"}
                                                    </button>

                                                    <button
                                                        onClick={() => onInvestigateTarget(item.ip)}
                                                        title="Opens NetScaler Deep Investigator tab filtered to this IP to view all raw HTTP/AAA/ICA requests, session IDs, and timestamps."
                                                        className="px-2.5 py-1 rounded text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                                    >
                                                        <Search className="w-3 h-3" />
                                                        Inspect Timeline
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 2: IMPACTED CITRIX USERS & AD DIAGNOSIS */}
            {subView === "users" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                    {filteredUsers.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No named Citrix user login failures recorded in this timeframe.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Username & AD Identity</th>
                                        <th className="py-3 px-4">AD Status</th>
                                        <th className="py-3 px-4">Failures vs Citrix Logins</th>
                                        <th className="py-3 px-4">Client IPs & Origins</th>
                                        <th className="py-3 px-4">Automated Diagnosis</th>
                                        <th className="py-3 px-4 text-right">Investigate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {filteredUsers.map((u) => (
                                        <tr key={u.username} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-mono font-bold text-white text-sm">{u.username}</div>
                                                {u.adDisplayName && (
                                                    <div className="text-slate-300 text-xs mt-0.5">{u.adDisplayName}</div>
                                                )}
                                                {(u.adDepartment || u.adTitle) && (
                                                    <div className="text-[11px] text-slate-500">
                                                        {[u.adTitle, u.adDepartment].filter(Boolean).join(" • ")}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4">{getAdBadge(u.adStatus)}</td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-semibold text-red-400">{u.failureCount} failure event(s)</div>
                                                <div className={u.citrixSuccessCount > 0 ? "text-emerald-400 text-[11px] mt-0.5" : "text-slate-500 text-[11px] mt-0.5"}>
                                                    {u.citrixSuccessCount} successful session event(s)
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    Last fail: {new Date(u.lastFailureAt).toLocaleString()}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {u.sourceIps.map((ip) => (
                                                        <span
                                                            key={ip}
                                                            className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700"
                                                        >
                                                            {ip}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 max-w-md">
                                                <div className="flex flex-wrap gap-1.5 mb-1">
                                                    {u.imprivataBadPasswordCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold">
                                                            🔑 {u.imprivataBadPasswordCount}x Bad AD Password / Policy
                                                        </span>
                                                    )}
                                                    {u.imprivataMfaTimeoutCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold">
                                                            📱 {u.imprivataMfaTimeoutCount}x MFA Push Timeout (AD OK)
                                                        </span>
                                                    )}
                                                    {u.imprivataInvalidUserCount > 0 && (
                                                        <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold">
                                                            🚫 Invalid AD Username
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-slate-200 leading-relaxed">{u.diagnosis}</p>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {u.failureReasons.map((r, i) => (
                                                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                                                            {r}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <button
                                                        onClick={() => onInvestigateTarget(u.username)}
                                                        title="Opens NetScaler Deep Investigator tab filtered to this username to inspect chronological authentication & session activity."
                                                        className="px-2.5 py-1 rounded bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 text-[11px] font-medium"
                                                    >
                                                        Citrix Timeline
                                                    </button>
                                                    <Link
                                                        href={`/queries/account-lockout?username=${encodeURIComponent(u.username)}`}
                                                        title="Opens Account Lockout Investigator to correlate Active Directory 4740/4625 events, Imprivata RADIUS logs, and calling workstation/IP."
                                                        className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] flex items-center gap-1"
                                                    >
                                                        AD Lockout Triage <ExternalLink className="w-3 h-3" />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 3: RAW CITRIX FAILURE & POLICY EVENTS */}
            {subView === "events" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                    {filteredEvents.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No raw Citrix failure events matched the selected filters.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Timestamp</th>
                                        <th className="py-3 px-4">Category</th>
                                        <th className="py-3 px-4">User & AD Status</th>
                                        <th className="py-3 px-4">Client IP & Location</th>
                                        <th className="py-3 px-4">Reason / Policy / Browser</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {filteredEvents.map((ev) => (
                                        <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors align-top">
                                            <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-mono text-[11px]">
                                                {new Date(ev.timestamp).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/15 text-red-300 border border-red-500/30">
                                                    {ev.category}
                                                </span>
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    {ev.module} : {ev.action}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-mono font-semibold text-white">{ev.username}</div>
                                                <div className="mt-1">{getAdBadge(ev.adStatus)}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-mono text-slate-200">{ev.clientIp}</div>
                                                <div className="text-[11px] text-slate-400">
                                                    {ev.cityName !== "N/A" ? `${ev.cityName}, ` : ""}
                                                    {ev.countryCode}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 max-w-xl">
                                                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                                    {ev.imprivataVerdict === "BAD_AD_PASSWORD_OR_POLICY" && (
                                                        <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-bold uppercase">
                                                            🔑 Imprivata: Bad AD Password / Policy ({ev.imprivataNode || "as07"})
                                                        </span>
                                                    )}
                                                    {(ev.imprivataVerdict === "MFA_PUSH_TIMEOUT" || ev.imprivataVerdict === "MFA_CHALLENGED") && (
                                                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[10px] font-bold uppercase">
                                                            📱 Imprivata: MFA Push Timeout — AD Password OK ({ev.imprivataMfaMethod || "2FA"})
                                                        </span>
                                                    )}
                                                    {ev.imprivataVerdict === "INVALID_USER" && (
                                                        <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono text-[10px] font-bold uppercase">
                                                            🚫 Imprivata: Invalid Username
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="font-medium text-amber-300">{ev.failureReason}</div>
                                                {ev.userAgent && (
                                                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5">
                                                        <Laptop className="w-3 h-3 text-slate-500 shrink-0" />
                                                        <span className="truncate">{ev.userAgent}</span>
                                                    </div>
                                                )}
                                                <div className="mt-1.5 p-2 rounded bg-slate-950/80 border border-slate-800/80 font-mono text-[10px] text-slate-400 break-all">
                                                    {ev.rawMessage}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* SHUN & GUARDIAN BLACKLIST CONFIRMATION MODAL */}
            {blockModal && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30">
                                    <Flame className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        Perimeter Firewall Shun & Guardian Lock
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Block {blockModal.ips.length} Citrix abusive IP{blockModal.ips.length > 1 ? "s" : ""}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setBlockModal(null)}
                                className="text-slate-400 hover:text-white p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block text-slate-400 font-semibold mb-1">Target IP(s)</label>
                                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                                    {blockModal.ips.map((ip) => (
                                        <span
                                            key={ip}
                                            className="font-mono px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30"
                                        >
                                            {ip}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-slate-400 font-semibold mb-1">Target Perimeter Firewall</label>
                                <select
                                    value={blockModal.targetHost}
                                    onChange={(e) => setBlockModal({ ...blockModal, targetHost: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                                >
                                    <option value="all">All Firewalls (Perimeter Fleet)</option>
                                    {firewallHosts.map((fw) => (
                                        <option key={fw.id} value={fw.id}>
                                            {fw.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-slate-400 font-semibold mb-1">Audit & Blacklist Reason</label>
                                <input
                                    type="text"
                                    value={blockModal.reason}
                                    onChange={(e) => setBlockModal({ ...blockModal, reason: e.target.value })}
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                                />
                            </div>

                            <label className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={blockModal.addToGuardianBlacklist}
                                    onChange={(e) =>
                                        setBlockModal({ ...blockModal, addToGuardianBlacklist: e.target.checked })
                                    }
                                    className="mt-0.5 rounded border-amber-500/50 bg-slate-950 text-amber-500"
                                />
                                <div>
                                    <div className="font-semibold text-amber-300">
                                        Add to Guardian Do-Not-Unshun Blacklist (Recommended)
                                    </div>
                                    <div className="text-[11px] text-amber-200/80 mt-0.5">
                                        Prevents the automated Firewall Guardian cron from unshunning this IP if it belongs to a public ISP.
                                    </div>
                                </div>
                            </label>

                            {blockModal.error && (
                                <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/40 text-red-300">
                                    {blockModal.error}
                                </div>
                            )}

                            {blockModal.result && (
                                <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 space-y-1">
                                    <div className="font-semibold">
                                        ✓ Executed perimeter shun on {blockModal.result.blockedIps?.length || 0} IP(s)
                                        {blockModal.result.blacklistedCount
                                            ? ` and locked ${blockModal.result.blacklistedCount} IP(s) in Guardian Blacklist.`
                                            : "."}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                            <button
                                onClick={() => setBlockModal(null)}
                                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300"
                            >
                                Close
                            </button>
                            {!blockModal.result && (
                                <button
                                    onClick={executeBlockAction}
                                    disabled={blockModal.loading}
                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Flame className="w-4 h-4" />
                                    {blockModal.loading ? "Executing SSH Shun..." : "Confirm Shun & Lock"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
