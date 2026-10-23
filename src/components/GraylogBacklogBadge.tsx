"use client";

import React, { useEffect, useState, useRef } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type {
    GraylogBacklogGuardianReport,
    GraylogClusterJournalTelemetry,
} from "@/lib/graylog-backlog-guardian";

export default function GraylogBacklogBadge() {
    const [report, setReport] = useState<GraylogBacklogGuardianReport | null>(null);
    const [open, setOpen] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchStatus = async (force = false) => {
        if (force) setRefreshing(true);
        try {
            const res = await fetch(`/api/graylog/backlog-status${force ? "?refresh=true" : ""}`);
            if (res.ok) {
                const data = await res.json();
                setReport(data);
            }
        } catch {
            // Ignore transient network errors
        } finally {
            if (force) setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStatus(false);
        const timer = setInterval(() => fetchStatus(false), 30_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const handleOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) {
            document.addEventListener("mousedown", handleOutside);
        }
        return () => document.removeEventListener("mousedown", handleOutside);
    }, [open]);

    if (!report) return null;

    const { ogGraylog, newGraylog, anyBacklogged, maxLagSeconds } = report;
    const maxLagMinutes = Math.round(maxLagSeconds / 60);

    const formatCount = (n: number) => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
        return String(n);
    };

    const renderClusterCard = (c: GraylogClusterJournalTelemetry) => {
        const isBacklogged = c.status === "BACKLOGGED" || c.status === "CRITICAL_FULL";
        const isMinor = c.status === "MINOR_LAG";
        return (
            <div
                key={c.cluster}
                className={`rounded-lg border p-3 space-y-2 ${
                    isBacklogged
                        ? "bg-amber-950/25 border-amber-500/40"
                        : isMinor
                        ? "bg-yellow-950/20 border-yellow-500/30"
                        : "bg-slate-900/80 border-slate-800"
                }`}
            >
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-xs font-bold text-white">{c.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.host}</div>
                    </div>
                    {isBacklogged ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <AlertTriangle className="w-3 h-3" />
                            ~{Math.round(c.lagMinutes)}m Lag
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            Real-Time
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                    <div className="bg-slate-950/60 rounded p-1.5 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Journal Queue</div>
                        <div className="font-mono font-semibold text-slate-200">
                            {formatCount(c.uncommittedEntries)} ({c.utilizationPct}%)
                        </div>
                    </div>
                    <div className="bg-slate-950/60 rounded p-1.5 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">In / Out Rate</div>
                        <div className="font-mono font-semibold text-slate-200">
                            {formatCount(c.appendEventsPerSec)}/s • {formatCount(c.readEventsPerSec)}/s
                        </div>
                    </div>
                    <div className="bg-slate-950/60 rounded p-1.5 border border-slate-800/80">
                        <div className="text-[10px] text-slate-400">Net Drain / ETA</div>
                        <div
                            className={`font-mono font-semibold ${
                                c.netDrainRatePerSec >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}
                        >
                            {c.netDrainRatePerSec >= 0 ? "+" : ""}
                            {formatCount(c.netDrainRatePerSec)}/s
                            {c.etaClearMinutes ? ` (~${c.etaClearMinutes}m)` : ""}
                        </div>
                    </div>
                </div>

                {c.lagSeconds >= 90 && (
                    <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                        Newest indexed logs: <span className="font-mono">{new Date(c.newestIndexedEstimateIso).toLocaleTimeString()}</span>.
                        Backlog Guardian is auto-expanding search ranges by <span className="font-semibold">+{Math.round(c.lagMinutes)}m</span>.
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    anyBacklogged
                        ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40"
                        : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                }`}
                title="Graylog Backlog Guardian — Real-time journal telemetry & search window compensation"
            >
                <span
                    className={`w-2 h-2 rounded-full ${
                        anyBacklogged ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                    }`}
                />
                <span className="hidden md:inline">
                    {anyBacklogged
                        ? `SIEM Backlog: ~${maxLagMinutes}m Lag (Guardian Active)`
                        : "SIEM Journal: Real-Time"}
                </span>
                <span className="md:hidden">
                    {anyBacklogged ? `~${maxLagMinutes}m Lag` : "SIEM OK"}
                </span>
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-[380px] sm:w-[430px] rounded-xl bg-slate-950 border border-slate-800 shadow-2xl p-4 z-50 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-indigo-400" />
                            <div>
                                <div className="text-xs font-bold text-white">
                                    Graylog Backlog Guardian
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    Real-time journal lag detection & automatic search range compensation
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => fetchStatus(true)}
                            disabled={refreshing}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer"
                            title="Refresh journal telemetry now"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
                        </button>
                    </div>

                    <div className="space-y-2.5">
                        {renderClusterCard(ogGraylog)}
                        {renderClusterCard(newGraylog)}
                    </div>

                    <div className="text-[11px] text-slate-400 bg-slate-900/70 border border-slate-800/80 rounded-lg p-2.5 leading-relaxed">
                        <span className="text-indigo-300 font-semibold">How it works:</span> Whenever a Graylog disk journal falls behind, all UI queries (NetScaler, Imprivata, Lockouts, Histograms) and background daemons automatically shift/expand their lookback window by the exact journal lag so no events are missed.
                    </div>
                </div>
            )}
        </div>
    );
}
