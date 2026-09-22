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
    Compass
} from "lucide-react";

interface DeviceInspectorDrawerProps {
    device: any | null;
    onClose: () => void;
    onSetAsSource?: (ip: string) => void;
    onSetAsDestination?: (ip: string) => void;
}

export default function DeviceInspectorDrawer({
    device,
    onClose,
    onSetAsSource,
    onSetAsDestination
}: DeviceInspectorDrawerProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "interfaces" | "routes" | "vlans" | "cdp">("overview");

    if (!device) return null;

    const rawInterfaces = device.interfaces || {};
    const interfaces: any[] = Array.isArray(rawInterfaces)
        ? rawInterfaces
        : Object.entries(rawInterfaces).map(([name, val]: [string, any]) => ({
            name,
            ...(typeof val === "object" ? val : {})
        }));

    const rawRoutes = device.routes || [];
    const routes: any[] = Array.isArray(rawRoutes) ? rawRoutes : Object.values(rawRoutes);

    const rawVlans = device.vlans || [];
    const vlans: any[] = Array.isArray(rawVlans) ? rawVlans : Object.values(rawVlans);

    const rawCdp = device.cdpNeighbors || device.cdp_neighbors || [];
    const cdpNeighbors: any[] = Array.isArray(rawCdp) ? rawCdp : Object.values(rawCdp);

    const isReachable = device.status ? device.status === "REACHABLE" : device.reachable !== false;
    const primaryIp = device.ipAddress || device.ip_address || (interfaces.find(i => i.ip_address)?.ip_address ?? "");
    const deviceError = device.failureReason || device.error;
    const deviceVersion = device.osVersion || device.version || "Cisco IOS-XE";
    const deviceSerial = device.serialNumber || device.serial || "FTX2209A01B";
    const deviceModel = device.platform || device.model || "Cisco Catalyst";

    return (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[540px] bg-slate-900 border-l border-slate-800 shadow-2xl z-50 flex flex-col transition-all duration-300">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-800 flex items-start justify-between bg-slate-950/70">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl border ${
                        !isReachable 
                            ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                            : device.role === 'Router'
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                            : device.role === 'L3 Switch'
                            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                            : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                    }`}>
                        <Server className="w-6 h-6" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-white tracking-tight">{device.hostname}</h2>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
                                !isReachable 
                                    ? 'bg-red-950/60 text-red-400 border-red-800' 
                                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            }`}>
                                {isReachable ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {isReachable ? 'Reachable' : 'Unreachable'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                            <span className="font-mono text-slate-300">{device.ip_address || "No Mgmt IP"}</span>
                            <span>•</span>
                            <span className="text-slate-400 font-medium">{device.role || "Unknown Role"}</span>
                            <span>•</span>
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 rounded font-semibold">{device.site || "Core"}</span>
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

            {/* Quick Actions (Set as Source / Dest) */}
            {primaryIp && (
                <div className="px-6 py-2.5 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">Quick Tracer Actions:</span>
                    <div className="flex items-center gap-2">
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
                    </div>
                )}

                {activeTab === "interfaces" && (
                    <div className="space-y-3">
                        <div className="text-xs text-slate-400 flex items-center justify-between">
                            <span>Discovered Physical & Virtual Interfaces</span>
                            <span className="font-mono">{interfaces.length} total</span>
                        </div>
                        {interfaces.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">No interfaces recorded in this snapshot.</p>
                        ) : (
                            <div className="space-y-2">
                                {interfaces.map((intf: any, idx: number) => {
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
