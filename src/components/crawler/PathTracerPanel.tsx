"use client";

import React, { useState } from "react";
import { 
    Send, 
    Route as RouteIcon, 
    ArrowRight, 
    CheckCircle2, 
    AlertTriangle, 
    XCircle, 
    Clock, 
    Layers, 
    Server, 
    Sparkles,
    RotateCcw
} from "lucide-react";

interface PathTracerPanelProps {
    snapshotId: string;
    sourceIp: string;
    destinationIp: string;
    onSourceIpChange: (ip: string) => void;
    onDestinationIpChange: (ip: string) => void;
    onPathDiscovered: (result: any) => void;
    onSelectDevice: (hostname: string) => void;
    activeSnapshot?: any;
    onOpenCrawlModal?: () => void;
    className?: string;
}

export default function PathTracerPanel({
    snapshotId,
    sourceIp,
    destinationIp,
    onSourceIpChange,
    onDestinationIpChange,
    onPathDiscovered,
    onSelectDevice,
    activeSnapshot,
    onOpenCrawlModal,
    className
}: PathTracerPanelProps) {
    const [loading, setLoading] = useState(false);
    const [traceResult, setTraceResult] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);

    const runTrace = async (src?: string, dst?: string) => {
        const s = src || sourceIp;
        const d = dst || destinationIp;

        if (!s || !d) {
            setError("Please enter both a source and destination IPv4 address.");
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/crawler/trace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    snapshotId,
                    sourceIp: s.trim(),
                    destinationIp: d.trim()
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to trace packet path.");
            }

            setTraceResult(data);
            onPathDiscovered(data);
        } catch (err: any) {
            setError(err.message || "An error occurred during path tracing.");
            setTraceResult(null);
        } finally {
            setLoading(false);
        }
    };

    const handlePreset = (src: string, dst: string) => {
        onSourceIpChange(src);
        onDestinationIpChange(dst);
        runTrace(src, dst);
    };

    return (
        <div className={`flex-1 min-h-0 flex flex-col h-full overflow-hidden ${className || ""}`}>
            {/* Pinned Header */}
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
                <div className="flex items-center gap-2">
                    <RouteIcon className="w-4 h-4 text-blue-400" />
                    <div>
                        <div className="flex items-center gap-1.5">
                            <h2 className="text-xs font-bold text-white tracking-wide uppercase">Path Tracer</h2>
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
                                LPM
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-400">Simulate packet traversal & L3 matching</p>
                    </div>
                </div>

                {traceResult && (
                    <button
                        type="button"
                        onClick={() => {
                            setTraceResult(null);
                            onPathDiscovered(null);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-800 text-[11px] text-slate-400 hover:text-white hover:bg-slate-800/60 transition flex items-center gap-1 cursor-pointer"
                    >
                        <RotateCcw className="w-3 h-3" />
                        Clear
                    </button>
                )}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3.5 space-y-3.5">
                {/* Discovery Profile Active Notice */}
                {activeSnapshot?.crawlProfile === "DISCOVERY" && (
                    <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl flex items-start justify-between gap-3 text-xs text-amber-200">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold text-white block text-[11px]">Discovery Profile Active</span>
                                <p className="text-slate-300 text-[10px] leading-relaxed">
                                    Routing tables bypassed. To simulate LPM routing, initiate Spider Intensive crawl.
                                </p>
                            </div>
                        </div>
                        {onOpenCrawlModal && (
                            <button
                                type="button"
                                onClick={onOpenCrawlModal}
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[10px] shrink-0 transition cursor-pointer"
                            >
                                Crawl
                            </button>
                        )}
                    </div>
                )}

                {/* Form Inputs & Action */}
                <div className="space-y-2.5 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-300">Source Host / Gateway IP</label>
                        <input
                            type="text"
                            placeholder="e.g. 10.10.10.50"
                            value={sourceIp}
                            onChange={(e) => onSourceIpChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") runTrace(); }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-[11px] font-semibold text-slate-300">Destination IP</label>
                        <input
                            type="text"
                            placeholder="e.g. 10.20.50.88"
                            value={destinationIp}
                            onChange={(e) => onDestinationIpChange(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") runTrace(); }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => runTrace()}
                        disabled={loading}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-2 shadow-md shadow-blue-600/30 transition cursor-pointer disabled:cursor-not-allowed mt-1"
                    >
                        {loading ? (
                            <>
                                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                                <span>Tracing Packet Path...</span>
                            </>
                        ) : (
                            <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Trace Forwarding Path</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1.5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Quick Test Presets
                    </span>
                    <div className="flex flex-col gap-1.5">
                        <button
                            type="button"
                            onClick={() => handlePreset("10.10.10.50", "10.20.50.88")}
                            className="w-full px-2.5 py-1.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-[11px] font-mono transition flex items-center justify-between text-left cursor-pointer group"
                        >
                            <span className="text-slate-400 group-hover:text-white truncate">Cross-Site (10.10.10.50 &rarr; 10.20.50.88)</span>
                            <ArrowRight className="w-3 h-3 text-blue-400 shrink-0 ml-1" />
                        </button>
                        <button
                            type="button"
                            onClick={() => handlePreset("10.10.10.50", "10.10.20.100")}
                            className="w-full px-2.5 py-1.5 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 text-[11px] font-mono transition flex items-center justify-between text-left cursor-pointer group"
                        >
                            <span className="text-slate-400 group-hover:text-white truncate">Inter-VLAN (10.10.10.50 &rarr; 10.10.20.100)</span>
                            <ArrowRight className="w-3 h-3 text-blue-400 shrink-0 ml-1" />
                        </button>
                    </div>
                </div>

                {/* Error banner */}
                {error && (
                    <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

            {/* Trace Results */}
            {traceResult && (() => {
                const isSuccess = traceResult.delivered ?? (traceResult.status === "COMPLETED");
                const statusLabel = isSuccess ? "DELIVERED" : (traceResult.status || "UNREACHABLE");
                const statusReason = traceResult.message || traceResult.reason || "Hop-by-hop packet path simulation completed.";
                const totalHops = traceResult.hops?.length ?? traceResult.totalHops ?? 0;

                return (
                    <div className="space-y-4 pt-2 border-t border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                            <div className="flex items-center gap-3">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                                    isSuccess 
                                        ? "bg-emerald-950/80 text-emerald-400 border-emerald-800" 
                                        : "bg-red-950/80 text-red-400 border-red-800"
                                }`}>
                                    {isSuccess ? (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                    ) : (
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                    )}
                                    {statusLabel}
                                </span>
                                <span className="text-xs text-slate-300 font-medium">
                                    {statusReason}
                                </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                                {traceResult.executionTimeMs !== undefined && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3.5 h-3.5 text-blue-400" />
                                        {traceResult.executionTimeMs} ms
                                    </span>
                                )}
                                <span>•</span>
                                <span className="text-slate-300 font-bold">
                                    {totalHops} Hops
                                </span>
                            </div>
                        </div>

                        {/* Step-by-Step Path Cards */}
                        <div className="space-y-2.5">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                Forwarding Path Sequence ({totalHops} Switches/Routers)
                            </h3>

                            <div className="relative pl-6 space-y-3 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                                {traceResult.hops?.map((hop: any, idx: number) => {
                                    const isTerminal = idx === traceResult.hops.length - 1;
                                    const hopStep = hop.hopNumber ?? hop.step ?? (idx + 1);
                                    const hopDevice = hop.deviceName ?? hop.device;
                                    const hopRole = hop.role ?? hop.deviceRole;

                                    return (
                                        <div 
                                            key={idx}
                                            onClick={() => onSelectDevice(hopDevice)}
                                            className="relative bg-slate-950/80 hover:bg-slate-800/60 border border-slate-800 hover:border-blue-500/60 p-3.5 rounded-xl transition cursor-pointer group"
                                        >
                                            {/* Dot indicator */}
                                            <div className={`absolute -left-[23px] top-4 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                                                isTerminal ? 'bg-emerald-400 ring-2 ring-emerald-500/30' : 'bg-blue-400'
                                            }`} />

                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-bold text-slate-500">#{hopStep}</span>
                                                    <span className="text-sm font-bold text-white group-hover:text-blue-400 transition font-mono">
                                                        {hopDevice}
                                                    </span>
                                                    <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300 font-medium">
                                                        {hopRole}
                                                    </span>
                                                    {hop.forwardingType && (
                                                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/60 font-mono">
                                                            {hop.forwardingType}
                                                        </span>
                                                    )}
                                                </div>

                                                {hop.vlan && (
                                                    <span className="text-[11px] font-mono text-slate-400">
                                                        VLAN {hop.vlan}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs font-mono text-slate-400 pt-2 border-t border-slate-900">
                                                <div>
                                                    <span className="text-slate-500 block text-[10px]">Ingress Port:</span>
                                                    <span className="text-slate-300 font-semibold">{hop.ingressInterface || "Source / Access"}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-[10px]">Egress Port:</span>
                                                    <span className="text-emerald-400 font-semibold">{hop.egressInterface || "Terminal Port"}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 block text-[10px]">Next Hop L3 IP:</span>
                                                    <span className="text-blue-300 font-semibold">{hop.nextHopIp || "Direct / Local"}</span>
                                                </div>
                                            </div>

                                            {hop.notes && (
                                                <div className="mt-2 text-[11px] font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
                                                    <span className="text-slate-300">{hop.notes}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })()}
            </div>
        </div>
    );
}
