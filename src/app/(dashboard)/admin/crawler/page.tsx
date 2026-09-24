"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
    Network, 
    Route as RouteIcon, 
    ShieldAlert, 
    Play, 
    RefreshCw, 
    Layers, 
    Server, 
    Clock, 
    Compass, 
    AlertTriangle, 
    Activity,
    CheckCircle2,
    Calendar,
    ChevronDown,
    FileText,
    Download,
    Copy,
    Check,
    X
} from "lucide-react";

import TopologyGraph from "@/components/crawler/TopologyGraph";
import DeviceInspectorDrawer from "@/components/crawler/DeviceInspectorDrawer";
import PathTracerPanel from "@/components/crawler/PathTracerPanel";
import FailureInvestigationTable from "@/components/crawler/FailureInvestigationTable";
import CrawlModal from "@/components/crawler/CrawlModal";
import { CrawlIcon } from "@/components/crawler/CrawlIcon";
import { ToolHelp } from "@/components/ToolHelp";

export default function AdminCrawlerPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const role = (session?.user as any)?.role || "USER";
    const isAdmin = role === "ADMIN";

    // Snapshots list & current snapshot
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("master");
    const [currentSnapshotData, setCurrentSnapshotData] = useState<any | null>(null);
    const [loadingSnapshots, setLoadingSnapshots] = useState(true);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastCrawlNotification, setLastCrawlNotification] = useState<{ snapshotId: string; snapshotNumber?: number } | null>(null);

    // Active sub-view tab
    const [activeTab, setActiveTab] = useState<"topology" | "tracer" | "failures">("topology");

    // Drawer selection
    const [selectedDevice, setSelectedDevice] = useState<any | null>(null);

    // Tracer inputs & highlighted path
    const [tracerSourceIp, setTracerSourceIp] = useState<string>("10.10.10.50");
    const [tracerDestIp, setTracerDestIp] = useState<string>("10.20.50.88");
    const [activeHopDevices, setActiveHopDevices] = useState<string[]>([]);
    const [highlightedLinks, setHighlightedLinks] = useState<Array<{ from: string; to: string }>>([]);
    const [showMetrics, setShowMetrics] = useState(true);

    // Crawl Modal
    const [isCrawlModalOpen, setIsCrawlModalOpen] = useState(false);
    const [reseedDevice, setReseedDevice] = useState<any | null>(null);

    // Snapshot Crawl Log Viewer Modal
    const [isLogModalOpen, setIsLogModalOpen] = useState(false);
    const [logModalContent, setLogModalContent] = useState<string>("");
    const [loadingLog, setLoadingLog] = useState(false);
    const [logModalError, setLogModalError] = useState<string | null>(null);
    const [copiedLog, setCopiedLog] = useState(false);

    // Protect route for ADMIN role
    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/auth/signin");
        } else if (status === "authenticated" && !isAdmin) {
            router.push("/");
        }
    }, [status, isAdmin, router]);

    // Fetch snapshots list
    const fetchSnapshots = async (preferredId?: string) => {
        setLoadingSnapshots(true);
        setError(null);
        try {
            const res = await fetch("/api/crawler/snapshots");
            if (!res.ok) {
                if (res.status === 403) {
                    throw new Error("Forbidden: Administrator access required.");
                }
                throw new Error("Failed to load snapshots list.");
            }
            const data = await res.json();
            setSnapshots(data);

            const targetId = preferredId || (selectedSnapshotId === "master" || data.some((s: any) => s.id === selectedSnapshotId) ? selectedSnapshotId : "master");
            if (targetId === selectedSnapshotId) {
                fetchSnapshotDetails(targetId);
            } else {
                setSelectedSnapshotId(targetId);
            }
        } catch (err: any) {
            setError(err.message || "An error occurred while fetching snapshots.");
        } finally {
            setLoadingSnapshots(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchSnapshots();
        }
    }, [isAdmin]);

    // Fetch snapshot details when selectedSnapshotId changes
    const fetchSnapshotDetails = async (id: string) => {
        if (!id) return;
        setLoadingDetails(true);
        try {
            const res = await fetch(`/api/crawler/snapshot/${id}`);
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Failed to load snapshot details (HTTP ${res.status}).`);
            }
            const data = await res.json();
            setCurrentSnapshotData(data);
            setSelectedDevice(null);
            setActiveHopDevices([]);
            setHighlightedLinks([]);
        } catch (err: any) {
            setError(err.message || "Failed to load snapshot topology.");
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        if (selectedSnapshotId) {
            fetchSnapshotDetails(selectedSnapshotId);
        }
    }, [selectedSnapshotId]);

    // Calculate pulse metrics
    const devices: any[] = currentSnapshotData?.devices || [];
    const links: any[] = currentSnapshotData?.links || [];
    const unreachableDevices = useMemo(() => {
        return devices.filter(d => (d.status && d.status !== "REACHABLE") || d.reachable === false || Boolean(d.failureReason) || Boolean(d.error));
    }, [devices]);

    const frontierDevices = useMemo(() => {
        return devices.filter(d => Boolean(d.isReseedFrontier) || (Array.isArray(d.boundaryNeighbors) && d.boundaryNeighbors.length > 0));
    }, [devices]);

    const isMasterView = selectedSnapshotId === "master";
    const activeSnapshot = isMasterView
        ? {
            id: "master",
            snapshotNumber: "Master",
            crawlProfile: "MASTER",
            timestamp: currentSnapshotData?.metadata?.timestamp || new Date(),
            maxHops: null,
            totalDiscovered: devices.length
        }
        : snapshots.find(s => s.id === selectedSnapshotId);

    // Path Discovered callback from PathTracerPanel
    const handlePathDiscovered = (result: any) => {
        if (!result || !result.hops) {
            setActiveHopDevices([]);
            setHighlightedLinks([]);
            return;
        }

        const hops: any[] = result.hops;
        const hopHostnames = hops.map(h => h.deviceName || h.device);
        setActiveHopDevices(hopHostnames);

        const hlLinks: Array<{ from: string; to: string }> = [];
        for (let i = 0; i < hopHostnames.length - 1; i++) {
            hlLinks.push({ from: hopHostnames[i], to: hopHostnames[i + 1] });
        }
        setHighlightedLinks(hlLinks);
    };

    const handleSelectDeviceByHostname = (hostname: string) => {
        const found = devices.find(d => d.hostname === hostname);
        if (found) {
            setSelectedDevice(found);
        }
    };

    const handleOpenLogViewer = async (snapshotId: string) => {
        const targetId = snapshotId === "master" ? snapshots[0]?.id : snapshotId;
        if (!targetId) return;
        setIsLogModalOpen(true);
        setLoadingLog(true);
        setLogModalError(null);
        setLogModalContent("");
        setCopiedLog(false);

        try {
            const res = await fetch(`/api/crawler/logs?snapshotId=${targetId}`);
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to load log file.");
            }
            setLogModalContent(data.log || "No log content recorded.");
        } catch (err: any) {
            setLogModalError(err.message || "Failed to load log file.");
        } finally {
            setLoadingLog(false);
        }
    };

    const handleDownloadLogFile = (snapshotId: string) => {
        const targetId = snapshotId === "master" ? snapshots[0]?.id : snapshotId;
        if (!targetId) return;
        window.open(`/api/crawler/logs?snapshotId=${targetId}&download=1`, "_blank");
    };

    const handleCopyLog = () => {
        if (!logModalContent) return;
        navigator.clipboard.writeText(logModalContent);
        setCopiedLog(true);
        setTimeout(() => setCopiedLog(false), 2000);
    };

    if (status === "loading" || (!isAdmin && status === "authenticated")) {
        return (
            <div className="flex items-center justify-center h-full min-h-[500px]">
                <div className="flex flex-col items-center gap-3">
                    <span className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></span>
                    <p className="text-sm font-medium text-slate-400">Verifying administrative credentials...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="internal-scroll-layout wide-layout flex flex-col h-full space-y-3 pb-2">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <Network className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-bold text-white tracking-tight">Cisco Network Crawler & Path Tracer</h1>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30">
                                    Admin Only
                                </span>
                                {isMasterView ? (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 border border-blue-500/40 shadow-sm flex items-center gap-1.5">
                                        <Layers className="w-3 h-3 text-blue-400" />
                                        Master View (Live Merged)
                                    </span>
                                ) : activeSnapshot ? (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ${
                                        activeSnapshot.crawlProfile === "DISCOVERY" ? "bg-amber-500/10 text-amber-300 border-amber-500/40" :
                                        activeSnapshot.crawlProfile === "MAPPING" ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40" :
                                        "bg-blue-500/10 text-blue-300 border-blue-500/40"
                                    }`}>
                                        Snapshot #{activeSnapshot.snapshotNumber} • {activeSnapshot.crawlProfile || "INTENSIVE"}
                                        {activeSnapshot.maxHops ? ` • ${activeSnapshot.maxHops}H` : " • FULL"}
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-xs text-slate-400">
                                {isMasterView 
                                    ? "Cumulative enterprise topology aggregating the latest verified device states, interfaces, and CDP neighbor links."
                                    : "Point-in-time crawl snapshot showing isolated discovery results for this crawl execution."}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Header Controls */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Snapshot Selector */}
                    <div className="relative">
                        <select
                            value={selectedSnapshotId}
                            onChange={(e) => setSelectedSnapshotId(e.target.value)}
                            disabled={loadingSnapshots}
                            className="appearance-none bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 pl-3 pr-8 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition cursor-pointer"
                        >
                            <option value="master">
                                🌟 Master Topology (Cumulative Map)
                            </option>
                            {snapshots.length > 0 && (
                                <optgroup label="Point-in-Time Crawl Runs">
                                    {snapshots.map((s) => (
                                        <option key={s.id} value={s.id}>
                                            Snapshot #{s.snapshotNumber} [{s.crawlProfile || 'INTENSIVE'}{s.maxHops ? ` • ${s.maxHops}h` : ''}] ({s._count?.devices || s.totalDiscovered || 0} devs) • {new Date(s.timestamp).toLocaleDateString()}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                    </div>

                    {/* Toggle Overview / Pulse Metrics */}
                    <button
                        onClick={() => setShowMetrics(v => !v)}
                        className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                        title={showMetrics ? "Collapse overview cards to maximize diagram space" : "Show overview metric cards"}
                    >
                        <Activity className="w-3.5 h-3.5 text-blue-400" />
                        <span className="hidden sm:inline">{showMetrics ? "Hide Overview" : "Show Overview"}</span>
                    </button>

                    {/* View Execution Log Button */}
                    <button
                        onClick={() => handleOpenLogViewer(selectedSnapshotId)}
                        disabled={!selectedSnapshotId}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        title="View Execution Log (Retained 7 days)"
                    >
                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                        <span className="hidden md:inline">Run Log</span>
                    </button>

                    {/* Refresh Snapshot */}
                    <button
                        onClick={() => fetchSnapshotDetails(selectedSnapshotId)}
                        disabled={loadingDetails}
                        className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl transition"
                        title="Reload Current Snapshot"
                    >
                        <RefreshCw className={`w-4 h-4 ${loadingDetails ? "animate-spin text-blue-400" : ""}`} />
                    </button>

                    {/* New Crawl Button */}
                    <button
                        onClick={() => {
                            setReseedDevice(null);
                            setIsCrawlModalOpen(true);
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <CrawlIcon size={14} className="text-white" />
                        Run Crawl
                    </button>

                    {/* Tool Help Guide Modal */}
                    <div className="flex items-center pl-1 border-l border-slate-800">
                        <ToolHelp toolId="crawler" iconSize={16} />
                    </div>
                </div>
            </div>

            {/* Pulse Metrics Bar */}
            {showMetrics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                            <Server className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-[11px] text-slate-400 font-medium block">
                                {isMasterView ? "Master Monitored Devices" : "Monitored Devices"}
                            </span>
                            <span className="text-lg font-bold text-white font-mono">{devices.length}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-[11px] text-slate-400 font-medium block">
                                {isMasterView ? "Master Inter-Switch Links" : "Inter-Switch Links"}
                            </span>
                            <span className="text-lg font-bold text-white font-mono">{links.length}</span>
                        </div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${unreachableDevices.length > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-[11px] text-slate-400 font-medium block">
                                {isMasterView ? "Unreachable (Latest State)" : "Unreachable Nodes"}
                            </span>
                            <div className="flex items-center gap-2">
                                <span className={`text-lg font-bold font-mono ${unreachableDevices.length > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                    {unreachableDevices.length}
                                </span>
                                {unreachableDevices.length > 0 && (
                                    <button
                                        onClick={() => setActiveTab("failures")}
                                        className="text-[10px] text-red-400 underline font-sans"
                                    >
                                        Review
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-[11px] text-slate-400 font-medium block">
                                {isMasterView ? "Master Network Synced" : "Snapshot Timestamp"}
                            </span>
                            <span className="text-xs font-semibold text-slate-200 truncate block">
                                {activeSnapshot?.timestamp ? new Date(activeSnapshot.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Post-Crawl Status Notification Banner */}
            {lastCrawlNotification && (
                <div className="p-3.5 bg-emerald-950/50 border border-emerald-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200 shrink-0 shadow-lg shadow-emerald-950/30">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>
                            Crawl completed successfully! Newly discovered & refreshed switches have been integrated into the <strong>Master Topology</strong>.
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => {
                                setSelectedSnapshotId(lastCrawlNotification.snapshotId);
                                setLastCrawlNotification(null);
                            }}
                            className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg font-semibold transition cursor-pointer text-[11px]"
                        >
                            View Isolated Crawl Run
                        </button>
                        <button
                            onClick={() => setLastCrawlNotification(null)}
                            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 transition cursor-pointer"
                            title="Dismiss"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Isolated Snapshot Mode Notice with 1-click Return to Master */}
            {!isMasterView && activeSnapshot && (
                <div className="p-3 bg-blue-950/40 border border-blue-800/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-200 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Compass className="w-4 h-4 text-blue-400 shrink-0" />
                        <div>
                            <span>
                                Viewing isolated crawl <strong>Snapshot #{activeSnapshot.snapshotNumber}</strong> ({devices.length} device{devices.length === 1 ? '' : 's'}). The rest of the network is hidden in this run.
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={() => setSelectedSnapshotId("master")}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Switch to Master Topology
                    </button>
                </div>
            )}

            {/* Error banner */}
            {error && (
                <div className="p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl text-xs text-red-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Frontier Reseed Banner if Boundary Switch(es) exist */}
            {frontierDevices.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
                            <Compass className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-amber-300 block">
                                Hop Depth Boundary Reached (Hop {activeSnapshot?.maxHops || 1})
                            </span>
                            <p className="text-[11px] text-amber-200/80">
                                {frontierDevices.length} boundary switch(es) detected with unvisited neighbors at Hop {(activeSnapshot?.maxHops || 1) + 1}. Expansion halted safely to guarantee zero loops.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {frontierDevices.slice(0, 2).map((fd) => (
                            <button
                                key={fd.id}
                                onClick={() => {
                                    setReseedDevice(fd);
                                    setIsCrawlModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center gap-1.5 cursor-pointer"
                            >
                                <CrawlIcon size={14} className="text-slate-950" />
                                Reseed from {fd.hostname}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab("topology")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-[1px] ${
                            activeTab === "topology"
                                ? "text-blue-400 border-blue-500 bg-slate-900/40 rounded-t-lg"
                                : "text-slate-400 border-transparent hover:text-slate-200"
                        }`}
                    >
                        <Network className="w-4 h-4" />
                        Topology Map ({devices.length})
                    </button>

                    <button
                        onClick={() => setActiveTab("tracer")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-[1px] ${
                            activeTab === "tracer"
                                ? "text-blue-400 border-blue-500 bg-slate-900/40 rounded-t-lg"
                                : "text-slate-400 border-transparent hover:text-slate-200"
                        }`}
                    >
                        <RouteIcon className="w-4 h-4" />
                        Path Tracer (LPM)
                        {activeHopDevices.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono">
                                {activeHopDevices.length} hops
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab("failures")}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition -mb-[1px] ${
                            activeTab === "failures"
                                ? "text-red-400 border-red-500 bg-slate-900/40 rounded-t-lg"
                                : "text-slate-400 border-transparent hover:text-slate-200"
                        }`}
                    >
                        <ShieldAlert className="w-4 h-4" />
                        Failure Center
                        {unreachableDevices.length > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-300 font-mono">
                                {unreachableDevices.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 min-h-0 flex flex-col">
                {activeTab === "topology" && (
                    <div className="flex-1 h-full min-h-0 flex flex-col">
                        <TopologyGraph
                            devices={devices}
                            links={links}
                            siteDirectory={currentSnapshotData?.siteDirectory}
                            selectedDevice={selectedDevice}
                            onSelectDevice={(d) => setSelectedDevice(d)}
                            activeHopDevices={activeHopDevices}
                            highlightedLinks={highlightedLinks}
                            onReseedDevice={(d) => {
                                setReseedDevice(d);
                                setIsCrawlModalOpen(true);
                            }}
                            className="relative w-full flex-1 h-full min-h-[660px]"
                        />
                    </div>
                )}

                {activeTab === "tracer" && (
                    <div className="space-y-6">
                        {activeSnapshot?.crawlProfile === "DISCOVERY" && (
                            <div className="p-4 bg-amber-950/40 border border-amber-800/80 rounded-2xl flex items-start justify-between gap-4 text-xs text-amber-200">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <span className="font-bold text-white block">Neighbor Discovery Profile Active</span>
                                        <p className="text-slate-300 leading-relaxed">
                                            This snapshot was captured in <strong>Discovery</strong> mode to test credentials and find adjacent switches quickly. Routing tables were bypassed for speed. To simulate packet routing with LPM, initiate a <strong>Spider Intensive</strong> crawl.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsCrawlModalOpen(true)}
                                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl text-xs shrink-0 transition"
                                >
                                    Run Intensive Crawl
                                </button>
                            </div>
                        )}

                        <PathTracerPanel
                            snapshotId={selectedSnapshotId}
                            sourceIp={tracerSourceIp}
                            destinationIp={tracerDestIp}
                            onSourceIpChange={setTracerSourceIp}
                            onDestinationIpChange={setTracerDestIp}
                            onPathDiscovered={handlePathDiscovered}
                            onSelectDevice={handleSelectDeviceByHostname}
                        />

                        {/* Also render topology map underneath path tracer so user immediately sees visually highlighted path */}
                        <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Visual Traversal Overlay
                            </h3>
                            <TopologyGraph
                                devices={devices}
                                links={links}
                                siteDirectory={currentSnapshotData?.siteDirectory}
                                selectedDevice={selectedDevice}
                                onSelectDevice={(d) => setSelectedDevice(d)}
                                activeHopDevices={activeHopDevices}
                                highlightedLinks={highlightedLinks}
                                onReseedDevice={(d) => {
                                    setReseedDevice(d);
                                    setIsCrawlModalOpen(true);
                                }}
                                className="relative w-full h-[620px] min-h-[500px]"
                            />
                        </div>
                    </div>
                )}

                {activeTab === "failures" && (
                    <div className="flex-1 h-full min-h-0 flex flex-col">
                        <FailureInvestigationTable
                            unreachableDevices={unreachableDevices}
                            onSelectDevice={(host) => {
                                handleSelectDeviceByHostname(host);
                                setActiveTab("topology");
                            }}
                            onRefresh={() => {
                                if (selectedSnapshotId) {
                                    fetchSnapshotDetails(selectedSnapshotId);
                                }
                            }}
                        />
                    </div>
                )}
            </div>

            {/* Device Inspector Drawer */}
            <DeviceInspectorDrawer
                device={selectedDevice}
                onClose={() => setSelectedDevice(null)}
                onSetAsSource={(ip) => {
                    setTracerSourceIp(ip);
                    setActiveTab("tracer");
                }}
                onSetAsDestination={(ip) => {
                    setTracerDestIp(ip);
                    setActiveTab("tracer");
                }}
                onReseed={(dev) => {
                    setReseedDevice(dev);
                    setIsCrawlModalOpen(true);
                }}
            />

            {/* Crawl Initiation Modal */}
            <CrawlModal
                isOpen={isCrawlModalOpen}
                onClose={() => {
                    setIsCrawlModalOpen(false);
                    setReseedDevice(null);
                }}
                onSuccess={(newId) => {
                    setIsCrawlModalOpen(false);
                    setReseedDevice(null);
                    setLastCrawlNotification({ snapshotId: newId });
                    fetchSnapshots(selectedSnapshotId === "master" ? "master" : newId);
                }}
                initialSeed={reseedDevice?.ipAddress || reseedDevice?.ip_address || (Array.isArray(reseedDevice?.interfaces) ? reseedDevice?.interfaces.find((i: any) => i.ip_address)?.ip_address : undefined)}
                initialMaxHops={1}
            />

            {/* Snapshot Crawl Execution Log Viewer Modal */}
            {isLogModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-white tracking-tight">
                                        Snapshot Execution Audit Log {activeSnapshot ? `(#${activeSnapshot.snapshotNumber})` : ""}
                                    </h2>
                                    <p className="text-xs text-slate-400">
                                        Raw Python Netmiko terminal stream, SSH latencies, and device collection events. Retained for 7 days.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleCopyLog}
                                    disabled={!logModalContent}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                >
                                    {copiedLog ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copiedLog ? "Copied!" : "Copy"}
                                </button>
                                <button
                                    onClick={() => handleDownloadLogFile(selectedSnapshotId)}
                                    disabled={!logModalContent}
                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer shadow shadow-blue-500/20 disabled:opacity-50"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Download .log
                                </button>
                                <button
                                    onClick={() => setIsLogModalOpen(false)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition ml-1"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="p-4 flex-1 overflow-hidden flex flex-col bg-slate-950">
                            {loadingLog ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 text-sm">
                                    <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
                                    <span>Retrieving snapshot log from server...</span>
                                </div>
                            ) : logModalError ? (
                                <div className="p-6 text-center text-red-400 text-sm space-y-2">
                                    <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                                    <p>{logModalError}</p>
                                    <p className="text-xs text-slate-500">Log files are automatically pruned after 7 days.</p>
                                </div>
                            ) : (
                                <pre className="font-mono text-xs text-slate-300 p-4 rounded-xl bg-slate-950 border border-slate-800/80 overflow-y-auto flex-1 leading-relaxed select-text whitespace-pre-wrap">
                                    {logModalContent}
                                </pre>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
                            <span>Snapshot ID: {selectedSnapshotId}</span>
                            <button
                                onClick={() => setIsLogModalOpen(false)}
                                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-lg transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
