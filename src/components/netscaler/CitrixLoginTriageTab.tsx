"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PaginationControls } from "@/components/common/PaginationControls";
import {
    ShieldAlert, ShieldCheck, AlertTriangle, Lock, Unlock, UserCheck, UserX,
    Globe, Server, RefreshCw, Search, CheckCircle2, Flame, Eye, ExternalLink,
    Sliders, Terminal, Laptop, FileSpreadsheet, Ban, Shield, ChevronRight, X,
    Download, ClipboardCheck, FileText, Sparkles, Home
} from "lucide-react";
import { ToolHelp } from "@/components/ToolHelp";
import Link from "next/link";
import { ShunDatabaseTab } from "@/components/firewall/ShunDatabaseTab";
import type {
    CitrixLoginTriageResponse,
    CitrixAsnMetric,
    CitrixIpEvaluation,
    CitrixUserIssueSummary,
    CitrixLoginFailureEvent,
    GuardianAbuseVerdict,
    CitrixIssueCategory,
    SingleIpReevaluationResult,
} from "@/lib/netscaler-login-triage";

interface CitrixLoginTriageTabProps {
    timeframe: number;
    onTimeframeChange?: (seconds: number) => void;
    firewallHosts: { id: string; name: string }[];
    onInvestigateTarget: (term: string) => void;
}

