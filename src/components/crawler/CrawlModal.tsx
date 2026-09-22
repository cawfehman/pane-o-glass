"use client";

import React, { useState, useEffect, useRef } from "react";
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
    RefreshCw,
    Compass,
    Zap,
    Map as MapIcon,
    Search,
    Clock,
    Hash,
    Lock,
    KeyRound,
    Eye,
    EyeOff,
    StopCircle,
    Trash2,
    Plus,
    Info,
    Download
} from "lucide-react";

export interface CredentialItem {
    id: string;
    label: string;
    username: string;
    password: string;
    secret: string;
    showPassword?: boolean;
    showSecret?: boolean;
    hasSecret?: boolean;
}

interface CrawlModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newSnapshotId: string) => void;
    initialSeed?: string;
    initialMaxHops?: number;
}

export default function CrawlModal({ isOpen, onClose, onSuccess, initialSeed, initialMaxHops }: CrawlModalProps) {
    const [mode, setMode] = useState<"mock" | "live">(initialSeed ? "live" : "mock");
    const [profile, setProfile] = useState<"discovery" | "mapping" | "intensive">("intensive");
    const [name, setName] = useState<string>(initialSeed ? `Reseed from ${initialSeed}` : "Lab Multi-Site Topology");
    const [seeds, setSeeds] = useState<string>(initialSeed || "10.10.1.1, 10.20.1.1");
    const [maxHops, setMaxHops] = useState<number>(initialMaxHops ?? 1);
    const [enableLldp, setEnableLldp] = useState<boolean>(false);

    // Ephemeral credentials for live crawl (supports Primary + sequential Fallbacks)
    const [authMode, setAuthMode] = useState<"server" | "custom">("server");
    const [credentials, setCredentials] = useState<CredentialItem[]>([
        { id: "primary", label: "Primary (TACACS+ / Domain)", username: "admin", password: "", secret: "", showPassword: false, showSecret: false, hasSecret: false }
    ]);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const terminalRef = useRef<HTMLDivElement>(null);
    const modalBodyRef = useRef<HTMLDivElement>(null);

    // Instant, container-only scroll to bottom without vibrating/jitter
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    // Position modal body to terminal once when crawl begins
    useEffect(() => {
        if (loading && modalBodyRef.current) {
            modalBodyRef.current.scrollTop = modalBodyRef.current.scrollHeight;
        }
    }, [loading]);

    useEffect(() => {
        if (initialSeed) {
            setMode("live");
            setSeeds(initialSeed);
            setName(`Reseed from ${initialSeed}`);
            setMaxHops(initialMaxHops ?? 1);
        }
    }, [initialSeed, initialMaxHops]);

    if (!isOpen) return null;

    const handleAddFallback = () => {
        setCredentials(prev => [
            ...prev,
            {
                id: `fb-${Date.now()}`,
                label: `Fallback #${prev.length} (Local Admin)`,
                username: "localadmin",
                password: "",
                secret: "",
                showPassword: false,
                showSecret: false,
                hasSecret: false
            }
        ]);
    };

    const handleRemoveFallback = (id: string) => {
        setCredentials(prev => prev.filter(c => c.id !== id));
    };

    const handleUpdateCredential = (id: string, field: keyof CredentialItem, value: any) => {
        setCredentials(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
    };

    const handleDownloadLogs = () => {
        if (logs.length === 0) return;
        const blob = new Blob([logs.join("\n")], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `crawl_console_${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const getLogLineStyle = (line: string) => {
        if (line.startsWith("[ERROR]") || line.includes("failed") || line.includes("Failed") || line.includes("AuthenticationException")) {
            return "text-red-400";
        }
        if (line.startsWith("[WARNING]") || line.includes("WARNING")) {
            return "text-amber-400";
        }
        if (line.startsWith("[SUCCESS]") || line.startsWith("[DONE]") || line.includes("REACHABLE") || line.includes("FALLBACK_SUCCESS")) {
            return "text-emerald-400";
        }
        if (line.startsWith("[SSH]") || line.includes("Attempting SSH") || line.includes("Connecting")) {
            return "text-yellow-300";
        }
        if (line.startsWith("[INIT]") || line.startsWith("[DB]") || line.startsWith("[STATUS]")) {
            return "text-blue-400";
        }
        if (line.startsWith("[ABORTED]")) {
            return "text-orange-400";
        }
        return "text-slate-300";
    };

    const handleAbort = () => {
        if (abortController) {
            abortController.abort();
            setAbortController(null);
            setLoading(false);
            setStatusMessage("Crawl cancelled by user.");
            setLogs(prev => [...prev, "[ABORTED] Operation stopped by user."]);
        }
    };

    const handleRunCrawl = async () => {
        setError(null);
        setStatusMessage(null);
        setLogs([]);
        setLoading(true);

        const controller = new AbortController();
        setAbortController(controller);

        try {
            setStatusMessage(
                mode === "mock" 
                    ? `Generating ${profile.toUpperCase()} topology from lab fixtures...` 
                    : `Connecting to seeds via SSH worker (${profile.toUpperCase()} profile, ${maxHops} hop max)...`
            );

            const payload: any = {
                name: name.trim() || (mode === "mock" ? "Mock Lab Topology" : "Live Production Crawl"),
                useMock: mode === "mock",
                profile,
                maxHops: Math.min(Math.max(maxHops, 1), 10),
                enableLldp,
                seeds: mode === "live" ? seeds.split(",").map(s => s.trim()).filter(Boolean) : undefined,
            };

            if (mode === "live" && authMode === "custom") {
                const primary = credentials[0];
                if (!primary || !primary.password) {
                    setError("Please enter the primary switch SSH password (or switch back to Server Default credentials).");
                    setLoading(false);
                    setAbortController(null);
                    return;
                }
                payload.username = primary.username.trim();
                payload.password = primary.password;
                if (primary.secret) {
                    payload.secret = primary.secret;
                }
                if (credentials.length > 1) {
                    payload.fallbackCredentials = credentials.slice(1).map(c => ({
                        username: c.username.trim(),
                        password: c.password,
                        secret: c.secret ? c.secret : undefined
                    }));
                }
            }

            const res = await fetch("/api/crawler/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            const contentType = res.headers.get("content-type") || "";
            if (!res.ok && contentType.includes("application/json")) {
                const data = await res.json();
                throw new Error(data.error || "Crawl operation failed.");
            }

            if (!res.body) {
                throw new Error("No readable stream received from server.");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() || "";

                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith("data: ")) continue;
                    try {
                        const evt = JSON.parse(line.slice(6));
                        if (evt.type === "status") {
                            setStatusMessage(evt.message);
                            setLogs(prev => [...prev, evt.message]);
                        } else if (evt.type === "log") {
                            setLogs(prev => [...prev, evt.line]);
                        } else if (evt.type === "stderr") {
                            setLogs(prev => [...prev, `[STDERR] ${evt.line}`]);
                        } else if (evt.type === "error") {
                            setError(evt.error);
                            setLogs(prev => [...prev, `[ERROR] ${evt.error}`]);
                        } else if (evt.type === "done") {
                            setStatusMessage(`Crawl completed! Snapshot #${evt.snapshotNumber} saved (${evt.totalDiscovered} devices).`);
                            setLogs(prev => [...prev, `[SUCCESS] Snapshot #${evt.snapshotNumber} saved to database.`]);
                            setTimeout(() => {
                                onSuccess(evt.snapshotId);
                                onClose();
                            }, 1800);
                        }
                    } catch (e) {
                        console.error("SSE parse error:", e);
                    }
                }
            }

            // Flush remaining buffer if any
            if (buffer.trim().startsWith("data: ")) {
                try {
                    const evt = JSON.parse(buffer.trim().slice(6));
                    if (evt.type === "error") setError(evt.error);
                    if (evt.type === "done") {
                        onSuccess(evt.snapshotId);
                        onClose();
                    }
                } catch {}
            }
        } catch (err: any) {
            if (err.name === "AbortError") {
                setStatusMessage("Crawl was stopped.");
                setLogs(prev => [...prev, "[ABORTED] Crawl cancelled by user."]);
            } else {
                setError(err.message || "An unexpected error occurred during the crawl.");
                setLogs(prev => [...prev, `[EXCEPTION] ${err.message || String(err)}`]);
            }
        } finally {
            setLoading(false);
            setAbortController(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <Network className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">Network Discovery &amp; Crawl</h2>
                            <p className="text-xs text-slate-400">Configure discovery scope, seed switches, and traversal profiles.</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Compact Header Mode Switch */}
                        <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("live");
                                    setName(initialSeed ? `Reseed from ${initialSeed}` : "Production Campus Crawl");
                                }}
                                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                    mode === "live"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                <Terminal className="w-3.5 h-3.5" />
                                Live SSH Crawl
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setMode("mock");
                                    setName("Lab Multi-Site Topology");
                                }}
                                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                    mode === "mock"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                <Sparkles className="w-3.5 h-3.5" />
                                Lab Simulation
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            disabled={loading}
                            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div ref={modalBodyRef} className="p-6 space-y-5 overflow-y-auto flex-1 overscroll-contain">
                    {mode === "mock" ? (
                        /* Clean, Spacious Mock Mode */
                        <div className="max-w-2xl mx-auto space-y-5 py-2">
                            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-3">
                                <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
                                <div>
                                    <span className="font-semibold block text-white mb-0.5">Isolated Lab Simulation Environment</span>
                                    <span>Generates a virtual multi-tier campus topology with 9 switches across 3 sites, VLAN trunks, and ARP caches without contacting physical hardware.</span>
                                </div>
                            </div>

                            {/* Profile Selection */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-blue-400" />
                                    Simulation Profile
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setProfile("discovery")}
                                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                            profile === "discovery"
                                                ? "bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1 text-white font-semibold text-xs">
                                            <Zap className="w-3.5 h-3.5 text-amber-400" />
                                            Discovery
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-snug">Credentials &amp; CDP neighbor audit.</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setProfile("mapping")}
                                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                            profile === "mapping"
                                                ? "bg-cyan-500/10 border-cyan-500/50 text-white ring-1 ring-cyan-500/30"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1 text-white font-semibold text-xs">
                                            <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
                                            Mapping
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-snug">Trunks, VLANs &amp; physical links.</p>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setProfile("intensive")}
                                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                            profile === "intensive"
                                                ? "bg-blue-600/10 border-blue-500/50 text-white ring-1 ring-blue-500/30"
                                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center gap-1.5 mb-1 text-white font-semibold text-xs">
                                            <Search className="w-3.5 h-3.5 text-blue-400" />
                                            Intensive
                                        </div>
                                        <p className="text-[11px] text-slate-400 leading-snug">Full routing (LPM) &amp; ARP tables.</p>
                                    </button>
                                </div>
                            </div>

                            {/* Snapshot Label */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-slate-300">Snapshot Label</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Lab Multi-Site Topology"
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                                />
                            </div>
                        </div>
                    ) : (
                        /* Live Cisco SSH Crawl Mode: Clean 2-Column Responsive Layout */
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {/* Column 1: Target & Traversal Scope */}
                            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-4">
                                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800/80">
                                    <Server className="w-4 h-4 text-blue-400" />
                                    <span>Target &amp; Traversal Scope</span>
                                </div>

                                {/* Seed Switch IP(s) */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-slate-300">Seed Switch IP Address</label>
                                        <span className="text-[10px] text-slate-500 font-mono">SSH Port 22</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={seeds}
                                        onChange={(e) => setSeeds(e.target.value)}
                                        placeholder="e.g. 172.21.0.22, 10.10.1.1"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                                    />
                                    <p className="text-[11px] text-slate-500">
                                        Seed IP to begin recursive CDP/LLDP discovery from.
                                    </p>
                                </div>

                                {/* Hop Distance Slider */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                                            <Hash className="w-3.5 h-3.5 text-blue-400" />
                                            Max Hop Distance
                                        </label>
                                        <span className="font-mono text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-xs">
                                            {maxHops} {maxHops === 1 ? "Hop (Default)" : "Hops"}
                                        </span>
                                    </div>

                                    <input
                                        type="range"
                                        min={1}
                                        max={10}
                                        value={maxHops}
                                        onChange={(e) => setMaxHops(parseInt(e.target.value, 10))}
                                        className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                                    />

                                    <div className="flex justify-between text-[10px] font-mono text-slate-500 px-0.5">
                                        <span className="text-blue-400 font-semibold">1 (Default)</span>
                                        <span>2 (Dist)</span>
                                        <span>4 (Campus)</span>
                                        <span>7 (Ext)</span>
                                        <span className="text-amber-400 font-semibold">10 (Cap)</span>
                                    </div>

                                    <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                                        <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                                        <span>Direct SSH from central server. Safely halts at 10 hops for boundary reseeding.</span>
                                    </div>
                                </div>

                                {/* LLDP Fallback Checkbox */}
                                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition cursor-pointer">
                                    <div>
                                        <span className="text-xs font-semibold text-slate-200 block">LLDP Fallback Adjacency</span>
                                        <span className="text-[10px] text-slate-500">Only queried if CDP returns 0 neighbors or is disabled</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={enableLldp}
                                        onChange={(e) => setEnableLldp(e.target.checked)}
                                        className="accent-blue-500 rounded cursor-pointer h-4 w-4"
                                    />
                                </label>

                                {/* Snapshot Label */}
                                <div className="space-y-1.5 pt-1">
                                    <label className="text-xs font-semibold text-slate-300">Snapshot Label (Optional)</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="e.g. Campus Core Crawl"
                                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition"
                                    />
                                </div>
                            </div>

                            {/* Column 2: Profile & SSH Authentication */}
                            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-4">
                                <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider pb-2 border-b border-slate-800/80">
                                    <Sliders className="w-4 h-4 text-blue-400" />
                                    <span>Profile &amp; Credentials</span>
                                </div>

                                {/* Crawl Profile */}
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-300">Execution Profile</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setProfile("discovery")}
                                            className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                                                profile === "discovery"
                                                    ? "bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                                                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                                            }`}
                                        >
                                            <div className="flex items-center gap-1 mb-1 text-white font-semibold text-xs">
                                                <Zap className="w-3.5 h-3.5 text-amber-400" />
                                                Discovery
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-tight mb-2">Auth &amp; CDP check.</p>
                                            <span className="text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">~1s / dev</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setProfile("mapping")}
                                            className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                                                profile === "mapping"
                                                    ? "bg-cyan-500/10 border-cyan-500/50 text-white ring-1 ring-cyan-500/30"
                                                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                                            }`}
                                        >
                                            <div className="flex items-center gap-1 mb-1 text-white font-semibold text-xs">
                                                <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
                                                Mapping
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-tight mb-2">Trunks &amp; VLANs.</p>
                                            <span className="text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">~3s / dev</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setProfile("intensive")}
                                            className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                                                profile === "intensive"
                                                    ? "bg-blue-600/10 border-blue-500/50 text-white ring-1 ring-blue-500/30"
                                                    : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
                                            }`}
                                        >
                                            <div className="flex items-center gap-1 mb-1 text-white font-semibold text-xs">
                                                <Search className="w-3.5 h-3.5 text-blue-400" />
                                                Intensive
                                            </div>
                                            <p className="text-[10px] text-slate-400 leading-tight mb-2">Routes &amp; ARP tables.</p>
                                            <span className="text-[9px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">~8s / dev</span>
                                        </button>
                                    </div>
                                </div>

                                {/* SSH Credentials Box */}
                                <div className="space-y-2.5 pt-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                                            SSH Authentication
                                        </label>
                                        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                                            <button
                                                type="button"
                                                onClick={() => setAuthMode("server")}
                                                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                                    authMode === "server" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                                                }`}
                                            >
                                                Server (.env)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setAuthMode("custom")}
                                                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                                    authMode === "custom" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200"
                                                }`}
                                            >
                                                Prompt Credentials
                                            </button>
                                        </div>
                                    </div>

                                    {authMode === "server" ? (
                                        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 leading-relaxed">
                                            Using primary and fallback credentials defined in <code className="text-slate-300 font-mono">.env</code> and <code className="text-slate-300 font-mono">config.yaml</code> on the server.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {credentials.map((cred, idx) => (
                                                <div key={cred.id} className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl space-y-2.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                                                            <span className={`w-2 h-2 rounded-full ${idx === 0 ? "bg-amber-400" : "bg-cyan-400"}`} />
                                                            {cred.label}
                                                        </span>
                                                        {idx > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveFallback(cred.id)}
                                                                className="text-slate-500 hover:text-red-400 transition cursor-pointer p-0.5"
                                                                title="Remove Fallback"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-medium text-slate-400">Username</label>
                                                            <input
                                                                type="text"
                                                                value={cred.username}
                                                                onChange={(e) => handleUpdateCredential(cred.id, "username", e.target.value)}
                                                                placeholder="admin"
                                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[10px] font-medium text-slate-400">Password</label>
                                                            <div className="relative">
                                                                <input
                                                                    type={cred.showPassword ? "text" : "password"}
                                                                    value={cred.password}
                                                                    onChange={(e) => handleUpdateCredential(cred.id, "password", e.target.value)}
                                                                    placeholder="Password"
                                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-2.5 pr-7 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateCredential(cred.id, "showPassword", !cred.showPassword)}
                                                                    className="absolute right-1.5 top-1.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                                                                >
                                                                    {cred.showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Optional Enable Secret */}
                                                    {!cred.hasSecret && !cred.secret ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUpdateCredential(cred.id, "hasSecret", true)}
                                                            className="text-[10px] text-amber-400/90 hover:text-amber-300 flex items-center gap-1 transition cursor-pointer"
                                                        >
                                                            <Plus className="w-3 h-3" />
                                                            Add Enable Secret (Optional)
                                                        </button>
                                                    ) : (
                                                        <div className="space-y-1 pt-1.5 border-t border-slate-800/60">
                                                            <div className="flex items-center justify-between">
                                                                <label className="text-[10px] font-medium text-slate-400">Enable Secret (Privileged Exec)</label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        handleUpdateCredential(cred.id, "hasSecret", false);
                                                                        handleUpdateCredential(cred.id, "secret", "");
                                                                        handleUpdateCredential(cred.id, "showSecret", false);
                                                                    }}
                                                                    className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                            <div className="relative">
                                                                <input
                                                                    type={cred.showSecret ? "text" : "password"}
                                                                    value={cred.secret}
                                                                    onChange={(e) => handleUpdateCredential(cred.id, "secret", e.target.value)}
                                                                    placeholder="Optional enable password"
                                                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-2.5 pr-7 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleUpdateCredential(cred.id, "showSecret", !cred.showSecret)}
                                                                    className="absolute right-1.5 top-1.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                                                                    title={cred.showSecret ? "Hide enable secret" : "Show enable secret"}
                                                                >
                                                                    {cred.showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}

                                            {/* Add Fallback Credential Button */}
                                            {credentials.length < 5 && (
                                                <button
                                                    type="button"
                                                    onClick={handleAddFallback}
                                                    className="w-full py-2 px-3 rounded-xl border border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer bg-slate-900/40"
                                                >
                                                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                                                    Add Fallback Credential (Local Admin / Emergency)
                                                </button>
                                            )}

                                            <div className="flex items-center gap-1.5 text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                                                <Lock className="w-3 h-3 shrink-0" />
                                                <span><strong>Ephemeral:</strong> All credential sets are held in memory only during execution; never written to disk or DB.</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Live Execution Console Terminal (Full Width) */}
                    {(loading || logs.length > 0) && (
                        <div className="space-y-2 pt-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Live Execution Console</span>
                                    {loading && (
                                        <span className="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                            </span>
                                            STREAMING
                                        </span>
                                    )}
                                    <span className="text-[10px] font-mono text-slate-500">
                                        ({logs.length} lines)
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {logs.length > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleDownloadLogs}
                                                className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition cursor-pointer"
                                                title="Save Execution Log"
                                            >
                                                <Download className="w-3 h-3" />
                                                Save Log
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setLogs([])}
                                                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition cursor-pointer"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                                Clear
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div 
                                ref={terminalRef} 
                                className="bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] leading-relaxed h-64 shrink-0 overflow-y-auto overscroll-contain shadow-inner space-y-1 select-text"
                            >
                                {logs.map((logLine, idx) => (
                                    <div key={idx} className={`font-mono break-all ${getLogLineStyle(logLine)}`}>
                                        <span className="text-slate-600 select-none mr-2">{String(idx + 1).padStart(2, "0")}</span>
                                        {logLine}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Status message */}
                    {statusMessage && (
                        <div className="p-3 bg-blue-950/40 border border-blue-800/80 rounded-xl text-xs text-blue-300 flex items-center gap-2">
                            <RefreshCw className={`w-4 h-4 text-blue-400 shrink-0 ${loading ? "animate-spin" : ""}`} />
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
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-semibold uppercase tracking-wider text-slate-500">Profile:</span>
                        <span className="font-bold text-white uppercase">{profile}</span>
                        <span>•</span>
                        <span>{maxHops} {maxHops === 1 ? "Hop Limit" : "Hops Limit"}</span>
                        <span>•</span>
                        <span className="text-slate-500 font-mono">{mode === "live" ? (seeds.split(",")[0] || "No seed") : "Mock lab"}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {loading ? (
                            <button
                                type="button"
                                onClick={handleAbort}
                                className="px-4 py-2 text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                            >
                                <StopCircle className="w-3.5 h-3.5 text-red-400" />
                                Abort Crawl
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition cursor-pointer"
                            >
                                Close
                            </button>
                        )}
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
        </div>
    );
}
