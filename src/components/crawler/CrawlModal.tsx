"use client";

import React, { useState } from "react";
import { 
    X, 
    Play, 
    Server, 
    Network, 
    Sliders, 
    ShieldAlert, 
    CheckCircle2, 
    AlertCircle, 
    Layers, 
    Sparkles, 
    Terminal,
    RefreshCw
} from "lucide-react";

interface CrawlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newSnapshotId: string) => void;
}

export default function CrawlModal({ isOpen, onClose, onSuccess }: CrawlModalProps) {
    const [mode, setMode] = useState<"mock" | "live">("mock");
    const [name, setName] = useState<string>("Lab Topology Snapshot");
    const [seeds, setSeeds] = useState<string>("10.10.1.1, 10.20.1.1");
    const [maxDepth, setMaxDepth] = useState<number>(5);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleRunCrawl = async () => {
        setError(null);
        setStatusMessage(null);
        setLoading(true);

        try {
            setStatusMessage(mode === "mock" ? "Generating topology from lab fixtures..." : "Connecting to seeds via SSH worker...");

            const payload: any = {
                name: name.trim() || (mode === "mock" ? "Mock Lab Topology" : "Live Production Crawl"),
                useMock: mode === "mock",
                seeds: mode === "live" ? seeds.split(",").map(s => s.trim()).filter(Boolean) : undefined,
                maxDepth: mode === "live" ? maxDepth : undefined
            };

            const res = await fetch("/api/crawler/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Crawl operation failed.");
            }

            setStatusMessage("Crawl completed and saved to PostgreSQL successfully!");
            setTimeout(() => {
                onSuccess(data.snapshotId);
                onClose();
            }, 1000);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred during the crawl.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <Network className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">Initiate Network Crawl</h2>
                            <p className="text-xs text-slate-400">Spider network switches via CDP neighbors and build topology.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Mode selector */}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                setMode("mock");
                                setName("Lab Multi-Site Topology");
                            }}
                            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                                mode === "mock"
                                    ? "bg-blue-600/10 border-blue-500/50 text-white ring-1 ring-blue-500/30"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-xs text-white">Lab Topology (Mock)</span>
                                <Sparkles className={`w-4 h-4 ${mode === "mock" ? "text-blue-400" : "text-slate-600"}`} />
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">
                                Instant multi-tier simulation with 24 switches, OSPF routes, and 802.1Q trunks.
                            </p>
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setMode("live");
                                setName("Production Campus Crawl");
                            }}
                            className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                                mode === "live"
                                    ? "bg-blue-600/10 border-blue-500/50 text-white ring-1 ring-blue-500/30"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                            }`}
                        >
                            <div className="flex items-center justify-between mb-1.5">
                                <span className="font-semibold text-xs text-white">Live Cisco SSH Crawl</span>
                                <Terminal className={`w-4 h-4 ${mode === "live" ? "text-blue-400" : "text-slate-600"}`} />
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">
                                Connects to seed switches via Netmiko and recursively walks CDP neighbors.
                            </p>
                        </button>
                    </div>

                    {/* Snapshot Name */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">Snapshot Label</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Core Network Q1 Audit"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                        />
                    </div>

                    {/* Live mode specific options */}
                    {mode === "live" && (
                        <div className="space-y-4 pt-2 border-t border-slate-800">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-300">Seed Switch IP Addresses</label>
                                <input
                                    type="text"
                                    value={seeds}
                                    onChange={(e) => setSeeds(e.target.value)}
                                    placeholder="10.10.1.1, 10.20.1.1"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                                />
                                <span className="text-[11px] text-slate-500">
                                    Comma-separated IPs of core or distribution switches to start CDP spidering from.
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-300">Max Hop Depth</span>
                                    <span className="font-mono text-blue-400 font-bold">{maxDepth} hops</span>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={maxDepth}
                                    onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                                    className="w-full accent-blue-500 cursor-pointer"
                                />
                            </div>
                        </div>
                    )}

                    {/* Status message */}
                    {statusMessage && (
                        <div className="p-3 bg-blue-950/40 border border-blue-800/80 rounded-xl text-xs text-blue-300 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                            <span>{statusMessage}</span>
                        </div>
                    )}

                    {/* Error message */}
                    {error && (
                        <div className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleRunCrawl}
                        disabled={loading}
                        className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white rounded-xl shadow-lg shadow-blue-500/20 flex items-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <>
                                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                                Crawling...
                            </>
                        ) : (
                            <>
                                <Play className="w-3.5 h-3.5 fill-current" />
                                Start Crawl
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
