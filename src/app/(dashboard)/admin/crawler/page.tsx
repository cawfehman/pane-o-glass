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
    ChevronDown
} from "lucide-react";

import TopologyGraph from "@/components/crawler/TopologyGraph";
import DeviceInspectorDrawer from "@/components/crawler/DeviceInspectorDrawer";
import PathTracerPanel from "@/components/crawler/PathTracerPanel";
import FailureInvestigationTable from "@/components/crawler/FailureInvestigationTable";
import CrawlModal from "@/components/crawler/CrawlModal";

export default function AdminCrawlerPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const role = (session?.user as any)?.role || "USER";
    const isAdmin = role === "ADMIN";

    // Snapshots list & current snapshot
    const [snapshots, setSnapshots] = useState<any[]>([]);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
    const [currentSnapshotData, setCurrentSnapshotData] = useState<any | null>(null);
    const [loadingSnapshots, setLoadingSnapshots] = useState(true);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Active Tab
    const [activeTab, setActiveTab] = useState<"topology" | "tracer" | "failures">("topology");

    // Device selection for Inspector Drawer
    const [selectedDevice, setSelectedDevice] = useState<any | null>(null);

    // Tracer inputs & highlighted path
    const [tracerSourceIp, setTracerSourceIp] = useState<string>("10.10.10.50");
    const [tracerDestIp, setTracerDestIp] = useState<string>("10.20.50.88");
    const [activeHopDevices, setActiveHopDevices] = useState<string[]>([]);
    const [highlightedLinks, setHighlightedLinks] = useState<Array<{ from: string; to: string }>>([]);

    // Crawl Modal
    const [isCrawlModalOpen, setIsCrawlModalOpen] = useState(false);
    const [reseedDevice, setReseedDevice] = useState<any | null>(null);

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

            if (data.length > 0) {
                const targetId = preferredId || (data.some((s: any) => s.id === selectedSnapshotId) ? selectedSnapshotId : data[0].id);
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
            if (!res.ok) throw new Error("Failed to load snapshot details.");
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

    const activeSnapshot = snapshots.find(s => s.id === selectedSnapshotId);

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
        <div className="internal-scroll-layout flex flex-col h-full space-y-5 pb-8">
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
                                {activeSnapshot && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border ${
                                        activeSnapshot.crawlProfile === "DISCOVERY" ? "bg-amber-500/10 text-amber-300 border-amber-500/40" :
                                        activeSnapshot.crawlProfile === "MAPPING" ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/40" :
                                        "bg-blue-500/10 text-blue-300 border-blue-500/40"
                                    }`}>
                                        {activeSnapshot.crawlProfile || "INTENSIVE"}
                                        {activeSnapshot.maxHops ? ` • ${activeSnapshot.maxHops}H` : " • FULL"}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400">
                                Automated CDP/LLDP spidering, multi-profile audits, and IPv4 Longest Prefix Match (LPM) path simulation.
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
                            disabled={loadingSnapshots || snapshots.length === 0}
                            className="appearance-none bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 pl-3 pr-8 py-2 rounded-xl focus:outline-none focus:border-blue-500 transition cursor-pointer"
                        >
                            {snapshots.map((s) => (
                                <option key={s.id} value={s.id}>
                                    Snapshot #{s.snapshotNumber} [{s.crawlProfile || 'INTENSIVE'}{s.maxHops ? ` • ${s.maxHops}h` : ''}] ({s._count?.devices || s.totalDiscovered || 0} devs) • {new Date(s.timestamp).toLocaleDateString()}
                                </option>
                            ))}
                            {snapshots.length === 0 && <option value="">No snapshots found</option>}
                        </select>
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-3 pointer-events-none" />
                    </div>

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
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Run Crawl
                    </button>
                </div>
            </div>

            {/* Pulse Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                        <Server className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="text-[11px] text-slate-400 font-medium block">Monitored Devices</span>
                        <span className="text-lg font-bold text-white font-mono">{devices.length}</span>
                    </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Activity className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="text-[11px] text-slate-400 font-medium block">Inter-Switch Links</span>
                        <span className="text-lg font-bold text-white font-mono">{links.length}</span>
                    </div>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${unreachableDevices.length > 0 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                        <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                        <span className="text-[11px] text-slate-400 font-medium block">Unreachable Nodes</span>
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
                        <span className="text-[11px] text-slate-400 font-medium block">Snapshot Timestamp</span>
                        <span className="text-xs font-semibold text-slate-200 truncate block">
                            {activeSnapshot ? new Date(activeSnapshot.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                    </div>
                </div>
            </div>

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
                                <Play className="w-3.5 h-3.5 fill-current" />
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
            <div className="flex-1 min-h-[500px]">
                {activeTab === "topology" && (
                    <div className="h-full">
                        <TopologyGraph
                            devices={devices}
                            links={links}
                            selectedDevice={selectedDevice}
                            onSelectDevice={(d) => setSelectedDevice(d)}
                            activeHopDevices={activeHopDevices}
                            highlightedLinks={highlightedLinks}
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
                                selectedDevice={selectedDevice}
                                onSelectDevice={(d) => setSelectedDevice(d)}
                                activeHopDevices={activeHopDevices}
                                highlightedLinks={highlightedLinks}
                            />
                        </div>
                    </div>
                )}

                {activeTab === "failures" && (
                    <FailureInvestigationTable
                        unreachableDevices={unreachableDevices}
                        onSelectDevice={(host) => {
                            handleSelectDeviceByHostname(host);
                            setActiveTab("topology");
                        }}
                    />
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
                    fetchSnapshots(newId);
                }}
                initialSeed={reseedDevice?.ipAddress}
                initialMaxHops={1}
            />
        </div>
    );
}
