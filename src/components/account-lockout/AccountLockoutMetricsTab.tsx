"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
    BarChart3, RefreshCw, UserX, Users, Wifi, Laptop, RotateCcw,
    KeyRound, Repeat, AlertTriangle, CheckCircle2, Clock, Server,
    ArrowRight, Search, ShieldAlert, X, Activity
} from "lucide-react";
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
    Tooltip, CartesianGrid, Legend
} from "recharts";

interface LockoutMetricsSummary {
    totalLockouts: number;
    uniqueLockedUsers: number;
    repeatLoopUsers: number;
    activeRelockLoops: number;
    wirelessLockouts: number;
    workstationLockouts: number;
    unknownCallerLockouts: number;
    wirelessPct: number;
    workstationPct: number;
    totalUnlocks: number;
    totalPasswordChanges: number;
    userPwdChanges: number;
    adminPwdResets: number;
    usersLockedAfterPwdChange: number;
    lastSyncedAt: string | null;
    syncStatus: string;
}

interface TopLockedUser {
    username: string;
    targetUsername: string;
    lockoutCount: number;
    unlockCount: number;
    isRepeatLoop: boolean;
    relockedAfterUnlock: boolean;
    hadRecentPwdChange: boolean;
    pwdChangeType: "USER_CHANGE" | "ADMIN_RESET" | null;
    pwdChangeAt: string | null;
    primarySource: "ISE_WIRELESS" | "WORKSTATION" | "MIXED" | "UNKNOWN";
    topCaller: string;
    callers: string[];
    domainControllers: string[];
    firstLockoutAt: string;
    latestLockoutAt: string;
}

interface TopCallerItem {
    caller: string;
    isIsePsn: boolean;
    lockoutCount: number;
    uniqueUsers: number;
    latestAt: string;
    sampleUsers: string[];
}

interface LockoutMetricsResponse {
    rangeHours: number;
    summary: LockoutMetricsSummary;
    timeline: Array<{
        timestamp: number;
        time: string;
        lockouts: number;
        wirelessLockouts: number;
        workstationLockouts: number;
        uniqueUsers: number;
        unlocks: number;
        passwordChanges: number;
    }>;
    topUsers: TopLockedUser[];
    sourceBreakdown: {
        wirelessLockouts: number;
        workstationLockouts: number;
        unknownCallerLockouts: number;
        isePsnBreakdown: Array<{ node: string; count: number; uniqueUsers: number }>;
        topCallers: TopCallerItem[];
        topDomainControllers: Array<{ dc: string; count: number }>;
    };
    recentLockouts: Array<{
        id: string;
        timestamp: string;
        username: string;
        callerComputer: string;
        isIsePsn: boolean;
        domainController: string;
    }>;
}

interface AccountLockoutMetricsTabProps {
    rangeHours: number;
    onRangeChange: (hours: number) => void;
    onInvestigateUser: (username: string, rangeHours: number) => void;
}

