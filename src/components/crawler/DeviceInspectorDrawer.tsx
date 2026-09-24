"use client";

import React, { useState } from "react";
import { 
    X, 
    Server, 
    Network, 
    Cpu, 
    Activity, 
    Route as RouteIcon, 
    Layers, 
    Share2, 
    AlertTriangle, 
    CheckCircle2, 
    XCircle,
    ArrowRightLeft,
    Compass,
    KeyRound,
    Zap,
    Hash,
    Play,
    Clock,
    Tag
} from "lucide-react";
import { CrawlIcon } from "./CrawlIcon";
import { detectSwitchStack, parseFloorFromIdf } from "./TopologyGraph";

export function formatFullVerifiedDate(ts?: string | null): string {
    if (!ts) return "Never Verified";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Never Verified";
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    });
}

interface DeviceInspectorDrawerProps {
    device: any | null;
    onClose: () => void;
    onSetAsSource?: (ip: string) => void;
    onSetAsDestination?: (ip: string) => void;
    onReseed?: (device: any) => void;
}

export default function DeviceInspectorDrawer({
    device,
    onClose,
    onSetAsSource,
    onSetAsDestination,
    onReseed
}: DeviceInspectorDrawerProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "interfaces" | "routes" | "vlans" | "cdp">("overview");
    const [stackMemberFilter, setStackMemberFilter] = useState<string>("ALL");

    if (!device) return null;

    const stackInfo = detectSwitchStack(device);

    const rawInterfaces = device.interfaces || {};
    const interfaces: any[] = Array.isArray(rawInterfaces)
        ? rawInterfaces
        : Object.entries(rawInterfaces).map(([name, val]: [string, any]) => ({
            name,
            ...(typeof val === "object" ? val : {})
        }));

    const displayedInterfaces = (stackInfo.isStack && stackMemberFilter !== "ALL")
        ? interfaces.filter((i: any) => {
            const m = (i.name || "").match(/^[A-Za-z]+(\d+)\/\d+\/\d+/);
            return m && m[1] === stackMemberFilter;
        })
        : interfaces;

    const rawRoutes = device.routes || [];
    const routes: any[] = Array.isArray(rawRoutes) ? rawRoutes : Object.values(rawRoutes);

    const rawVlans = device.vlans || [];
    const vlans: any[] = Array.isArray(rawVlans) ? rawVlans : Object.values(rawVlans);

    const rawCdp = device.cdpNeighbors || device.cdp_neighbors || [];
    const cdpNeighbors: any[] = Array.isArray(rawCdp) ? rawCdp : Object.values(rawCdp);

    const isUnverified = device.status === "UNVERIFIED";
    const isReachable = device.status ? device.status === "REACHABLE" : device.reachable !== false;
    const primaryIp = device.ipAddress || device.ip_address || (interfaces.find(i => i.ip_address)?.ip_address ?? "");
    const deviceError = device.failureReason || device.error;
    const deviceVersion = device.osVersion || device.version || "Cisco IOS-XE";
    const deviceSerial = device.serialNumber || device.serial || "FTX2209A01B";
    const deviceModel = device.platform || device.model || "Cisco Catalyst";

    const shortHost = (device.hostname || "").split(".")[0].trim();
    const siteCode = device.site || (shortHost.length >= 3 ? shortHost.slice(0, 3).toUpperCase() : "UNK");
    const idfCode = device.idf || (shortHost.includes("-") && shortHost.split("-")[1] ? shortHost.split("-")[1].slice(0, 3).toUpperCase() : "MDF");
    const floorInfo = parseFloorFromIdf(idfCode);
    const isL3 = device.role === "Router" || device.role === "L3 Switch" || device.role === "L3";

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all duration-300">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/70">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                        isUnverified
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : !isReachable 
                            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                            : device.role === 'Router'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : device.role === 'L3 Switch'
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>
                        {isUnverified ? <Compass className="w-6 h-6" /> : <Server className="w-6 h-6" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white tracking-tight">{device.hostname}</h2>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                isUnverified
                                    ? 'bg-amber-950/60 text-amber-400 border-amber-700/80'
                                    : !isReachable 
                                    ? 'bg-red-950/60 text-red-400 border-red-800' 
                                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            }`}>
                                {isUnverified ? <Compass className="w-3 h-3" /> : isReachable ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {isUnverified ? 'Unverified Boundary' : isReachable ? 'Reachable' : 'Unreachable'}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                                isL3 ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                                {isL3 ? 'L3' : 'L2'}
                            </span>
                            {device.isVendorManaged && (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-purple-950/80 text-purple-300 border-purple-800">
                                    Vendor Managed
                                </span>
                            )}
                            {(device.isMultiCloset || device.flaggedForInvestigation) && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-amber-950/80 text-amber-300 border-amber-600/80">
                                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                                    Multi-Closet Conflict
                                </span>
                            )}
                            {stackInfo.isStack && (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-purple-500/10 text-purple-300 border-purple-500/40 flex items-center gap-1">
                                    <Layers className="w-3 h-3 text-purple-400" />
                                    StackWise ({stackInfo.stackSize}x • {stackInfo.portCount}p)
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                            <span className="font-mono text-slate-300">{primaryIp || "No Mgmt IP"}</span>
                            <span>•</span>
                            <span className="text-slate-400 font-medium">{device.role || "Unknown Role"}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-semibold">{siteCode}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-semibold">IDF: {idfCode}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.2 bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded font-semibold">{floorInfo.floorLabel}</span>
                            {(device.hopDistance !== undefined && device.hopDistance !== null) && (
                                <>
                                    <span>•</span>
                                    <span className="px-1.5 py-0.2 bg-blue-950 text-blue-300 rounded font-mono text-[10px] border border-blue-800/60">
                                        {device.hopDistance === 0 ? "Seed (Hop 0)" : `Hop ${device.hopDistance}`}
                                    </span>
                                </>
                            )}
                        </div>
                        {device.allIps && device.allIps.length > 1 && (
                            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-400">
                                <span className="text-slate-500 font-medium">Reachable via {device.allIps.length} IPs:</span>
                                <div className="flex flex-wrap gap-1">
                                    {device.allIps.map((ip: string) => (
                                        <span key={ip} className="font-mono text-cyan-300 bg-cyan-950/50 px-1.5 py-0.2 rounded border border-cyan-800/40 text-[10px]">
                                            {ip}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1.5">
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-slate-500 font-medium">Last Verified:</span>
                                <span className={`font-mono font-medium ${
                                    device.lastVerifiedAt ? "text-emerald-400" : "text-amber-400"
                                }`}>
                                    {formatFullVerifiedDate(device.lastVerifiedAt)}
                                </span>
                            </div>
                            {device.credentialUsed && (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500 font-medium">Auth:</span>
                                    <span className="text-emerald-400 font-mono font-medium">{device.credentialUsed}</span>
                                    {device.authTimeMs !== undefined && device.authTimeMs !== null && (
                                        <span className="text-slate-500 font-mono text-[10px]">({device.authTimeMs}ms)</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                    title="Close"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Quick Actions (Set as Source / Dest / Initiate Crawl) */}
            {primaryIp && (
                <div className="px-6 py-2.5 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Quick Actions:</span>
                    <div className="flex items-center gap-2">
                        {onReseed && isReachable && (
                            <button
                                onClick={() => onReseed(device)}
                                className="px-2.5 py-1 text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/60 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                                title={`Initiate crawl seeding from ${device.hostname} (${primaryIp})`}
                            >
                                <CrawlIcon size={14} className="text-blue-400" />
                                Initiate Crawl
                            </button>
                        )}
                        {onSetAsSource && (
                            <button
                                onClick={() => onSetAsSource(primaryIp)}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg transition"
                            >
                                Set as Source IP
                            </button>
                        )}
                        {onSetAsDestination && (
                            <button
                                onClick={() => onSetAsDestination(primaryIp)}
                                className="px-2.5 py-1 text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg transition"
                            >
                                Set as Dest IP
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Multi-Closet Conflict Investigation Alert */}
            {(device.flaggedForInvestigation || device.isMultiCloset) && (
                <div className="px-6 py-3 bg-amber-500/15 border-b border-amber-500/40 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        Multi-Closet Conflict (Flagged for Investigation)
                    </div>
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                        This unverified device was discovered via CDP by switches across multiple distinct closets {Array.isArray(device.discoveredClosets) && device.discoveredClosets.length > 0 ? `(${device.discoveredClosets.map((c: any) => `${c.site} / ${c.idf}`).join(', ')})` : ""}.
                        Per network discovery policy, unverified devices adopt discovering closets and do not spawn unverified Sites or IDFs. Instances are placed in each discovering closet.
                    </p>
                    {device.investigationReason && (
                        <div className="text-[11px] font-mono text-amber-300/80 bg-amber-950/60 p-2 rounded border border-amber-500/30">
                            {device.investigationReason}
                        </div>
                    )}
                </div>
            )}

            {/* Unverified Boundary Device Alert */}
            {isUnverified && (
                <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                            <Compass className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-amber-300 block">
                                Unverified Frontier Switch (Hop {device.hopDistance ?? 1})
                            </span>
                            <span className="text-[11px] text-amber-200/80">
                                Discovered via neighbor CDP/LLDP from {device.discoveredVia || "adjacent switch"}. Uncrawled because the hop limit was reached.
                            </span>
                        </div>
                    </div>
                    {onReseed && (
                        <button
                            onClick={() => onReseed(device)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                            <CrawlIcon size={14} className="text-slate-950" />
                            Reseed from this Switch
                        </button>
                    )}
                </div>
            )}

            {/* Reseed Frontier Boundary Alert */}
            {(device.isReseedFrontier || (Array.isArray(device.boundaryNeighbors) && device.boundaryNeighbors.length > 0)) && (
                <div className="px-6 py-3 bg-amber-500/10 border-b border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                            <Compass className="w-4 h-4" />
                        </div>
                        <div>
                            <span className="text-xs font-bold text-amber-300 block">
                                Hop Depth Boundary (Hop {device.hopDistance ?? 10})
                            </span>
                            <span className="text-[11px] text-amber-200/80">
                                {device.boundaryNeighbors?.length || 0} unvisited neighbor switch(es) detected at Hop {(device.hopDistance ?? 10) + 1}. Expansion halted safely.
                            </span>
                        </div>
                    </div>
                    {onReseed && (
                        <button
                            onClick={() => onReseed(device)}
                            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition shadow flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                            <CrawlIcon size={14} className="text-slate-950" />
                            Reseed from this Switch
                        </button>
                    )}
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 gap-2">
                {[
                    { id: "overview", label: "Overview", icon: Cpu },
                    { id: "interfaces", label: `Interfaces (${interfaces.length})`, icon: Network },
                    { id: "routes", label: `Routes (${routes.length})`, icon: RouteIcon },
                    { id: "vlans", label: `VLANs (${vlans.length})`, icon: Layers },
                    { id: "cdp", label: `CDP (${cdpNeighbors.length})`, icon: Share2 }
                ].map((t) => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id as any)}
                            className={`flex items-center gap-1.5 py-3 px-2 text-xs font-semibold border-b-2 transition -mb-[1px] ${
                                isActive 
                                    ? "text-blue-400 border-blue-500 bg-slate-900/60" 
                                    : "text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700"
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Error Banner if unreachable */}
                {!isReachable && (
                    <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 space-y-2">
                        <div className="flex items-center gap-2 font-semibold text-red-300">
                            <AlertTriangle className="w-4 h-4 text-red-400" />
                            Device Crawl Failure
                        </div>
                        <p className="text-xs text-red-300/90 leading-relaxed font-mono">
                            {deviceError || "Device was unreachable during the network crawl. Check credentials, ACLs, or physical connectivity."}
                        </p>
                    </div>
                )}

                {activeTab === "overview" && (
                    <div className="space-y-6">
                        {/* Crawl From Device Quick Action Card for fully discovered devices */}
                        {onReseed && isReachable && !isUnverified && (
                            <div className="bg-slate-950/80 rounded-xl p-4 border border-blue-500/30 flex items-center justify-between gap-4 shadow-lg shadow-blue-950/20">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                                        <CrawlIcon size={20} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                            Initiate Network Crawl
                                            <span className="px-1.5 py-0.2 text-[9px] bg-blue-500/20 text-blue-300 rounded font-semibold border border-blue-500/30">
                                                Seed Switch
                                            </span>
                                        </h4>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            Launch discovery crawl directly from <strong className="text-slate-200">{device.hostname}</strong> ({primaryIp || "Management IP"}).
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => onReseed(device)}
                                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5 shrink-0 cursor-pointer"
                                >
                                    <CrawlIcon size={14} className="text-white" />
                                    Crawl From Switch
                                </button>
                            </div>
                        )}

                        {/* Connected Peer Port & Description (Clue on Purpose / Vendor Ownership) */}
                        {(device.peerInterfaceDescription || device.discoveredPort || device.discoveredVia) && (
                            <div className="bg-slate-950/70 rounded-xl p-4 border border-cyan-800/50 space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Tag className="w-3.5 h-3.5 text-cyan-400" />
                                        Discovered Peer Port & Purpose Clue
                                    </span>
                                    {device.discoveredPort && (
                                        <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                                            {device.discoveredPort}
                                        </span>
                                    )}
                                </div>
                                {device.peerInterfaceDescription ? (
                                    <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40">
                                        <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                            Connected Peer Interface Description:
                                        </span>
                                        <span className="font-mono text-xs font-semibold text-cyan-200 block">
                                            "{device.peerInterfaceDescription}"
                                        </span>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-400">
                                        No interface description configured on discovering switch port.
                                    </p>
                                )}
                                {device.discoveredVia && (
                                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                                        <span className="text-slate-500">Discovered via peer:</span>
                                        <span className="font-mono text-slate-300 font-medium">{device.discoveredVia}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Switch Stack Architecture Card */}
                        {stackInfo.isStack && (
                            <div className="bg-purple-950/20 rounded-xl p-4 border border-purple-800/60 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                                        <Layers className="w-4 h-4 text-purple-400" />
                                        Cisco Switch Stack Architecture (StackWise)
                                    </span>
                                    <span className="text-xs font-mono font-bold text-purple-300 bg-purple-900/60 px-2.5 py-0.5 rounded-full border border-purple-700">
                                        {stackInfo.stackSize} Chassis • {stackInfo.portCount} Ports
                                    </span>
                                </div>
                                <p className="text-xs text-purple-200/80 leading-relaxed">
                                    This managed switch operates as a unified multi-chassis StackWise stack of {stackInfo.stackSize} physical switches under a single management plane. Interfaces span {Array.from({ length: stackInfo.stackSize }, (_, i) => `Switch ${i + 1}`).join(", ")}.
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-purple-900/40">
                                    <span className="text-[11px] font-semibold text-purple-300">Inspect Member:</span>
                                    {stackInfo.members.map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => {
                                                setStackMemberFilter(m);
                                                setActiveTab("interfaces");
                                            }}
                                            className="px-2.5 py-1 text-xs rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/60 transition cursor-pointer flex items-center gap-1 font-mono"
                                        >
                                            <span>Switch {m}</span>
                                            <span className="text-[10px] text-purple-400">→</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Multi-IP Inventory & SVIs Card */}
                        {device.allIps && device.allIps.length > 1 && (
                            <div className="bg-slate-950/60 rounded-xl p-4 border border-cyan-800/40 space-y-2">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                    <Network className="w-3.5 h-3.5 text-cyan-400" />
                                    Multi-IP Inventory & SVIs ({device.allIps.length} Detected IPs)
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                    This switch is reachable and managed across multiple configured IP addresses (SVIs, Loopbacks, or routed ports) unified under this canonical device:
                                </p>
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                    {device.allIps.map((ip: string) => (
                                        <span key={ip} className="font-mono text-xs text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded-lg border border-cyan-800/50">
                                            {ip}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Hardware & System */}
                        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Cpu className="w-3.5 h-3.5 text-blue-400" />
                                Hardware & Software Info
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-500 block">Model</span>
                                    <span className="font-semibold text-slate-200">{deviceModel}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Software Version</span>
                                    <span className="font-semibold text-slate-200 font-mono text-[11px] truncate block" title={deviceVersion}>
                                        {deviceVersion}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Serial Number</span>
                                    <span className="font-mono text-slate-200">{deviceSerial}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Uptime</span>
                                    <span className="text-slate-200">{device.uptime || "142 days, 4 hours"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Network Role & Function */}
                        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                                Network Capabilities
                            </h3>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between py-1 border-b border-slate-800/60">
                                    <span className="text-slate-400">Primary Role</span>
                                    <span className="font-semibold text-white">{device.role}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/60">
                                    <span className="text-slate-400">Active Routing Engine</span>
                                    <span className="font-semibold text-white">{routes.length > 0 ? "Enabled (IPv4 Routing Active)" : "L2 Switching Only"}</span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-slate-800/60">
                                    <span className="text-slate-400">Total Interfaces Monitored</span>
                                    <span className="font-mono text-white">{interfaces.length} interfaces</span>
                                </div>
                                <div className="flex justify-between py-1">
                                    <span className="text-slate-400">Direct Neighbor Adjacencies</span>
                                    <span className="font-mono text-white">{cdpNeighbors.length} peers</span>
                                </div>
                            </div>
                        </div>

                        {/* Crawl & Credential Audit */}
                        <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80 space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                                Credential & Crawl Audit
                            </h3>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-500 block">Credential Profile</span>
                                    <span className="text-emerald-400 font-mono font-semibold">{device.credentialUsed || "Primary TACACS+"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Auth Latency</span>
                                    <span className="text-slate-200 font-mono font-semibold">{device.authTimeMs !== undefined && device.authTimeMs !== null ? `${device.authTimeMs} ms` : "—"}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Hop Distance from Seed</span>
                                    <span className="text-blue-300 font-mono font-semibold">{device.hopDistance === 0 ? "0 (Seed Switch)" : `${device.hopDistance} hops`}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 block">Discovered Via</span>
                                    <span className="text-slate-300 font-mono truncate block" title={device.discoveredVia || "Seed"}>{device.discoveredVia || "Seed Device"}</span>
                                </div>
                                <div className="col-span-2 pt-2 border-t border-slate-800">
                                    <span className="text-slate-500 block">Last Verified Date &amp; Time</span>
                                    <span className={`font-mono font-semibold ${
                                        device.lastVerifiedAt ? "text-emerald-400" : "text-amber-400"
                                    }`}>
                                        {formatFullVerifiedDate(device.lastVerifiedAt)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "interfaces" && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                            <span>Discovered Physical &amp; Virtual Interfaces</span>
                            <span className="font-mono">{interfaces.length} total</span>
                        </div>

                        {/* Stack Member Switch Filter */}
                        {stackInfo.isStack && (
                            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900/80 rounded-lg border border-slate-800 text-[11px]">
                                <span className="px-2 text-slate-400 font-bold uppercase text-[9px]">Stack Member:</span>
                                <button
                                    onClick={() => setStackMemberFilter("ALL")}
                                    className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                                        stackMemberFilter === "ALL"
                                            ? "bg-purple-600 text-white shadow-sm"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    All ({interfaces.length})
                                </button>
                                {Array.from({ length: stackInfo.stackSize }, (_, i) => String(i + 1)).map((swNum) => (
                                    <button
                                        key={swNum}
                                        onClick={() => setStackMemberFilter(swNum)}
                                        className={`px-2.5 py-0.5 rounded font-medium transition cursor-pointer ${
                                            stackMemberFilter === swNum
                                                ? "bg-purple-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        Switch {swNum}
                                    </button>
                                ))}
                            </div>
                        )}

                        {displayedInterfaces.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">No interfaces recorded in this filter.</p>
                        ) : (
                            <div className="space-y-2">
                                {displayedInterfaces.map((intf: any, idx: number) => {
                                    const isUp = intf.status === "up" || intf.status === "connected";
                                    return (
                                        <div key={idx} className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1.5 hover:border-slate-700 transition">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-white">{intf.name}</span>
                                                    {intf.ip_address && (
                                                        <span className="px-1.5 py-0.5 rounded bg-blue-950/80 text-blue-300 font-mono text-[11px] border border-blue-800/60">
                                                            {intf.ip_address}{intf.cidr ? `/${intf.cidr}` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                                    isUp 
                                                        ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800' 
                                                        : 'bg-red-950/60 text-red-400 border-red-800'
                                                }`}>
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isUp ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                                                    {intf.status || "down"}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] pt-1 border-t border-slate-900">
                                                <div>
                                                    <span className="text-slate-500">VLAN / Mode: </span>
                                                    <span className="text-slate-300">{intf.vlan ? `Vlan ${intf.vlan}` : (intf.mode || "Routed")}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500">Description: </span>
                                                    <span className="text-slate-300 truncate block">{intf.description || "—"}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "routes" && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                            <span>IPv4 Routing Table (LPM Target)</span>
                            <span className="font-mono">{routes.length} prefixes</span>
                        </div>
                        {routes.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">No routing entries recorded (L2 switch or no routes parsed).</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                                <table className="w-full text-xs text-left">
                                    <thead className="text-[11px] text-slate-400 bg-slate-900 border-b border-slate-800 uppercase">
                                        <tr>
                                            <th className="py-2.5 px-3">Network</th>
                                            <th className="py-2.5 px-3">Protocol</th>
                                            <th className="py-2.5 px-3">Next Hop</th>
                                            <th className="py-2.5 px-3">Interface</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-900 font-mono">
                                        {routes.map((r: any, idx: number) => (
                                            <tr key={idx} className="hover:bg-slate-900/50">
                                                <td className="py-2 px-3 font-semibold text-white">
                                                    {r.network || r.prefix || "0.0.0.0"}/{r.cidr || r.mask || "0"}
                                                </td>
                                                <td className="py-2 px-3 text-slate-300">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                                                        r.protocol === "connected" ? "bg-emerald-950 text-emerald-400" :
                                                        r.protocol === "static" ? "bg-blue-950 text-blue-400" :
                                                        r.protocol === "ospf" ? "bg-purple-950 text-purple-400" :
                                                        "bg-amber-950 text-amber-400"
                                                    }`}>
                                                        {r.protocol || "C"}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3 text-slate-400">{r.next_hop || "Direct"}</td>
                                                <td className="py-2 px-3 text-slate-300 font-semibold">{r.interface || "—"}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "vlans" && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                            <span>Configured Layer-2 VLANs</span>
                            <span className="font-mono">{vlans.length} VLANs</span>
                        </div>
                        {vlans.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">No VLAN database items found.</p>
                        ) : (
                            <div className="space-y-2">
                                {vlans.map((v: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-blue-400">
                                                {v.id || v.vlan_id}
                                            </div>
                                            <div>
                                                <span className="font-semibold text-white block">{v.name || `VLAN ${v.id}`}</span>
                                                <span className="text-[11px] text-slate-400 font-mono">
                                                    Status: {v.status || "active"}
                                                </span>
                                            </div>
                                        </div>
                                        {v.ports && (
                                            <span className="text-[11px] text-slate-400 font-mono max-w-[200px] truncate" title={v.ports.join(", ")}>
                                                {v.ports.length} ports
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "cdp" && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                            <span>Cisco Discovery Protocol (CDP) Neighbors</span>
                            <span className="font-mono">{cdpNeighbors.length} neighbors</span>
                        </div>
                        {cdpNeighbors.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">No CDP neighbors recorded for this device.</p>
                        ) : (
                            <div className="space-y-2">
                                {cdpNeighbors.map((n: any, idx: number) => (
                                    <div key={idx} className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-white font-mono">{n.destination_host || n.device_id}</span>
                                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                                {n.platform || "Cisco"}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-900 font-mono">
                                            <span>Local: <strong className="text-slate-200">{n.local_port || n.local_interface}</strong></span>
                                            <span>Remote: <strong className="text-slate-200">{n.remote_port || n.remote_interface}</strong></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