export default function CitrixLoginTriageTab({
    timeframe,
    onTimeframeChange,
    firewallHosts,
    onInvestigateTarget,
}: CitrixLoginTriageTabProps) {
    const [data, setData] = useState<CitrixLoginTriageResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sub-navigation inside the tab
    const [subView, setSubView] = useState<"ips" | "asns" | "users" | "events">("ips");

    // Filters
    const [verdictFilter, setVerdictFilter] = useState<"ALL" | GuardianAbuseVerdict | "ABUSIVE_RESIDENTIAL">("ALL");
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

    // Subview pagination states
    const [ipPage, setIpPage] = useState<number>(1);
    const [ipLimit, setIpLimit] = useState<number>(25);

    const [asnPage, setAsnPage] = useState<number>(1);
    const [asnLimit, setAsnLimit] = useState<number>(25);

    const [userPage, setUserPage] = useState<number>(1);
    const [userLimit, setUserLimit] = useState<number>(25);

    const [eventPage, setEventPage] = useState<number>(1);
    const [eventLimit, setEventLimit] = useState<number>(50);
    // Automated Guardian now syncs directly to Security Intelligence Feed (no SSH auto-shun controls)

    // Positive Confirmation Shun Action Audit Log
    const [showShunLogModal, setShowShunLogModal] = useState<boolean>(false);
    const [shunLogsLoading, setShunLogsLoading] = useState<boolean>(false);
    const [shunLogEntries, setShunLogEntries] = useState<any[]>([]);
    const [shunLogRawText, setShunLogRawText] = useState<string>("");
    const [shunLogTab, setShunLogTab] = useState<"cards" | "raw">("cards");

    // Perimeter Shun Database Modal
    const [showShunDbModal, setShowShunDbModal] = useState<boolean>(false);
    const [shunDbInitialSearch, setShunDbInitialSearch] = useState<string>("");

    // Origin ASN Intelligence & Blacklist Modal State
    const [asnFilterType, setAsnFilterType] = useState<"ALL" | "BLACKLISTED" | "HOSTING" | "ABUSIVE">("ALL");
    const [asnBlacklistModal, setAsnBlacklistModal] = useState<{
        asn: string;
        asnName: string;
        reason: string;
        isCurrentlyBlacklisted: boolean;
        loading: boolean;
        error: string | null;
        success: boolean;
    } | null>(null);
    const [asnActionLoadingKey, setAsnActionLoadingKey] = useState<string | null>(null);

    const handleToggleAsnBlacklist = async (
        asn: string,
        asnName: string,
        currentlyBlacklisted: boolean,
        customReason?: string
    ) => {
        setAsnActionLoadingKey(asn);
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: currentlyBlacklisted ? "remove_asn_blacklist" : "blacklist_asn",
                    asn,
                    asnName,
                    reason:
                        customReason ||
                        (currentlyBlacklisted
                            ? undefined
                            : "Blacklisted via Citrix Abuse Triage: zero-tolerance 1-failure autoshun rule"),
                }),
            });
            const j = await res.json();
            if (res.ok) {
                await fetchTriage();
                if (asnBlacklistModal) {
                    setAsnBlacklistModal(null);
                }
            } else {
                if (asnBlacklistModal) {
                    setAsnBlacklistModal((prev) =>
                        prev ? { ...prev, error: j.error || "Failed to update ASN blacklist status", loading: false } : null
                    );
                }
            }
        } catch (e: any) {
            console.error("Failed to toggle ASN blacklist:", e);
            if (asnBlacklistModal) {
                setAsnBlacklistModal((prev) => (prev ? { ...prev, error: e.message, loading: false } : null));
            }
        } finally {
            setAsnActionLoadingKey(null);
        }
    };

    const openBlacklistAsnModal = (
        asn: string,
        asnName: string,
        isCurrentlyBlacklisted: boolean = false,
        defaultReason?: string
    ) => {
        setAsnBlacklistModal({
            asn,
            asnName: asnName || "Unknown Organization",
            reason:
                defaultReason ||
                (isCurrentlyBlacklisted
                    ? ""
                    : "Blacklisted via Citrix Abuse Triage: zero-tolerance 1-failure autoshun rule"),
            isCurrentlyBlacklisted,
            loading: false,
            error: null,
            success: false,
        });
    };

    const fetchShunLogs = useCallback(async () => {
        setShunLogsLoading(true);
        try {
            const [jsonRes, rawRes] = await Promise.all([
                fetch("/api/firewall/shun/log?limit=50"),
                fetch("/api/firewall/shun/log?raw=true"),
            ]);
            if (jsonRes.ok) {
                const j = await jsonRes.json();
                setShunLogEntries(j.entries || []);
            }
            if (rawRes.ok) {
                const txt = await rawRes.text();
                setShunLogRawText(txt);
            }
        } catch (e) {
            console.error("Failed to load shun logs:", e);
        } finally {
            setShunLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (showShunLogModal) {
            fetchShunLogs();
        }
    }, [showShunLogModal, fetchShunLogs]);

    // Single IP Re-Evaluation & Reasoning State
    const [reevaluateModalIp, setReevaluateModalIp] = useState<string | null>(null);
    const [reevaluateData, setReevaluateData] = useState<SingleIpReevaluationResult | null>(null);
    const [reevaluateLoading, setReevaluateLoading] = useState<boolean>(false);
    const [reevaluateTab, setReevaluateTab] = useState<"reasoning" | "users" | "events">("reasoning");

    const handleReevaluateIp = async (ip: string) => {
        setReevaluateLoading(true);
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reevaluate_ip",
                    ip,
                    rangeSeconds: timeframe,
                    config: {
                        minFailuresForBlock: minFailures,
                        minSprayUsers,
                        flagForeignIps,
                        flagNonExistentAdUsers,
                        protectIspWithValidAdUser,
                    },
                }),
            });
            const json = await res.json();
            if (res.ok && json.evaluation) {
                setReevaluateData(json);
                // In-place update of that IP inside data.ipEvaluations
                setData((prev) => {
                    if (!prev) return prev;
                    const updatedIps = prev.ipEvaluations.map((item) =>
                        item.ip === ip ? { ...item, ...json.evaluation } : item
                    );
                    return { ...prev, ipEvaluations: updatedIps };
                });
            }
        } catch (e) {
            console.error("Failed to reevaluate IP:", e);
        } finally {
            setReevaluateLoading(false);
        }
    };

    const handleOpenReevaluateModal = (ip: string) => {
        setReevaluateModalIp(ip);
        setReevaluateTab("reasoning");
        handleReevaluateIp(ip);
    };

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

    const [unshunLoadingIp, setUnshunLoadingIp] = useState<string | null>(null);

    const handleUnshunIp = async (ip: string) => {
        if (!confirm(`Remove perimeter firewall shun for IP ${ip} across all firewalls?`)) return;
        setUnshunLoadingIp(ip);
        try {
            const res = await fetch("/api/firewall/shun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ipAddress: ip,
                    action: "remove",
                    targetHost: "all",
                }),
            });
            if (res.ok) {
                await fetchTriage();
            }
        } catch (e) {
            console.error("Failed to remove shun:", e);
        } finally {
            setUnshunLoadingIp(null);
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
        if (verdictFilter === "ABUSIVE_RESIDENTIAL") {
            if (!item.isResidentialAbusive || item.verdict !== "ABUSIVE_BLOCK") return false;
        } else if (verdictFilter !== "ALL" && item.verdict !== verdictFilter) {
            return false;
        }
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

    const exportAsnCsv = () => {
        if (!data?.asnMetrics?.length) return;
        const headers =
            "ASN,Organization,Type,Country,TotalFailures,LoginFailed,PolicyFailed,STA_Failed,UniqueIPs,TargetedUsers,AbusiveIPs,AlreadyShunnedIPs,MaxRiskScore,IsBlacklisted,BlacklistReason,FirstSeen,LastSeen\n";
        const rows = data.asnMetrics
            .map((a) =>
                [
                    `"${a.asn}"`,
                    `"${(a.asnName || "").replace(/"/g, '""')}"`,
                    `"${a.companyType || ""}"`,
                    `"${a.countryCode || ""}"`,
                    a.totalFailures,
                    a.loginFailedCount,
                    a.policyFailedCount,
                    a.staFailedCount,
                    a.uniqueIpCount,
                    a.uniqueUserCount,
                    a.abusiveIpCount,
                    a.alreadyShunnedIpCount,
                    a.maxRiskScore,
                    a.isBlacklisted ? "YES" : "NO",
                    `"${(a.blacklistReason || "").replace(/"/g, '""')}"`,
                    `"${a.firstSeen}"`,
                    `"${a.lastSeen}"`,
                ].join(",")
            )
            .join("\n");

        const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `citrix-origin-asn-metrics-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const filteredAsns: CitrixAsnMetric[] = (data?.asnMetrics || []).filter((item) => {
        if (asnFilterType === "BLACKLISTED" && !item.isBlacklisted) return false;
        if (asnFilterType === "HOSTING" && item.companyType?.toLowerCase() !== "hosting") return false;
        if (asnFilterType === "ABUSIVE" && item.abusiveIpCount === 0) return false;

        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
            item.asn.toLowerCase().includes(q) ||
            item.asnName.toLowerCase().includes(q) ||
            (item.companyType || "").toLowerCase().includes(q) ||
            (item.countryCode || "").toLowerCase().includes(q) ||
            item.ips.some((ip) => ip.includes(q)) ||
            item.targetedUsers.some((u) => u.toLowerCase().includes(q)) ||
            (item.blacklistReason || "").toLowerCase().includes(q)
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

    const paginatedIps = useMemo(() => {
        const start = (ipPage - 1) * ipLimit;
        return filteredIps.slice(start, start + ipLimit);
    }, [filteredIps, ipPage, ipLimit]);

    const paginatedUsers = useMemo(() => {
        const start = (userPage - 1) * userLimit;
        return filteredUsers.slice(start, start + userLimit);
    }, [filteredUsers, userPage, userLimit]);

    const paginatedAsns = useMemo(() => {
        const start = (asnPage - 1) * asnLimit;
        return filteredAsns.slice(start, start + asnLimit);
    }, [filteredAsns, asnPage, asnLimit]);

    const paginatedEvents = useMemo(() => {
        const start = (eventPage - 1) * eventLimit;
        return filteredEvents.slice(start, start + eventLimit);
    }, [filteredEvents, eventPage, eventLimit]);

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
                                <ToolHelp toolId="citrix-triage" iconSize={16} />
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
                            title={`Enforces all ${unshunnedAbusiveIps.length} unblocked Abusive IPs into Cisco FMC Security Intelligence feed and Guardian Do-Not-Unshun Blacklist.`}
                            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all"
                        >
                            <Flame className="w-4 h-4" />
                            Enforce All in Security Intelligence Feed ({unshunnedAbusiveIps.length})
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
                        onClick={() => {
                            setShunDbInitialSearch("");
                            setShowShunDbModal(true);
                        }}
                        title="Search all perimeter shunned IPs, browse recently shunned addresses, and un-shun across firewalls."
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 shadow-sm transition-all"
                    >
                        <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        Search Shunned IPs
                    </button>

                    <button
                        onClick={() => setShowShunLogModal(true)}
                        title="Open Positive Confirmation Shun Action Audit Log to verify firewall shuns and download log files."
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700"
                    >
                        <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Shun Audit Log
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
                        Verified Cooper AD users & households on US ISPs
                    </div>
                </div>

                {/* 5th KPI: Abusive Residential IPs & Reason Breakdown */}
                <div
                    onClick={() => {
                        setSubView("ips");
                        setVerdictFilter(verdictFilter === "ABUSIVE_RESIDENTIAL" ? "ALL" : "ABUSIVE_RESIDENTIAL");
                    }}
                    className={`cursor-pointer rounded-xl p-4 border transition-all ${
                        verdictFilter === "ABUSIVE_RESIDENTIAL"
                            ? "bg-rose-950/40 border-rose-500/70 shadow-lg shadow-rose-950/20"
                            : "bg-slate-900/60 border-slate-800 hover:border-rose-500/40"
                    }`}
                >
                    <div className="flex items-center justify-between text-xs text-rose-300 font-semibold">
                        <span>Abusive Residential IPs</span>
                        <Home className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="text-2xl font-bold text-rose-400 mt-1">
                        {loading ? "..." : data?.summary.residentialBlockedCount ?? 0}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                        {(data?.summary.residentialBlockReasons || []).length > 0 ? (
                            data?.summary.residentialBlockReasons.slice(0, 2).map((r) => (
                                <span key={r.reason} className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-medium truncate max-w-full" title={r.reason}>
                                    {r.reason}: {r.count}
                                </span>
                            ))
                        ) : (
                            <span className="text-[11px] text-slate-400">0 residential spray or brute-force hits</span>
                        )}
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
                        onClick={() => setSubView("asns")}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                            subView === "asns"
                                ? "bg-indigo-600 text-white"
                                : "text-slate-400 hover:text-white hover:bg-slate-800"
                        }`}
                    >
                        <span>Origin ASNs ({data?.asnMetrics?.length ?? 0})</span>
                        {(data?.summary?.blacklistedAsnsCount ?? 0) > 0 && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-[10px] font-bold">
                                {data?.summary?.blacklistedAsnsCount} Blacklisted
                            </span>
                        )}
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
                            <option value="ABUSIVE_RESIDENTIAL">Abusive Residential IPs ({(data?.summary.residentialBlockedCount ?? 0)})</option>
                            <option value="SUSPICIOUS_WATCH">Suspicious — Watch Only</option>
                            <option value="LEGIT_USER_ISSUE">Guardian Protected Only</option>
                        </select>
                    )}

                    {subView === "asns" && (
                        <div className="flex items-center gap-2">
                            <select
                                value={asnFilterType}
                                onChange={(e) => setAsnFilterType(e.target.value as any)}
                                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            >
                                <option value="ALL">All Origin ASNs</option>
                                <option value="BLACKLISTED">Blacklisted Only (Zero-Tolerance)</option>
                                <option value="HOSTING">Hosting / Cloud Providers</option>
                                <option value="ABUSIVE">Originating Abusive IPs</option>
                            </select>
                            <button
                                onClick={exportAsnCsv}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1 border border-slate-700"
                                title="Export ASN intelligence metrics to CSV"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Export CSV
                            </button>
                        </div>
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
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm max-h-[640px]">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            Evaluating Citrix authentication telemetry, Active Directory accounts, and ISP/ASN intelligence...
                        </div>
                    ) : filteredIps.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No external client IPs matched the current filter criteria in this timeframe.
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 shadow-xs">
                                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Client IP & Geo</th>
                                        <th className="py-3 px-4">ISP / Network (ASN)</th>
                                        <th className="py-3 px-4">Guardian Verdict & Rules</th>
                                        <th className="py-3 px-4">Failures vs Success</th>
                                        <th className="py-3 px-4">Targeted Users & AD Status</th>
                                        <th className="py-3 px-4 text-right">Enforcement Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {paginatedIps.map((item) => (
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
                                                    {item.isResidentialAbusive ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold flex items-center gap-1">
                                                            <Home className="w-3 h-3 text-rose-400" />
                                                            Abusive Residential
                                                        </span>
                                                    ) : item.isProtectedHousehold ? (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                                                            <Home className="w-3 h-3 text-emerald-400" />
                                                            Household (2 AD Users)
                                                        </span>
                                                    ) : item.isResidentialIsp ? (
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
                                                {item.residentialBlockReason && item.verdict === "ABUSIVE_BLOCK" && (
                                                    <div className="mt-1 text-[10px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded px-2 py-0.5 font-semibold flex items-center gap-1.5 w-fit">
                                                        <Home className="w-3 h-3 text-rose-400" />
                                                        <span>Block Reason: <strong>{item.residentialBlockReason}</strong></span>
                                                    </div>
                                                )}
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
                                                    {item.isCurrentlyShunned || item.isOnGuardianBlacklist ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span
                                                                className="px-2.5 py-1 rounded bg-red-950/70 border border-red-500/40 text-red-300 font-semibold text-[11px] flex items-center gap-1 shadow-sm"
                                                                title="Enforced in Cisco FMC Security Intelligence feed and Guardian Do-Not-Unshun Blacklist."
                                                            >
                                                                <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                                                                Enforced (SI)
                                                            </span>
                                                            <button
                                                                onClick={() => handleUnshunIp(item.ip)}
                                                                disabled={unshunLoadingIp === item.ip}
                                                                title="Removes the IP from Guardian Blacklist and un-shuns across firewalls"
                                                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium flex items-center gap-1 transition-all"
                                                            >
                                                                <Unlock className="w-3 h-3 text-emerald-400" />
                                                                {unshunLoadingIp === item.ip ? "Pardoning..." : "Pardon / Unblock"}
                                                            </button>
                                                        </div>
                                                    ) : (
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
                                                            title="Enforces this IP into Cisco FMC Security Intelligence feed and locks it into Guardian Do-Not-Unshun Blacklist."
                                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                                                                item.verdict === "LEGIT_USER_ISSUE"
                                                                    ? "bg-slate-800 hover:bg-red-950/60 text-slate-300 hover:text-red-300 border border-slate-700"
                                                                    : "bg-red-600 hover:bg-red-500 text-white shadow-sm"
                                                            }`}
                                                        >
                                                            <ShieldAlert className="w-3.5 h-3.5" />
                                                            Enforce in SI Feed
                                                        </button>
                                                    )}

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
                                                                ? "Currently locked on the Do-Not-Unshun list. Click to REMOVE from the list (allows automated unshunning if legitimate)."
                                                                : "Adds this IP to the Guardian Do-Not-Unshun Blacklist in the database (protects against future automated unshun cleanup)."
                                                        }
                                                        className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-all flex items-center gap-1.5 ${
                                                            item.isOnGuardianBlacklist
                                                                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-red-950/40 hover:border-red-500/40 hover:text-red-300"
                                                                : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white"
                                                        }`}
                                                    >
                                                        {item.isOnGuardianBlacklist ? (
                                                            <>
                                                                <X className="w-3 h-3 text-amber-400" />
                                                                <span>Remove Do-Not-Unshun</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Ban className="w-3 h-3 text-slate-400" />
                                                                <span>+ Add Do-Not-Unshun</span>
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        onClick={() => onInvestigateTarget(item.ip)}
                                                        title="Opens NetScaler Deep Investigator tab filtered to this IP to view all raw HTTP/AAA/ICA requests, session IDs, and timestamps."
                                                        className="px-2.5 py-1 rounded text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                                    >
                                                        <Search className="w-3 h-3" />
                                                        Inspect Timeline
                                                    </button>

                                                    <button
                                                        onClick={() => handleOpenReevaluateModal(item.ip)}
                                                        title="Re-check Graylog and Active Directory in real time, inspect step-by-step scoring reasoning, and update verdict."
                                                        className="px-2.5 py-1 rounded text-[11px] font-medium bg-slate-800 hover:bg-indigo-950/60 text-slate-300 hover:text-indigo-300 border border-slate-700 hover:border-indigo-500/40 flex items-center gap-1 transition-all"
                                                    >
                                                        <Sparkles className="w-3 h-3 text-indigo-400" />
                                                        Re-Evaluate & Reasoning
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {filteredIps.length > 0 && (
                        <div className="shrink-0 p-3 bg-slate-950/90 border-t border-slate-800 flex justify-between items-center text-xs">
                            <PaginationControls
                                totalRecords={filteredIps.length}
                                page={ipPage}
                                limit={ipLimit}
                                onPageChange={setIpPage}
                                onLimitChange={(l) => { setIpLimit(l); setIpPage(1); }}
                                limitOptions={[25, 50, 100, 200]}
                                showLimitSelector={true}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 2: IMPACTED CITRIX USERS & AD DIAGNOSIS */}
            {subView === "users" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm max-h-[640px]">
                    {filteredUsers.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No named Citrix user login failures recorded in this timeframe.
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 shadow-xs">
                                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Username & AD Identity</th>
                                        <th className="py-3 px-4">AD Status</th>
                                        <th className="py-3 px-4">Failures vs Citrix Logins</th>
                                        <th className="py-3 px-4">Client IPs & Origins</th>
                                        <th className="py-3 px-4">Automated Diagnosis</th>
                                        <th className="py-3 px-4 text-right">Investigate</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {paginatedUsers.map((u) => (
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
                    {filteredUsers.length > 0 && (
                        <div className="shrink-0 p-3 bg-slate-950/90 border-t border-slate-800 flex justify-between items-center text-xs">
                            <PaginationControls
                                totalRecords={filteredUsers.length}
                                page={userPage}
                                limit={userLimit}
                                onPageChange={setUserPage}
                                onLimitChange={(l) => { setUserLimit(l); setUserPage(1); }}
                                limitOptions={[25, 50, 100, 200]}
                                showLimitSelector={true}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 4: ORIGIN ASN INTELLIGENCE & ZERO-TOLERANCE BLACKLISTING */}
            {subView === "asns" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm max-h-[640px]">
                    {filteredAsns.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No origin Autonomous System Numbers (ASNs) match the current filters.
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 shadow-xs">
                                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Autonomous System (ASN)</th>
                                        <th className="py-3 px-4">Organization & Type</th>
                                        <th className="py-3 px-4">Country</th>
                                        <th className="py-3 px-4">Failures</th>
                                        <th className="py-3 px-4">Client IPs</th>
                                        <th className="py-3 px-4">Targeted Users</th>
                                        <th className="py-3 px-4">Blacklist Policy</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {paginatedAsns.map((a) => (
                                        <tr key={a.asn} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3.5 px-4">
                                                <div className="font-mono font-bold text-white text-sm flex items-center gap-2">
                                                    <span>{a.asn}</span>
                                                    {a.isBlacklisted && (
                                                        <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono text-[9px] font-bold">
                                                            ZERO-TOLERANCE
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-medium text-slate-200">{a.asnName || "Unknown Org"}</div>
                                                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                                    <span className="capitalize">{a.companyType || "unknown"}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-300">
                                                {a.countryCode || "--"}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                <div className="font-bold text-rose-400 font-mono text-sm">{a.totalFailures}</div>
                                                <div className="text-[10px] text-slate-500 font-mono">
                                                    {a.loginFailedCount} AAA | {a.policyFailedCount} Pol
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-4 font-mono">
                                                <span className="text-white font-semibold">{a.uniqueIpCount}</span>
                                                {a.abusiveIpCount > 0 && (
                                                    <span className="ml-1 text-[11px] text-rose-400">({a.abusiveIpCount} abusive)</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 font-mono text-slate-300">
                                                {a.uniqueUserCount} user{a.uniqueUserCount === 1 ? "" : "s"}
                                            </td>
                                            <td className="py-3.5 px-4">
                                                {a.isBlacklisted ? (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded w-fit">
                                                            🚫 Blacklisted ASN
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 truncate max-w-xs" title={a.blacklistReason || "Zero-tolerance autoshun rule"}>
                                                            {a.blacklistReason || "Zero-tolerance autoshun rule"}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-xs">Standard Thresholds (3+ fails)</span>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {a.isBlacklisted ? (
                                                        <button
                                                            onClick={() => openBlacklistAsnModal(a.asn, a.asnName, true, a.blacklistReason || "")}
                                                            disabled={asnActionLoadingKey === a.asn}
                                                            className="px-2.5 py-1 rounded text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                                                        >
                                                            Manage / Remove
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => openBlacklistAsnModal(a.asn, a.asnName, false)}
                                                            disabled={asnActionLoadingKey === a.asn}
                                                            className="px-2.5 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white shadow-xs transition-colors flex items-center gap-1"
                                                        >
                                                            <Ban className="w-3 h-3" />
                                                            + Blacklist ASN
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {filteredAsns.length > 0 && (
                        <div className="shrink-0 p-3 bg-slate-950/90 border-t border-slate-800 flex justify-between items-center text-xs">
                            <PaginationControls totalRecords={filteredAsns.length} page={asnPage} limit={asnLimit} onPageChange={setAsnPage} onLimitChange={(l) => { setAsnLimit(l); setAsnPage(1); }} limitOptions={[25, 50, 100, 200]} showLimitSelector={true} />
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 3: RAW CITRIX FAILURE & POLICY EVENTS */}
            {subView === "events" && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm max-h-[640px]">
                    {filteredEvents.length === 0 ? (
                        <div className="p-12 text-center text-sm text-slate-400">
                            No raw Citrix failure events matched the selected filters.
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative">
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 shadow-xs">
                                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                        <th className="py-3 px-4">Timestamp</th>
                                        <th className="py-3 px-4">Category</th>
                                        <th className="py-3 px-4">User & AD Status</th>
                                        <th className="py-3 px-4">Client IP & Location</th>
                                        <th className="py-3 px-4">Reason / Policy / Browser</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/70 text-xs">
                                    {paginatedEvents.map((ev) => (
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
                    {filteredEvents.length > 0 && (
                        <div className="shrink-0 p-3 bg-slate-950/90 border-t border-slate-800 flex justify-between items-center text-xs">
                            <PaginationControls
                                totalRecords={filteredEvents.length}
                                page={eventPage}
                                limit={eventLimit}
                                onPageChange={setEventPage}
                                onLimitChange={(l) => { setEventLimit(l); setEventPage(1); }}
                                limitOptions={[25, 50, 100, 200]}
                                showLimitSelector={true}
                            />
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
                                        Security Intelligence Feed Enforcement
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Enforce {blockModal.ips.length} Citrix abusive IP{blockModal.ips.length > 1 ? "s" : ""}
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

                            <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
                                <Shield className="w-4 h-4 shrink-0 text-indigo-400" />
                                <span>Enforces line-rate drop across Cisco FMC Security Intelligence feed (no SSH interface shuns needed).</span>
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
                                <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="font-semibold flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                            <span>
                                                Security Intelligence enforcement active for {blockModal.result.blockedIps?.length || 0} IP(s)
                                                {blockModal.result.blacklistedCount
                                                    ? ` and locked ${blockModal.result.blacklistedCount} in Guardian Blacklist.`
                                                    : "."}
                                            </span>
                                        </div>
                                        <a
                                            href="/api/firewall/shun/log?download=true"
                                            download
                                            className="px-2.5 py-1 rounded bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-all self-start sm:self-auto"
                                            title="Download positive confirmation audit log file (.log)"
                                        >
                                            <Download className="w-3.5 h-3.5" />
                                            Download Log (.log)
                                        </a>
                                    </div>

                                    {blockModal.result.positiveConfirmation && (
                                        <div className="pt-2.5 border-t border-emerald-500/20 text-xs space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-emerald-200 font-medium">
                                                    {blockModal.result.positiveConfirmation.summary}
                                                </div>
                                                <button
                                                    onClick={() => setShowShunLogModal(true)}
                                                    className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
                                                >
                                                    View Detailed Audit Log
                                                </button>
                                            </div>

                                            {blockModal.result.positiveConfirmation.nodeVerifications && (
                                                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                                                    {blockModal.result.positiveConfirmation.nodeVerifications.map((n: any) => (
                                                        <div
                                                            key={n.target}
                                                            className={`px-2.5 py-1.5 rounded text-[11px] font-mono border flex items-center justify-between ${
                                                                n.success
                                                                    ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-300"
                                                                    : "bg-red-950/80 border-red-500/30 text-red-300"
                                                            }`}
                                                        >
                                                            <span className="truncate">{n.target}</span>
                                                            <span className="font-semibold">
                                                                {n.success ? "✓ Confirmed Active" : "✗ Warning"}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
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
                                    {blockModal.loading ? "Enforcing via SI Feed..." : "Confirm SI Feed Block"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Positive Confirmation Shun Action Audit Log Modal */}
            {showShunLogModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60 rounded-t-xl">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    <ClipboardCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                                        Perimeter Shun Audit Log & Positive Confirmation
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Audit records persisted to <code className="text-emerald-400">logs/shun-actions.log</code> confirming firewall execution status.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowShunLogModal(false)}
                                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Toolbar */}
                        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-1.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
                                <button
                                    onClick={() => setShunLogTab("cards")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        shunLogTab === "cards"
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Parsed Events ({shunLogEntries.length})
                                </button>
                                <button
                                    onClick={() => setShunLogTab("raw")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        shunLogTab === "raw"
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Raw Log File
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={fetchShunLogs}
                                    disabled={shunLogsLoading}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${shunLogsLoading ? "animate-spin text-indigo-400" : ""}`} />
                                    Refresh
                                </button>
                                <a
                                    href="/api/firewall/shun/log?download=true"
                                    download
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1.5 shadow-sm shadow-emerald-600/30"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download shun-actions.log
                                </a>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-3 font-sans text-xs">
                            {shunLogsLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                                    <span>Loading positive confirmation records...</span>
                                </div>
                            ) : shunLogTab === "raw" ? (
                                <pre className="p-3.5 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap overflow-x-auto leading-relaxed">
                                    {shunLogRawText || "No shun log records found."}
                                </pre>
                            ) : shunLogEntries.length === 0 ? (
                                <div className="py-12 text-center text-slate-400">
                                    No shun actions recorded yet in this session.
                                </div>
                            ) : (
                                shunLogEntries.map((entry: any, idx: number) => {
                                    const isConfirmedAll = entry.verdict === "CONFIRMED_ALL_NODES";
                                    return (
                                        <div
                                            key={idx}
                                            className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                            isConfirmedAll
                                                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                                                : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                        }`}
                                                    >
                                                        {entry.verdict?.replace(/_/g, " ")}
                                                    </span>
                                                    <span className="font-semibold text-white">
                                                        {entry.action}
                                                    </span>
                                                    <span className="text-slate-400">
                                                        • {entry.ips?.length || 0} IP(s)
                                                    </span>
                                                </div>
                                                <div className="text-[11px] text-slate-400">
                                                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ""}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-300">
                                                <div>
                                                    <span className="text-slate-500">Initiator:</span>{" "}
                                                    <span className="text-slate-200 font-medium">{entry.initiator}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Fleet:</span>{" "}
                                                    <span className="text-slate-200">{entry.targetFleet}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Guardian Lock:</span>{" "}
                                                    <span className={entry.addedToGuardianBlacklist ? "text-amber-400 font-medium" : "text-slate-400"}>
                                                        {entry.addedToGuardianBlacklist ? "Yes (Protected)" : "No"}
                                                    </span>
                                                </div>
                                            </div>

                                            {entry.reason && (
                                                <div className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800">
                                                    <span className="text-slate-500 font-medium">Reason:</span> {entry.reason}
                                                </div>
                                            )}

                                            {/* Node Verifications */}
                                            {entry.nodeVerifications && (
                                                <div className="space-y-1">
                                                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                                        Firewall Nodes Positive Confirmation
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                                        {entry.nodeVerifications.map((n: any, nIdx: number) => (
                                                            <div
                                                                key={nIdx}
                                                                className={`p-2 rounded border font-mono text-[11px] flex items-center justify-between ${
                                                                    n.success
                                                                        ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                                                                        : "bg-red-950/30 border-red-500/30 text-red-300"
                                                                }`}
                                                            >
                                                                <div>
                                                                    <div className="font-semibold text-white">{n.target}</div>
                                                                    <div className="text-[10px] text-slate-400">
                                                                        {n.commandsCount} cmd(s) • {n.promptConfirmed ? "Prompt confirmed" : "Closed cleanly"}
                                                                    </div>
                                                                </div>
                                                                <span className="text-xs font-bold">
                                                                    {n.success ? "✓ Active" : "✗ Error"}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* IPs Sample */}
                                            {entry.ips && (
                                                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                                                    <span className="text-slate-500">IPs:</span>{" "}
                                                    {entry.ips.slice(0, 8).join(", ")}
                                                    {entry.ips.length > 8 && ` +${entry.ips.length - 8} more`}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 bg-slate-950/80 border-t border-slate-800 rounded-b-xl flex items-center justify-between text-xs text-slate-400">
                            <div>
                                Confirmation log file: <code className="text-emerald-400 font-mono">logs/shun-actions.log</code>
                            </div>
                            <button
                                onClick={() => setShowShunLogModal(false)}
                                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Real-time IP Re-Evaluation & Scoring Reasoning Modal */}
            {reevaluateModalIp && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base font-bold font-mono text-white">
                                            {reevaluateModalIp}
                                        </h3>
                                        {reevaluateData?.evaluation?.isCurrentlyShunned && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
                                                SHUNNED ON PERIMETER
                                            </span>
                                        )}
                                        {reevaluateData?.evaluation?.isOnGuardianBlacklist && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                DO-NOT-UNSHUN
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                                        <span>
                                            {reevaluateData?.evaluation?.cityName !== "N/A"
                                                ? `${reevaluateData?.evaluation?.cityName}, `
                                                : ""}
                                            {reevaluateData?.evaluation?.countryCode || "Unknown"}
                                        </span>
                                        <span>•</span>
                                        <span>{reevaluateData?.evaluation?.companyName || "Unknown ISP"}</span>
                                        <span className="font-mono text-slate-500">
                                            ({reevaluateData?.evaluation?.asn})
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {reevaluateData?.evaluation && (
                                    <div className="flex items-center gap-2">
                                        {getVerdictBadge(
                                            reevaluateData.evaluation.verdict,
                                            reevaluateData.evaluation.riskScore
                                        )}
                                        <div className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-slate-200">
                                            Score: <span className="font-bold text-white">{reevaluateData.evaluation.riskScore}</span>/100
                                        </div>
                                    </div>
                                )}
                                <button
                                    onClick={() => {
                                        setReevaluateModalIp(null);
                                        setReevaluateData(null);
                                    }}
                                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Toolbar */}
                        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
                                <button
                                    onClick={() => setReevaluateTab("reasoning")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        reevaluateTab === "reasoning"
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Scoring Reasoning & Rules ({reevaluateData?.reasoningDetails?.triggeredRules?.length || 0})
                                </button>
                                <button
                                    onClick={() => setReevaluateTab("users")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        reevaluateTab === "users"
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Targeted Users & AD ({reevaluateData?.evaluation?.targetedUsers?.length || 0})
                                </button>
                                <button
                                    onClick={() => setReevaluateTab("events")}
                                    className={`px-3 py-1 rounded-md font-medium transition-all ${
                                        reevaluateTab === "events"
                                            ? "bg-indigo-600 text-white"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    Recent Events ({reevaluateData?.events?.length || 0})
                                </button>
                            </div>

                            <button
                                onClick={() => reevaluateModalIp && handleReevaluateIp(reevaluateModalIp)}
                                disabled={reevaluateLoading}
                                title="Re-queries Graylog, Active Directory, and perimeter firewalls right now"
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-600/30 transition-all disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${reevaluateLoading ? "animate-spin" : ""}`} />
                                {reevaluateLoading ? "Re-Evaluating Live..." : "Re-Check Live Telemetry"}
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-4 overflow-y-auto flex-1 space-y-4 font-sans text-xs">
                            {reevaluateLoading && !reevaluateData ? (
                                <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2.5">
                                    <RefreshCw className="w-7 h-7 animate-spin text-indigo-400" />
                                    <span className="text-sm font-medium">Re-checking Graylog & Active Directory for {reevaluateModalIp}...</span>
                                </div>
                            ) : !reevaluateData ? (
                                <div className="py-12 text-center text-slate-400">
                                    Unable to load evaluation data for this IP address.
                                </div>
                            ) : reevaluateTab === "reasoning" ? (
                                <div className="space-y-3.5">
                                    {/* Verdict Reasoning Card */}
                                    <div
                                        className={`p-3.5 rounded-xl border space-y-2 ${
                                            reevaluateData.evaluation.verdict === "ABUSIVE_BLOCK"
                                                ? "bg-red-950/30 border-red-500/40 text-red-200"
                                                : reevaluateData.evaluation.verdict === "SUSPICIOUS_WATCH"
                                                ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                                                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-xs uppercase tracking-wider">
                                                Verdict Explanation: {reevaluateData.evaluation.verdict.replace(/_/g, " ")}
                                            </span>
                                            <span className="font-mono text-xs font-semibold">
                                                Base Score: {reevaluateData.reasoningDetails.baseScore} → Final Score: {reevaluateData.reasoningDetails.finalScore}
                                            </span>
                                        </div>
                                        <p className="text-sm font-medium leading-relaxed">
                                            {reevaluateData.evaluation.verdictReason}
                                        </p>
                                        {reevaluateData.evaluation.protectionNote && (
                                            <div className="mt-2 text-xs bg-slate-900/60 p-2 rounded border border-slate-700/60 text-slate-200">
                                                {reevaluateData.evaluation.protectionNote}
                                            </div>
                                        )}
                                        {reevaluateData.reasoningDetails.safetyShieldApplied && (
                                            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 pt-1">
                                                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                                Guardian Safety Shield Applied: {reevaluateData.reasoningDetails.safetyShieldReason}
                                            </div>
                                        )}
                                    </div>

                                    {/* Triggered Rules Breakdown */}
                                    <div className="space-y-2">
                                        <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                                            Triggered Smart Guardian Rules
                                        </h4>
                                        {reevaluateData.reasoningDetails.triggeredRules.length === 0 ? (
                                            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
                                                No abusive scoring rules triggered for this IP.
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {reevaluateData.reasoningDetails.triggeredRules.map((rule, rIdx) => (
                                                    <div
                                                        key={rIdx}
                                                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3"
                                                    >
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                                        rule.severity === "CRITICAL"
                                                                            ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                                                            : rule.severity === "HIGH"
                                                                            ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                                                                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                                    }`}
                                                                >
                                                                    {rule.severity}
                                                                </span>
                                                                <span className="font-semibold text-white">
                                                                    {rule.label}
                                                                </span>
                                                            </div>
                                                            <p className="text-slate-400 text-xs leading-relaxed">
                                                                {rule.detail}
                                                            </p>
                                                        </div>
                                                        <div className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 font-mono font-bold text-xs shrink-0">
                                                            +{rule.points} pts
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Network & Forensic Telemetry */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                                Network & ISP Classification
                                            </div>
                                            <div className="text-xs text-slate-200">
                                                <span className="text-slate-500">Provider:</span> {reevaluateData.reasoningDetails.ispClassification.companyName}
                                            </div>
                                            <div className="text-xs text-slate-200">
                                                <span className="text-slate-500">Type:</span> {reevaluateData.reasoningDetails.ispClassification.companyType}{" "}
                                                {reevaluateData.reasoningDetails.ispClassification.isResidentialIsp && (
                                                    <span className="text-sky-400 font-semibold">(Residential ISP)</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-slate-200">
                                                <span className="text-slate-500">Blacklisted ASN:</span>{" "}
                                                {reevaluateData.reasoningDetails.ispClassification.isOnAsnBlacklist ? (
                                                    <span className="text-red-400 font-bold">YES</span>
                                                ) : (
                                                    <span className="text-slate-400">No</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                                            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                                Imprivata RADIUS Telemetry
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-slate-200">
                                                <span className="text-slate-500">Bad AD Password / Policy:</span>
                                                <span className="font-mono font-bold text-amber-300">
                                                    {reevaluateData.reasoningDetails.imprivataSummary.badPasswordCount}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-slate-200">
                                                <span className="text-slate-500">MFA Push Timeout (Smartphone):</span>
                                                <span className="font-mono font-bold text-cyan-300">
                                                    {reevaluateData.reasoningDetails.imprivataSummary.mfaTimeoutCount}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-xs text-slate-200">
                                                <span className="text-slate-500">Invalid Username in RADIUS:</span>
                                                <span className="font-mono font-bold text-red-300">
                                                    {reevaluateData.reasoningDetails.imprivataSummary.invalidUserCount}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : reevaluateTab === "users" ? (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                                        Targeted Usernames & Live Active Directory Status
                                    </h4>
                                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                                                <tr>
                                                    <th className="py-2.5 px-3">Username</th>
                                                    <th className="py-2.5 px-3">AD Account Status</th>
                                                    <th className="py-2.5 px-3">Display Name / Dept</th>
                                                    <th className="py-2.5 px-3 text-right">Failures</th>
                                                    <th className="py-2.5 px-3 text-right">Citrix Success</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                                                {reevaluateData.evaluation.targetedUsers.map((u) => (
                                                    <tr key={u.username} className="hover:bg-slate-800/40">
                                                        <td className="py-2.5 px-3 font-mono font-semibold text-white">
                                                            {u.username}
                                                        </td>
                                                        <td className="py-2.5 px-3">{getAdBadge(u.adStatus)}</td>
                                                        <td className="py-2.5 px-3 text-slate-300">
                                                            {u.adDisplayName || "-"}
                                                            {u.adDepartment && (
                                                                <span className="text-slate-500 block text-[10px]">
                                                                    {u.adDepartment}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                                            {u.failures} fail(s)
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right">
                                                            {u.succeededLater ? (
                                                                <span className="text-emerald-400 font-medium">✓ Logged in later</span>
                                                            ) : (
                                                                <span className="text-slate-500">-</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
                                        Authentication Failure Event Timeline ({reevaluateData.events.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {reevaluateData.events.map((ev) => (
                                            <div
                                                key={ev.id}
                                                className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5 font-mono text-[11px]"
                                            >
                                                <div className="flex items-center justify-between text-slate-400">
                                                    <div className="flex items-center gap-2">
                                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-sans font-semibold text-[10px]">
                                                            {ev.category}
                                                        </span>
                                                        <span className="text-white font-bold">{ev.username}</span>
                                                    </div>
                                                    <span className="text-slate-500 font-sans text-[10px]">
                                                        {new Date(ev.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="text-slate-300 font-sans">
                                                    <span className="text-slate-500 font-medium">Failure Reason:</span>{" "}
                                                    {ev.failureReason}
                                                </div>
                                                {ev.imprivataVerdictLabel && (
                                                    <div className="text-[10px] text-cyan-300 font-sans bg-cyan-950/30 p-1.5 rounded border border-cyan-500/20">
                                                        📱 Imprivata RADIUS: {ev.imprivataVerdictLabel} {ev.imprivataMfaMethod ? `via ${ev.imprivataMfaMethod}` : ""}
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-slate-500 truncate">
                                                    Raw: {ev.rawMessage}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 rounded-b-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div className="text-slate-400 text-[11px]">
                                Re-evaluated at: <span className="font-mono text-slate-300">{reevaluateData?.refreshedAt ? new Date(reevaluateData.refreshedAt).toLocaleTimeString() : "-"}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                {reevaluateData?.evaluation && (
                                    <>
                                        {reevaluateData.evaluation.isCurrentlyShunned || reevaluateData.evaluation.isOnGuardianBlacklist ? (
                                            <button
                                                onClick={() => {
                                                    handleUnshunIp(reevaluateData.evaluation.ip);
                                                    setReevaluateModalIp(null);
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-1.5 border border-slate-700"
                                            >
                                                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                                                Pardon / Remove from SI
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    setBlockModal({
                                                        ips: [reevaluateData.evaluation.ip],
                                                        reason: reevaluateData.evaluation.verdictReason || "Citrix Login Abuse",
                                                        targetHost: "all",
                                                        addToGuardianBlacklist: true,
                                                        loading: false,
                                                        result: null,
                                                        error: null,
                                                    });
                                                }}
                                                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold flex items-center gap-1.5 shadow-sm shadow-red-600/30"
                                            >
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                Enforce in SI Feed
                                            </button>
                                        )}

                                        <button
                                            onClick={async () => {
                                                await handleToggleGuardianBlacklist(
                                                    reevaluateData.evaluation.ip,
                                                    reevaluateData.evaluation.isOnGuardianBlacklist,
                                                    reevaluateData.evaluation.verdictReason || "Citrix Login Abuse"
                                                );
                                                handleReevaluateIp(reevaluateData.evaluation.ip);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium"
                                        >
                                            {reevaluateData.evaluation.isOnGuardianBlacklist
                                                ? "Remove Do-Not-Unshun"
                                                : "+ Add Do-Not-Unshun"}
                                        </button>

                                        <button
                                            onClick={() => {
                                                onInvestigateTarget(reevaluateData.evaluation.ip);
                                                setReevaluateModalIp(null);
                                            }}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 hover:bg-indigo-600/30 font-medium flex items-center gap-1"
                                        >
                                            <Search className="w-3.5 h-3.5" />
                                            Deep Timeline
                                        </button>
                                    </>
                                )}

                                <button
                                    onClick={() => {
                                        setReevaluateModalIp(null);
                                        setReevaluateData(null);
                                    }}
                                    className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* UNIFIED GUARDIAN ASN BLACKLIST MODAL */}
            {asnBlacklistModal && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                    <Ban className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        {asnBlacklistModal.isCurrentlyBlacklisted ? "Manage Blacklisted ASN" : "Blacklist Autonomous System (ASN)"}
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Single Source of Truth: Fleet-wide Rule (Citrix, VPN & Firewalls)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setAsnBlacklistModal(null)}
                                className="text-slate-400 hover:text-white p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                                <div>
                                    <div className="font-mono text-base font-bold text-white">{asnBlacklistModal.asn}</div>
                                    <div className="text-slate-400 font-medium">{asnBlacklistModal.asnName}</div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                                    asnBlacklistModal.isCurrentlyBlacklisted
                                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                        : "bg-slate-800 text-slate-400 border border-slate-700"
                                }`}>
                                    {asnBlacklistModal.isCurrentlyBlacklisted ? "BLACKLISTED" : "NOT BLACKLISTED"}
                                </span>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                                    Reason for Blacklisting
                                </label>
                                <textarea
                                    value={asnBlacklistModal.reason}
                                    onChange={(e) => setAsnBlacklistModal(prev => prev ? { ...prev, reason: e.target.value } : null)}
                                    rows={3}
                                    placeholder="Enter reason for fleet-wide ASN blacklisting..."
                                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                                />
                            </div>

                            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] leading-relaxed">
                                💡 <strong>Universal Rule:</strong> When an ASN is in the Guardian Blacklist, <strong>any failure (Citrix or VPN)</strong> originating from this ASN triggers zero-tolerance automatic perimeter shunning across all 4 Cisco ASA/FTD firewalls, and Guardian will never un-shun it.
                            </div>

                            {asnBlacklistModal.error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                                    {asnBlacklistModal.error}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                            <button
                                onClick={() => setAsnBlacklistModal(null)}
                                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs"
                            >
                                Cancel
                            </button>
                            <div className="flex items-center gap-2">
                                {asnBlacklistModal.isCurrentlyBlacklisted ? (
                                    <button
                                        onClick={() => handleToggleAsnBlacklist(asnBlacklistModal.asn, asnBlacklistModal.asnName, true)}
                                        disabled={asnActionLoadingKey === asnBlacklistModal.asn}
                                        className="px-4 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 font-semibold text-xs transition-colors"
                                    >
                                        {asnActionLoadingKey === asnBlacklistModal.asn ? "Removing..." : "Remove from Blacklist"}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => handleToggleAsnBlacklist(asnBlacklistModal.asn, asnBlacklistModal.asnName, false, asnBlacklistModal.reason)}
                                        disabled={asnActionLoadingKey === asnBlacklistModal.asn}
                                        className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-xs transition-colors"
                                    >
                                        {asnActionLoadingKey === asnBlacklistModal.asn ? "Blacklisting..." : "Confirm & Blacklist ASN"}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Perimeter Firewall Shunned IPs Database Modal */}
            {showShunDbModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden">
                        <ShunDatabaseTab
                            initialSearch={shunDbInitialSearch}
                            onClose={() => setShowShunDbModal(false)}
                            isModal={true}
                        />
                    </div>
                </div>
            )}

        </div>
    );
}
