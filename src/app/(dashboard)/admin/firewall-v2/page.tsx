"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Shield,
    ShieldAlert,
    ShieldCheck,
    Server,
    RefreshCw,
    Search,
    AlertTriangle,
    Globe,
    Activity,
    CheckCircle2,
    XCircle,
    Terminal,
    User,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Clock,
    Zap,
    Lock,
    Database,
    Filter
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ShunDatabaseTab } from "@/components/firewall/ShunDatabaseTab";

interface FirewallHost {
    id: string;
    name: string;
    ip: string;
}

interface FleetNodeStatus {
    firewallId: string;
    firewallName: string;
    ip: string;
    success: boolean;
    prompt?: string;
    summary?: string;
    output?: string;
    error?: string;
}

interface IpScanResult {
    targetIp: string;
    isPrivate: boolean;
    geoInfo?: {
        asn?: string;
        as_name?: string;
        country?: string;
        country_code?: string;
    } | null;
    vpnSessions: Array<{
        username: string;
        status: string;
        vpnStream: string | null;
        createdAt: string;
        adDisplayName: string | null;
    }>;
    blacklistEntry?: {
        reason: string;
        createdAt: string;
    } | null;
    guardianHistory: Array<{
        action: string;
        reason?: string | null;
        details?: string | null;
        createdAt: string;
    }>;
    fleetResults: Array<{
        firewallId: string;
        firewallName: string;
        ip: string;
        success: boolean;
        isShunned?: boolean;
        output?: string;
        error?: string;
    }>;
}

interface ClusterGroup<T> {
    clusterId: string;
    clusterName: string;
    siteCode: string;
    primary?: T;
    secondary?: T;
    others: T[];
}

function groupNodesByCluster<T extends { firewallId?: string; id?: string; name?: string; firewallName?: string }>(items: T[]): ClusterGroup<T>[] {
    const wilmington: ClusterGroup<T> = {
        clusterId: "wilmington",
        clusterName: "Wilmington Cluster (Connect)",
        siteCode: "WILM",
        others: []
    };
    const keleman: ClusterGroup<T> = {
        clusterId: "keleman",
        clusterName: "Keleman Cluster (Reconnect)",
        siteCode: "KEL",
        others: []
    };
    const other: ClusterGroup<T> = {
        clusterId: "other",
        clusterName: "Other Perimeter Firewalls",
        siteCode: "OTHER",
        others: []
    };

    for (const item of items) {
        const id = (item.firewallId || item.id || "").toLowerCase();
        const name = (item.firewallName || item.name || "").toLowerCase();

        if (id === "fw1" || (name.includes("wilmington") && name.includes("primary"))) {
            wilmington.primary = item;
        } else if (id === "fw2" || (name.includes("wilmington") && name.includes("secondary"))) {
            wilmington.secondary = item;
        } else if (id === "fw3" || (name.includes("keleman") && name.includes("primary"))) {
            keleman.primary = item;
        } else if (id === "fw4" || (name.includes("keleman") && name.includes("secondary"))) {
            keleman.secondary = item;
        } else if (name.includes("wilmington")) {
            if (!wilmington.primary) wilmington.primary = item;
            else if (!wilmington.secondary) wilmington.secondary = item;
            else wilmington.others.push(item);
        } else if (name.includes("keleman")) {
            if (!keleman.primary) keleman.primary = item;
            else if (!keleman.secondary) keleman.secondary = item;
            else keleman.others.push(item);
        } else {
            other.others.push(item);
        }
    }

    return [
        wilmington,
        keleman,
        ...(other.primary || other.secondary || other.others.length > 0 ? [other] : [])
    ].filter(c => c.primary || c.secondary || c.others.length > 0);
}

