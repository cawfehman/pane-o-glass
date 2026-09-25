"use client";

import React, { useState, useMemo } from "react";
import { 
    X, 
    Building2, 
    Network, 
    Server, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    MapPin, 
    Layers, 
    ArrowUpRight, 
    Edit3, 
    Crosshair, 
    Cable, 
    Cpu, 
    Activity, 
    Folder, 
    Tag, 
    Search,
    ChevronRight,
    Star,
    ExternalLink,
    HelpCircle
} from "lucide-react";
import { SiteMetadataLookup, parseFloorFromIdf, detectSwitchStack } from "./TopologyGraph";

interface SiteInspectorDrawerProps {
    siteCode: string | null;
    onClose: () => void;
    devices: any[];
    links: any[];
    siteDirectory?: Record<string, SiteMetadataLookup>;
    onSelectDevice?: (dev: any) => void;
    onEditSite?: (siteCode: string) => void;
    onLocateSite?: (siteCode: string) => void;
}

export function formatRelativeTime(dateString?: string | null): string {
    if (!dateString) return "Never verified";
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "Never verified";
    
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function SiteInspectorDrawer({
    siteCode,
    onClose,
    devices,
    links,
    siteDirectory = {},
    onSelectDevice,
    onEditSite,
    onLocateSite
}: SiteInspectorDrawerProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "switches" | "ports" | "idfs" | "links">("overview");
    const [searchFilter, setSearchFilter] = useState("");

    const upperCode = (siteCode || "").toUpperCase().trim();
    const metadata = siteDirectory[upperCode] || siteDirectory[siteCode || ""];

    // Find all devices belonging to this site
    const siteDevices = useMemo(() => {
        if (!upperCode) return [];
        return devices.filter(d => {
            const devSite = (d.siteOverride || d.site || "").toUpperCase();
            if (devSite === upperCode) return true;
            const shortHost = (d.hostname || "").split(".")[0].split("(")[0].trim().toUpperCase();
            return shortHost.slice(0, 3) === upperCode;
        }).sort((a, b) => {
            // Routers and L3 switches first
            const isL3A = a.role === "Router" || a.role === "L3 Switch";
            const isL3B = b.role === "Router" || b.role === "L3 Switch";
            if (isL3A && !isL3B) return -1;
            if (!isL3A && isL3B) return 1;
            return (a.hostname || "").localeCompare(b.hostname || "", undefined, { numeric: true });
        });
    }, [devices, upperCode]);

    // Reachability & Freshness
    const reachableCount = useMemo(() => siteDevices.filter(d => d.status === "REACHABLE").length, [siteDevices]);
    const unreachableCount = siteDevices.length - reachableCount;
    const healthPercent = siteDevices.length > 0 ? Math.round((reachableCount / siteDevices.length) * 100) : 0;

    const latestVerifiedTimestamp = useMemo(() => {
        let maxTime: number | null = null;
        for (const d of siteDevices) {
            const ts = d.lastVerifiedAt || d.updatedAt || d.createdAt;
            if (ts) {
                const t = new Date(ts).getTime();
                if (!isNaN(t) && (maxTime === null || t > maxTime)) {
                    maxTime = t;
                }
            }
        }
        return maxTime ? new Date(maxTime).toISOString() : null;
    }, [siteDevices]);

    // Port Quantities & Utilization Metrics
    const portMetrics = useMemo(() => {
        let total = 0;
        let up = 0;
        let down = 0;
        const speeds: Record<string, number> = {
            "100G": 0,
            "40G": 0,
            "25G": 0,
            "10G": 0,
            "1G": 0,
            "FastEthernet": 0,
            "Other": 0
        };

        for (const dev of siteDevices) {
            let intfs: Record<string, any> = {};
            try {
                intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : (dev.interfaces || {});
            } catch {
                intfs = {};
            }

            const entries = Object.entries(intfs);
            if (entries.length > 0) {
                total += entries.length;
                for (const [name, data] of entries) {
                    const status = (typeof data === "object" ? data?.status || data?.oper_status : data) || "";
                    const isUp = /up/i.test(String(status));
                    if (isUp) up++;
                    else down++;

                    const lower = name.toLowerCase();
                    if (lower.startsWith("hu") || lower.includes("hundredgig")) speeds["100G"]++;
                    else if (lower.startsWith("fo") || lower.includes("fortygig")) speeds["40G"]++;
                    else if (lower.startsWith("twe") || lower.includes("twentyfivegig")) speeds["25G"]++;
                    else if (lower.startsWith("te") || lower.includes("tengigabit")) speeds["10G"]++;
                    else if (lower.startsWith("gi") || lower.includes("gigabit")) speeds["1G"]++;
                    else if (lower.startsWith("fa") || lower.includes("fast")) speeds["FastEthernet"]++;
                    else speeds["Other"]++;
                }
            } else {
                // Stack estimation if interface detail is not parsed
                const stack = detectSwitchStack(dev);
                const estPorts = stack.portCount || 48;
                total += estPorts;
                up += Math.round(estPorts * 0.6);
                down += Math.round(estPorts * 0.4);
                speeds["1G"] += estPorts;
            }
        }

        return {
            total,
            up,
            down,
            utilization: total > 0 ? Math.round((up / total) * 100) : 0,
            speeds
        };
    }, [siteDevices]);

    // Group switches by IDF / closet
    const idfGroups = useMemo(() => {
        const map = new Map<string, any[]>();
        for (const dev of siteDevices) {
            const shortHost = (dev.hostname || "").split(".")[0].trim();
            const idf = dev.idfOverride || dev.idf || (shortHost.includes("-") && shortHost.split("-")[1] ? shortHost.split("-")[1].slice(0, 3).toUpperCase() : "MDF");
            if (!map.has(idf)) map.set(idf, []);
            map.get(idf)!.push(dev);
        }
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [siteDevices]);

    // Inter-Site WAN Connections
    const wanLinks = useMemo(() => {
        if (!upperCode) return [];
        const seen = new Set<string>();
        const list: any[] = [];

        for (const l of links) {
            const devA = l.sourceDevice || l.source;
            const devB = l.targetDevice || l.target;
            const siteA = (devA?.siteOverride || devA?.site || (devA?.hostname || "").slice(0, 3)).toUpperCase();
            const siteB = (devB?.siteOverride || devB?.site || (devB?.hostname || "").slice(0, 3)).toUpperCase();

            if ((siteA === upperCode && siteB !== upperCode) || (siteB === upperCode && siteA !== upperCode)) {
                const remoteSite = siteA === upperCode ? siteB : siteA;
                const remoteDev = siteA === upperCode ? devB : devA;
                const localDev = siteA === upperCode ? devA : devB;
                const key = `${localDev?.hostname || ""}::${remoteDev?.hostname || ""}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    list.push({
                        remoteSite,
                        localDevice: localDev?.hostname || "Local Switch",
                        localPort: l.sourcePort || "Uplink",
                        remoteDevice: remoteDev?.hostname || "Remote Switch",
                        remotePort: l.targetPort || "Downlink",
                        linkType: l.linkType || "TRUNK",
                        speed: l.speed || "10 Gbps",
                        status: l.status || "UP"
                    });
                }
            }
        }
        return list;
    }, [links, upperCode]);

    if (!siteCode) return null;

    const isHub = Boolean(metadata?.isHub);
    const siteName = metadata?.name || `Site ${upperCode}`;

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all duration-300 animate-in slide-in-from-right">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/80">
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    <div className={`p-2.5 rounded-xl border shrink-0 ${
                        isHub 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-lg font-black text-white tracking-wide font-mono">{upperCode}</h2>
                            {isHub && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm" title="Critical Site">
                                    <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                                    CRITICAL SITE
                                </span>
                            )}
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                metadata?.status === 'Active' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                                metadata?.status === 'Future' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                                'bg-rose-500/10 text-rose-300 border-rose-500/30'
                            }`}>
                                {metadata?.status || 'Active'}
                            </span>
                        </div>
                        <p className="text-xs font-semibold text-slate-300 truncate mt-0.5">
                            {siteName}
                        </p>
                        {metadata?.folderPath && (
                            <p className="text-[11px] text-sky-400/80 flex items-center gap-1 mt-0.5">
                                <Folder className="w-3 h-3 text-sky-400" />
                                {metadata.folderPath}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {onLocateSite && (
                        <button
                            type="button"
                            onClick={() => onLocateSite(upperCode)}
                            title="Locate site on canvas"
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                        >
                            <Crosshair className="w-4 h-4" />
                        </button>
                    )}
                    {onEditSite && (
                        <button
                            type="button"
                            onClick={() => onEditSite(upperCode)}
                            title="Edit site details in directory"
                            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-amber-300 hover:bg-slate-700 transition cursor-pointer"
                        >
                            <Edit3 className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        title="Close Inspector"
                        className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center px-6 border-b border-slate-800 bg-slate-900/60 overflow-x-auto text-xs shrink-0">
                <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={`py-3 px-3.5 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === "overview" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <Activity className="w-3.5 h-3.5" />
                    Overview & Health
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("switches")}
                    className={`py-3 px-3.5 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === "switches" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <Server className="w-3.5 h-3.5" />
                    Switches ({siteDevices.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("ports")}
                    className={`py-3 px-3.5 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === "ports" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <Cpu className="w-3.5 h-3.5" />
                    Ports ({portMetrics.total})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("idfs")}
                    className={`py-3 px-3.5 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === "idfs" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    Closets ({idfGroups.length})
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("links")}
                    className={`py-3 px-3.5 border-b-2 font-semibold transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                        activeTab === "links" ? "border-blue-500 text-blue-400" : "border-transparent text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <Cable className="w-3.5 h-3.5" />
                    WAN Links ({wanLinks.length})
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-xs">
                {activeTab === "overview" && (
                    <>
                        {/* Quick Stats Grid */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                                <span className="text-[11px] text-slate-400 font-medium block">Total Switches</span>
                                <span className="text-xl font-bold text-white mt-1 block">{siteDevices.length}</span>
                                <span className="text-[10px] text-emerald-400 mt-1 block font-mono">
                                    {reachableCount} reachable
                                </span>
                            </div>

                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                                <span className="text-[11px] text-slate-400 font-medium block">Total Switchports</span>
                                <span className="text-xl font-bold text-white mt-1 block">{portMetrics.total}</span>
                                <span className="text-[10px] text-blue-400 mt-1 block font-mono">
                                    {portMetrics.utilization}% active
                                </span>
                            </div>

                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                                <span className="text-[11px] text-slate-400 font-medium block">Network Closets</span>
                                <span className="text-xl font-bold text-white mt-1 block">{idfGroups.length}</span>
                                <span className="text-[10px] text-slate-400 mt-1 block">
                                    MDF + IDFs
                                </span>
                            </div>

                            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
                                <span className="text-[11px] text-slate-400 font-medium block">Health Pulse</span>
                                <span className={`text-xl font-bold mt-1 block ${healthPercent === 100 ? 'text-emerald-400' : healthPercent > 70 ? 'text-amber-400' : 'text-rose-400'}`}>
                                    {healthPercent}%
                                </span>
                                <span className="text-[10px] text-slate-400 mt-1 block">
                                    {unreachableCount === 0 ? "All up" : `${unreachableCount} down`}
                                </span>
                            </div>
                        </div>

                        {/* Freshness & Telemetry Banner */}
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                                    <Clock className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="text-[11px] font-bold text-white block">Telemetry Freshness</span>
                                    <span className="text-[11px] text-slate-400 block mt-0.5">
                                        Last crawler snapshot verification: <strong className="text-slate-200">{formatRelativeTime(latestVerifiedTimestamp)}</strong>
                                    </span>
                                </div>
                            </div>
                            {latestVerifiedTimestamp && (
                                <span className="text-[10px] font-mono text-slate-500">
                                    {new Date(latestVerifiedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>

                        {/* Location & Facility Information */}
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-blue-400" />
                                Facility Information
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-400 text-[11px] block">Location Type</span>
                                    <span className="font-semibold text-slate-200 mt-0.5 block">{metadata?.locationType || "Ambulatory Facility"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 text-[11px] block">City / Market</span>
                                    <span className="font-semibold text-slate-200 mt-0.5 block">{metadata?.city || "Regional"}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-slate-400 text-[11px] block">Physical Street Address</span>
                                    <span className="font-semibold text-slate-200 mt-0.5 block">{metadata?.address || "Address not provided"}</span>
                                </div>
                                {metadata?.notes && (
                                    <div className="col-span-2 pt-1 border-t border-slate-800/80">
                                        <span className="text-slate-400 text-[11px] block">Facility Notes</span>
                                        <p className="text-slate-300 mt-1 italic leading-relaxed">{metadata.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Closet Rollup Summary */}
                        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <Layers className="w-3.5 h-3.5 text-purple-400" />
                                    Network Closets ({idfGroups.length})
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("idfs")}
                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
                                >
                                    View All IDFs &rarr;
                                </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {idfGroups.map(([idfName, devs]) => {
                                    const floor = parseFloorFromIdf(idfName);
                                    return (
                                        <div key={idfName} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                                            <div>
                                                <span className="font-bold text-white font-mono text-[11px] block">{idfName}</span>
                                                <span className="text-[10px] text-slate-400 block">{floor.floorLabel}</span>
                                            </div>
                                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30">
                                                {devs.length} sw
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}

                {activeTab === "switches" && (
                    <div className="space-y-3">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                                placeholder="Filter switches by hostname, IP, role, or model..."
                                className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="space-y-2">
                            {siteDevices
                                .filter(d => {
                                    if (!searchFilter.trim()) return true;
                                    const q = searchFilter.toLowerCase();
                                    return (d.hostname || "").toLowerCase().includes(q) ||
                                        (d.ipAddress || "").toLowerCase().includes(q) ||
                                        (d.role || "").toLowerCase().includes(q) ||
                                        (d.platform || "").toLowerCase().includes(q) ||
                                        (d.idf || "").toLowerCase().includes(q);
                                })
                                .map((dev) => {
                                    const isReachable = dev.status === "REACHABLE";
                                    const stack = detectSwitchStack(dev);
                                    return (
                                        <div 
                                            key={dev.id || dev.hostname}
                                            onClick={() => onSelectDevice && onSelectDevice(dev)}
                                            className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-blue-500/50 hover:bg-slate-800/50 transition cursor-pointer group flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className={`p-2 rounded-lg border shrink-0 ${
                                                    isReachable ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
                                                }`}>
                                                    <Server className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white font-mono text-xs truncate group-hover:text-blue-300">
                                                            {dev.hostname}
                                                        </span>
                                                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                                            dev.role === 'Router' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' :
                                                            dev.role === 'L3 Switch' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                                                            'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                                        }`}>
                                                            {dev.role || 'L2 Switch'}
                                                        </span>
                                                        {stack.isStack && (
                                                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30">
                                                                {stack.stackSize}x
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-slate-400 mt-1">
                                                        <span>{dev.ipAddress || "No Management IP"}</span>
                                                        <span>•</span>
                                                        <span>IDF: <strong className="text-slate-300">{dev.idf || "MDF"}</strong></span>
                                                        <span>•</span>
                                                        <span className="truncate">{dev.platform || "Cisco Catalyst"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition shrink-0 ml-2" />
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                )}

                {activeTab === "ports" && (
                    <div className="space-y-4">
                        {/* Port Summary Card */}
                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                                Port Census & Operational Status
                            </h3>
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">Total Provisioned Interfaces</span>
                                    <span className="font-bold text-white font-mono">{portMetrics.total} ports</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-emerald-400 flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                        Active / Connected (UP)
                                    </span>
                                    <span className="font-bold text-emerald-400 font-mono">{portMetrics.up} ports ({portMetrics.utilization}%)</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500 flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full bg-slate-600"></div>
                                        Available / Down
                                    </span>
                                    <span className="font-bold text-slate-400 font-mono">{portMetrics.down} ports</span>
                                </div>

                                <div className="w-full bg-slate-800 rounded-full h-2.5 mt-2 overflow-hidden flex">
                                    <div className="bg-emerald-500 h-full" style={{ width: `${portMetrics.utilization}%` }}></div>
                                    <div className="bg-slate-700 h-full flex-1"></div>
                                </div>
                            </div>
                        </div>

                        {/* Speed Breakdown */}
                        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
                            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                                Speed & Physical Media Breakdown
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                                {Object.entries(portMetrics.speeds).map(([spd, count]) => {
                                    if (count === 0) return null;
                                    return (
                                        <div key={spd} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between">
                                            <span className="text-slate-300 font-sans font-medium">{spd}</span>
                                            <span className="font-bold text-white font-mono px-2 py-0.5 bg-blue-500/10 text-blue-300 rounded border border-blue-500/20">
                                                {count}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "idfs" && (
                    <div className="space-y-3">
                        {idfGroups.map(([idfName, devs]) => {
                            const floor = parseFloorFromIdf(idfName);
                            return (
                                <div key={idfName} className="p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800/80">
                                        <div className="flex items-center gap-2">
                                            <Layers className="w-4 h-4 text-purple-400" />
                                            <h4 className="font-black text-white font-mono text-sm">{idfName}</h4>
                                            <span className="text-[10px] text-slate-400 font-sans px-2 py-0.5 rounded bg-slate-800">
                                                {floor.floorLabel}
                                            </span>
                                        </div>
                                        <span className="text-[11px] font-mono text-slate-400">
                                            {devs.length} switch{devs.length === 1 ? '' : 'es'}
                                        </span>
                                    </div>

                                    <div className="space-y-1.5">
                                        {devs.map(sw => (
                                            <div 
                                                key={sw.id || sw.hostname}
                                                onClick={() => onSelectDevice && onSelectDevice(sw)}
                                                className="p-2 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/60 flex items-center justify-between cursor-pointer group text-xs"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${sw.status === "REACHABLE" ? "bg-emerald-400" : "bg-red-400"}`}></div>
                                                    <span className="font-mono text-slate-200 group-hover:text-blue-300">{sw.hostname}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400">{sw.ipAddress}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === "links" && (
                    <div className="space-y-3">
                        {wanLinks.length === 0 ? (
                            <div className="p-8 text-center text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                                <Cable className="w-6 h-6 mx-auto mb-2 opacity-50" />
                                <p className="font-semibold text-xs text-slate-400">No Inter-Site WAN Adjacencies Detected</p>
                                <p className="text-[11px] mt-1">This facility operates as an edge island or is connected via an untracked carrier service.</p>
                            </div>
                        ) : (
                            wanLinks.map((wl, idx) => (
                                <div key={idx} className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-white font-mono text-xs">{upperCode}</span>
                                            <span className="text-blue-400 font-bold">&harr;</span>
                                            <span className="font-black text-white font-mono text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">
                                                {wl.remoteSite}
                                            </span>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30">
                                            {wl.speed} • {wl.status}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
                                        <div>
                                            <span className="text-slate-500 block">Local Device & Port</span>
                                            <span className="font-mono text-slate-200 mt-0.5 block truncate">{wl.localDevice}</span>
                                            <span className="text-slate-400 font-mono">{wl.localPort}</span>
                                        </div>
                                        <div>
                                            <span className="text-slate-500 block">Remote Peer</span>
                                            <span className="font-mono text-slate-200 mt-0.5 block truncate">{wl.remoteDevice}</span>
                                            <span className="text-slate-400 font-mono">{wl.remotePort}</span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
