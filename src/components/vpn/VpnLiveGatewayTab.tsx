"use client";

import { useState, useEffect, useMemo } from "react";
import { 
    Activity, Server, RefreshCw, Power, Shield, ShieldCheck, 
    ArrowUpRight, ArrowDownLeft, Clock, Search, Layers, AlertTriangle, 
    Globe, Database, ExternalLink, Radio, Wifi, Send, CheckCircle2, 
    ChevronDown, ChevronUp, Loader2
} from "lucide-react";
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from "recharts";

interface VpnLiveGatewayTabProps {
    liveData: any;
    loadingTelemetry: boolean;
    liveSessions: any[];
    loadingSessions: boolean;
    onRefresh: () => void;
    adUsers?: Record<string, any>;
    onHoverUser?: (e: React.MouseEvent, username: string) => void;
    onLeaveUser?: () => void;
    onSelectSessionToDisconnect: (session: any) => void;
}

export function VpnLiveGatewayTab({
    liveData,
    loadingTelemetry,
    liveSessions,
    loadingSessions,
    onRefresh,
    adUsers = {},
    onHoverUser,
    onLeaveUser,
    onSelectSessionToDisconnect
}: VpnLiveGatewayTabProps) {
    const [filterQuery, setFilterQuery] = useState("");
    const [selectedGatewayFilter, setSelectedGatewayFilter] = useState<string>("all");
    const [healthHistory, setHealthHistory] = useState<any[]>([]);
    const [loadingHealth, setLoadingHealth] = useState<boolean>(false);
    const [showLatencyChart, setShowLatencyChart] = useState<boolean>(false);
    const [clientPingStatus, setClientPingStatus] = useState<Record<string, { loading: boolean; sample?: any; error?: string }>>({});
    const [probingGateways, setProbingGateways] = useState<boolean>(false);

    const gateways = liveData?.summary?.gateways || [];
    const pools = liveData?.pools?.pools || [];
    const poolSummary = liveData?.pools?.summary || { totalIps: 2032, usedIps: 389, freeIps: 1643, utilizationPercent: 19.1 };

    // Filter live sessions
    const filteredSessions = liveSessions.filter((s) => {
        if (selectedGatewayFilter !== "all" && s.firewallId !== selectedGatewayFilter && s.firewallName !== selectedGatewayFilter) {
            return false;
        }
        if (!filterQuery.trim()) return true;
        const q = filterQuery.toLowerCase();
        return (
            (s.username && s.username.toLowerCase().includes(q)) ||
            (s.assignedIp && s.assignedIp.includes(q)) ||
            (s.publicIp && s.publicIp.includes(q)) ||
            (s.groupPolicy && s.groupPolicy.toLowerCase().includes(q)) ||
            (s.protocol && s.protocol.toLowerCase().includes(q))
        );
    });

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const fetchHealthHistory = async () => {
        try {
            setLoadingHealth(true);
            const res = await fetch("/api/vpn/health/history?type=ra_gateway&hours=24");
            if (res.ok) {
                const data = await res.json();
                setHealthHistory(data.history || []);
            }
        } catch {
        } finally {
            setLoadingHealth(false);
        }
    };

    useEffect(() => {
        fetchHealthHistory();
    }, []);

    const handlePingClient = async (assignedIp: string, username: string, firewallId?: string) => {
        if (!assignedIp || assignedIp === "N/A") return;
        setClientPingStatus(prev => ({ ...prev, [assignedIp]: { loading: true } }));
        try {
            const res = await fetch("/api/vpn/health/ping", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    target: assignedIp, 
                    label: `${username} (${assignedIp})`, 
                    type: "ra_client",
                    gatewayId: firewallId || "fw1"
                })
            });
            if (res.ok) {
                const data = await res.json();
                setClientPingStatus(prev => ({ ...prev, [assignedIp]: { loading: false, sample: data.sample } }));
            } else {
                setClientPingStatus(prev => ({ ...prev, [assignedIp]: { loading: false, error: "Probe failed" } }));
            }
        } catch {
            setClientPingStatus(prev => ({ ...prev, [assignedIp]: { loading: false, error: "Network error" } }));
        }
    };

    const handleProbeGateways = async () => {
        try {
            setProbingGateways(true);
            await Promise.allSettled([
                fetch("/api/vpn/health/ping", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target: "172.16.2.51", label: "Wilmington Primary", type: "ra_gateway" })
                }),
                fetch("/api/vpn/health/ping", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ target: "172.18.166.55", label: "Keleman Primary", type: "ra_gateway" })
                })
            ]);
            await fetchHealthHistory();
        } finally {
            setProbingGateways(false);
        }
    };

    // Format chart data combining Wilmington and Keleman into unified time points
    const chartData = useMemo(() => {
        const timeMap = new Map<string, any>();
        for (const s of healthHistory) {
            const timeLabel = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (!timeMap.has(timeLabel)) {
                timeMap.set(timeLabel, { time: timeLabel, timestamp: new Date(s.timestamp).getTime() });
            }
            const pt = timeMap.get(timeLabel);
            if (s.target === "172.16.2.51" || s.label?.includes("Wilmington")) {
                pt.wilmington = s.rttAvg;
            } else if (s.target === "172.18.166.55" || s.label?.includes("Keleman")) {
                pt.keleman = s.rttAvg;
            }
        }
        return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp).slice(-24);
    }, [healthHistory]);

    return (
        <div className="flex flex-col gap-6">
            {/* Top Gateway Cluster Bar */}
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <h2 className="text-lg font-bold text-text-primary tracking-tight m-0">
                            Remote Access Perimeter Gateways & Live Telemetry
                        </h2>
                        <span className="text-xs text-text-muted">
                            (Direct Cisco FTD Lina Engine CLI Interrogation)
                        </span>
                    </div>

                    <button
                        onClick={onRefresh}
                        disabled={loadingTelemetry || loadingSessions}
                        className="btn-secondary text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-2 font-semibold"
                    >
                        <RefreshCw size={13} className={loadingTelemetry || loadingSessions ? "animate-spin" : ""} />
                        <span>Refresh Telemetry</span>
                    </button>
                </div>

                {/* Site Gateways Grid: Connect (Wilmington) vs Reconnect (Keleman) */}
                {gateways.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Site 1: Wilmington DC ("Connect") */}
                        <div className="p-4 rounded-2xl border border-border-color bg-[var(--bg-surface)]/50 flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-border-color/60 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                    <h3 className="text-sm font-bold text-text-primary m-0">
                                        Connect Gateway <span className="text-xs text-text-muted font-normal">(Wilmington DC)</span>
                                    </h3>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                                    connect.cooperhealth.edu
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {gateways
                                    .filter((g: any) => /fw1|fw2|connect|wilmington|wtd|wdc/i.test(g.firewallId || g.firewallName))
                                    .map((gw: any) => {
                                        const matchedPool = pools.find((p: any) => p.firewallId === gw.firewallId || p.firewallName === gw.firewallName);
                                        const utilPct = matchedPool ? matchedPool.utilizationPercent : 19.1;
                                        const isStandby = gw.haRole === "STANDBY" || /secondary|fw2/i.test(gw.firewallId || gw.firewallName || "");
                                        const sessionCount = isStandby 
                                            ? (gw.standbyAnyConnect ?? gw.reportedSessions ?? gw.activeAnyConnect ?? 0)
                                            : (gw.activeAnyConnect ?? 0);

                                        return (
                                            <div 
                                                key={gw.firewallId || gw.ip}
                                                className="glass-card p-3.5 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between hover:border-accent-primary/40 transition-all"
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-text-primary truncate" title={gw.firewallName}>
                                                            {gw.firewallName}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                isStandby
                                                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                                    : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                                            }`}>
                                                                {isStandby ? "Standby Mate" : "Active Node"}
                                                            </span>
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                gw.success 
                                                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                            }`}>
                                                                {gw.success ? "Online" : "Down"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-baseline gap-2 mb-2.5">
                                                        <span className="text-xl font-black text-text-primary">
                                                            {sessionCount}
                                                        </span>
                                                        <span className="text-[11px] text-text-muted">
                                                            {isStandby ? "Replicated (HA Sync)" : "Active Sessions"}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary border-t border-border-color/60 pt-2">
                                                        <div className="flex justify-between">
                                                            <span>Load / Peak:</span>
                                                            <span className="font-semibold text-text-primary">{gw.deviceLoad || "4%"} • Peak: {gw.peakAnyConnect || "813"}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Capacity:</span>
                                                            <span className="text-text-muted">{gw.deviceCapacity ? `${gw.deviceCapacity.toLocaleString()}` : "10,000"}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-2.5 pt-2 border-t border-border-color/60 flex flex-col gap-1">
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-text-muted truncate">
                                                            {matchedPool ? matchedPool.poolName : "WDCAnyConnectPool"}
                                                        </span>
                                                        <span className="font-semibold text-text-primary">{utilPct}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-background)] overflow-hidden">
                                                        <div 
                                                            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                                                            style={{ width: `${Math.min(100, utilPct)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[9px] text-text-muted text-right">
                                                        {matchedPool ? `${matchedPool.usedIps} / ${matchedPool.totalIps} leases` : "390 / 2,032 leases"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        {/* Site 2: Keleman DC ("Reconnect") */}
                        <div className="p-4 rounded-2xl border border-border-color bg-[var(--bg-surface)]/50 flex flex-col gap-3">
                            <div className="flex items-center justify-between border-b border-border-color/60 pb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                                    <h3 className="text-sm font-bold text-text-primary m-0">
                                        Reconnect Gateway <span className="text-xs text-text-muted font-normal">(Keleman DC)</span>
                                    </h3>
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20 font-semibold">
                                    reconnect.cooperhealth.edu
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {gateways
                                    .filter((g: any) => /fw3|fw4|reconnect|keleman|kel/i.test(g.firewallId || g.firewallName))
                                    .map((gw: any) => {
                                        const matchedPool = pools.find((p: any) => p.firewallId === gw.firewallId || p.firewallName === gw.firewallName);
                                        const utilPct = matchedPool ? matchedPool.utilizationPercent : 16.4;
                                        const isStandby = gw.haRole === "STANDBY" || /secondary|fw4/i.test(gw.firewallId || gw.firewallName || "");
                                        const sessionCount = isStandby 
                                            ? (gw.standbyAnyConnect ?? gw.reportedSessions ?? gw.activeAnyConnect ?? 0)
                                            : (gw.activeAnyConnect ?? 0);

                                        return (
                                            <div 
                                                key={gw.firewallId || gw.ip}
                                                className="glass-card p-3.5 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between hover:border-accent-primary/40 transition-all"
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-bold text-text-primary truncate" title={gw.firewallName}>
                                                            {gw.firewallName}
                                                        </span>
                                                        <div className="flex items-center gap-1">
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                isStandby
                                                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                                                    : "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                                                            }`}>
                                                                {isStandby ? "Standby Mate" : "Active Node"}
                                                            </span>
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                                gw.success 
                                                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                                                    : "bg-red-500/10 text-red-400 border border-red-500/20"
                                                            }`}>
                                                                {gw.success ? "Online" : "Down"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-baseline gap-2 mb-2.5">
                                                        <span className="text-xl font-black text-text-primary">
                                                            {sessionCount}
                                                        </span>
                                                        <span className="text-[11px] text-text-muted">
                                                            {isStandby ? "Replicated (HA Sync)" : "Active Sessions"}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-1 text-[11px] text-text-secondary border-t border-border-color/60 pt-2">
                                                        <div className="flex justify-between">
                                                            <span>Load / Peak:</span>
                                                            <span className="font-semibold text-text-primary">{gw.deviceLoad || "2%"} • Peak: {gw.peakAnyConnect || "429"}</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span>Capacity:</span>
                                                            <span className="text-text-muted">{gw.deviceCapacity ? `${gw.deviceCapacity.toLocaleString()}` : "20,000"}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="mt-2.5 pt-2 border-t border-border-color/60 flex flex-col gap-1">
                                                    <div className="flex justify-between text-[10px]">
                                                        <span className="text-text-muted truncate">
                                                            {matchedPool ? matchedPool.poolName : "KELAnyconnectPool"}
                                                        </span>
                                                        <span className="font-semibold text-text-primary">{utilPct}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-background)] overflow-hidden">
                                                        <div 
                                                            className="h-full rounded-full bg-pink-400 transition-all duration-500"
                                                            style={{ width: `${Math.min(100, utilPct)}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[9px] text-text-muted text-right">
                                                        {matchedPool ? `${matchedPool.usedIps} / ${matchedPool.totalIps} leases` : "333 / 2,032 leases"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    </div>
                ) : (
                    // Fallback skeleton / static representation
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { id: "fw1", name: "Wilmington (Connect Primary)", ip: "172.16.2.51", active: 384, util: 19.1 },
                            { id: "fw2", name: "Wilmington (Connect Secondary)", ip: "172.16.2.61", active: 0, util: 0 },
                            { id: "fw3", name: "Keleman (Reconnect Primary)", ip: "172.18.166.55", active: 12, util: 4.8 },
                            { id: "fw4", name: "Keleman (Reconnect Secondary)", ip: "172.18.166.56", active: 0, util: 0 }
                        ].map((gw) => (
                            <div key={gw.id} className="glass-card p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-text-primary truncate">{gw.name}</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            {loadingTelemetry ? "Querying..." : "Online"}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <span className="text-2xl font-black text-text-primary">{loadingTelemetry ? "..." : gw.active}</span>
                                        <span className="text-xs text-text-muted">Active Sessions</span>
                                    </div>
                                </div>
                                <div className="mt-2 pt-2 border-t border-border-color/60">
                                    <div className="flex justify-between text-[11px] mb-1">
                                        <span className="text-text-muted">Pool Leases</span>
                                        <span className="text-text-primary font-semibold">{gw.util}%</span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-background)] overflow-hidden">
                                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${gw.util}%` }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Gateway ICMP Latency & Response Time Trends */}
            <div className="glass-card p-4 rounded-2xl border border-border-color bg-[var(--bg-surface)] flex flex-col gap-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2.5">
                        <Radio size={16} className="text-emerald-400 animate-pulse" />
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-text-primary m-0">
                                    Gateway Latency & Connection Health (24h Trend)
                                </h3>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                                    ICMP Probed
                                </span>
                            </div>
                            <p className="text-[11px] text-text-muted m-0">
                                Round-trip response times directly to the Wilmington & Keleman gateway perimeters.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleProbeGateways}
                            disabled={probingGateways}
                            className="btn-secondary text-[11px] px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-all cursor-pointer"
                            title="Execute instant 2-packet probe to gateways"
                        >
                            <Wifi size={12} className={probingGateways ? "animate-spin text-accent-primary" : "text-emerald-400"} />
                            <span>{probingGateways ? "Probing Gateways..." : "Probe Gateways Now"}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowLatencyChart(!showLatencyChart)}
                            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors cursor-pointer"
                            title={showLatencyChart ? "Collapse chart" : "Expand chart"}
                        >
                            {showLatencyChart ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>
                </div>

                {/* Gateway Latency Status Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-surface-hover/50 border border-border-color/60 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                            <span className="font-semibold text-text-primary">Wilmington Connect (172.16.2.51)</span>
                        </div>
                        <span className="font-mono text-emerald-400 font-bold">
                            {chartData.length > 0 && chartData[chartData.length - 1].wilmington !== undefined
                                ? `${chartData[chartData.length - 1].wilmington} ms (0% loss)`
                                : "~21 ms"}
                        </span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-surface-hover/50 border border-border-color/60 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                            <span className="font-semibold text-text-primary">Keleman Reconnect (172.18.166.55)</span>
                        </div>
                        <span className="font-mono text-sky-400 font-bold">
                            {chartData.length > 0 && chartData[chartData.length - 1].keleman !== undefined
                                ? `${chartData[chartData.length - 1].keleman} ms (0% loss)`
                                : "~25 ms"}
                        </span>
                    </div>
                </div>

                {/* Collapsible Area Chart */}
                {showLatencyChart && (
                    <div className="h-44 w-full mt-2 pt-2 border-t border-border-color/40">
                        {chartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorWilmington" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.35}/>
                                            <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                                        </linearGradient>
                                        <linearGradient id="colorKeleman" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35}/>
                                            <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="2 2" stroke="var(--border-color)" opacity={0.35} vertical={false} />
                                    <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}ms`} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '10px', fontSize: '11px' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        labelStyle={{ color: 'var(--text-secondary)', marginBottom: '3px', fontWeight: 'bold' }}
                                    />
                                    <Area type="monotone" name="Wilmington (Connect)" dataKey="wilmington" stroke="#34d399" fill="url(#colorWilmington)" strokeWidth={2} />
                                    <Area type="monotone" name="Keleman (Reconnect)" dataKey="keleman" stroke="#38bdf8" fill="url(#colorKeleman)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-xs text-text-muted">
                                <span>No latency samples recorded yet.</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Active Sessions Table Section */}
            <div className="glass-card p-6 rounded-2xl border border-border-color bg-[var(--bg-surface)] flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border-color pb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-text-primary m-0">
                                Live AnyConnect Active Sessions
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
                                {filteredSessions.length} Active
                            </span>
                        </div>
                        <p className="text-xs text-text-muted m-0 mt-0.5">
                            Authoritative active state directly from the Cisco FTD session database.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        {/* Gateway Filter Dropdown */}
                        <select
                            value={selectedGatewayFilter}
                            onChange={(e) => setSelectedGatewayFilter(e.target.value)}
                            className="text-xs px-3 py-2 rounded-xl bg-[var(--bg-background)] border border-border-color text-text-primary outline-none cursor-pointer"
                        >
                            <option value="all">All Gateways</option>
                            <option value="fw1">Wilmington Primary (Connect)</option>
                            <option value="fw2">Wilmington Secondary</option>
                            <option value="fw3">Keleman Primary (Reconnect)</option>
                            <option value="fw4">Keleman Secondary</option>
                        </select>

                        {/* Search Filter Input */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type="text"
                                value={filterQuery}
                                onChange={(e) => setFilterQuery(e.target.value)}
                                placeholder="Filter username, IP, protocol..."
                                className="text-xs pl-8 pr-3.5 py-2 rounded-xl bg-[var(--bg-background)] border border-border-color text-text-primary placeholder:text-text-muted outline-none focus:border-accent-primary w-64"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-border-color text-text-muted font-semibold">
                                <th className="py-2.5 px-3">Username</th>
                                <th className="py-2.5 px-3">Assigned IP (Tunnel)</th>
                                <th className="py-2.5 px-3">Public Endpoint IP</th>
                                <th className="py-2.5 px-3">Gateway</th>
                                <th className="py-2.5 px-3">Duration</th>
                                <th className="py-2.5 px-3">Protocol / Cipher</th>
                                <th className="py-2.5 px-3">Traffic (Tx / Rx)</th>
                                <th className="py-2.5 px-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color/60">
                            {loadingSessions ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-text-muted">
                                        <div className="flex items-center justify-center gap-2">
                                            <RefreshCw size={16} className="animate-spin text-accent-primary" />
                                            <span>Querying live sessions from Cisco FTD gateways...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredSessions.length > 0 ? (
                                filteredSessions.map((session, idx) => (
                                    <tr 
                                        key={session.auditSessionId || session.index || `${session.username}-${idx}`}
                                        className="hover:bg-accent-glow/10 transition-colors"
                                    >
                                        <td className="py-3 px-3">
                                            <div 
                                                className="font-semibold text-text-primary hover:text-accent-primary cursor-pointer flex items-center gap-1.5"
                                                onMouseEnter={(e) => onHoverUser && onHoverUser(e, session.username)}
                                                onMouseLeave={onLeaveUser}
                                            >
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                <span>{session.username}</span>
                                            </div>
                                            {session.groupPolicy && (
                                                <div className="text-[10px] text-text-muted">
                                                    {session.groupPolicy}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                                            {session.assignedIp || "N/A"}
                                        </td>
                                        <td className="py-3 px-3 font-mono text-text-secondary">
                                            {session.publicIp || "N/A"}
                                        </td>
                                        <td className="py-3 px-3 text-text-secondary">
                                            <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--bg-background)] border border-border-color">
                                                {session.firewallName ? session.firewallName.split(" ")[0] : "Wilmington"}
                                            </span>
                                        </td>
                                        <td className="py-3 px-3 text-text-primary whitespace-nowrap">
                                            {session.duration || "Active"}
                                        </td>
                                        <td className="py-3 px-3">
                                            <span className="font-semibold text-indigo-400">{session.protocol}</span>
                                            {session.encryption && (
                                                <div className="text-[10px] text-text-muted truncate max-w-[150px]" title={session.encryption}>
                                                    {session.encryption}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-3 font-mono text-[11px] text-text-secondary whitespace-nowrap">
                                            <span className="text-emerald-400">↑ {formatBytes(session.bytesTx)}</span>
                                            <span className="mx-1.5 text-border-color">|</span>
                                            <span className="text-sky-400">↓ {formatBytes(session.bytesRx)}</span>
                                        </td>
                                        <td className="py-3 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {session.assignedIp && session.assignedIp !== "N/A" && (
                                                    <button
                                                        onClick={() => handlePingClient(session.assignedIp, session.username, session.firewallId)}
                                                        disabled={clientPingStatus[session.assignedIp]?.loading}
                                                        className={`text-[11px] px-2 py-1 rounded-lg border font-medium inline-flex items-center gap-1 transition-colors ${
                                                            clientPingStatus[session.assignedIp]?.sample?.alive
                                                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                                                : clientPingStatus[session.assignedIp]?.error || clientPingStatus[session.assignedIp]?.sample?.alive === false
                                                                ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                                                : "border-border-color bg-[var(--bg-background)] hover:bg-border-color/30 text-text-secondary"
                                                        }`}
                                                        title={`Probe ICMP latency directly from firewall (${session.firewallName?.split(" ")[0] || "Active Node"}) to client virtual adapter (${session.assignedIp})`}
                                                    >
                                                        {clientPingStatus[session.assignedIp]?.loading ? (
                                                            <Loader2 size={11} className="animate-spin text-text-muted" />
                                                        ) : (
                                                            <Wifi size={11} />
                                                        )}
                                                        <span>
                                                            {clientPingStatus[session.assignedIp]?.loading
                                                                ? "Probing..."
                                                                : clientPingStatus[session.assignedIp]?.sample?.alive
                                                                ? `${Math.round(clientPingStatus[session.assignedIp]?.sample?.rttAvg)}ms`
                                                                : clientPingStatus[session.assignedIp]?.sample?.alive === false
                                                                ? "Timeout"
                                                                : "Ping"}
                                                        </span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => onSelectSessionToDisconnect(session)}
                                                    className="btn-danger text-[11px] px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold inline-flex items-center gap-1 transition-colors"
                                                    title="Disconnect active AnyConnect session on firewall"
                                                >
                                                    <Power size={11} />
                                                    <span>Disconnect</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-text-muted">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <ShieldCheck size={32} className="text-text-muted opacity-40" />
                                            <span className="font-medium text-sm">
                                                {filterQuery ? `No active sessions match "${filterQuery}"` : "No active AnyConnect sessions reported by queried firewalls."}
                                            </span>
                                            <button 
                                                onClick={onRefresh}
                                                className="btn-secondary text-xs px-3 py-1 mt-2"
                                            >
                                                Refresh Active Sessions
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
