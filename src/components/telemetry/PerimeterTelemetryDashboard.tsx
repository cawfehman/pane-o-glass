"use client";

import React, { useState, useEffect } from "react";
import {
    Activity,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Users,
    Globe,
    Server,
    AlertTriangle,
    RefreshCw,
    TrendingUp,
    Lock,
    ExternalLink,
    Filter,
    CheckCircle2,
    XCircle,
    Info,
} from "lucide-react";
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from "recharts";

interface PerimeterTelemetryData {
    timeframe: number;
    kpis: {
        totalDeduplicatedAuthFailures: number;
        rawSyslogVolumeEstimate: number;
        hostileFailures: number;
        staffFrictionFailures: number;
        hostileRatio: number;
        staffFrictionRatio: number;
        uniqueAttackingIps: number;
        uniqueAccountsTargeted: number;
        quarantinedEntities: number;
        enforcedEntities: number;
        watchingEntities: number;
        pardonedStaffIps: number;
    };
    timeline: Array<{
        time: string;
        hostile: number;
        friction: number;
        total: number;
    }>;
    gateways: Record<string, number>;
    topHostileIps: Array<{
        ip: string;
        count: number;
        distinctUserCount: number;
        sampleUsers: string[];
        gateways: string[];
        strikeCount: number;
        status: string;
        ispOrg: string;
        asn: string | null;
        country: string;
        city: string;
        lastSeen: string;
    }>;
    topTargetedUsers: Array<{
        username: string;
        attempts: number;
        distinctIps: number;
        isCorporateFormat: boolean;
    }>;
}

const TIMEFRAME_OPTIONS = [
    { label: "1h", seconds: 3600 },
    { label: "6h", seconds: 21600 },
    { label: "12h", seconds: 43200 },
    { label: "24h", seconds: 86400 },
    { label: "7d", seconds: 604800 },
    { label: "30d", seconds: 2592000 },
];