export default function FtdOperationsPage() {
    const [hosts, setHosts] = useState<FirewallHost[]>([]);
    const [fleetStatuses, setFleetStatuses] = useState<FleetNodeStatus[]>([]);
    const [loadingFleet, setLoadingFleet] = useState(false);
    const [fleetLastUpdated, setFleetLastUpdated] = useState<string | null>(null);

    // Active Navigation Tab
    const [activeTab, setActiveTab] = useState<"audit" | "live_inventory" | "shun_db" | "guardian" | "history">("audit");

    // Search / Audit State
    const [searchIp, setSearchIp] = useState("");
    const [targetSelection, setTargetSelection] = useState<string>("fleet");
    const [scanningIp, setScanningIp] = useState(false);
    const [scanResult, setScanResult] = useState<IpScanResult | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);

    // Safe Dry-Run switch
    const [isDryRun, setIsDryRun] = useState(true);

    // Action Execution
    const [actionExecuting, setActionExecuting] = useState(false);
    const [actionMessage, setActionMessage] = useState<{ text: string; isError?: boolean } | null>(null);
    const [expandedCli, setExpandedCli] = useState<Record<string, boolean>>({});

    // Live Shun Tab State
    const [loadingLiveShuns, setLoadingLiveShuns] = useState(false);
    const [liveShunsData, setLiveShunsData] = useState<any[]>([]);

    // Guardian Tab State
    const [guardianEvents, setGuardianEvents] = useState<any[]>([]);
    const [loadingGuardian, setLoadingGuardian] = useState(false);
    const [guardianSearch, setGuardianSearch] = useState("");
    const [guardianActionFilter, setGuardianActionFilter] = useState("");
    const [guardianStatus, setGuardianStatus] = useState<any>(null);

    // History Tab State
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Confirmation Modal
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        actionType: "shun" | "unshun";
        targetNode: string;
        targetIp: string;
    }>({
        isOpen: false,
        title: "",
        message: "",
        actionType: "unshun",
        targetNode: "fleet",
        targetIp: ""
    });

    // 1. Fetch configured hosts
    useEffect(() => {
        fetch("/api/firewall/v2?action=hosts")
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data?.hosts)) {
                    setHosts(data.hosts);
                }
            })
            .catch(() => {});
    }, []);

    // 2. Fetch fleet status on-demand (saves to sessionStorage so navigating between tools is instant)
    const refreshFleetStatus = useCallback(async () => {
        setLoadingFleet(true);
        try {
            const res = await fetch("/api/firewall/v2?action=fleet_status&target=fleet");
            const data = await res.json();
            if (data.results && Array.isArray(data.results)) {
                setFleetStatuses(data.results);
                const timeStr = new Date().toLocaleTimeString();
                setFleetLastUpdated(timeStr);
                try {
                    sessionStorage.setItem("pane-o-glass.ftd-fleet-status", JSON.stringify(data.results));
                    sessionStorage.setItem("pane-o-glass.ftd-fleet-time", timeStr);
                } catch {}
            }
        } catch (e) {
            console.error("Failed to load fleet status", e);
        } finally {
            setLoadingFleet(false);
        }
    }, []);

    // Restore cached fleet test from current session if available (never auto-query SSH on page load/switch!)
    useEffect(() => {
        try {
            const cached = sessionStorage.getItem("pane-o-glass.ftd-fleet-status");
            const cachedTime = sessionStorage.getItem("pane-o-glass.ftd-fleet-time");
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setFleetStatuses(parsed);
                    if (cachedTime) setFleetLastUpdated(cachedTime);
                }
            }
        } catch {}
    }, []);

    // 3. Scan specific IP across fleet
    const handleScanIp = async (targetIpOverride?: string) => {
        const ipToScan = (targetIpOverride || searchIp).trim();
        if (!ipToScan) return;

        setScanningIp(true);
        setScanError(null);
        setActionMessage(null);

        try {
            const res = await fetch(`/api/firewall/v2?action=check_ip&ip=${encodeURIComponent(ipToScan)}&target=${targetSelection}`);
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to scan IP across fleet");
            }
            setScanResult(data);
        } catch (err: any) {
            setScanError(err.message || "Error scanning IP");
        } finally {
            setScanningIp(false);
        }
    };

    // 4. Fetch live shuns table
    const handleFetchLiveShuns = async () => {
        setLoadingLiveShuns(true);
        try {
            const res = await fetch(`/api/firewall/v2?action=live_shuns&target=fleet`);
            const data = await res.json();
            if (data.results && Array.isArray(data.results)) {
                setLiveShunsData(data.results);
            }
        } catch (e) {
            console.error("Failed to fetch live shuns", e);
        } finally {
            setLoadingLiveShuns(false);
        }
    };

    // 5. Fetch Guardian events
    const fetchGuardianEvents = useCallback(async () => {
        setLoadingGuardian(true);
        try {
            const query = new URLSearchParams();
            if (guardianSearch) query.append("search", guardianSearch);
            if (guardianActionFilter) query.append("action", guardianActionFilter);
            query.append("limit", "100");
            const res = await fetch(`/api/firewall/guardian?${query.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setGuardianEvents(data.events || []);
            }
        } catch (e) {
            console.error("Failed to fetch guardian events", e);
        } finally {
            setLoadingGuardian(false);
        }
    }, [guardianSearch, guardianActionFilter]);

    // 6. Fetch Operation History
    const fetchHistoryLogs = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch("/api/firewall/history");
            if (res.ok) {
                const data = await res.json();
                setHistoryLogs(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failed to fetch history logs", e);
        } finally {
            setLoadingHistory(false);
        }
    }, []);

    // Fetch tab data on tab switch
    useEffect(() => {
        if (activeTab === "guardian") {
            fetchGuardianEvents();
            fetch("/api/health/guardian")
                .then(res => res.json())
                .then(d => setGuardianStatus(d))
                .catch(() => {});
        } else if (activeTab === "history") {
            fetchHistoryLogs();
        }
    }, [activeTab, fetchGuardianEvents, fetchHistoryLogs]);

    // 7. Execute Mutation (Shun or Unshun)
    const executeAction = async (action: "shun" | "unshun", targetIp: string, targetNode: string) => {
        setActionExecuting(true);
        setActionMessage(null);

        try {
            const res = await fetch("/api/firewall/v2", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action,
                    ip: targetIp,
                    target: targetNode,
                    dryRun: isDryRun
                })
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || `Failed to execute ${action}`);
            }

            const modeLabel = isDryRun ? "Simulated (Dry-Run)" : "Successfully applied";
            setActionMessage({
                text: `${modeLabel} ${action.toUpperCase()} for ${targetIp} on ${targetNode === "fleet" ? "all firewalls" : targetNode}.`
            });

            // Re-scan IP if live mutation was performed to refresh the matrix
            if (!isDryRun) {
                handleScanIp(targetIp);
            }
        } catch (err: any) {
            setActionMessage({ text: err.message || `Failed to execute ${action}`, isError: true });
        } finally {
            setActionExecuting(false);
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
        }
    };

    const triggerActionConfirm = (action: "shun" | "unshun", targetIp: string, targetNode: string) => {
        const nodeLabel = targetNode === "fleet" ? "ALL 4 FTD firewalls" : `firewall node ${targetNode}`;
        const modeLabel = isDryRun ? "SIMULATE" : "EXECUTE LIVE";
        setConfirmModal({
            isOpen: true,
            title: `${modeLabel}: ${action === "unshun" ? "Remove Shun" : "Apply Shun"} (${targetIp})`,
            message: isDryRun
                ? `You are in Safe Dry-Run Mode. This will simulate sending '${action === "unshun" ? "no shun" : "shun"} ${targetIp}' across ${nodeLabel} without making changes to hardware.`
                : `WARNING: You are in LIVE EXECUTION MODE. This will immediately execute '${action === "unshun" ? "no shun" : "shun"} ${targetIp}' on ${nodeLabel}. Are you sure you wish to proceed?`,
            actionType: action,
            targetNode,
            targetIp
        });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
                            <Shield className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-white tracking-tight">
                                    Cisco FTD Perimeter Defense Operations
                                </h1>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    V2 PREVIEW · ADMIN ONLY
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Real-time parallel Netmiko engine for Cisco Firepower Threat Defense (FTD 7.2+) and Lina diagnostic sub-shells.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Safe Dry-Run Switch */}
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-bold block">Safety Guardrail</span>
                            <span className={`text-xs font-bold ${isDryRun ? "text-emerald-400" : "text-rose-400"}`}>
                                {isDryRun ? "Safe Dry-Run Mode" : "LIVE MUTATIONS ON"}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsDryRun(!isDryRun)}
                            className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                                isDryRun ? "bg-emerald-600 justify-start" : "bg-rose-600 justify-end"
                            }`}
                            title={isDryRun ? "Switch to Live Hardware Mode" : "Switch to Safe Dry-Run Simulation"}
                        >
                            <div className="w-4 h-4 rounded-full bg-white shadow-md transform transition" />
                        </button>
                    </div>

                    {/* Refresh Fleet Button */}
                    <button
                        type="button"
                        onClick={refreshFleetStatus}
                        disabled={loadingFleet}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingFleet ? "animate-spin text-blue-400" : ""}`} />
                        <span>{loadingFleet ? "Testing Fleet..." : fleetStatuses.length === 0 ? "Test Connectivity" : "Re-test Fleet"}</span>
                    </button>
                </div>
            </div>

            {/* Fleet Status Strip */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-blue-400" />
                        Perimeter FTD Fleet Connectivity
                    </span>
                    {fleetLastUpdated ? (
                        <span>Last verified: {fleetLastUpdated}</span>
                    ) : (
                        <span className="text-slate-500 italic">Click &quot;Test Connectivity&quot; to verify live SSH links</span>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groupNodesByCluster(hosts).map((cluster) => {
                        const nodes = [
                            cluster.primary ? { node: cluster.primary, role: "Primary Node" } : null,
                            cluster.secondary ? { node: cluster.secondary, role: "Secondary Node" } : null,
                            ...cluster.others.map(o => ({ node: o, role: "Member Node" }))
                        ].filter(Boolean) as { node: FirewallHost; role: string }[];

                        return (
                            <div
                                key={cluster.clusterId}
                                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md space-y-3"
                            >
                                <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                                    <div className="flex items-center gap-2">
                                        <Server className="w-4 h-4 text-blue-400" />
                                        <h4 className="text-xs font-bold text-white">{cluster.clusterName}</h4>
                                    </div>
                                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                                        HA Pair Stack
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {nodes.map(({ node, role }) => {
                                        const status = fleetStatuses.find(s => s.firewallId === node.id || s.ip === node.ip);
                                        const hasRun = status !== undefined;
                                        const isConnected = status?.success;
                                        const isChecking = loadingFleet;

                                        return (
                                            <div
                                                key={node.id}
                                                className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 hover:border-slate-700 transition flex items-center justify-between gap-3"
                                            >
                                                <div className="min-w-0 flex items-center gap-2.5">
                                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                                                        role === "Primary Node"
                                                            ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                                                            : "bg-slate-800 text-slate-300 border-slate-700"
                                                    }`}>
                                                        {role}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <h5 className="text-xs font-bold text-white truncate" title={node.name}>
                                                            {node.name}
                                                        </h5>
                                                        <div className="flex items-center gap-2 text-[11px] font-mono">
                                                            <span className="text-cyan-400">{node.ip}</span>
                                                            {status?.prompt && (
                                                                <span className="text-slate-500">
                                                                    · CLI: <span className="text-emerald-400 font-bold">{status.prompt}</span>
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                                                    isChecking
                                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                                                        : !hasRun
                                                        ? "bg-slate-800 text-slate-400 border-slate-700"
                                                        : isConnected
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                                        isChecking
                                                            ? "bg-blue-400 animate-pulse"
                                                            : !hasRun
                                                            ? "bg-slate-500"
                                                            : isConnected
                                                            ? "bg-emerald-400"
                                                            : "bg-rose-400"
                                                    }`} />
                                                    {isChecking ? "Testing..." : !hasRun ? "Configured" : isConnected ? "Online" : "Unreachable"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-800 pt-2 overflow-x-auto">
                {[
                    { id: "audit", label: "Global IP Fleet Audit", icon: Search },
                    { id: "live_inventory", label: "Live FTD Hardware Shuns", icon: Activity },
                    { id: "shun_db", label: "Shun Database & Snapshots", icon: Database },
                    { id: "guardian", label: "Guardian Intelligence & Auto-Unshuns", icon: ShieldAlert },
                    { id: "history", label: "Operations History", icon: Clock },
                ].map((t) => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.id;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                                setActiveTab(t.id as any);
                                if (t.id === "live_inventory" && liveShunsData.length === 0) handleFetchLiveShuns();
                            }}
                            className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition -mb-[1px] cursor-pointer whitespace-nowrap ${
                                isActive
                                    ? "text-blue-400 border-blue-500 bg-slate-900/40"
                                    : "text-slate-400 border-transparent hover:text-slate-200"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{t.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* TAB 1: GLOBAL IP AUDIT & ACTIONS */}
            {activeTab === "audit" && (
                <div className="space-y-6">
                    {/* Search & Audit Bar */}
                    <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                        <form onSubmit={(e) => { e.preventDefault(); handleScanIp(); }} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchIp}
                                    onChange={(e) => setSearchIp(e.target.value.trim())}
                                    placeholder="Enter public IPv4 address to audit across all 4 FTD firewalls (e.g. 198.51.100.42)..."
                                    className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <select
                                    value={targetSelection}
                                    onChange={(e) => setTargetSelection(e.target.value)}
                                    className="bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
                                >
                                    <option value="fleet">⚡ All 4 Firewalls (Parallel Fleet)</option>
                                    {hosts.map(h => (
                                        <option key={h.id} value={h.id}>{h.name}</option>
                                    ))}
                                </select>

                                <button
                                    type="submit"
                                    disabled={scanningIp || !searchIp.trim()}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/20 transition flex items-center gap-2 cursor-pointer"
                                >
                                    {scanningIp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                                    <span>{scanningIp ? "Scanning Fleet..." : "Audit Fleet"}</span>
                                </button>
                            </div>
                        </form>

                        {scanError && (
                            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                                <span>{scanError}</span>
                            </div>
                        )}

                        {actionMessage && (
                            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                                actionMessage.isError
                                    ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            }`}>
                                {actionMessage.isError ? <XCircle className="w-4 h-4 shrink-0 text-rose-400" /> : <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
                                <span>{actionMessage.text}</span>
                            </div>
                        )}
                    </div>

                    {/* Scan Results */}
                    {scanResult && (
                        <div className="space-y-6">
                            {/* Context & Safety Intelligence Banner */}
                            <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 shadow-lg">
                                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                                    <div className="flex items-center gap-2.5">
                                        <Globe className="w-5 h-5 text-blue-400" />
                                        <div>
                                            <h3 className="text-sm font-bold text-white font-mono flex items-center gap-2">
                                                {scanResult.targetIp}
                                                {scanResult.isPrivate && (
                                                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-sans">
                                                        RFC1918 Private Range
                                                    </span>
                                                )}
                                            </h3>
                                            <p className="text-xs text-slate-400">
                                                {scanResult.geoInfo?.country || "Unknown Country"} · {scanResult.geoInfo?.as_name || scanResult.geoInfo?.asn || "Autonomous System Unspecified"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Fleet Action Buttons */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => triggerActionConfirm("unshun", scanResult.targetIp, targetSelection)}
                                            disabled={actionExecuting}
                                            className="px-3.5 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <ShieldCheck className="w-4 h-4" />
                                            <span>Unshun {targetSelection === "fleet" ? "Across Fleet" : "on Node"}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => triggerActionConfirm("shun", scanResult.targetIp, targetSelection)}
                                            disabled={actionExecuting}
                                            className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <ShieldAlert className="w-4 h-4" />
                                            <span>Shun {targetSelection === "fleet" ? "Across Fleet" : "on Node"}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* AnyConnect VPN Correlation Warning */}
                                {scanResult.vpnSessions.length > 0 && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs space-y-1">
                                        <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                            <User className="w-4 h-4" />
                                            <span>Legitimate VPN User Correlation Detected!</span>
                                        </div>
                                        <p className="text-slate-300">
                                            This IP address was recently used for AnyConnect VPN authentication by{" "}
                                            <span className="font-bold text-white">{scanResult.vpnSessions[0].username}</span>
                                            {scanResult.vpnSessions[0].adDisplayName && ` (${scanResult.vpnSessions[0].adDisplayName})`} on{" "}
                                            {new Date(scanResult.vpnSessions[0].createdAt).toLocaleDateString()} via{" "}
                                            <span className="font-mono text-cyan-300">{scanResult.vpnSessions[0].vpnStream || "VPN"}</span>.
                                            Take caution before shunning to avoid locking out legitimate staff.
                                        </p>
                                    </div>
                                )}

                                {/* Guardian Blacklist Indicator */}
                                {scanResult.blacklistEntry && (
                                    <div className="p-3 bg-rose-950/40 border border-rose-800/40 rounded-xl text-xs space-y-0.5">
                                        <div className="font-bold text-rose-300 flex items-center gap-1.5">
                                            <Lock className="w-3.5 h-3.5 text-rose-400" />
                                            <span>Listed on Guardian Safety Blacklist</span>
                                        </div>
                                        <p className="text-slate-400">
                                            Reason: <span className="text-slate-200">{scanResult.blacklistEntry.reason}</span>
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Parallel Fleet Matrix */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                    Firewall Node Status Matrix ({scanResult.fleetResults.length} Nodes Queried)
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {groupNodesByCluster(scanResult.fleetResults).map((cluster) => {
                                        const nodes = [
                                            cluster.primary ? { node: cluster.primary, role: "Primary Node" } : null,
                                            cluster.secondary ? { node: cluster.secondary, role: "Secondary Node" } : null,
                                            ...cluster.others.map(o => ({ node: o, role: "Member Node" }))
                                        ].filter(Boolean) as { node: (typeof scanResult.fleetResults)[0]; role: string }[];

                                        const primaryShunned = cluster.primary?.isShunned;
                                        const secondaryShunned = cluster.secondary?.isShunned;
                                        const hasError = nodes.some(n => !n.node.success);

                                        let clusterBadge = { 
                                            text: "NOT SHUNNED", 
                                            badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", 
                                            dotClass: "bg-emerald-400" 
                                        };

                                        if (hasError) {
                                            clusterBadge = { 
                                                text: "NODE ERROR", 
                                                badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40", 
                                                dotClass: "bg-amber-400" 
                                            };
                                        } else if (primaryShunned && secondaryShunned) {
                                            clusterBadge = { 
                                                text: "BOTH NODES SHUNNED", 
                                                badgeClass: "bg-rose-500/20 text-rose-300 border-rose-500/40", 
                                                dotClass: "bg-rose-400" 
                                            };
                                        } else if (primaryShunned || secondaryShunned) {
                                            clusterBadge = { 
                                                text: "ASYMMETRIC SHUN (1 NODE)", 
                                                badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40", 
                                                dotClass: "bg-amber-400" 
                                            };
                                        }

                                        return (
                                            <div
                                                key={cluster.clusterId}
                                                className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3.5"
                                            >
                                                {/* Cluster Header */}
                                                <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                                                    <div className="flex items-center gap-2">
                                                        <Server className="w-4 h-4 text-blue-400" />
                                                        <h5 className="text-xs font-bold text-white tracking-wide">
                                                            {cluster.clusterName}
                                                        </h5>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${clusterBadge.badgeClass}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full ${clusterBadge.dotClass}`} />
                                                        {clusterBadge.text}
                                                    </span>
                                                </div>

                                                {/* Stacked HA Nodes */}
                                                <div className="space-y-3">
                                                    {nodes.map(({ node, role }) => {
                                                        const isShunned = node.isShunned;
                                                        const isExpanded = expandedCli[node.firewallId];

                                                        return (
                                                            <div
                                                                key={node.firewallId}
                                                                className={`p-3.5 rounded-xl border transition ${
                                                                    !node.success
                                                                        ? "bg-slate-950/60 border-slate-800"
                                                                        : isShunned
                                                                        ? "bg-rose-950/20 border-rose-500/40"
                                                                        : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700"
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-2 pb-2">
                                                                    <div className="flex items-start gap-2.5">
                                                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 mt-0.5 ${
                                                                            role === "Primary Node"
                                                                                ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                                                                                : "bg-slate-800 text-slate-300 border-slate-700"
                                                                        }`}>
                                                                            {role}
                                                                        </span>
                                                                        <div>
                                                                            <h6 className="text-xs font-bold text-white">{node.firewallName}</h6>
                                                                            <span className="text-[11px] font-mono text-cyan-400">{node.ip}</span>
                                                                        </div>
                                                                    </div>
                                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shrink-0 ${
                                                                        !node.success 
                                                                            ? "bg-slate-800 text-slate-400 border-slate-700" 
                                                                            : isShunned 
                                                                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40" 
                                                                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                                    }`}>
                                                                        <span className={`w-2 h-2 rounded-full ${
                                                                            !node.success ? "bg-slate-400" : isShunned ? "bg-rose-400" : "bg-emerald-400"
                                                                        }`} />
                                                                        {!node.success ? "Error" : isShunned ? "SHUNNED" : "NOT SHUNNED"}
                                                                    </span>
                                                                </div>

                                                                {/* Node Action Buttons */}
                                                                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedCli(prev => ({ ...prev, [node.firewallId]: !prev[node.firewallId] }))}
                                                                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition cursor-pointer"
                                                                    >
                                                                        <Terminal className="w-3 h-3 text-blue-400" />
                                                                        <span>{isExpanded ? "Hide CLI Output" : "View CLI Output"}</span>
                                                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                    </button>

                                                                    <div className="flex items-center gap-1.5">
                                                                        {isShunned ? (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => triggerActionConfirm("unshun", scanResult.targetIp, node.firewallId)}
                                                                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
                                                                            >
                                                                                Unshun Node
                                                                            </button>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => triggerActionConfirm("shun", scanResult.targetIp, node.firewallId)}
                                                                                className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition cursor-pointer"
                                                                            >
                                                                                Shun Node
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* Raw CLI Drawer */}
                                                                {isExpanded && (
                                                                    <div className="mt-3 p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre-wrap">
                                                                        {node.output || node.error || "No command output recorded."}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: LIVE SHUNS TABLE */}
            {activeTab === "live_inventory" && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Real-time snapshot of active dynamic shuns pulled directly from all 4 FTD firewalls via Netmiko.
                        </p>
                        <button
                            type="button"
                            onClick={handleFetchLiveShuns}
                            disabled={loadingLiveShuns}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingLiveShuns ? "animate-spin" : ""}`} />
                            <span>{loadingLiveShuns ? "Polling Firewalls..." : "Poll Active Shuns"}</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {groupNodesByCluster(liveShunsData).map((cluster) => {
                            const nodes = [
                                cluster.primary ? { node: cluster.primary, role: "Primary Node" } : null,
                                cluster.secondary ? { node: cluster.secondary, role: "Secondary Node" } : null,
                                ...cluster.others.map(o => ({ node: o, role: "Member Node" }))
                            ].filter(Boolean) as { node: any; role: string }[];

                            const totalShuns = nodes.reduce((acc, n) => acc + (n.node.shunCount ?? 0), 0);

                            return (
                                <div key={cluster.clusterId} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3.5">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
                                        <div className="flex items-center gap-2">
                                            <Server className="w-4 h-4 text-blue-400" />
                                            <h4 className="text-xs font-bold text-white tracking-wide">{cluster.clusterName}</h4>
                                        </div>
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                            {totalShuns} Total Cluster Shuns
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {nodes.map(({ node, role }) => (
                                            <div key={node.firewallId} className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${
                                                            role === "Primary Node"
                                                                ? "bg-blue-500/10 text-blue-300 border-blue-500/30"
                                                                : "bg-slate-800 text-slate-300 border-slate-700"
                                                        }`}>
                                                            {role}
                                                        </span>
                                                        <div>
                                                            <h5 className="text-xs font-bold text-white">{node.firewallName}</h5>
                                                            <span className="text-[11px] font-mono text-cyan-400">{node.ip}</span>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                                                        {node.shunCount ?? 0} active
                                                    </span>
                                                </div>

                                                <div className="max-h-48 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                                                    {Array.isArray(node.shunnedIps) && node.shunnedIps.length > 0 ? (
                                                        node.shunnedIps.map((ip: string) => (
                                                            <div
                                                                key={ip}
                                                                className="flex items-center justify-between px-2.5 py-1 bg-slate-900 rounded border border-slate-800 hover:border-slate-700 transition"
                                                            >
                                                                <span>{ip}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSearchIp(ip);
                                                                        setActiveTab("audit");
                                                                        handleScanIp(ip);
                                                                    }}
                                                                    className="text-[10px] text-blue-400 hover:text-blue-300 font-sans font-semibold cursor-pointer"
                                                                >
                                                                    Audit / Unshun →
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <p className="text-slate-500 text-[11px] py-2 text-center">
                                                            {node.success ? "No active shuns on this node." : (node.error || "Failed to poll node.")}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* TAB 3: SHUN DATABASE & SNAPSHOTS */}
            {activeTab === "shun_db" && (
                <div className="space-y-4">
                    <ShunDatabaseTab />
                </div>
            )}

            {/* TAB 4: GUARDIAN THREAT INTELLIGENCE & AUTO-UNSHUNS */}
            {activeTab === "guardian" && (
                <div className="space-y-4">
                    {/* Guardian Health Status */}
                    {guardianStatus && (
                        <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-xl border ${
                                    guardianStatus.isLive 
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                }`}>
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-white">Guardian Safety Engine</h4>
                                    <p className="text-slate-400">
                                        Status: <span className="font-semibold text-emerald-400">{guardianStatus.status || "ACTIVE"}</span> · Last Scan: {guardianStatus.lastRun ? new Date(guardianStatus.lastRun).toLocaleTimeString() : "Recent"}
                                    </p>
                                </div>
                            </div>
                            <span className="text-slate-400">
                                Monitored Watchlist: <span className="font-mono text-white">{guardianStatus.watchList?.length || 0} IPs</span>
                            </span>
                        </div>
                    )}

                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900 border border-slate-800 rounded-xl">
                        <div className="relative w-full sm:w-80">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={guardianSearch}
                                onChange={(e) => setGuardianSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && fetchGuardianEvents()}
                                placeholder="Filter IP, Reason, ASN, Company..."
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <select
                                value={guardianActionFilter}
                                onChange={(e) => setGuardianActionFilter(e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="">All Actions</option>
                                <option value="AUTO_UNSHUNNED">Auto-Unshunned</option>
                                <option value="SHUN_DETECTED">Shun Detected</option>
                                <option value="SKIPPED">Skipped (Retained)</option>
                            </select>

                            <button
                                type="button"
                                onClick={fetchGuardianEvents}
                                disabled={loadingGuardian}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
                            >
                                {loadingGuardian ? "Loading..." : "Filter"}
                            </button>
                        </div>
                    </div>

                    {/* Events Table */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                                <tr>
                                    <th className="py-3 px-4">Action</th>
                                    <th className="py-3 px-4">IP Address</th>
                                    <th className="py-3 px-4">Reason / Details</th>
                                    <th className="py-3 px-4">Organization / ASN</th>
                                    <th className="py-3 px-4">Timestamp</th>
                                    <th className="py-3 px-4 text-right">Fleet Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {guardianEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-slate-500 font-sans">
                                            {loadingGuardian ? "Loading events..." : "No Guardian events found matching filter."}
                                        </td>
                                    </tr>
                                ) : (
                                    guardianEvents.map((ev) => (
                                        <tr key={ev.id} className="hover:bg-slate-800/40 transition">
                                            <td className="py-3 px-4 font-sans">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                                    ev.action === "AUTO_UNSHUNNED" 
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                                        : ev.action === "SKIPPED"
                                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                                        : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                                }`}>
                                                    {ev.action}
                                                </span>
                                            </td>
                                            <td className="py-3 px-4 font-bold text-white">
                                                {ev.ip}
                                            </td>
                                            <td className="py-3 px-4 font-sans text-slate-300 max-w-xs truncate" title={ev.details || ev.reason}>
                                                {ev.details || ev.reason || "—"}
                                            </td>
                                            <td className="py-3 px-4 font-sans text-slate-400">
                                                {ev.companyName || ev.asn || "—"}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-[11px]">
                                                {new Date(ev.createdAt).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right font-sans">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchIp(ev.ip);
                                                        setActiveTab("audit");
                                                        handleScanIp(ev.ip);
                                                    }}
                                                    className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                                                >
                                                    Audit Fleet →
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB 5: OPERATIONS HISTORY */}
            {activeTab === "history" && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Log of interactive firewall queries, shun checks, and manual un-shun actions.
                        </p>
                        <button
                            type="button"
                            onClick={fetchHistoryLogs}
                            disabled={loadingHistory}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
                            <span>Refresh History</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                                <tr>
                                    <th className="py-3 px-4">Action / Command</th>
                                    <th className="py-3 px-4">Target IP</th>
                                    <th className="py-3 px-4">Target Firewall</th>
                                    <th className="py-3 px-4">Operator</th>
                                    <th className="py-3 px-4">Location / ASN</th>
                                    <th className="py-3 px-4">Timestamp</th>
                                    <th className="py-3 px-4 text-right">Audit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {historyLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-8 text-center text-slate-500 font-sans">
                                            {loadingHistory ? "Loading history..." : "No recent operations recorded."}
                                        </td>
                                    </tr>
                                ) : (
                                    historyLogs.map((h) => (
                                        <tr key={h.id} className="hover:bg-slate-800/40 transition">
                                            <td className="py-3 px-4 font-sans font-semibold text-white">
                                                {h.command}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-cyan-300">
                                                {h.targetIp}
                                            </td>
                                            <td className="py-3 px-4 font-sans text-slate-300">
                                                {h.targetName || "Fleet"}
                                            </td>
                                            <td className="py-3 px-4 font-sans text-slate-400">
                                                {h.user?.username || "Admin"}
                                            </td>
                                            <td className="py-3 px-4 font-sans text-slate-400">
                                                {h.ipCountry ? `${h.ipCountry} · ` : ""}{h.ipAsName || h.ipAsn || "—"}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-[11px]">
                                                {new Date(h.createdAt).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4 text-right font-sans">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchIp(h.targetIp);
                                                        setActiveTab("audit");
                                                        handleScanIp(h.targetIp);
                                                    }}
                                                    className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                                                >
                                                    Audit Fleet →
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                variant={confirmModal.actionType === "shun" ? "danger" : "warning"}
                confirmText={isDryRun ? "Execute Dry-Run Simulation" : "Proceed with Live Mutation"}
                onConfirm={() => executeAction(confirmModal.actionType, confirmModal.targetIp, confirmModal.targetNode)}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
