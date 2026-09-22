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
}

export default function PathTracerPanel({
    snapshotId,
    sourceIp,
    destinationIp,
    onSourceIpChange,
    onDestinationIpChange,
    onPathDiscovered,
    onSelectDevice
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                        <RouteIcon className="w-5 h-5" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                            Hop-by-Hop Path Tracer
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                Native LPM Engine
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            Simulate packet traversal, VLAN tags, and L3 longest prefix matching.
                        </p>
                    </div>
                </div>

                {traceResult && (
                    <button
                        onClick={() => {
                            setTraceResult(null);
                            onPathDiscovered(null);
                        }}
                        className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Clear
                    </button>
                )}
            </div>

            {/* Inputs & Action */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Source Host / Gateway IP</label>
                    <input
                        type="text"
                        placeholder="e.g. 10.10.10.50"
                        value={sourceIp}
                        onChange={(e) => onSourceIpChange(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                    />
                </div>

                <div className="md:col-span-5 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Destination IP</label>
                    <input
                        type="text"
                        placeholder="e.g. 10.20.50.88"
                        value={destinationIp}
                        onChange={(e) => onDestinationIpChange(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                    />
                </div>

                <div className="md:col-span-2">
                    <button
                        onClick={() => runTrace()}
                        disabled={loading}
                        className="w-full h-[42px] bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                                Tracing...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Trace
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 flex items-center gap-1 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Quick Presets:
                </span>
                <button
                    onClick={() => handlePreset("10.10.10.50", "10.20.50.88")}
                    className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-slate-300 font-mono transition flex items-center gap-1"
                >
                    Cross-Site: 10.10.10.50 <ArrowRight className="w-3 h-3 text-slate-500" /> 10.20.50.88
                </button>
                <button
                    onClick={() => handlePreset("10.10.10.50", "10.10.20.100")}
                    className="px-2.5 py-1 bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 rounded-lg text-slate-300 font-mono transition flex items-center gap-1"
                >
                    Inter-VLAN (Site 101): 10.10.10.50 <ArrowRight className="w-3 h-3 text-slate-500" /> 10.10.20.100
                </button>
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
    );
}