export function PerimeterTelemetryDashboard() {
    const [timeframe, setTimeframe] = useState<number>(86400);
    const [data, setData] = useState<PerimeterTelemetryData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
    const [actionLoadingIp, setActionLoadingIp] = useState<string | null>(null);

    const fetchData = async (range: number) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/telemetry/perimeter?range=${range}`);
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(errJson.details || errJson.error || `HTTP ${res.status}`);
            }
            const json = await res.json();
            if (json.success) {
                setData(json);
                setLastUpdated(new Date());
            } else {
                throw new Error(json.error || "Failed to load telemetry");
            }
        } catch (e: any) {
            setError(e.message || "Failed to fetch telemetry data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(timeframe);
    }, [timeframe]);

    // Auto refresh every 60s if enabled
    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(() => {
            fetchData(timeframe);
        }, 60000);
        return () => clearInterval(interval);
    }, [autoRefresh, timeframe]);

    const handleShunIp = async (ip: string) => {
        if (!confirm(`Deploy emergency perimeter shun for IP ${ip} across all firewalls?`)) return;
        setActionLoadingIp(ip);
        try {
            const res = await fetch("/api/firewall/shun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip, reason: "Perimeter Telemetry manual shun" }),
            });
            const resData = await res.json();
            if (res.ok && (resData.success || resData.queued)) {
                alert(`Successfully deployed shun for ${ip}`);
                fetchData(timeframe);
            } else {
                alert(`Failed: ${resData.error || "Could not execute shun"}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setActionLoadingIp(null);
        }
    };

    const handleBlacklistAsn = async (asn: string, orgName: string) => {
        if (!confirm(`Add ASN ${asn} (${orgName}) to Guardian Blacklist? This will auto-quarantine all nodes from this network.`)) return;
        try {
            const res = await fetch("/api/netscaler/login-triage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "blacklist_asn",
                    asn,
                    reason: `Blacklisted via Perimeter Telemetry: ${orgName}`,
                }),
            });
            const resData = await res.json();
            if (res.ok && resData.success) {
                alert(`ASN ${asn} added to Guardian Blacklist!`);
                fetchData(timeframe);
            } else {
                alert(`Failed: ${resData.error || "Could not blacklist ASN"}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        }
    };

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const hostile = payload.find((p: any) => p.dataKey === "hostile")?.value || 0;
            const friction = payload.find((p: any) => p.dataKey === "friction")?.value || 0;
            const total = hostile + friction;
            return (
                <div className="bg-slate-950/95 border border-slate-800 p-3 rounded-lg shadow-2xl backdrop-blur-md text-xs">
                    <p className="font-semibold text-slate-200 mb-1.5 border-b border-slate-800 pb-1">{label}</p>
                    <div className="flex items-center justify-between gap-4 py-0.5">
                        <span className="flex items-center gap-1.5 text-rose-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                            Hostile Threats:
                        </span>
                        <span className="font-mono font-bold text-rose-300">{hostile.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 py-0.5">
                        <span className="flex items-center gap-1.5 text-indigo-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                            Staff Auth Friction:
                        </span>
                        <span className="font-mono font-bold text-indigo-300">{friction.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-1.5 mt-1 border-t border-slate-800 font-bold text-slate-300">
                        <span>Total Deduplicated:</span>
                        <span className="font-mono">{total.toLocaleString()}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col gap-5 p-1 pb-10 text-slate-100">
            {/* TOP HEADER CONTROLS */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                        <Activity size={22} className="animate-pulse" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                            Perimeter Security Telemetry
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 uppercase tracking-widest font-semibold">
                                Live Signal
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            Deduplicated authentication telemetry &bull; Hostile attack signals separated from employee friction
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Timeframe Selector */}
                    <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-1 text-xs">
                        {TIMEFRAME_OPTIONS.map((opt) => (
                            <button
                                key={opt.seconds}
                                onClick={() => setTimeframe(opt.seconds)}
                                className={`px-3 py-1 rounded-md font-medium transition-all ${
                                    timeframe === opt.seconds
                                        ? "bg-indigo-600 text-white shadow-md font-semibold"
                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Auto Refresh & Manual Refresh */}
                    <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
                        <button
                            onClick={() => setAutoRefresh(!autoRefresh)}
                            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                                autoRefresh
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                    : "bg-slate-900 border-slate-800 text-slate-400"
                            }`}
                            title="Auto-refresh every 60s"
                        >
                            Auto (60s)
                        </button>
                        <button
                            onClick={() => fetchData(timeframe)}
                            disabled={loading}
                            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
                            title="Refresh Now"
                        >
                            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} />
                        <span>{error}</span>
                    </div>
                    <button onClick={() => fetchData(timeframe)} className="underline hover:text-white">
                        Retry
                    </button>
                </div>
            )}

            {/* EXECUTIVE KPI RIBBON */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CARD 1: DEDUPLICATED AUTH FAILURES */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">True Auth Rejections</span>
                        <ShieldAlert size={17} className="text-amber-400" />
                    </div>
                    <div className="text-3xl font-extrabold font-mono text-white mt-1">
                        {loading && !data ? "..." : (data?.kpis.totalDeduplicatedAuthFailures ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/60 pt-2">
                        <span>Raw Syslog Volume:</span>
                        <span className="font-mono text-slate-300">
                            ~{(data?.kpis.rawSyslogVolumeEstimate ?? 0).toLocaleString()} (filtered)
                        </span>
                    </div>
                </div>

                {/* CARD 2: SIGNAL VS FRICTION SPLIT */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Hostile vs. Staff Friction</span>
                        <TrendingUp size={17} className="text-rose-400" />
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-extrabold font-mono text-rose-400">
                            {data?.kpis.hostileRatio ?? 0}%
                        </span>
                        <span className="text-xs text-slate-400">Hostile Attacks</span>
                    </div>
                    {/* Multi-colored ratio bar */}
                    <div className="w-full bg-slate-950 rounded-full h-2 mt-2 overflow-hidden flex border border-slate-800">
                        <div
                            style={{ width: `${data?.kpis.hostileRatio ?? 0}%` }}
                            className="bg-rose-500 h-full transition-all"
                            title={`Hostile: ${data?.kpis.hostileFailures.toLocaleString()}`}
                        />
                        <div
                            style={{ width: `${data?.kpis.staffFrictionRatio ?? 0}%` }}
                            className="bg-indigo-500 h-full transition-all"
                            title={`Staff Friction: ${data?.kpis.staffFrictionFailures.toLocaleString()}`}
                        />
                    </div>
                    <div className="text-[11px] text-indigo-300/80 mt-2 flex items-center justify-between">
                        <span>Staff Auth Friction:</span>
                        <span className="font-mono">{data?.kpis.staffFrictionRatio ?? 0}%</span>
                    </div>
                </div>

                {/* CARD 3: ACTIVE SPRAY NODES */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">Active Attacking IPs</span>
                        <Globe size={17} className="text-purple-400" />
                    </div>
                    <div className="text-3xl font-extrabold font-mono text-purple-300 mt-1">
                        {loading && !data ? "..." : (data?.kpis.uniqueAttackingIps ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/60 pt-2">
                        <span>Targeted Corporate IDs:</span>
                        <span className="font-mono text-purple-200">
                            {(data?.kpis.uniqueAccountsTargeted ?? 0).toLocaleString()}
                        </span>
                    </div>
                </div>

                {/* CARD 4: REPUTATION LEDGER STATUS */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                        <span className="text-xs font-semibold uppercase tracking-wider">3-Strike Enforcement</span>
                        <ShieldCheck size={17} className="text-emerald-400" />
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-extrabold font-mono text-rose-400">
                            {(data?.kpis.quarantinedEntities ?? 0).toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400">Quarantined (Strike 3)</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-2 flex items-center justify-between border-t border-slate-800/60 pt-2">
                        <span className="text-amber-400">Enforced (S2): {(data?.kpis.enforcedEntities ?? 0).toLocaleString()}</span>
                        <span className="text-emerald-400">Pardoned: {(data?.kpis.pardonedStaffIps ?? 0).toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* DUAL-STREAM VELOCITY TIMELINE (RECHARTS) */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <Activity size={16} className="text-indigo-400" />
                            Perimeter Authentication Velocity & Threat Timeline
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Visual comparison between hostile password spray attacks and normal hospital staff authentication baseline
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-medium">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 shadow-sm shadow-rose-500/50"></span>
                            <span className="text-rose-300">Hostile Threat Spikes</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500"></span>
                            <span className="text-indigo-300">Staff Auth Friction (MFA / Re-prompt)</span>
                        </div>
                    </div>
                </div>

                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data?.timeline || []}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="hostileGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
                                </linearGradient>
                                <linearGradient id="frictionGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="time"
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#334155" }}
                            />
                            <YAxis
                                stroke="#64748b"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#334155" }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="friction"
                                stroke="#6366f1"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#frictionGrad)"
                            />
                            <Area
                                type="monotone"
                                dataKey="hostile"
                                stroke="#ef4444"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#hostileGrad)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* LOWER GRID: GATEWAY SPLIT + TOP ATTACKERS + TARGETED USERS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* GATEWAY DISTRIBUTION */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
                    <div>
                        <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Server size={14} className="text-indigo-400" />
                            Gateway Telemetry Split
                        </h4>
                        <div className="space-y-3">
                            {Object.entries(data?.gateways || {}).map(([gw, count]) => {
                                const total = Object.values(data?.gateways || {}).reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                return (
                                    <div key={gw} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium text-slate-300">{gw}</span>
                                            <span className="font-mono text-slate-400">
                                                {count.toLocaleString()} ({pct}%)
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                                            <div
                                                className="bg-indigo-500 h-full rounded-full transition-all"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 mt-4 text-[11px] text-slate-400">
                        <Info size={13} className="inline mr-1 text-slate-400" />
                        NetScaler volume reflects deduplicated auth rejects. VPN gateways reflect live ASA/FTD drops.
                    </div>
                </div>

                {/* TOP TARGETED CORPORATE IDENTITIES */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 lg:col-span-2">
                    <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Users size={14} className="text-purple-400" />
                        Top Targeted Corporate Identities (Password Spray Targets)
                    </h4>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-800 text-slate-400">
                                    <th className="pb-2">Target Account</th>
                                    <th className="pb-2">Account Format</th>
                                    <th className="pb-2 text-right">Failure Events</th>
                                    <th className="pb-2 text-right">Distinct Attacker IPs</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {(data?.topTargetedUsers || []).map((u) => (
                                    <tr key={u.username} className="hover:bg-slate-800/30">
                                        <td className="py-2 text-slate-200 font-semibold">{u.username}</td>
                                        <td className="py-2">
                                            {u.isCorporateFormat ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                    Valid Corporate (name-name)
                                                </span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                                    Dictionary / Non-Corporate
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 text-right text-slate-300 font-bold">
                                            {u.attempts.toLocaleString()}
                                        </td>
                                        <td className="py-2 text-right text-purple-300">
                                            {u.distinctIps.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* TOP HOSTILE OFFENDERS MATRIX TABLE */}
            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                            <ShieldAlert size={16} className="text-rose-400" />
                            Top Hostile Probing & Spray Entities (Active Attack Vector)
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            Ranked by failed attempt volume and multi-user password spray behavior
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                                <th className="pb-2.5">Source IP / ASN</th>
                                <th className="pb-2.5">ISP / Organization</th>
                                <th className="pb-2.5">Geo Location</th>
                                <th className="pb-2.5 text-center">Strike Tier</th>
                                <th className="pb-2.5 text-right">Failures</th>
                                <th className="pb-2.5">Targeted Accounts</th>
                                <th className="pb-2.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {(data?.topHostileIps || []).map((row) => (
                                <tr key={row.ip} className="hover:bg-slate-800/30">
                                    <td className="py-3">
                                        <div className="font-mono font-bold text-slate-100">{row.ip}</div>
                                        {row.asn && (
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                ASN {row.asn}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-3 text-slate-300 max-w-[200px] truncate" title={row.ispOrg}>
                                        {row.ispOrg}
                                    </td>
                                    <td className="py-3 text-slate-400">
                                        {row.city}, {row.country}
                                    </td>
                                    <td className="py-3 text-center">
                                        <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                row.status === "QUARANTINED"
                                                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                    : row.status === "ENFORCED"
                                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                                    : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                                            }`}
                                        >
                                            Strike {row.strikeCount} ({row.status})
                                        </span>
                                    </td>
                                    <td className="py-3 text-right font-mono font-bold text-rose-400">
                                        {row.count.toLocaleString()}
                                    </td>
                                    <td className="py-3 max-w-[220px]">
                                        <div className="flex flex-wrap gap-1">
                                            {row.sampleUsers.map((u) => (
                                                <span
                                                    key={u}
                                                    className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300"
                                                >
                                                    {u}
                                                </span>
                                            ))}
                                            {row.distinctUserCount > 3 && (
                                                <span className="text-[10px] text-slate-500">
                                                    +{row.distinctUserCount - 3} more
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => handleShunIp(row.ip)}
                                                disabled={actionLoadingIp === row.ip}
                                                className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-semibold text-[10px] transition-colors"
                                            >
                                                {actionLoadingIp === row.ip ? "..." : "Shun"}
                                            </button>
                                            {row.asn && (
                                                <button
                                                    onClick={() => handleBlacklistAsn(row.asn!, row.ispOrg)}
                                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] transition-colors"
                                                    title={`Blacklist ASN ${row.asn}`}
                                                >
                                                    Blacklist ASN
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
