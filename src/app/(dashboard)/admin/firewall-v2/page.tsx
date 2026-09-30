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
    Lock
} from "lucide-react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

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

export default function FtdOperationsPage() {
    const [hosts, setHosts] = useState<FirewallHost[]>([]);
    const [fleetStatuses, setFleetStatuses] = useState<FleetNodeStatus[]>([]);
    const [loadingFleet, setLoadingFleet] = useState(false);
    const [fleetLastUpdated, setFleetLastUpdated] = useState<string | null>(null);

    // Search / Audit
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

    // Live Shun Tab
    const [activeTab, setActiveTab] = useState<"audit" | "live_inventory">("audit");
    const [loadingLiveShuns, setLoadingLiveShuns] = useState(false);
    const [liveShunsData, setLiveShunsData] = useState<any[]>([]);

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

    // 2. Fetch fleet status
    const refreshFleetStatus = useCallback(async () => {
        setLoadingFleet(true);
        try {
            const res = await fetch("/api/firewall/v2?action=fleet_status&target=fleet");
            const data = await res.json();
            if (data.results && Array.isArray(data.results)) {
                setFleetStatuses(data.results);
                setFleetLastUpdated(new Date().toLocaleTimeString());
            }
        } catch (e) {
            console.error("Failed to load fleet status", e);
        } finally {
            setLoadingFleet(false);
        }
    }, []);

    useEffect(() => {
        refreshFleetStatus();
    }, [refreshFleetStatus]);

    // 3. Scan specific IP across fleet
    const handleScanIp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const cleanIp = searchIp.trim();
        if (!cleanIp) return;

        setScanningIp(true);
        setScanError(null);
        setActionMessage(null);

        try {
            const res = await fetch(`/api/firewall/v2?action=check_ip&ip=${encodeURIComponent(cleanIp)}&target=${targetSelection}`);
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

    // 5. Execute Mutation (Shun or Unshun)
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
                handleScanIp();
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
                                Real-time parallel Netmiko engine for Cisco Firepower Threat Defense (FTD 7.2+) and Lina Lina diagnostic sub-shells.
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
                        <span>Refresh Fleet</span>
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
                    {fleetLastUpdated && <span>Last verified: {fleetLastUpdated}</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {hosts.map((host) => {
                        const status = fleetStatuses.find(s => s.firewallId === host.id || s.ip === host.ip);
                        const isConnected = status?.success;
                        const isChecking = loadingFleet;

                        return (
                            <div
                                key={host.id}
                                className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition space-y-2"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <h4 className="text-xs font-bold text-white truncate" title={host.name}>
                                            {host.name}
                                        </h4>
                                        <span className="text-[11px] font-mono text-cyan-400">
                                            {host.ip}
                                        </span>
                                    </div>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0 ${
                                        isChecking
                                            ? "bg-slate-800 text-slate-400 border-slate-700"
                                            : isConnected
                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                                    }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                            isChecking ? "bg-slate-400 animate-pulse" : isConnected ? "bg-emerald-400" : "bg-rose-400"
                                        }`} />
                                        {isChecking ? "Testing..." : isConnected ? "Online" : "Unreachable"}
                                    </span>
                                </div>

                                {status?.prompt && (
                                    <div className="text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
                                        <span>Diagnostic CLI:</span>
                                        <span className="text-emerald-400 font-bold">{status.prompt}</span>
                                    </div>
                                )}
                                {status?.error && (
                                    <p className="text-[10px] text-rose-400 truncate" title={status.error}>
                                        {status.error}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pt-2">
                <button
                    type="button"
                    onClick={() => setActiveTab("audit")}
                    className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition -mb-[1px] cursor-pointer ${
                        activeTab === "audit"
                            ? "text-blue-400 border-blue-500 bg-slate-900/40"
                            : "text-slate-400 border-transparent hover:text-slate-200"
                    }`}
                >
                    <Search className="w-3.5 h-3.5" />
                    <span>Global IP Fleet Audit & Actions</span>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setActiveTab("live_inventory");
                        if (liveShunsData.length === 0) handleFetchLiveShuns();
                    }}
                    className={`flex items-center gap-2 py-2.5 px-4 text-xs font-semibold border-b-2 transition -mb-[1px] cursor-pointer ${
                        activeTab === "live_inventory"
                            ? "text-blue-400 border-blue-500 bg-slate-900/40"
                            : "text-slate-400 border-transparent hover:text-slate-200"
                    }`}
                >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Live Active Shuns Table</span>
                </button>
            </div>

            {/* TAB 1: GLOBAL IP AUDIT & ACTIONS */}
            {activeTab === "audit" && (
                <div className="space-y-6">
                    {/* Search & Audit Bar */}
                    <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                        <form onSubmit={handleScanIp} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
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
                            {/* 1. Context & Safety Intelligence Banner */}
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

                            {/* 2. Parallel Fleet Matrix */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                    Firewall Node Status Matrix ({scanResult.fleetResults.length} Nodes Queried)
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {scanResult.fleetResults.map((node) => {
                                        const isShunned = node.isShunned;
                                        const isExpanded = expandedCli[node.firewallId];

                                        return (
                                            <div
                                                key={node.firewallId}
                                                className={`p-4 rounded-xl border transition ${
                                                    isShunned 
                                                        ? "bg-rose-950/10 border-rose-500/40" 
                                                        : "bg-slate-900/60 border-slate-800"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 pb-2">
                                                    <div>
                                                        <h5 className="text-xs font-bold text-white">{node.firewallName}</h5>
                                                        <span className="text-[11px] font-mono text-slate-400">{node.ip}</span>
                                                    </div>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
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
                                                <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedCli(prev => ({ ...prev, [node.firewallId]: !prev[node.firewallId] }))}
                                                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition"
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
                                                                className="px-2.5 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold transition"
                                                            >
                                                                Unshun Node
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => triggerActionConfirm("shun", scanResult.targetIp, node.firewallId)}
                                                                className="px-2.5 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition"
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
                        {liveShunsData.map((node: any) => (
                            <div key={node.firewallId} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                    <div>
                                        <h4 className="text-xs font-bold text-white">{node.firewallName}</h4>
                                        <span className="text-[11px] font-mono text-cyan-400">{node.ip}</span>
                                    </div>
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                        {node.shunCount ?? 0} Active Shuns
                                    </span>
                                </div>

                                <div className="max-h-60 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
                                    {Array.isArray(node.shunnedIps) && node.shunnedIps.length > 0 ? (
                                        node.shunnedIps.map((ip: string) => (
                                            <div
                                                key={ip}
                                                className="flex items-center justify-between px-2.5 py-1 bg-slate-950/60 rounded border border-slate-800/80 hover:border-slate-700 transition"
                                            >
                                                <span>{ip}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSearchIp(ip);
                                                        setActiveTab("audit");
                                                        handleScanIp();
                                                    }}
                                                    className="text-[10px] text-blue-400 hover:text-blue-300 font-sans font-semibold cursor-pointer"
                                                >
                                                    Audit / Unshun →
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-500 text-xs py-4 text-center">
                                            {node.success ? "No active shuns on this node." : (node.error || "Failed to poll node.")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
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