export function AccountLockoutMetricsTab({
    rangeHours,
    onRangeChange,
    onInvestigateUser
}: AccountLockoutMetricsTabProps) {
    const [metrics, setMetrics] = useState<LockoutMetricsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [syncBanner, setSyncBanner] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);

    const [chartMode, setChartMode] = useState<"lifecycle" | "source">("lifecycle");
    const [userFilter, setUserFilter] = useState("");
    const [userSourceFilter, setUserSourceFilter] = useState<"ALL" | "LOOP" | "PWD" | "ISE" | "WORKSTATION">("ALL");

    const fetchMetrics = useCallback(async (hours: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/account-lockout/metrics?rangeHours=${hours}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to load account lockout metrics");
            }
            setMetrics(data);
        } catch (err: any) {
            setError(err.message || "Failed to load account lockout metrics");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMetrics(rangeHours);
    }, [rangeHours, fetchMetrics]);

    const handleManualSync = async () => {
        setSyncing(true);
        setSyncBanner(null);
        try {
            const res = await fetch("/api/account-lockout/metrics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rangeHours })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to sync from Graylog");
            }
            setMetrics(data);
            const sr = data.syncResult;
            const sec = ((sr?.durationMs || 0) / 1000).toFixed(1);
            setSyncBanner({
                type: "success",
                message: `Synced AD Security Stream (${rangeHours}h window) in ${sec}s — evaluated ${sr?.totalFetched || 0} events (${sr?.lockoutsFetched || 0} lockouts, +${sr?.totalInserted || 0} newly stored).`
            });
        } catch (err: any) {
            setSyncBanner({
                type: "error",
                message: err.message || "Failed to sync account lockout events from Graylog."
            });
        } finally {
            setSyncing(false);
        }
    };

    const filteredTopUsers = useMemo(() => {
        if (!metrics?.topUsers) return [];
        return metrics.topUsers.filter(u => {
            if (userSourceFilter === "LOOP" && !u.isRepeatLoop) return false;
            if (userSourceFilter === "PWD" && !u.hadRecentPwdChange) return false;
            if (userSourceFilter === "ISE" && u.primarySource !== "ISE_WIRELESS" && u.primarySource !== "MIXED") return false;
            if (userSourceFilter === "WORKSTATION" && u.primarySource !== "WORKSTATION" && u.primarySource !== "MIXED") return false;
            if (userFilter.trim()) {
                const q = userFilter.toLowerCase().trim();
                return (
                    u.username.toLowerCase().includes(q) ||
                    u.topCaller.toLowerCase().includes(q) ||
                    u.callers.some(c => c.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [metrics, userFilter, userSourceFilter]);

    const summary = metrics?.summary;

    return (
        <div className="space-y-5">
            {/* Sync & Time Range Bar */}
            <div className="p-3.5 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                        <BarChart3 size={16} className="text-amber-400" />
                        <span>Domain Lockout Telemetry</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[var(--bg-background)] p-1 rounded-xl border border-border-color">
                        {[
                            { label: "1h", hours: 1 },
                            { label: "4h", hours: 4 },
                            { label: "12h", hours: 12 },
                            { label: "24h", hours: 24 },
                            { label: "3d", hours: 72 },
                            { label: "7d", hours: 168 },
                            { label: "30d", hours: 720 }
                        ].map((btn) => (
                            <button
                                key={btn.hours}
                                type="button"
                                onClick={() => onRangeChange(btn.hours)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                    rangeHours === btn.hours
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                                }`}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {summary?.lastSyncedAt && (
                        <span className="text-xs text-text-muted flex items-center gap-1.5">
                            <Clock size={13} />
                            Last Synced:{" "}
                            <span className="text-text-secondary font-medium">
                                {new Date(summary.lastSyncedAt).toLocaleString()}
                            </span>
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={handleManualSync}
                        disabled={syncing}
                        className="px-3.5 py-2 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-semibold transition-all disabled:opacity-60 flex items-center gap-1.5 shadow-sm cursor-pointer"
                        title="Pull latest Event 4740, 4767, and 4723/4724 records from Graylog AD Stream now"
                    >
                        <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                        {syncing ? "Syncing Graylog..." : "Sync Now"}
                    </button>
                </div>
            </div>

            {syncBanner && (
                <div
                    className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                        syncBanner.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {syncBanner.type === "success" ? (
                            <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        ) : (
                            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
                        )}
                        <span>{syncBanner.message}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSyncBanner(null)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {error && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                    <span>{error}</span>
                </div>
            )}

            {loading && !metrics ? (
                <div className="p-12 text-center rounded-xl border border-border-color bg-[var(--bg-surface)]/40 space-y-3">
                    <RefreshCw size={28} className="animate-spin mx-auto text-accent-primary opacity-80" />
                    <div className="text-xs font-semibold text-text-primary">
                        Loading Account Lockout Metrics...
                    </div>
                </div>
            ) : summary && (
                <>
                    {/* 4 Primary KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card 1: Total Lockouts & Unique Users */}
                        <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/15 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                                    Event 4740 Lockouts
                                </span>
                                <UserX size={16} className="text-rose-400" />
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-extrabold text-text-primary">
                                    {summary.totalLockouts.toLocaleString()}
                                </span>
                                <span className="text-xs text-rose-300 font-semibold">
                                    across {summary.uniqueLockedUsers.toLocaleString()} unique users
                                </span>
                            </div>
                            <div className="text-[11px] text-text-secondary flex items-center gap-2 pt-1">
                                <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                                    {summary.repeatLoopUsers} repeat offenders (2+ lockouts)
                                </span>
                            </div>
                        </div>

                        {/* Card 2: Source Split (Wireless ISE-PSN vs Workstation) */}
                        <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/15 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                                    Lockout Source Split
                                </span>
                                <Wifi size={16} className="text-cyan-400" />
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <div>
                                    <span className="text-lg font-extrabold text-cyan-300">{summary.wirelessPct}%</span>
                                    <span className="text-text-secondary ml-1">Wireless ({summary.wirelessLockouts})</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-lg font-extrabold text-indigo-300">{summary.workstationPct}%</span>
                                    <span className="text-text-secondary ml-1">Host ({summary.workstationLockouts})</span>
                                </div>
                            </div>
                            <div className="w-full h-2 rounded-full bg-[var(--bg-background)] overflow-hidden flex border border-border-color">
                                <div
                                    className="bg-cyan-400 h-full transition-all"
                                    style={{ width: `${summary.wirelessPct}%` }}
                                    title={`Wireless 802.1X (ise-psn01-04): ${summary.wirelessLockouts}`}
                                />
                                <div
                                    className="bg-indigo-400 h-full transition-all"
                                    style={{ width: `${summary.workstationPct}%` }}
                                    title={`Workstations / Servers: ${summary.workstationLockouts}`}
                                />
                            </div>
                            <div className="text-[10px] text-text-muted flex justify-between">
                                <span>ise-psn01–04 (802.1X EAP)</span>
                                <span>Workstations / RDP / SMB</span>
                            </div>
                        </div>

                        {/* Card 3: Unlocks (4767) & Re-Lock Loops */}
                        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/15 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                                    Unlocks & Re-Lock Loops
                                </span>
                                <RotateCcw size={16} className="text-emerald-400" />
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-extrabold text-text-primary">
                                    {summary.totalUnlocks.toLocaleString()}
                                </span>
                                <span className="text-xs text-emerald-300 font-semibold">
                                    Event 4767 unlocks
                                </span>
                            </div>
                            <div className="text-[11px] text-text-secondary pt-1">
                                {summary.activeRelockLoops > 0 ? (
                                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold inline-flex items-center gap-1">
                                        <Repeat size={11} /> {summary.activeRelockLoops} accounts re-locked after unlock
                                    </span>
                                ) : (
                                    <span className="text-text-muted">No post-unlock re-lock loops in window</span>
                                )}
                            </div>
                        </div>

                        {/* Card 4: Password Changes (4723/4724) & Correlation */}
                        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/15 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                                    Password Changes & Resets
                                </span>
                                <KeyRound size={16} className="text-amber-400" />
                            </div>
                            <div className="flex items-baseline gap-2.5">
                                <span className="text-2xl font-extrabold text-text-primary">
                                    {summary.totalPasswordChanges.toLocaleString()}
                                </span>
                                <span className="text-xs text-text-secondary">
                                    ({summary.userPwdChanges} user / {summary.adminPwdResets} admin)
                                </span>
                            </div>
                            <div className="text-[11px] text-text-secondary pt-1">
                                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                                    {summary.usersLockedAfterPwdChange} locked users had recent pwd change
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Trend Chart */}
                    <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                    <Activity size={16} className="text-accent-primary" />
                                    <span>Account Lockout & Lifecycle Trend ({rangeHours}h Window)</span>
                                </h3>
                                <p className="text-[11px] text-text-muted">
                                    Tracks Event 4740 lockouts alongside affected users, unlocks (4767), and password changes/resets (4723/4724).
                                </p>
                            </div>
                            <div className="flex items-center gap-1 bg-[var(--bg-background)] p-1 rounded-lg border border-border-color text-xs">
                                <button
                                    type="button"
                                    onClick={() => setChartMode("lifecycle")}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        chartMode === "lifecycle"
                                            ? "bg-accent-primary text-white"
                                            : "text-text-secondary hover:text-text-primary"
                                    }`}
                                >
                                    Lockouts / Unlocks / Pwd
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChartMode("source")}
                                    className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                                        chartMode === "source"
                                            ? "bg-accent-primary text-white"
                                            : "text-text-secondary hover:text-text-primary"
                                    }`}
                                >
                                    Wireless vs. Workstation
                                </button>
                            </div>
                        </div>

                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={metrics?.timeline || []} margin={{ top: 10, right: 15, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="lockoutGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="wirelessGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="workstationGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                    <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: "#0f172a",
                                            borderColor: "#334155",
                                            borderRadius: "0.75rem",
                                            fontSize: "12px"
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                                    {chartMode === "lifecycle" ? (
                                        <>
                                            <Area
                                                type="monotone"
                                                dataKey="lockouts"
                                                name="Lockouts (4740)"
                                                stroke="#f43f5e"
                                                fill="url(#lockoutGrad)"
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="uniqueUsers"
                                                name="Unique Locked Users"
                                                stroke="#fbbf24"
                                                fill="none"
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="unlocks"
                                                name="Unlocks (4767)"
                                                stroke="#10b981"
                                                fill="none"
                                                strokeWidth={1.5}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="passwordChanges"
                                                name="Password Changes (4723/24)"
                                                stroke="#a855f7"
                                                fill="none"
                                                strokeWidth={1.5}
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Area
                                                type="monotone"
                                                dataKey="wirelessLockouts"
                                                name="Wireless 802.1X (ise-psn01-04)"
                                                stroke="#06b6d4"
                                                fill="url(#wirelessGrad)"
                                                strokeWidth={2}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="workstationLockouts"
                                                name="Workstation / Server"
                                                stroke="#6366f1"
                                                fill="url(#workstationGrad)"
                                                strokeWidth={2}
                                            />
                                        </>
                                    )}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Two-Column Breakdown: Top Locked-Out Users & Source / Calling Computers */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                        {/* Left Column (7 cols): Top Locked-Out Users & Repeat Offenders */}
                        <div className="lg:col-span-7 p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col gap-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                        <Users size={16} className="text-rose-400" />
                                        <span>Top Locked-Out Users & Repeat Loops</span>
                                    </h3>
                                    <p className="text-[11px] text-text-muted">
                                        Click any account to launch a full AD + Cisco ISE root-cause investigation.
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap text-[11px]">
                                    {[
                                        { id: "ALL", label: "All" },
                                        { id: "LOOP", label: "Repeat Loops" },
                                        { id: "PWD", label: "Post-Pwd Change" },
                                        { id: "ISE", label: "Wireless EAP" },
                                        { id: "WORKSTATION", label: "Workstation" }
                                    ].map(f => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setUserSourceFilter(f.id as any)}
                                            className={`px-2 py-1 rounded-md font-semibold border transition-all cursor-pointer ${
                                                userSourceFilter === f.id
                                                    ? "bg-accent-primary/20 border-accent-primary/50 text-text-primary"
                                                    : "bg-[var(--bg-background)] border-border-color text-text-secondary hover:text-text-primary"
                                            }`}
                                        >
                                            {f.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="relative">
                                <Search size={14} className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={userFilter}
                                    onChange={(e) => setUserFilter(e.target.value)}
                                    placeholder="Filter users or calling devices..."
                                    className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border-color bg-[var(--bg-background)] text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                />
                            </div>

                            <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-border-color rounded-lg">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead className="bg-[var(--bg-background)] text-text-secondary uppercase text-[10px] sticky top-0 z-10 border-b border-border-color">
                                        <tr>
                                            <th className="px-3 py-2.5">Account</th>
                                            <th className="px-3 py-2.5 text-center">Lockouts</th>
                                            <th className="px-3 py-2.5">Primary Source / Caller</th>
                                            <th className="px-3 py-2.5">Flags</th>
                                            <th className="px-3 py-2.5 text-right">Last Lockout</th>
                                            <th className="px-3 py-2.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {filteredTopUsers.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-10 text-center text-text-muted">
                                                    No locked-out accounts match the current filter in this time window.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredTopUsers.map((u) => (
                                                <tr
                                                    key={u.targetUsername}
                                                    onClick={() => onInvestigateUser(u.username, rangeHours)}
                                                    className="hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                                                >
                                                    <td className="px-3 py-2.5 font-mono font-semibold text-accent-primary">
                                                        {u.username}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center">
                                                        <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold">
                                                            {u.lockoutCount}
                                                        </span>
                                                        {u.unlockCount > 0 && (
                                                            <span className="ml-1 text-[10px] text-emerald-400" title={`${u.unlockCount} unlock(s)`}>
                                                                ({u.unlockCount}u)
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {u.primarySource === "ISE_WIRELESS" ? (
                                                                <Wifi size={13} className="text-cyan-400 shrink-0" />
                                                            ) : (
                                                                <Laptop size={13} className="text-indigo-400 shrink-0" />
                                                            )}
                                                            <span className="font-mono text-text-primary truncate max-w-[150px]" title={u.callers.join(", ")}>
                                                                {u.topCaller}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <div className="flex flex-wrap gap-1">
                                                            {u.relockedAfterUnlock && (
                                                                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                                                                    Re-Lock Loop
                                                                </span>
                                                            )}
                                                            {!u.relockedAfterUnlock && u.isRepeatLoop && (
                                                                <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                                                                    Repeat
                                                                </span>
                                                            )}
                                                            {u.hadRecentPwdChange && (
                                                                <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                                                                    Post-Pwd
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-text-secondary whitespace-nowrap">
                                                        {new Date(u.latestLockoutAt).toLocaleTimeString([], {
                                                            month: "short",
                                                            day: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit"
                                                        })}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onInvestigateUser(u.username, rangeHours);
                                                            }}
                                                            className="px-2 py-1 rounded bg-accent-primary/15 hover:bg-accent-primary text-accent-primary hover:text-white border border-accent-primary/30 text-[11px] font-semibold inline-flex items-center gap-1 transition-all cursor-pointer"
                                                        >
                                                            Investigate <ArrowRight size={11} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Right Column (5 cols): ISE PSN Breakdown & Top Calling Computers */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            {/* Wireless ISE-PSN Node Distribution */}
                            <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                        <Wifi size={16} className="text-cyan-400" />
                                        <span>Cisco ISE PSN Wireless Lockout Distribution</span>
                                    </h3>
                                    <p className="text-[11px] text-text-muted">
                                        802.1X RADIUS lockouts across Policy Service Nodes (ise-psn01 – 04).
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(metrics?.sourceBreakdown.isePsnBreakdown || []).map(psn => (
                                        <div
                                            key={psn.node}
                                            className="p-2.5 rounded-lg border border-border-color bg-[var(--bg-background)] text-center space-y-0.5"
                                        >
                                            <div className="text-[11px] font-mono text-cyan-300 font-semibold">{psn.node}</div>
                                            <div className="text-lg font-extrabold text-text-primary">{psn.count}</div>
                                            <div className="text-[10px] text-text-muted">{psn.uniqueUsers} users</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Calling Computers / Endpoints */}
                            <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex-1 flex flex-col gap-3">
                                <div>
                                    <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                                        <Server size={16} className="text-indigo-400" />
                                        <span>Top Calling Computers / Lockout Sources</span>
                                    </h3>
                                    <p className="text-[11px] text-text-muted">
                                        Workstations, servers, and RADIUS nodes generating the most Event 4740 lockouts.
                                    </p>
                                </div>
                                <div className="overflow-x-auto max-h-[275px] overflow-y-auto border border-border-color rounded-lg">
                                    <table className="w-full text-xs text-left border-collapse">
                                        <thead className="bg-[var(--bg-background)] text-text-secondary uppercase text-[10px] sticky top-0 z-10 border-b border-border-color">
                                            <tr>
                                                <th className="px-3 py-2">Caller Computer</th>
                                                <th className="px-3 py-2 text-center">Lockouts</th>
                                                <th className="px-3 py-2 text-center">Users</th>
                                                <th className="px-3 py-2">Affected Accounts</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-color">
                                            {(metrics?.sourceBreakdown.topCallers || []).length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="px-3 py-8 text-center text-text-muted">
                                                        No caller telemetry in this window.
                                                    </td>
                                                </tr>
                                            ) : (
                                                metrics?.sourceBreakdown.topCallers.map((c) => (
                                                    <tr key={c.caller} className="hover:bg-[var(--bg-surface-hover)]">
                                                        <td className="px-3 py-2 font-mono text-text-primary flex items-center gap-1.5">
                                                            {c.isIsePsn ? (
                                                                <Wifi size={12} className="text-cyan-400 shrink-0" />
                                                            ) : (
                                                                <Laptop size={12} className="text-indigo-400 shrink-0" />
                                                            )}
                                                            <span className="truncate max-w-[140px]" title={c.caller}>{c.caller}</span>
                                                        </td>
                                                        <td className="px-3 py-2 text-center font-bold text-rose-300">
                                                            {c.lockoutCount}
                                                        </td>
                                                        <td className="px-3 py-2 text-center text-text-secondary">
                                                            {c.uniqueUsers}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex flex-wrap gap-1">
                                                                {c.sampleUsers.slice(0, 3).map(u => (
                                                                    <button
                                                                        key={u}
                                                                        type="button"
                                                                        onClick={() => onInvestigateUser(u, rangeHours)}
                                                                        className="px-1.5 py-0.5 rounded bg-[var(--bg-background)] hover:bg-accent-primary/20 border border-border-color text-[10px] font-mono text-accent-primary cursor-pointer"
                                                                        title={`Investigate ${u}`}
                                                                    >
                                                                        {u}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
