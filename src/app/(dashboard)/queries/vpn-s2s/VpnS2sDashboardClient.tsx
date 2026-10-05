"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    ArrowDownLeft,
    ArrowUpRight,
    CheckCircle2,
    Clock,
    Copy,
    Check,
    Cpu,
    ExternalLink,
    Filter,
    HardDrive,
    Layers,
    Link2,
    Lock,
    Network,
    RefreshCw,
    Search,
    Server,
    Shield,
    ShieldAlert,
    ShieldCheck,
    Terminal,
    Trash2,
    Wifi,
    X,
    XCircle,
    Zap,
    Download,
    HelpCircle,
    Settings2
} from "lucide-react";
import { S2sTunnel, S2sTroubleshootResult } from "@/lib/s2s-vpn";
import { S2sSetupModal } from "@/components/vpn/S2sSetupModal";

interface FleetSummary {
    total: number;
    up: number;
    degraded: number;
    down: number;
    negotiating: number;
    totalBytesTx: number;
    totalBytesRx: number;
    totalBandwidthGigabytes: string;
}

export default function VpnS2sDashboardClient({ role }: { role: string }) {
    const isAdmin = role === "ADMIN";
    const isNetworkOrAnalyst = role === "ADMIN" || role === "ANALYST" || role === "NETWORK";

    const [tunnels, setTunnels] = useState<S2sTunnel[]>([]);
    const [summary, setSummary] = useState<FleetSummary | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string>("");

    // S2S Config & Prompt State
    const [configInfo, setConfigInfo] = useState<any>(null);
    const [isSetupModalOpen, setIsSetupModalOpen] = useState<boolean>(false);
    const [hasAutoPrompted, setHasAutoPrompted] = useState<boolean>(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [selectedStatus, setSelectedStatus] = useState<string>("all");
    const [selectedGateway, setSelectedGateway] = useState<string>("all");
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(30); // seconds (0 = off)

    // Deep Diagnostics Modal State
    const [activeDiagReport, setActiveDiagReport] = useState<S2sTroubleshootResult | null>(null);
    const [diagnosingTunnelId, setDiagnosingTunnelId] = useState<string | null>(null);
    const [isDiagOpen, setIsDiagOpen] = useState<boolean>(false);
    const [copiedCli, setCopiedCli] = useState<boolean>(false);

    // Operational Action States
    const [actionLoading, setActionLoading] = useState<boolean>(false);
    const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);
    const [safeMode, setSafeMode] = useState<boolean>(true);

    // FMC Status Modal State
    const [isFmcModalOpen, setIsFmcModalOpen] = useState<boolean>(false);
    const [fmcStatusData, setFmcStatusData] = useState<any>(null);
    const [fmcLoading, setFmcLoading] = useState<boolean>(false);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch("/api/vpn/s2s/config");
            if (res.ok) {
                const data = await res.json();
                setConfigInfo(data);
                // Prompt user immediately if .env / config is blank!
                if (!data.isConfigured && !hasAutoPrompted) {
                    setIsSetupModalOpen(true);
                    setHasAutoPrompted(true);
                }
            }
        } catch (e) {
            console.warn("Failed to check S2S configuration:", e);
        }
    }, [hasAutoPrompted]);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const fetchTunnels = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        else setRefreshing(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedGateway !== "all") params.append("gateway", selectedGateway);
            if (selectedStatus !== "all") params.append("status", selectedStatus);
            if (searchQuery.trim()) params.append("q", searchQuery.trim());

            const res = await fetch(`/api/vpn/s2s/tunnels?${params.toString()}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}: Failed to fetch tunnels`);
            }
            const data = await res.json();
            setTunnels(data.tunnels || []);
            setSummary(data.summary || null);
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (err: any) {
            setError(err.message || "Failed to load S2S VPN tunnels");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedGateway, selectedStatus, searchQuery]);

    useEffect(() => {
        fetchTunnels();
    }, [fetchTunnels]);

    // Auto-refresh timer
    useEffect(() => {
        if (autoRefreshInterval <= 0) return;
        const timer = setInterval(() => {
            fetchTunnels(true);
        }, autoRefreshInterval * 1000);
        return () => clearInterval(timer);
    }, [autoRefreshInterval, fetchTunnels]);

    const handleRunDiagnostics = async (tunnel: S2sTunnel) => {
        setDiagnosingTunnelId(tunnel.id);
        setActionFeedback(null);
        try {
            const res = await fetch("/api/vpn/s2s/troubleshoot", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tunnelId: tunnel.id, peerIp: tunnel.peerIp })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Diagnostic check failed");
            }
            const data = await res.json();
            setActiveDiagReport(data.report);
            setIsDiagOpen(true);
        } catch (err: any) {
            alert(`Diagnostic error: ${err.message}`);
        } finally {
            setDiagnosingTunnelId(null);
        }
    };

    const handleAction = async (action: "ping" | "clear_ipsec" | "clear_ike", peerIp: string, gatewayId?: string) => {
        setActionLoading(true);
        setActionFeedback(null);
        try {
            const res = await fetch("/api/vpn/s2s/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    peerIp,
                    gatewayId,
                    dryRun: safeMode
                })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || `Failed to execute ${action}`);
            }
            setActionFeedback({
                success: true,
                message: data.message || `Action '${action}' completed successfully.`
            });
            // Re-fetch in background after bounce
            if (action !== "ping") {
                setTimeout(() => fetchTunnels(true), 1500);
            }
        } catch (err: any) {
            setActionFeedback({
                success: false,
                message: err.message || `Failed to execute ${action}`
            });
        } finally {
            setActionLoading(false);
        }
    };

    const checkFmcStatus = async () => {
        setFmcLoading(true);
        setIsFmcModalOpen(true);
        try {
            const res = await fetch("/api/vpn/s2s/fmc-status");
            const data = await res.json();
            setFmcStatusData(data);
        } catch (err: any) {
            setFmcStatusData({ error: err.message });
        } finally {
            setFmcLoading(false);
        }
    };

    const copyCliToClipboard = (commands: string[]) => {
        const text = commands.join("\n");
        navigator.clipboard.writeText(text);
        setCopiedCli(true);
        setTimeout(() => setCopiedCli(false), 2000);
    };

    const exportIncidentReport = (report: S2sTroubleshootResult) => {
        const content = `# Cisco S2S VPN Incident Report
**Generated:** ${new Date().toISOString()}
**Tunnel Name:** ${report.tunnelName}
**Local Gateway:** ${report.gatewayName}
**Remote Peer IP:** ${report.peerIp}
**Overall Health:** ${report.overallHealth} (${report.failureCategory})
**Health Score:** ${report.healthScore}/100

## Root Cause Analysis
${report.rootCause}

## Plain English Summary
${report.plainEnglishExplanation}

## FMC Remediation Steps
${report.fmcRemediationSteps.map((s, idx) => `${idx + 1}. ${s}`).join("\n")}

## Cisco FTD CLI Diagnostic Commands
\`\`\`bash
${report.ftdCliCommands.join("\n")}
\`\`\`

## Correlated Syslogs
${report.correlatedSyslogs.map(l => `[${l.timestamp}] ${l.messageId} (L${l.level}): ${l.text}`).join("\n")}
`;

        const blob = new Blob([content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vpn-incident-${report.peerIp.replace(/\./g, "-")}-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Gateways list for filtering
    const gateways = useMemo(() => {
        const set = new Set<string>();
        tunnels.forEach(t => {
            if (t.gatewayName) set.add(t.gatewayName);
        });
        return Array.from(set);
    }, [tunnels]);

    return (
        <div className="space-y-6">
            {/* Top Control Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-color pb-5">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                            <Link2 size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
                                Cisco FTD / FMC Site-to-Site VPN Monitor
                                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
                                    FTD 7.2.10
                                </span>
                            </h1>
                            <p className="text-sm text-text-secondary mt-0.5">
                                Real-time cryptographic telemetry, IKEv1/IKEv2 SA health, and automated root-cause diagnostics across the Cisco Firepower perimeter fleet.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Setup / Prompt Button */}
                    <button
                        onClick={() => setIsSetupModalOpen(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm ${
                            configInfo?.isConfigured
                                ? "border-cyan-500/30 bg-cyan-950/20 hover:bg-cyan-950/40 text-cyan-300"
                                : "border-amber-500/50 bg-amber-950/40 hover:bg-amber-950/60 text-amber-300 ring-2 ring-amber-500/20"
                        }`}
                        title={configInfo?.isConfigured ? "Update FMC or FTD gateway credentials" : "No S2S credentials found in .env. Click to configure!"}
                    >
                        <Settings2 size={14} className={configInfo?.isConfigured ? "text-cyan-400" : "text-amber-400 animate-spin"} />
                        <span>
                            {configInfo?.isConfigured
                                ? configInfo.fmc?.url
                                    ? `FMC: ${configInfo.fmc.url.replace(/^https?:\/\//, '').split('/')[0].split(':')[0]}`
                                    : `FTDs (${configInfo.ftds?.length || 0})`
                                : "Configure FMC / FTDs"}
                        </span>
                    </button>

                    {/* Safe Mode Toggle */}
                    <button
                        onClick={() => setSafeMode(!safeMode)}
                        title={safeMode ? "Safe Mode is ON: SA bounces will be simulated (dry-run)" : "Safe Mode is OFF: SA bounces will execute LIVE on firewalls"}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                            safeMode
                                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                                : "bg-amber-950/40 border-amber-500/40 text-amber-300 shadow-sm"
                        }`}
                    >
                        <Shield size={14} />
                        <span>{safeMode ? "Safe Mode: ON" : "Safe Mode: OFF (LIVE)"}</span>
                    </button>

                    {/* FMC Topology Button */}
                    <button
                        onClick={checkFmcStatus}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-color bg-bg-surface hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                    >
                        <Server size={14} className="text-indigo-400" />
                        <span>FMC Topology</span>
                    </button>

                    {/* Auto Refresh Select */}
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-color bg-bg-surface text-xs text-text-secondary">
                        <Clock size={13} />
                        <select
                            value={autoRefreshInterval}
                            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                            className="bg-transparent text-text-primary outline-none cursor-pointer text-xs"
                        >
                            <option value={0} className="bg-bg-surface text-text-primary">Auto: Off</option>
                            <option value={15} className="bg-bg-surface text-text-primary">Auto: 15s</option>
                            <option value={30} className="bg-bg-surface text-text-primary">Auto: 30s</option>
                            <option value={60} className="bg-bg-surface text-text-primary">Auto: 60s</option>
                        </select>
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={() => fetchTunnels(false)}
                        disabled={loading || refreshing}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
                        <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
                    </button>
                </div>
            </div>

            {/* Setup Needed Banner if .env is blank */}
            {configInfo && !configInfo.isConfigured && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-200 shadow-sm animate-in fade-in duration-300">
                    <div className="flex items-center gap-3">
                        <AlertCircle size={22} className="shrink-0 text-amber-400" />
                        <div className="text-xs space-y-0.5">
                            <strong className="text-amber-100 text-sm block">Target S2S Firewalls Not Configured in .env</strong>
                            <span className="text-amber-200/90 leading-relaxed block">
                                Enter your target Firepower Management Center (FMC) or Firepower Threat Defense (FTD) IP addresses and credentials to connect to your live Site-to-Site VPN environment.
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsSetupModalOpen(true)}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold whitespace-nowrap transition-all shadow-md active:scale-95 shrink-0"
                    >
                        Configure FMC & FTDs Now
                    </button>
                </div>
            )}

            {/* Error Notification */}
            {error && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-sm">
                    <AlertCircle size={18} className="shrink-0 text-rose-400" />
                    <span>{error}</span>
                </div>
            )}

            {/* Fleet KPI Ribbon */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                <div className="glass-card p-4 rounded-xl border border-border-color bg-bg-surface flex items-center justify-between">
                    <div>
                        <div className="text-xs text-text-secondary uppercase font-semibold tracking-wider">Total Tunnels</div>
                        <div className="text-2xl font-extrabold text-text-primary mt-1">
                            {summary?.total ?? tunnels.length}
                        </div>
                        <div className="text-[11px] text-text-secondary mt-0.5">FTD / FMC Monitored</div>
                    </div>
                    <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <Network size={20} />
                    </div>
                </div>

                <div className="glass-card p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-emerald-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Active (UP)
                        </div>
                        <div className="text-2xl font-extrabold text-emerald-300 mt-1">
                            {summary?.up ?? tunnels.filter(t => t.status === "UP").length}
                        </div>
                        <div className="text-[11px] text-emerald-400/80 mt-0.5">Passing Encrypted Traffic</div>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 size={20} />
                    </div>
                </div>

                <div className="glass-card p-4 rounded-xl border border-amber-500/20 bg-amber-950/10 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-amber-400 uppercase font-semibold tracking-wider">Degraded</div>
                        <div className="text-2xl font-extrabold text-amber-300 mt-1">
                            {summary?.degraded ?? tunnels.filter(t => t.status === "DEGRADED").length}
                        </div>
                        <div className="text-[11px] text-amber-400/80 mt-0.5">One-Way / High Drops</div>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <AlertTriangle size={20} />
                    </div>
                </div>

                <div className="glass-card p-4 rounded-xl border border-rose-500/20 bg-rose-950/10 flex items-center justify-between">
                    <div>
                        <div className="text-xs text-rose-400 uppercase font-semibold tracking-wider">Down / Failed</div>
                        <div className="text-2xl font-extrabold text-rose-300 mt-1">
                            {summary?.down ?? tunnels.filter(t => t.status === "DOWN").length}
                        </div>
                        <div className="text-[11px] text-rose-400/80 mt-0.5">Negotiation Faults</div>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                        <XCircle size={20} />
                    </div>
                </div>

                <div className="glass-card p-4 rounded-xl border border-border-color bg-bg-surface flex items-center justify-between col-span-2 md:col-span-1">
                    <div>
                        <div className="text-xs text-text-secondary uppercase font-semibold tracking-wider">Encrypted Volume</div>
                        <div className="text-2xl font-extrabold text-indigo-400 mt-1">
                            {summary?.totalBandwidthGigabytes ?? "0"} <span className="text-xs text-text-secondary font-medium">GB</span>
                        </div>
                        <div className="text-[11px] text-text-secondary mt-0.5">Cumulative Transferred</div>
                    </div>
                    <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        <Activity size={20} />
                    </div>
                </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-xl border border-border-color bg-bg-surface">
                {/* Search Input */}
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input
                        type="text"
                        placeholder="Search peer IP, tunnel name, protected subnet (e.g. 10.240.0.0/16)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-surface-hover/70 border border-border-color text-text-primary text-xs outline-none focus:border-accent-primary transition-all"
                    />
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Tabs */}
                    <div className="flex items-center p-1 rounded-lg bg-bg-surface-hover/60 border border-border-color text-xs">
                        {["all", "up", "degraded", "down"].map((st) => (
                            <button
                                key={st}
                                onClick={() => setSelectedStatus(st)}
                                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                                    selectedStatus === st
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                {st}
                            </button>
                        ))}
                    </div>

                    {/* Gateway Filter */}
                    {gateways.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-color bg-bg-surface text-xs text-text-secondary">
                            <Server size={13} />
                            <select
                                value={selectedGateway}
                                onChange={(e) => setSelectedGateway(e.target.value)}
                                className="bg-transparent text-text-primary outline-none cursor-pointer text-xs max-w-[160px] truncate"
                            >
                                <option value="all" className="bg-bg-surface text-text-primary">All Firewalls</option>
                                {gateways.map((gw) => (
                                    <option key={gw} value={gw} className="bg-bg-surface text-text-primary">
                                        {gw}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* Tunnels Grid & Table */}
            <div className="space-y-3">
                {loading ? (
                    <div className="py-20 text-center text-text-secondary flex flex-col items-center justify-center gap-3">
                        <RefreshCw size={28} className="animate-spin text-accent-primary" />
                        <div className="text-sm font-medium">Scanning Cisco FTD & FMC Site-to-Site Tunnels...</div>
                    </div>
                ) : tunnels.length === 0 ? (
                    <div className="py-16 text-center text-text-secondary border border-dashed border-border-color rounded-2xl bg-bg-surface/50">
                        <Network size={36} className="mx-auto text-text-secondary/50 mb-3" />
                        <h3 className="text-base font-semibold text-text-primary">No Matching S2S Tunnels Found</h3>
                        <p className="text-xs text-text-secondary mt-1">Try adjusting your search query or status filter.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3.5">
                        {tunnels.map((tunnel) => {
                            const isUp = tunnel.status === "UP";
                            const isDegraded = tunnel.status === "DEGRADED";
                            const isDown = tunnel.status === "DOWN";

                            const statusColor = isUp
                                ? "border-emerald-500/30 bg-emerald-950/10"
                                : isDegraded
                                ? "border-amber-500/30 bg-amber-950/10"
                                : "border-rose-500/30 bg-rose-950/10";

                            const badgeColor = isUp
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                : isDegraded
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                : "bg-rose-500/20 text-rose-300 border-rose-500/30";

                            return (
                                <div
                                    key={tunnel.id}
                                    className={`p-4 rounded-xl border ${statusColor} bg-bg-surface hover:border-accent-primary/40 transition-all shadow-sm`}
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                        {/* Tunnel Identity */}
                                        <div className="space-y-1.5 flex-1 min-w-[280px]">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border uppercase tracking-wide flex items-center gap-1.5 ${badgeColor}`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isUp ? "bg-emerald-400" : isDegraded ? "bg-amber-400" : "bg-rose-400"}`} />
                                                    {tunnel.status}
                                                </span>
                                                <h3 className="text-base font-bold text-text-primary m-0">
                                                    {tunnel.name}
                                                </h3>
                                                <span className="text-xs text-text-secondary font-mono px-2 py-0.5 rounded bg-bg-surface-hover/80 border border-border-color">
                                                    {tunnel.topologyType}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-4 text-xs text-text-secondary flex-wrap">
                                                <div className="flex items-center gap-1">
                                                    <Server size={13} className="text-indigo-400" />
                                                    <span className="text-text-primary font-medium">{tunnel.gatewayName}</span>
                                                    <span className="text-text-secondary/70">({tunnel.localIp})</span>
                                                </div>
                                                <span>↔</span>
                                                <div className="flex items-center gap-1">
                                                    <Shield size={13} className="text-cyan-400" />
                                                    <span className="text-text-primary font-medium">{tunnel.peerDeviceName}</span>
                                                    <span className="text-cyan-400 font-mono font-medium">({tunnel.peerIp})</span>
                                                </div>
                                            </div>

                                            {tunnel.failureReason && (
                                                <div className="mt-1 text-xs text-rose-300 flex items-center gap-1.5">
                                                    <AlertCircle size={13} className="shrink-0 text-rose-400" />
                                                    <span className="font-medium">{tunnel.failureReason}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Cryptographic Parameters */}
                                        <div className="flex items-center gap-3 text-xs border-y lg:border-y-0 lg:border-x border-border-color py-2 lg:py-0 px-0 lg:px-4 flex-wrap">
                                            <div className="space-y-1">
                                                <div className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">Phase 1 (IKE)</div>
                                                <div className="font-mono text-text-primary text-[11px] flex items-center gap-1">
                                                    <span className="px-1.5 py-0.5 rounded bg-bg-surface-hover border border-border-color text-cyan-300">
                                                        {tunnel.ikeVersion}
                                                    </span>
                                                    <span className={`font-semibold ${tunnel.ikeStatus === "READY" ? "text-emerald-400" : "text-rose-400"}`}>
                                                        {tunnel.ikeStatus}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-text-secondary truncate max-w-[170px]">
                                                    {tunnel.encryption} · DH{tunnel.dhGroup}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">Phase 2 (IPsec)</div>
                                                <div className="font-mono text-text-primary text-[11px] flex items-center gap-1">
                                                    <span className={`font-semibold ${tunnel.ipsecStatus === "ACTIVE" ? "text-emerald-400" : "text-rose-400"}`}>
                                                        {tunnel.ipsecStatus}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] text-text-secondary truncate max-w-[170px]">
                                                    Encaps: {tunnel.packetsEncaps.toLocaleString()} / Decaps: {tunnel.packetsDecaps.toLocaleString()}
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="text-[11px] text-text-secondary uppercase tracking-wider font-semibold">Uptime / Dropped</div>
                                                <div className="font-mono text-text-primary text-[11px]">
                                                    {tunnel.uptime}
                                                </div>
                                                <div className="text-[10px] text-text-secondary">
                                                    Drops: <span className={tunnel.sendErrors + tunnel.recvErrors > 0 ? "text-rose-400 font-bold" : "text-emerald-400"}>{tunnel.sendErrors + tunnel.recvErrors}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-2 self-end lg:self-center">
                                            <button
                                                onClick={() => handleAction("ping", tunnel.peerIp, tunnel.gatewayId)}
                                                disabled={actionLoading}
                                                title="Test peer reachability via ICMP/UDP"
                                                className="px-2.5 py-1.5 rounded-lg border border-border-color bg-bg-surface-hover/70 hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                                            >
                                                Ping Peer
                                            </button>

                                            {isNetworkOrAnalyst && (
                                                <button
                                                    onClick={() => handleAction("clear_ipsec", tunnel.peerIp, tunnel.gatewayId)}
                                                    disabled={actionLoading}
                                                    title={safeMode ? "[Safe Mode] Simulate Phase 2 SA clear" : "Execute LIVE clear crypto ipsec sa"}
                                                    className="px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 text-xs font-medium transition-all"
                                                >
                                                    Soft Bounce
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleRunDiagnostics(tunnel)}
                                                disabled={diagnosingTunnelId === tunnel.id}
                                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                            >
                                                <Zap size={13} className={diagnosingTunnelId === tunnel.id ? "animate-spin" : ""} />
                                                <span>{diagnosingTunnelId === tunnel.id ? "Diagnosing..." : "Troubleshoot"}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Protected Subnets Ribbon */}
                                    <div className="mt-3 pt-2.5 border-t border-border-color/60 flex items-center justify-between text-[11px] text-text-secondary flex-wrap gap-2">
                                        <div className="flex items-center gap-2 font-mono">
                                            <span className="text-text-secondary">Protected Traffic:</span>
                                            <span className="px-1.5 py-0.5 rounded bg-bg-surface-hover border border-border-color text-text-primary">
                                                {tunnel.localSubnets.join(", ")}
                                            </span>
                                            <span>↔</span>
                                            <span className="px-1.5 py-0.5 rounded bg-bg-surface-hover border border-border-color text-text-primary">
                                                {tunnel.remoteSubnets.join(", ")}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 text-[11px] text-text-secondary">
                                            <span>FMC Policy:</span>
                                            <span className="text-indigo-300 font-medium">{tunnel.fmcPolicyName}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Deep Troubleshooting Modal */}
            {isDiagOpen && activeDiagReport && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border-color bg-bg-surface p-6 shadow-2xl space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between border-b border-border-color pb-4">
                            <div>
                                <div className="flex items-center gap-2.5">
                                    <div className={`p-2 rounded-xl ${
                                        activeDiagReport.overallHealth === "CRITICAL"
                                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                                            : activeDiagReport.overallHealth === "WARNING"
                                            ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                            : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                    }`}>
                                        <Zap size={22} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-extrabold text-text-primary flex items-center gap-2">
                                            <span>Automated Root Cause Diagnosis</span>
                                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                                                activeDiagReport.overallHealth === "CRITICAL"
                                                    ? "bg-rose-950/60 text-rose-300 border border-rose-800/50"
                                                    : activeDiagReport.overallHealth === "WARNING"
                                                    ? "bg-amber-950/60 text-amber-300 border border-amber-800/50"
                                                    : "bg-emerald-950/60 text-emerald-300 border border-emerald-800/50"
                                            }`}>
                                                {activeDiagReport.overallHealth} (Score: {activeDiagReport.healthScore}/100)
                                            </span>
                                        </h2>
                                        <p className="text-xs text-text-secondary mt-0.5">
                                            Tunnel: <span className="text-text-primary font-semibold">{activeDiagReport.tunnelName}</span> · Peer: <span className="text-cyan-400 font-mono font-semibold">{activeDiagReport.peerIp}</span> · Gateway: <span className="text-text-primary font-semibold">{activeDiagReport.gatewayName}</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => setIsDiagOpen(false)}
                                className="p-1.5 rounded-lg border border-border-color hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Action feedback if triggered inside modal */}
                        {actionFeedback && (
                            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                                actionFeedback.success
                                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                                    : "bg-rose-950/40 border-rose-500/30 text-rose-300"
                            }`}>
                                <span>{actionFeedback.message}</span>
                                <button onClick={() => setActionFeedback(null)} className="text-text-secondary hover:text-text-primary">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* Primary Diagnostic Banner */}
                        <div className={`p-4 rounded-xl border ${
                            activeDiagReport.overallHealth === "CRITICAL"
                                ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                                : activeDiagReport.overallHealth === "WARNING"
                                ? "bg-amber-950/30 border-amber-500/40 text-amber-200"
                                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-200"
                        } space-y-2`}>
                            <div className="font-bold text-sm flex items-center gap-2">
                                <AlertCircle size={16} />
                                <span>{activeDiagReport.summary}</span>
                            </div>
                            <p className="text-xs leading-relaxed text-text-secondary">
                                {activeDiagReport.plainEnglishExplanation}
                            </p>
                            <div className="pt-1.5 text-xs font-mono text-text-primary border-t border-border-color/40">
                                <span className="text-text-secondary">Root Cause Signature: </span>
                                <span className="text-amber-300">{activeDiagReport.rootCause}</span>
                            </div>
                        </div>

                        {/* 4-Pillar Diagnostic Framework */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            {/* Pillar 1: Phase 1 */}
                            <div className="p-3.5 rounded-xl border border-border-color bg-bg-surface-hover/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Pillar 1: Phase 1 IKE</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        activeDiagReport.phase1.status === "PASS"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-rose-500/20 text-rose-300"
                                    }`}>
                                        {activeDiagReport.phase1.status}
                                    </span>
                                </div>
                                <div className="space-y-1 text-xs">
                                    <div className="text-text-secondary text-[11px]">State: <span className="text-text-primary font-mono">{activeDiagReport.phase1.state}</span></div>
                                    <div className="text-text-secondary text-[11px]">Cipher: <span className="text-text-primary">{activeDiagReport.phase1.cipherSuite}</span></div>
                                    <div className="text-text-secondary text-[11px]">Lifetime: <span className="text-text-primary font-mono">{activeDiagReport.phase1.lifetimeRemaining}</span></div>
                                </div>
                                <p className="text-[11px] text-text-secondary border-t border-border-color/60 pt-2 leading-tight">
                                    {activeDiagReport.phase1.details}
                                </p>
                            </div>

                            {/* Pillar 2: Phase 2 */}
                            <div className="p-3.5 rounded-xl border border-border-color bg-bg-surface-hover/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Pillar 2: Phase 2 IPsec</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        activeDiagReport.phase2.status === "PASS"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : "bg-rose-500/20 text-rose-300"
                                    }`}>
                                        {activeDiagReport.phase2.status}
                                    </span>
                                </div>
                                <div className="space-y-1 text-xs">
                                    <div className="text-text-secondary text-[11px]">State: <span className="text-text-primary font-mono">{activeDiagReport.phase2.ipsecState}</span></div>
                                    <div className="text-text-secondary text-[11px]">Proxy-IDs: <span className={activeDiagReport.phase2.trafficSelectorsMatch ? "text-emerald-400" : "text-rose-400 font-bold"}>{activeDiagReport.phase2.trafficSelectorsMatch ? "MATCHED" : "MISMATCH"}</span></div>
                                    <div className="text-text-secondary text-[11px]">SPI In/Out: <span className="text-text-primary font-mono text-[10px]">{activeDiagReport.phase2.inboundSpi}</span></div>
                                </div>
                                <p className="text-[11px] text-text-secondary border-t border-border-color/60 pt-2 leading-tight">
                                    {activeDiagReport.phase2.details}
                                </p>
                            </div>

                            {/* Pillar 3: Data Plane */}
                            <div className="p-3.5 rounded-xl border border-border-color bg-bg-surface-hover/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Pillar 3: Data Plane</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        activeDiagReport.dataPlane.status === "PASS"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : activeDiagReport.dataPlane.status === "WARN"
                                            ? "bg-amber-500/20 text-amber-300"
                                            : "bg-rose-500/20 text-rose-300"
                                    }`}>
                                        {activeDiagReport.dataPlane.status}
                                    </span>
                                </div>
                                <div className="space-y-1 text-xs">
                                    <div className="text-text-secondary text-[11px]">Encaps: <span className="text-text-primary font-mono">{activeDiagReport.dataPlane.packetsEncaps.toLocaleString()}</span></div>
                                    <div className="text-text-secondary text-[11px]">Decaps: <span className="text-text-primary font-mono">{activeDiagReport.dataPlane.packetsDecaps.toLocaleString()}</span></div>
                                    <div className="text-text-secondary text-[11px]">NAT Exemption: <span className={activeDiagReport.dataPlane.natExemptionVerified ? "text-emerald-400" : "text-amber-400"}>{activeDiagReport.dataPlane.natExemptionVerified ? "Verified" : "Check No-NAT"}</span></div>
                                </div>
                                <p className="text-[11px] text-text-secondary border-t border-border-color/60 pt-2 leading-tight">
                                    {activeDiagReport.dataPlane.details}
                                </p>
                            </div>

                            {/* Pillar 4: ACP & Connectivity Permissions */}
                            <div className="p-3.5 rounded-xl border border-border-color bg-bg-surface-hover/30 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-xs font-bold text-text-primary uppercase tracking-wide">Pillar 4: ACP & Policy</div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                        activeDiagReport.acpAudit?.status === "PASS"
                                            ? "bg-emerald-500/20 text-emerald-300"
                                            : activeDiagReport.acpAudit?.status === "WARN"
                                            ? "bg-amber-500/20 text-amber-300"
                                            : "bg-rose-500/20 text-rose-300"
                                    }`}>
                                        {activeDiagReport.acpAudit?.status || "PASS"}
                                    </span>
                                </div>
                                <div className="space-y-1 text-xs">
                                    <div className="text-text-secondary text-[11px]">Rule Action: <span className={`font-bold ${activeDiagReport.acpAudit?.action === "ALLOW" ? "text-emerald-400" : activeDiagReport.acpAudit?.action === "BLOCK" ? "text-rose-400" : "text-cyan-400"}`}>{activeDiagReport.acpAudit?.action || "ALLOW"}</span></div>
                                    <div className="text-text-secondary text-[11px]">Permit-VPN: <span className={activeDiagReport.acpAudit?.sysoptPermitVpn ? "text-emerald-400" : "text-amber-400"}>{activeDiagReport.acpAudit?.sysoptPermitVpn ? "Active (Bypass)" : "Disabled (Inspected)"}</span></div>
                                    <div className="text-text-secondary text-[11px]">Shadowing: <span className={activeDiagReport.acpAudit?.ruleShadowingDetected ? "text-rose-400 font-bold" : "text-emerald-400"}>{activeDiagReport.acpAudit?.ruleShadowingDetected ? "Detected" : "Clean"}</span></div>
                                </div>
                                <p className="text-[11px] text-text-secondary border-t border-border-color/60 pt-2 leading-tight">
                                    {activeDiagReport.acpAudit?.packetTracerSimulation ? `Packet-Tracer: ${activeDiagReport.acpAudit.packetTracerSimulation.verdict}` : "Access rules permit inter-site traffic."}
                                </p>
                            </div>
                        </div>

                        {/* Dedicated Access Control Policy (ACP) & Permissions Audit Section */}
                        {activeDiagReport.acpAudit && (
                            <div className="space-y-2.5">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                                    <ShieldCheck size={14} className="text-emerald-400" />
                                    <span>Access Control Policy (ACP) & Connectivity Permissions Audit</span>
                                </h3>
                                <div className="p-4 rounded-xl border border-border-color bg-bg-surface-hover/30 space-y-3 text-xs">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <div className="space-y-1">
                                            <div className="text-[11px] text-text-secondary uppercase">FMC Access Control Policy</div>
                                            <div className="font-semibold text-text-primary flex items-center gap-1.5">
                                                <Layers size={13} className="text-indigo-400" />
                                                <span>{activeDiagReport.acpAudit.policyName}</span>
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[11px] text-text-secondary uppercase">Evaluated Access Rule</div>
                                            <div className="font-semibold text-cyan-300 truncate" title={activeDiagReport.acpAudit.matchingRule}>
                                                {activeDiagReport.acpAudit.matchingRule}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="text-[11px] text-text-secondary uppercase">sysopt connection permit-vpn</div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                                    activeDiagReport.acpAudit.sysoptPermitVpn
                                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                                        : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                                }`}>
                                                    {activeDiagReport.acpAudit.sysoptPermitVpn ? "Bypass Enabled" : "Bypass Disabled (ACL Check Enforced)"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-3 rounded-lg bg-bg-surface border border-border-color text-text-secondary leading-relaxed">
                                        <strong className="text-text-primary">Policy Audit Finding: </strong>
                                        {activeDiagReport.acpAudit.details}
                                    </div>

                                    {activeDiagReport.acpAudit.packetTracerSimulation && (
                                        <div className="space-y-1.5 pt-1 border-t border-border-color/60">
                                            <div className="flex items-center justify-between text-[11px]">
                                                <span className="font-bold text-text-primary flex items-center gap-1.5">
                                                    <Terminal size={12} className="text-cyan-400" />
                                                    <span>Simulated FTD Packet-Tracer Execution</span>
                                                </span>
                                                <span className={`px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                                                    activeDiagReport.acpAudit.packetTracerSimulation.verdict === "ALLOW"
                                                        ? "bg-emerald-500/20 text-emerald-300"
                                                        : "bg-rose-500/20 text-rose-300"
                                                }`}>
                                                    Verdict: {activeDiagReport.acpAudit.packetTracerSimulation.verdict}
                                                </span>
                                            </div>
                                            <div className="p-2.5 rounded bg-black/60 font-mono text-[11px] text-cyan-300 overflow-x-auto border border-border-color/80">
                                                {activeDiagReport.acpAudit.packetTracerSimulation.traceSummary}
                                                {activeDiagReport.acpAudit.packetTracerSimulation.dropReason && (
                                                    <div className="text-rose-400 mt-1 font-semibold">
                                                        Drop Reason: {activeDiagReport.acpAudit.packetTracerSimulation.dropReason}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step-by-Step FMC Remediation Checklist */}
                        <div className="space-y-2.5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                                <Layers size={14} className="text-indigo-400" />
                                <span>Cisco FMC Remediation Checklist (Step-by-Step)</span>
                            </h3>
                            <div className="p-4 rounded-xl border border-border-color bg-bg-surface-hover/40 space-y-2">
                                {activeDiagReport.fmcRemediationSteps.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-2.5 text-xs text-text-secondary">
                                        <div className="w-5 h-5 rounded-full bg-accent-primary/20 border border-accent-primary/40 text-accent-primary font-bold flex items-center justify-center shrink-0 text-[11px]">
                                            {idx + 1}
                                        </div>
                                        <div className="leading-relaxed text-text-primary">{step}</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Cisco FTD CLI Diagnostic Commands */}
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                                    <Terminal size={14} className="text-cyan-400" />
                                    <span>Target FTD CLI Diagnostic Commands</span>
                                </h3>
                                <button
                                    onClick={() => copyCliToClipboard(activeDiagReport.ftdCliCommands)}
                                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-all"
                                >
                                    {copiedCli ? <Check size={13} /> : <Copy size={13} />}
                                    <span>{copiedCli ? "Copied!" : "Copy Commands"}</span>
                                </button>
                            </div>
                            <div className="p-3.5 rounded-xl border border-border-color bg-black/70 font-mono text-xs text-emerald-400 space-y-1 overflow-x-auto">
                                {activeDiagReport.ftdCliCommands.map((cmd, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="text-text-secondary select-none">$</span>
                                        <span>{cmd}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Correlated Graylog Syslogs */}
                        <div className="space-y-2.5">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                                <HardDrive size={14} className="text-amber-400" />
                                <span>Correlated Graylog Syslog Stream (%FTD- / %ASA-)</span>
                            </h3>
                            <div className="border border-border-color rounded-xl overflow-hidden text-xs">
                                <table className="w-full text-left">
                                    <thead className="bg-bg-surface-hover/60 border-b border-border-color text-text-secondary text-[11px] uppercase tracking-wider">
                                        <tr>
                                            <th className="p-2.5">Timestamp</th>
                                            <th className="p-2.5">Message ID</th>
                                            <th className="p-2.5">Level</th>
                                            <th className="p-2.5">Message Text</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color/60 font-mono text-[11px]">
                                        {activeDiagReport.correlatedSyslogs.map((log, idx) => (
                                            <tr key={idx} className="hover:bg-bg-surface-hover/40">
                                                <td className="p-2.5 text-text-secondary whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                                <td className="p-2.5 text-cyan-300 font-bold whitespace-nowrap">{log.messageId}</td>
                                                <td className="p-2.5 whitespace-nowrap">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                        log.level <= 3 ? "bg-rose-500/20 text-rose-300" : log.level === 4 ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
                                                    }`}>
                                                        L{log.level}
                                                    </span>
                                                </td>
                                                <td className="p-2.5 text-text-primary">{log.text}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Footer Operational Actions */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border-color pt-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => exportIncidentReport(activeDiagReport)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-color bg-bg-surface-hover hover:bg-bg-surface-hover text-text-primary text-xs font-medium transition-all"
                                >
                                    <Download size={13} />
                                    <span>Export TAC Incident Report</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleAction("ping", activeDiagReport.peerIp)}
                                    disabled={actionLoading}
                                    className="px-3 py-1.5 rounded-lg border border-border-color hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                                >
                                    Ping Peer
                                </button>
                                {isNetworkOrAnalyst && (
                                    <>
                                        <button
                                            onClick={() => handleAction("clear_ipsec", activeDiagReport.peerIp)}
                                            disabled={actionLoading}
                                            className="px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/40 text-amber-300 text-xs font-medium transition-all"
                                        >
                                            Soft Bounce (IPsec)
                                        </button>
                                        <button
                                            onClick={() => handleAction("clear_ike", activeDiagReport.peerIp)}
                                            disabled={actionLoading}
                                            className="px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 text-xs font-semibold transition-all"
                                        >
                                            Hard Re-Key (IKE)
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* FMC Status & Inventory Modal */}
            {isFmcModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-border-color bg-bg-surface p-6 shadow-2xl space-y-5">
                        <div className="flex items-center justify-between border-b border-border-color pb-3">
                            <div className="flex items-center gap-2.5">
                                <Server size={20} className="text-indigo-400" />
                                <h2 className="text-lg font-bold text-text-primary">Cisco Firepower Management Center (FMC)</h2>
                            </div>
                            <button
                                onClick={() => setIsFmcModalOpen(false)}
                                className="p-1 rounded-lg border border-border-color hover:bg-bg-surface-hover text-text-secondary hover:text-text-primary transition-all"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {fmcLoading ? (
                            <div className="py-12 text-center text-text-secondary flex flex-col items-center justify-center gap-2">
                                <RefreshCw size={24} className="animate-spin text-accent-primary" />
                                <div className="text-xs">Querying Cisco FMC REST API...</div>
                            </div>
                        ) : (
                            <div className="space-y-4 text-xs">
                                <div className="p-3.5 rounded-xl border border-border-color bg-bg-surface-hover/40 space-y-2">
                                    <div className="font-bold text-text-primary flex items-center justify-between">
                                        <span>FMC REST API Connectivity</span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            fmcStatusData?.isConfigured ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"
                                        }`}>
                                            {fmcStatusData?.isConfigured ? "API ONLINE" : "HYBRID SIMULATION / STANDALONE"}
                                        </span>
                                    </div>
                                    <p className="text-text-secondary text-[11px] leading-relaxed">
                                        {fmcStatusData?.testResult?.message || "Operating in telemetry-assisted hybrid mode. All FTD perimeter firewalls in FIREWALL_CONFIG are queried directly via Lina diagnostic CLI."}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="font-bold uppercase tracking-wider text-text-secondary text-[11px]">
                                        Managed FTD Firepower Inventory ({fmcStatusData?.devices?.length || 0})
                                    </div>
                                    <div className="border border-border-color rounded-xl overflow-hidden divide-y divide-border-color/60">
                                        {(fmcStatusData?.devices || []).map((dev: any) => (
                                            <div key={dev.id} className="p-3 flex items-center justify-between hover:bg-bg-surface-hover/30">
                                                <div>
                                                    <div className="font-bold text-text-primary">{dev.name}</div>
                                                    <div className="text-text-secondary text-[11px] font-mono">{dev.model} · {dev.swVersion}</div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-cyan-400 font-mono font-medium">{dev.ip}</div>
                                                    <span className="text-[10px] font-bold text-emerald-400">HEALTHY</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="border-t border-border-color pt-3 flex justify-end">
                            <button
                                onClick={() => setIsFmcModalOpen(false)}
                                className="px-4 py-1.5 rounded-lg bg-bg-surface-hover border border-border-color text-text-primary text-xs font-medium hover:bg-bg-surface transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* S2S Setup & Credential Prompt Modal */}
            <S2sSetupModal
                isOpen={isSetupModalOpen}
                onClose={() => setIsSetupModalOpen(false)}
                onConfigSaved={() => {
                    fetchConfig();
                    fetchTunnels(false);
                }}
                currentConfig={configInfo}
                isInitialPrompt={Boolean(configInfo && !configInfo.isConfigured)}
            />
        </div>
    );
}
