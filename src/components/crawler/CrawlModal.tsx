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
    Trash2
} from "lucide-react";

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

    // Ephemeral credentials for live crawl
    const [authMode, setAuthMode] = useState<"server" | "custom">("server");
    const [authUsername, setAuthUsername] = useState<string>("admin");
    const [authPassword, setAuthPassword] = useState<string>("");
    const [authSecret, setAuthSecret] = useState<string>("");
    const [showPassword, setShowPassword] = useState<boolean>(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logs.length > 0 && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    useEffect(() => {
        if (initialSeed) {
            setMode("live");
            setSeeds(initialSeed);
            setName(`Reseed from ${initialSeed}`);
            setMaxHops(initialMaxHops ?? 1);
        }
    }, [initialSeed, initialMaxHops]);

    if (!isOpen) return null;

    const getLogLineStyle = (line: string) => {
        if (line.startsWith("[ERROR]") || line.includes("failed") || line.includes("Failed") || line.includes("AuthenticationException")) {
            return "text-red-400";
        }
        if (line.startsWith("[WARNING]") || line.includes("WARNING")) {
            return "text-amber-400";
        }
        if (line.startsWith("[SUCCESS]") || line.startsWith("[DONE]") || line.includes("REACHABLE")) {
            return "text-emerald-400";
        }
        if (line.startsWith("[SSH]") || line.includes("Attempting SSH")) {
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
                if (!authPassword) {
                    setError("Please enter the switch SSH password or switch back to Server Default credentials.");
                    setLoading(false);
                    setAbortController(null);
                    return;
                }
                payload.username = authUsername.trim();
                payload.password = authPassword;
                if (authSecret) {
                    payload.secret = authSecret;
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <Network className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">Initiate Network Crawl</h2>
                            <p className="text-xs text-slate-400">Configure crawl profiles, seed switches, and hop depth limits.</p>
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
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
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
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-xs text-white">Lab Topology (Mock)</span>
                                <Sparkles className={`w-4 h-4 ${mode === "mock" ? "text-blue-400" : "text-slate-600"}`} />
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">
                                Instant multi-tier simulation with virtual devices, VLANs, and trunks.
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
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-semibold text-xs text-white">Live Cisco SSH Crawl</span>
                                <Terminal className={`w-4 h-4 ${mode === "live" ? "text-blue-400" : "text-slate-600"}`} />
                            </div>
                            <p className="text-[11px] text-slate-400 leading-snug">
                                Connects to seed switches via Netmiko and recursively spiders neighbors.
                            </p>
                        </button>
                    </div>

                    {/* Profile Selection */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-semibold text-slate-300">Crawl Profile & Depth</label>
                            <span className="text-[11px] text-slate-500">Controls command execution scope</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                            {/* Profile 1: Discovery */}
                            <button
                                type="button"
                                onClick={() => setProfile("discovery")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                    profile === "discovery"
                                        ? "bg-amber-500/10 border-amber-500/50 text-white ring-1 ring-amber-500/30"
                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Zap className={`w-3.5 h-3.5 ${profile === "discovery" ? "text-amber-400" : "text-slate-500"}`} />
                                        <span className="font-semibold text-xs text-white">Neighbor Discovery</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-tight mb-2">
                                        Ultra-fast credential validation & neighbor audit.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                                    ~1s / dev • show version + CDP
                                </div>
                            </button>

                            {/* Profile 2: Mapping */}
                            <button
                                type="button"
                                onClick={() => setProfile("mapping")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                    profile === "mapping"
                                        ? "bg-cyan-500/10 border-cyan-500/50 text-white ring-1 ring-cyan-500/30"
                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <MapIcon className={`w-3.5 h-3.5 ${profile === "mapping" ? "text-cyan-400" : "text-slate-500"}`} />
                                        <span className="font-semibold text-xs text-white">Mapping Crawl</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-tight mb-2">
                                        Physical connectivity, VLANs & trunks for diagrams.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                                    ~3s / dev • Trunks, VLANs & IPs
                                </div>
                            </button>

                            {/* Profile 3: Intensive */}
                            <button
                                type="button"
                                onClick={() => setProfile("intensive")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                                    profile === "intensive"
                                        ? "bg-blue-600/10 border-blue-500/50 text-white ring-1 ring-blue-500/30"
                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <Search className={`w-3.5 h-3.5 ${profile === "intensive" ? "text-blue-400" : "text-slate-500"}`} />
                                        <span className="font-semibold text-xs text-white">Spider Intensive</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-tight mb-2">
                                        Full diagnostics, routing tables (LPM) & ARP tables.
                                    </p>
                                </div>
                                <div className="pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500">
                                    ~8s / dev • Full Routes, ARP & Intfs
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Hop Depth Controls */}
                    <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                                <Hash className="w-4 h-4 text-blue-400" />
                                <span className="font-semibold text-slate-200">Max Hop Distance from Seed</span>
                            </div>
                            <span className="font-mono text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-xs">
                                {maxHops} {maxHops === 1 ? "Hop" : "Hops"}
                            </span>
                        </div>

                        <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                                <span className="text-slate-400">
                                    {maxHops === 1 ? "1 Hop (Seed + Direct Neighbors only) — Default" :
                                     maxHops === 2 ? "2 Hops (Seed + Core/Dist + Access Switches)" :
                                     maxHops === 10 ? "10 Hops (Maximum Depth Boundary — Loop Safety Cap)" :
                                     `${maxHops} Hops (Extended Campus Depth)`}
                                </span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={maxHops}
                                onChange={(e) => setMaxHops(parseInt(e.target.value, 10))}
                                className="w-full accent-blue-500 cursor-pointer"
                            />
                            <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                <span className="text-blue-400 font-semibold">1 (Default)</span>
                                <span>2 (Dist)</span>
                                <span>4 (Campus)</span>
                                <span>7 (Extended)</span>
                                <span className="text-amber-400 font-semibold">10 (Max Boundary)</span>
                            </div>
                        </div>

                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                            <div className="flex items-start gap-1.5 text-slate-300">
                                <span className="text-blue-400 font-bold">•</span>
                                <span><strong>Loop Safety:</strong> BFS depth is hard-capped at 10 hops. If switches exist at the 11th hop, crawl halts safely and registers the 10th-hop device for boundary reseeding.</span>
                            </div>
                            <div className="flex items-start gap-1.5 text-slate-400">
                                <span className="text-emerald-400 font-bold">•</span>
                                <span><strong>Direct SSH:</strong> Outbound sessions initiate directly from Pane-o-glass to each switch (no switch-to-switch daisy-chaining).</span>
                            </div>
                        </div>
                    </div>

                    {/* LLDP Fallback Optional Checkbox */}
                    <div className="px-4 py-3 bg-slate-950/40 rounded-xl border border-slate-800/60 flex items-center justify-between">
                        <div>
                            <span className="text-xs font-semibold text-slate-300 block">LLDP Fallback Adjacency</span>
                            <span className="text-[11px] text-slate-500">
                                Only queries LLDP if CDP returns zero neighbors or is disabled.
                            </span>
                        </div>
                        <input
                            type="checkbox"
                            checked={enableLldp}
                            onChange={(e) => setEnableLldp(e.target.checked)}
                            className="accent-blue-500 rounded cursor-pointer h-4 w-4"
                        />
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

                    {/* Live mode specific seeds & credentials */}
                    {mode === "live" && (
                        <div className="space-y-4 pt-1">
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

                            {/* Authentication Mode Selector */}
                            <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                                <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <KeyRound className="w-4 h-4 text-amber-400" />
                                        <span className="font-semibold text-slate-200">Switch SSH Authentication</span>
                                    </div>
                                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => setAuthMode("server")}
                                            className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                                authMode === "server" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"
                                            }`}
                                        >
                                            Server Config (.env)
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
                                    <p className="text-[11px] text-slate-400">
                                        Using primary &amp; fallback credentials defined in <code className="text-slate-300">.env</code> and <code className="text-slate-300">config.yaml</code> on the server.
                                    </p>
                                ) : (
                                    <div className="space-y-3 pt-1">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[11px] font-medium text-slate-400">SSH Username</label>
                                                <input
                                                    type="text"
                                                    value={authUsername}
                                                    onChange={(e) => setAuthUsername(e.target.value)}
                                                    placeholder="admin"
                                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[11px] font-medium text-slate-400">SSH Password</label>
                                                <div className="relative">
                                                    <input
                                                        type={showPassword ? "text" : "password"}
                                                        value={authPassword}
                                                        onChange={(e) => setAuthPassword(e.target.value)}
                                                        placeholder="Enter switch password"
                                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 cursor-pointer"
                                                    >
                                                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[11px] font-medium text-slate-400">
                                                Enable Secret <span className="text-slate-600">(Optional - if required for privileged exec)</span>
                                            </label>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                value={authSecret}
                                                onChange={(e) => setAuthSecret(e.target.value)}
                                                placeholder="Optional enable password"
                                                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition font-mono"
                                            />
                                        </div>

                                        <div className="flex items-center gap-1.5 text-[10px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg">
                                            <Lock className="w-3 h-3 shrink-0" />
                                            <span><strong>Ephemeral In-Memory Only:</strong> These credentials are passed directly to the isolated Netmiko SSH process and are never saved to disk, database, or logs.</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Live Execution Console Terminal */}
                    {(loading || logs.length > 0) && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                                    <Terminal className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Live Execution Console</span>
                                    {loading && (
                                        <span className="flex items-center gap-1.5 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
                                            STREAMING
                                        </span>
                                    )}
                                </div>
                                {logs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setLogs([])}
                                        className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto shadow-inner space-y-1 select-text">
                                {logs.map((logLine, idx) => (
                                    <div key={idx} className={`font-mono break-all ${getLogLineStyle(logLine)}`}>
                                        <span className="text-slate-600 select-none mr-2">{String(idx + 1).padStart(2, "0")}</span>
                                        {logLine}
                                    </div>
                                ))}
                                <div ref={logsEndRef} />
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
                                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
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
