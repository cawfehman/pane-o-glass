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
    Settings2,
    Maximize2,
    Minimize2,
    WrapText
} from "lucide-react";
import { S2sTunnel, S2sTroubleshootResult } from "@/lib/s2s-vpn";
import { S2sSetupModal } from "@/components/vpn/S2sSetupModal";
import { ToolHelp } from "@/components/ToolHelp";

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

    // Live Terminal Console Viewer State
    const [consoleActiveTab, setConsoleActiveTab] = useState<"all" | "ipsec" | "ike" | "route">("all");
    const [isConsoleExpanded, setIsConsoleExpanded] = useState<boolean>(false);
    const [isConsoleWordWrap, setIsConsoleWordWrap] = useState<boolean>(false);
    const [consoleFilterText, setConsoleFilterText] = useState<string>("");

    const rawConsoleText = useMemo(() => {
        if (!activeDiagReport?.liveTelemetric) return "";
        const t = activeDiagReport.liveTelemetric;
        const peer = activeDiagReport.peerIp;

        let text = "";
        if (consoleActiveTab === "all") {
            text = `# show crypto ikev2 sa | include ${peer}\n${t.ikeDetail || "% No IKE SAs found"}\n\n# show crypto ipsec sa peer ${peer}\n${t.ipsecDetail || "% No IPsec SAs found"}\n\n# show route ${peer}\n${t.routeOutput || "% Network not in table"}`;
        } else if (consoleActiveTab === "ipsec") {
            text = `# show crypto ipsec sa peer ${peer}\n${t.ipsecDetail || "% No IPsec SAs found"}`;
        } else if (consoleActiveTab === "ike") {
            text = `# show crypto ikev2 sa | include ${peer}\n${t.ikeDetail || "% No IKE SAs found"}`;
        } else if (consoleActiveTab === "route") {
            text = `# show route ${peer}\n${t.routeOutput || "% Network not in table"}`;
        }

        if (consoleFilterText.trim()) {
            const lines = text.split("\n");
            const q = consoleFilterText.trim().toLowerCase();
            const filtered = lines.filter(line => line.toLowerCase().includes(q) || line.startsWith("#"));
            return filtered.length > 0 ? filtered.join("\n") : `[No lines matched filter "${consoleFilterText}"]\n\n${text}`;
        }

        return text;
    }, [activeDiagReport, consoleActiveTab, consoleFilterText]);

    const consoleLineCount = useMemo(() => rawConsoleText ? rawConsoleText.split("\n").length : 0, [rawConsoleText]);

    // Client-side Pagination States
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("pane_s2s_page_size");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if ([10, 25, 50, 100].includes(parsed)) return parsed;
            }
        }
        return 25;
    });

    const handlePageSizeChange = (size: number) => {
        setPageSize(size);
        setCurrentPage(1);
        try {
            localStorage.setItem("pane_s2s_page_size", size.toString());
        } catch {}
    };

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

    const S2S_STORAGE_KEY = "pane_s2s_vpn_cache";

    // Load cached data from localStorage immediately on mount
    useEffect(() => {
        try {
            const raw = localStorage.getItem(S2S_STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed.tunnels && Array.isArray(parsed.tunnels) && parsed.tunnels.length > 0) {
                    setTunnels(parsed.tunnels);
                    if (parsed.summary) setSummary(parsed.summary);
                    if (parsed.lastUpdated) setLastUpdated(parsed.lastUpdated);
                    // Cached data available: don't show full blank screen spinner
                    setLoading(false);
                    setRefreshing(true);
                }
            }
        } catch (e) {
            console.warn("Failed to load cached S2S VPN tunnels:", e);
        }
    }, []);

    const fetchTunnels = useCallback(async (isBackground = false, forceRefresh = false) => {
        // If we already have tunnels loaded, treat fetch as a subtle background refresh rather than blanking the screen
        if (!isBackground && tunnels.length === 0) {
            setLoading(true);
        } else {
            setRefreshing(true);
        }
        setError(null);
        try {
            const params = new URLSearchParams();
            if (selectedGateway !== "all") params.append("gateway", selectedGateway);
            if (selectedStatus !== "all") params.append("status", selectedStatus);
            if (searchQuery.trim()) params.append("q", searchQuery.trim());
            if (forceRefresh) params.append("refresh", "true");

            const res = await fetch(`/api/vpn/s2s/tunnels?${params.toString()}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${res.status}: Failed to fetch tunnels`);
            }
            const data = await res.json();
            const fetchedTunnels = data.tunnels || [];
            const fetchedSummary = data.summary || null;
            const updateTime = new Date().toLocaleTimeString();

            setTunnels(fetchedTunnels);
            setSummary(fetchedSummary);
            setLastUpdated(updateTime);

            // Persist unfiltered / primary cache when no specific search is active
            if (selectedGateway === "all" && selectedStatus === "all" && !searchQuery.trim()) {
                try {
                    localStorage.setItem(
                        S2S_STORAGE_KEY,
                        JSON.stringify({
                            tunnels: fetchedTunnels,
                            summary: fetchedSummary,
                            lastUpdated: updateTime,
                            timestamp: Date.now()
                        })
                    );
                } catch (e) {
                    console.warn("Failed to save S2S VPN cache:", e);
                }
            }
        } catch (err: any) {
            setError(err.message || "Failed to load S2S VPN tunnels");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedGateway, selectedStatus, searchQuery, tunnels.length]);

    useEffect(() => {
        // Initial fetch or filter change
        fetchTunnels(tunnels.length > 0);
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
        let content = `# Cisco S2S VPN Incident Report
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
`;

        if (report.liveTelemetric) {
            content += `
## Live Active Firewall Telemetry (${report.liveTelemetric.firewallName} - ${report.liveTelemetric.ip})
- **Active Node Prompt:** \`${report.liveTelemetric.prompt}\`
- **Live Packets Encapsulated:** ${report.liveTelemetric.pktsEncaps.toLocaleString()}
- **Live Packets Decapsulated:** ${report.liveTelemetric.pktsDecaps.toLocaleString()}
- **Drop Counters:** ${report.liveTelemetric.sendErrors} send errors / ${report.liveTelemetric.recvErrors} recv errors
- **Local Traffic Selector:** \`${report.liveTelemetric.localIdent || 'None'}\`
- **Remote Traffic Selector:** \`${report.liveTelemetric.remoteIdent || 'None'}\`

### Raw Lina CLI Telemetry
\`\`\`text
# show crypto ikev2 sa | include ${report.peerIp}
${report.liveTelemetric.ikeDetail || '% No SAs found'}

# show crypto ipsec sa peer ${report.peerIp}
${report.liveTelemetric.ipsecDetail || '% No IPsec SAs found'}

# show route ${report.peerIp}
${report.liveTelemetric.routeOutput || '% Network not in table'}
\`\`\`
`;
        }

        content += `
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
        a.download = `vpn-investigation-${report.peerIp.replace(/\./g, "-")}-${Date.now()}.md`;
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

    // Client-side pagination slice
    const totalPages = Math.max(1, Math.ceil(tunnels.length / pageSize));
    const paginatedTunnels = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return tunnels.slice(startIndex, startIndex + pageSize);
    }, [tunnels, currentPage, pageSize]);

    // Reset current page to 1 if out of bounds
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    return (
        <div className="flex flex-col h-full min-h-0 gap-4">
            {/* Upper Fixed Area: Header, Controls, Alerts, Metrics Ribbon, and Filter Toolbar */}
            <div className="shrink-0 flex flex-col gap-4">
                {/* Top Control Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-color pb-4">
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
                                    <ToolHelp toolId="vpn-s2s" />
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

                        {/* Last Updated & Cache Status */}
                        {lastUpdated && (
                            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-color bg-bg-surface text-xs text-text-secondary">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                <span>Updated {lastUpdated}</span>
                            </div>
                        )}

                        {/* Refresh Button */}
                        <button
                            onClick={() => fetchTunnels(false, true)}
                            disabled={loading || refreshing}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-medium transition-all shadow-sm active:scale-95 disabled:opacity-50"
                            title="Force re-sync against live FMC & FTD telemetry"
                        >
                            <RefreshCw size={13} className={refreshing || loading ? "animate-spin" : ""} />
                            <span>{refreshing ? "Syncing..." : "Sync Now"}</span>
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
                    <div className="glass-card p-3.5 rounded-xl border border-border-color bg-bg-surface flex items-center justify-between">
                        <div>
                            <div className="text-[11px] text-text-secondary uppercase font-semibold tracking-wider">Total Tunnels</div>
                            <div className="text-xl font-extrabold text-text-primary mt-0.5">
                                {summary?.total ?? tunnels.length}
                            </div>
                            <div className="text-[10px] text-text-secondary mt-0.5">FTD / FMC Monitored</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            <Network size={18} />
                        </div>
                    </div>

                    <div className="glass-card p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/10 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] text-emerald-400 uppercase font-semibold tracking-wider flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Active (UP)
                            </div>
                            <div className="text-xl font-extrabold text-emerald-300 mt-0.5">
                                {summary?.up ?? tunnels.filter(t => t.status === "UP").length}
                            </div>
                            <div className="text-[10px] text-emerald-400/80 mt-0.5">Passing Encrypted Traffic</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 size={18} />
                        </div>
                    </div>

                    <div className="glass-card p-3.5 rounded-xl border border-amber-500/20 bg-amber-950/10 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] text-amber-400 uppercase font-semibold tracking-wider">Degraded</div>
                            <div className="text-xl font-extrabold text-amber-300 mt-0.5">
                                {summary?.degraded ?? tunnels.filter(t => t.status === "DEGRADED").length}
                            </div>
                            <div className="text-[10px] text-amber-400/80 mt-0.5">One-Way / High Drops</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <AlertTriangle size={18} />
                        </div>
                    </div>

                    <div className="glass-card p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/10 flex items-center justify-between">
                        <div>
                            <div className="text-[11px] text-rose-400 uppercase font-semibold tracking-wider">Down / Failed</div>
                            <div className="text-xl font-extrabold text-rose-300 mt-0.5">
                                {summary?.down ?? tunnels.filter(t => t.status === "DOWN").length}
                            </div>
                            <div className="text-[10px] text-rose-400/80 mt-0.5">Negotiation Faults</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <XCircle size={18} />
                        </div>
                    </div>

                    <div className="glass-card p-3.5 rounded-xl border border-border-color bg-bg-surface flex items-center justify-between col-span-2 md:col-span-1">
                        <div>
                            <div className="text-[11px] text-text-secondary uppercase font-semibold tracking-wider">Encrypted Volume</div>
                            <div className="text-xl font-extrabold text-indigo-400 mt-0.5">
                                {summary?.totalBandwidthGigabytes ?? "0"} <span className="text-xs text-text-secondary font-medium">GB</span>
                            </div>
                            <div className="text-[10px] text-text-secondary mt-0.5">Cumulative Transferred</div>
                        </div>
                        <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            <Activity size={18} />
                        </div>
                    </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-xl border border-border-color bg-bg-surface">
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

                {/* Top Pagination Controls Bar */}
                {!loading && tunnels.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-border-color bg-bg-surface/80 text-xs text-text-secondary">
                        <div className="flex items-center gap-3">
                            <span>
                                Showing <strong className="text-text-primary font-mono">{((currentPage - 1) * pageSize) + 1}</strong> to{" "}
                                <strong className="text-text-primary font-mono">{Math.min(currentPage * pageSize, tunnels.length)}</strong> of{" "}
                                <strong className="text-text-primary font-mono">{tunnels.length}</strong> tunnels
                            </span>

                            <div className="flex items-center gap-1.5">
                                <span>Per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                    className="bg-bg-surface-hover border border-border-color rounded px-2 py-0.5 text-text-primary text-xs outline-none cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-2 py-0.5 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all text-xs"
                            >
                                First
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-2 py-0.5 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all text-xs"
                            >
                                Prev
                            </button>

                            <span className="px-2.5 py-0.5 font-mono text-text-primary">
                                {currentPage} / {totalPages}
                            </span>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-2 py-0.5 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all text-xs"
                            >
                                Next
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage >= totalPages}
                                className="px-2 py-0.5 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all text-xs"
                            >
                                Last
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Scrollable Middle Container: Tunnels List Only */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-2 space-y-3">
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
                        {paginatedTunnels.map((tunnel) => {
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
                                                <span>{diagnosingTunnelId === tunnel.id ? "Investigating..." : "Investigate"}</span>
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

                {/* Pagination Controls Footer */}
                {!loading && tunnels.length > 0 && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 rounded-xl border border-border-color bg-bg-surface text-xs text-text-secondary">
                        <div className="flex items-center gap-3">
                            <span>
                                Showing <strong className="text-text-primary font-mono">{((currentPage - 1) * pageSize) + 1}</strong> to{" "}
                                <strong className="text-text-primary font-mono">{Math.min(currentPage * pageSize, tunnels.length)}</strong> of{" "}
                                <strong className="text-text-primary font-mono">{tunnels.length}</strong> tunnels
                            </span>

                            <div className="flex items-center gap-1.5">
                                <span>Rows per page:</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                    className="bg-bg-surface-hover border border-border-color rounded px-2 py-0.5 text-text-primary text-xs outline-none cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-2.5 py-1 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all"
                            >
                                First
                            </button>
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="px-2.5 py-1 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all"
                            >
                                Prev
                            </button>

                            <span className="px-3 py-1 font-mono text-text-primary">
                                {currentPage} / {totalPages}
                            </span>

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-2.5 py-1 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all"
                            >
                                Next
                            </button>
                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage >= totalPages}
                                className="px-2.5 py-1 rounded border border-border-color bg-bg-surface hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-text-primary font-medium transition-all"
                            >
                                Last
                            </button>
                        </div>
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
                                            <span>Live S2S Tunnel Investigation</span>
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

                        {/* Live Lina Telemetry from Active Firewall */}
                        {activeDiagReport.liveTelemetric && (
                            <div className="p-4 rounded-xl border border-cyan-500/40 bg-cyan-950/20 space-y-3.5">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <Terminal size={16} className="text-cyan-400" />
                                        <span className="font-bold text-sm text-text-primary">
                                            Live Lina Telemetry from <span className="text-cyan-300 font-mono">{activeDiagReport.liveTelemetric.firewallName}</span>
                                        </span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                            Active Node ({activeDiagReport.liveTelemetric.ip})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-[11px] font-mono text-text-secondary bg-black/50 px-2 py-0.5 rounded border border-border-color">
                                            Prompt: <span className="text-cyan-300 font-bold">{activeDiagReport.liveTelemetric.prompt.trim()}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Live Counters Ribbon */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div className="p-2.5 rounded-lg bg-bg-surface/80 border border-border-color">
                                        <div className="text-[10px] text-text-secondary uppercase">Live Encaps pkts</div>
                                        <div className="font-mono text-emerald-400 font-bold text-sm">
                                            {activeDiagReport.liveTelemetric.pktsEncaps.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-bg-surface/80 border border-border-color">
                                        <div className="text-[10px] text-text-secondary uppercase">Live Decaps pkts</div>
                                        <div className="font-mono text-cyan-400 font-bold text-sm">
                                            {activeDiagReport.liveTelemetric.pktsDecaps.toLocaleString()}
                                        </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-bg-surface/80 border border-border-color">
                                        <div className="text-[10px] text-text-secondary uppercase">Send / Recv Drops</div>
                                        <div className={`font-mono font-bold text-sm ${(activeDiagReport.liveTelemetric.sendErrors + activeDiagReport.liveTelemetric.recvErrors) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                            {activeDiagReport.liveTelemetric.sendErrors} / {activeDiagReport.liveTelemetric.recvErrors}
                                        </div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-bg-surface/80 border border-border-color">
                                        <div className="text-[10px] text-text-secondary uppercase">Traffic Selectors</div>
                                        <div className="font-mono text-text-primary text-[11px] truncate" title={`${activeDiagReport.liveTelemetric.localIdent} <-> ${activeDiagReport.liveTelemetric.remoteIdent}`}>
                                            {activeDiagReport.liveTelemetric.localIdent ? "Matched & Active" : "No Active SA"}
                                        </div>
                                    </div>
                                </div>

                                {/* Real Live Raw CLI Terminal Console */}
                                <div className="rounded-xl border border-cyan-500/30 bg-zinc-950 shadow-2xl overflow-hidden flex flex-col">
                                    {/* Terminal Toolbar: Tabs & Controls */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/80 border-b border-border-color/80 text-xs">
                                        {/* Sub-Tabs */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setConsoleActiveTab("all")}
                                                className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-all ${
                                                    consoleActiveTab === "all"
                                                        ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                                                        : "text-text-secondary hover:text-text-primary hover:bg-zinc-800/60"
                                                }`}
                                            >
                                                All Telemetry
                                            </button>
                                            <button
                                                onClick={() => setConsoleActiveTab("ipsec")}
                                                className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-all ${
                                                    consoleActiveTab === "ipsec"
                                                        ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                                                        : "text-text-secondary hover:text-text-primary hover:bg-zinc-800/60"
                                                }`}
                                            >
                                                IPsec SAs
                                            </button>
                                            <button
                                                onClick={() => setConsoleActiveTab("ike")}
                                                className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-all ${
                                                    consoleActiveTab === "ike"
                                                        ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                                                        : "text-text-secondary hover:text-text-primary hover:bg-zinc-800/60"
                                                }`}
                                            >
                                                IKEv2 SA
                                            </button>
                                            <button
                                                onClick={() => setConsoleActiveTab("route")}
                                                className={`px-2.5 py-1 rounded-md font-mono text-[11px] transition-all ${
                                                    consoleActiveTab === "route"
                                                        ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/40"
                                                        : "text-text-secondary hover:text-text-primary hover:bg-zinc-800/60"
                                                }`}
                                            >
                                                Routing Path
                                            </button>
                                        </div>

                                        {/* Controls: Search, Wrap, Expand, Copy */}
                                        <div className="flex items-center gap-2">
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={consoleFilterText}
                                                    onChange={(e) => setConsoleFilterText(e.target.value)}
                                                    placeholder="Filter lines..."
                                                    className="w-28 sm:w-36 px-2 py-0.5 text-[11px] rounded bg-zinc-900 border border-border-color text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-cyan-500/50 font-mono"
                                                />
                                                {consoleFilterText && (
                                                    <button
                                                        onClick={() => setConsoleFilterText("")}
                                                        className="absolute right-1 top-1 text-text-secondary hover:text-text-primary text-[10px]"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => setIsConsoleWordWrap(!isConsoleWordWrap)}
                                                title={isConsoleWordWrap ? "Disable word wrap" : "Enable word wrap"}
                                                className={`p-1.5 rounded border transition-all ${
                                                    isConsoleWordWrap
                                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                        : "border-border-color text-text-secondary hover:text-text-primary hover:bg-zinc-800"
                                                }`}
                                            >
                                                <WrapText size={13} />
                                            </button>

                                            <button
                                                onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
                                                title={isConsoleExpanded ? "Collapse console height" : "Expand console height"}
                                                className={`p-1.5 rounded border transition-all ${
                                                    isConsoleExpanded
                                                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                                        : "border-border-color text-text-secondary hover:text-text-primary hover:bg-zinc-800"
                                                }`}
                                            >
                                                {isConsoleExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                                            </button>

                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(rawConsoleText);
                                                    setCopiedCli(true);
                                                    setTimeout(() => setCopiedCli(false), 2000);
                                                }}
                                                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-border-color hover:bg-zinc-800 text-cyan-400 hover:text-cyan-300 text-[11px] font-mono transition-all"
                                            >
                                                {copiedCli ? <Check size={12} /> : <Copy size={12} />}
                                                <span>{copiedCli ? "Copied" : "Copy"}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Dedicated Scroll Container */}
                                    <div className={`relative transition-all duration-200 ${isConsoleExpanded ? "h-[540px]" : "h-[340px]"}`}>
                                        <pre className={`w-full h-full p-4 overflow-y-auto overflow-x-auto overscroll-contain select-text font-mono text-[12px] leading-relaxed text-emerald-400 bg-black/95 ${
                                            isConsoleWordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"
                                        }`}>
                                            {rawConsoleText || "% No live telemetry available for this command selection."}
                                        </pre>
                                    </div>

                                    {/* Terminal Status Footer */}
                                    <div className="flex items-center justify-between px-3 py-1.5 bg-black/90 border-t border-border-color/60 text-[11px] font-mono text-text-secondary">
                                        <div className="flex items-center gap-3">
                                            <span className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                <span className="text-text-primary">Live Lina Session</span>
                                            </span>
                                            <span>·</span>
                                            <span>Lines: <strong className="text-text-primary">{consoleLineCount}</strong></span>
                                            {consoleFilterText && (
                                                <span className="text-amber-300">
                                                    (Filtered by: "{consoleFilterText}")
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <span>Target: <strong className="text-cyan-300">{activeDiagReport.liveTelemetric.firewallName}</strong></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

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
