"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
    Shield, Search, CheckCircle2, ShieldAlert, 
    RefreshCw, Trash2, ExternalLink, Copy, Check, Clock,
    AlertTriangle, Filter, Server, Zap, Flame, UserCheck,
    ChevronLeft, ChevronRight, ArrowRight, ShieldCheck, Ban, Info
} from "lucide-react";

export function LiveFeedInspector() {
    // Inspection & Feed Data
    const [feedData, setFeedData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

    // Single IP Checker
    const [lookupMode, setLookupMode] = useState<"SINGLE" | "BULK">("SINGLE");
    const [checkIpInput, setCheckIpInput] = useState("");
    const [checkingIp, setCheckingIp] = useState(false);
    const [checkResult, setCheckResult] = useState<any | null>(null);

    // Bulk Multi-IP Triage State
    const [bulkInput, setBulkInput] = useState("");
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkResults, setBulkResults] = useState<any[]>([]);
    const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [copiedSummary, setCopiedSummary] = useState(false);

    // Lifecycle Action State (4-Step Confirmation)
    const [actionLoading, setActionLoading] = useState(false);
    const [lifecycleResult, setLifecycleResult] = useState<any | null>(null);
    const [copiedMd5, setCopiedMd5] = useState(false);

    // Fetch Feed Inspector Data
    const fetchFeedInspector = useCallback(async (
        p = page,
        size = pageSize,
        q = searchQuery,
        cat = categoryFilter,
        checkIp = ""
    ) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(p),
                pageSize: String(size),
                category: cat
            });
            if (q.trim()) params.append("search", q.trim());
            if (checkIp.trim()) params.append("ip", checkIp.trim());

            const res = await fetch(`/api/feeds/security-intelligence/inspect?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setFeedData(data);
                if (checkIp) {
                    setCheckResult(data.lookup);
                }
            }
        } catch (err) {
            console.error("Failed to load feed inspection data:", err);
        } finally {
            setLoading(false);
            setCheckingIp(false);
        }
    }, [page, pageSize, searchQuery, categoryFilter]);

    const didReadUrlIp = useRef(false);

    useEffect(() => {
        let initialCheckIp = "";
        if (!didReadUrlIp.current && typeof window !== "undefined") {
            didReadUrlIp.current = true;
            const params = new URLSearchParams(window.location.search);
            const ipParam = params.get("ip");
            if (ipParam && ipParam.trim()) {
                initialCheckIp = ipParam.trim();
                setCheckIpInput(initialCheckIp);
                setCheckingIp(true);
            }
        }
        fetchFeedInspector(page, pageSize, searchQuery, categoryFilter, initialCheckIp);
    }, [page, pageSize, categoryFilter, fetchFeedInspector]);

    // Handle Quick Check IP
    const handleCheckIp = (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkIpInput.trim()) return;
        setCheckingIp(true);
        fetchFeedInspector(page, pageSize, searchQuery, categoryFilter, checkIpInput.trim());
    };

    // Handle Instant Remove from Feed & Pardon Everywhere
    const handleRemoveAndPardon = async (ipToRemove: string, reason?: string) => {
        if (!confirm(`Are you sure you want to remove ${ipToRemove} from the FMC Feed and pardon it on all perimeter firewalls?`)) {
            return;
        }

        setActionLoading(true);
        try {
            const res = await fetch("/api/feeds/security-intelligence/inspect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "REMOVE_AND_PARDON",
                    ip: ipToRemove,
                    reason: reason || "Analyst manual removal via Live Feed Inspector"
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setLifecycleResult(data);
                // Refresh data
                fetchFeedInspector(page, pageSize, searchQuery, categoryFilter, checkIpInput.trim());
            } else {
                alert(`Error removing IP: ${data.error || "Unknown error"}`);
            }
        } catch (e: any) {
            alert(`Execution error: ${e.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    // Execute Batch Multi-IP Inspection
    const handleBatchInspect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkInput.trim()) return;

        setBulkLoading(true);
        setSelectedIps(new Set());
        try {
            const res = await fetch("/api/feeds/security-intelligence/inspect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "BATCH_INSPECT",
                    targets: bulkInput
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setBulkResults(data.results);
                // Auto-select blocked IPs by default
                const blocked = new Set<string>();
                for (const r of data.results) {
                    if (r.isCurrentlyBlocked) blocked.add(r.ip);
                }
                setSelectedIps(blocked);
            } else {
                alert(`Batch inspection error: ${data.error || "Unknown error"}`);
            }
        } catch (err: any) {
            alert(`Inspection failure: ${err.message}`);
        } finally {
            setBulkLoading(false);
        }
    };

    // Execute Bulk Unblock & Pardon on Selected IPs
    const handleBulkUnblock = async () => {
        if (selectedIps.size === 0) return;
        const ipsToPardon = Array.from(selectedIps);

        if (!confirm(`Are you sure you want to unblock & pardon all ${ipsToPardon.length} selected IPs across the perimeter firewalls and FMC feed?`)) {
            return;
        }

        setBulkActionLoading(true);
        try {
            const res = await fetch("/api/feeds/security-intelligence/inspect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "BATCH_REMOVE_AND_PARDON",
                    ips: ipsToPardon,
                    reason: `Bulk analyst unblock of ${ipsToPardon.length} IPs via Live Feed Inspector`
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setLifecycleResult(data);
                // Refresh batch inspection
                handleBatchInspect({ preventDefault: () => {} } as any);
                fetchFeedInspector();
            } else {
                alert(`Error executing bulk unblock: ${data.error || "Unknown error"}`);
            }
        } catch (err: any) {
            alert(`Execution failure: ${err.message}`);
        } finally {
            setBulkActionLoading(false);
        }
    };

    // Toggle Select All
    const toggleSelectAll = () => {
        if (selectedIps.size === bulkResults.length) {
            setSelectedIps(new Set());
        } else {
            setSelectedIps(new Set(bulkResults.map(r => r.ip)));
        }
    };

    // Select Only Blocked
    const selectOnlyBlocked = () => {
        const blocked = new Set<string>();
        for (const r of bulkResults) {
            if (r.isCurrentlyBlocked) blocked.add(r.ip);
        }
        setSelectedIps(blocked);
    };

    // Toggle Single Row Selection
    const toggleSelectRow = (ip: string) => {
        const next = new Set(selectedIps);
        if (next.has(ip)) next.delete(ip);
        else next.add(ip);
        setSelectedIps(next);
    };

    // Copy Ticket Summary
    const copyTicketSummary = () => {
        if (bulkResults.length === 0) return;
        const lines = [
            `Cooper InfoSec Perimeter Triage Summary (${new Date().toLocaleString()}):`,
            `Total Evaluated IPs: ${bulkResults.length}`,
            `Blocked: ${bulkResults.filter(r => r.isCurrentlyBlocked).length} | Clean: ${bulkResults.filter(r => !r.isCurrentlyBlocked).length}`,
            ``,
            `IP Breakdown:`
        ];
        for (const r of bulkResults) {
            const status = r.isCurrentlyBlocked ? `BLOCKED (${r.activeCategory})` : `CLEAN`;
            lines.push(`- ${r.ip}: ${status} | Geo: ${r.networkProfile?.city}, ${r.networkProfile?.countryCode} | ISP: ${r.networkProfile?.isp}`);
        }
        navigator.clipboard.writeText(lines.join("\n"));
        setCopiedSummary(true);
        setTimeout(() => setCopiedSummary(false), 2000);
    };

    // Copy MD5 Checksum
    const copyMd5 = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedMd5(true);
        setTimeout(() => setCopiedMd5(false), 2000);
    };

    const feedStatus = feedData?.feedStatus;
    const entries = feedData?.entries || [];
    const pagination = feedData?.pagination;
    const totalEntries = feedStatus?.totalCount || 0;
    const totalPages = pagination?.totalPages || 1;

    return (
        <div className="space-y-6">
            {/* 1. Header & Live FMC Sync Telemetry Banner */}
            <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-accent-primary/10 rounded-xl text-accent-primary border border-accent-primary/20">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
                                    Live FMC Threat Feed: <span className="font-mono text-accent-primary font-extrabold">POG_SI_Edge_Defense</span>
                                </h3>
                                <p className="text-xs text-text-muted mt-0.5">
                                    Direct transparency into the active IP snapshot served to Cisco FMC Security Intelligence.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchFeedInspector(page, pageSize, searchQuery, categoryFilter, checkIpInput.trim())}
                            disabled={loading}
                            className="px-3 py-1.5 bg-bg-surface hover:bg-bg-dark border border-border-color rounded-lg text-xs font-semibold text-text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh Snapshot
                        </button>
                        <a
                            href="/api/feeds/security-intelligence?format=txt"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                            Raw Feed <ExternalLink className="w-3 h-3" />
                        </a>
                        <a
                            href="/api/feeds/security-intelligence/md5"
                            target="_blank"
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-bg-surface hover:bg-bg-dark border border-border-color rounded-lg text-xs font-mono text-text-muted flex items-center gap-1 transition-colors"
                        >
                            MD5 Checksum <ExternalLink className="w-3 h-3" />
                        </a>
                    </div>
                </div>

                {/* FMC Telemetry Bar */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-4 border-t border-border-color text-xs">
                    <div className="bg-bg-surface/50 border border-border-color rounded-lg p-3">
                        <span className="text-text-muted block text-[11px] uppercase tracking-wider font-semibold">Active Feed Entries</span>
                        <span className="text-xl font-black text-text-primary mt-1 block">
                            {totalEntries.toLocaleString()} <span className="text-xs font-normal text-text-muted">Unique IPs</span>
                        </span>
                    </div>

                    <div className="bg-bg-surface/50 border border-border-color rounded-lg p-3">
                        <span className="text-text-muted block text-[11px] uppercase tracking-wider font-semibold">Verified MD5 Checksum</span>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="font-mono text-xs text-text-primary truncate font-bold">
                                {feedStatus?.md5 ? feedStatus.md5 : "Generating..."}
                            </span>
                            {feedStatus?.md5 && (
                                <button
                                    onClick={() => copyMd5(feedStatus.md5)}
                                    className="p-1 hover:bg-bg-dark rounded text-text-muted hover:text-text-primary transition-colors cursor-pointer shrink-0"
                                    title="Copy MD5"
                                >
                                    {copiedMd5 ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-bg-surface/50 border border-border-color rounded-lg p-3">
                        <span className="text-text-muted block text-[11px] uppercase tracking-wider font-semibold">Last FMC Poll (Heartbeat)</span>
                        <span className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-emerald-400" />
                            {feedStatus?.lastFmcPoll ? new Date(feedStatus.lastFmcPoll).toLocaleTimeString() : "Pending First Poll"}
                        </span>
                    </div>

                    <div className="bg-bg-surface/50 border border-border-color rounded-lg p-3">
                        <span className="text-text-muted block text-[11px] uppercase tracking-wider font-semibold">Next FMC Pull (Propagation SLA)</span>
                        <span className="text-xs font-bold text-accent-primary mt-1 flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-accent-primary" />
                            {feedStatus?.estimatedMinutesUntilNextPoll 
                                ? `In ~${feedStatus.estimatedMinutesUntilNextPoll} minute${feedStatus.estimatedMinutesUntilNextPoll === 1 ? '' : 's'}`
                                : "~15 minutes"}
                        </span>
                    </div>
                </div>

                {/* Composition Breakdown Badges */}
                {feedStatus?.breakdown && (
                    <div className="flex items-center gap-2 flex-wrap text-[11px] pt-1">
                        <span className="text-text-muted font-semibold">Feed Composition:</span>
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                            Cloud/Hosting VPS: {feedStatus.breakdown.hostingCount?.toLocaleString() || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 font-medium">
                            Permanent Blacklist: {feedStatus.breakdown.blacklistCount?.toLocaleString() || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-orange-500/10 text-orange-300 border border-orange-500/20 font-medium">
                            Active Strikes (&lt;7d): {feedStatus.breakdown.residentialCount?.toLocaleString() || 0}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                            CVE IOCs: {feedStatus.breakdown.cveCount?.toLocaleString() || 0}
                        </span>
                    </div>
                )}
            </div>

            {/* 2. Presence Verification: Single IP or Bulk Multi-IP Triage */}
            <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border-color pb-3">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setLookupMode("SINGLE")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                lookupMode === "SINGLE"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-muted hover:text-text-primary hover:bg-bg-surface"
                            }`}
                        >
                            <Search className="w-3.5 h-3.5" />
                            Single IP 360° Lookup
                        </button>
                        <button
                            type="button"
                            onClick={() => setLookupMode("BULK")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                lookupMode === "BULK"
                                    ? "bg-accent-primary text-white shadow-sm"
                                    : "text-text-muted hover:text-text-primary hover:bg-bg-surface"
                            }`}
                        >
                            <Filter className="w-3.5 h-3.5" />
                            Bulk Multi-IP Triage
                            {bulkResults.length > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                                    {bulkResults.length}
                                </span>
                            )}
                        </button>
                    </div>
                    <span className="text-xs text-text-muted">
                        {lookupMode === "SINGLE" ? "Inspect all perimeter defense layers for one IP" : "Paste, evaluate, and bulk unblock up to 100 IPs simultaneously"}
                    </span>
                </div>

                {lookupMode === "SINGLE" ? (
                    <>
                        <form onSubmit={handleCheckIp} className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter IPv4 address to verify (e.g. 73.150.121.81 or 198.51.100.4)..."
                                value={checkIpInput}
                                onChange={(e) => setCheckIpInput(e.target.value)}
                                className="flex-1 bg-bg-surface border border-border-color rounded-lg px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                            />
                            <button
                                type="submit"
                                disabled={checkingIp || !checkIpInput.trim()}
                                className="px-4 py-2 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                            >
                                {checkingIp ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                Check IP Presence
                            </button>
                        </form>

                        {/* 360° Diagnostic & Verification Profile */}
                        {checkResult && (
                            <div className="bg-bg-surface border border-border-color rounded-xl p-5 space-y-4 text-xs shadow-inner">
                                {/* Header: IP, Overall Verdict, and Action Button */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-border-color">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-base font-extrabold text-text-primary">{checkResult.ip}</span>
                                            {checkResult.isCurrentlyBlocked ? (
                                                <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-bold uppercase text-[11px] flex items-center gap-1">
                                                    <ShieldAlert className="w-3.5 h-3.5" /> ACTIVE PERIMETER BLOCK DETECTED
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold uppercase text-[11px] flex items-center gap-1">
                                                    <ShieldCheck className="w-3.5 h-3.5" /> ALL PERIMETER CHECKS CLEAR
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-text-muted text-xs">
                                            {checkResult.reason}
                                        </p>
                                    </div>

                                    {checkResult.isCurrentlyBlocked && (
                                        <button
                                            onClick={() => handleRemoveAndPardon(checkResult.ip, "Manual universal unblock via 360° Inspector")}
                                            disabled={actionLoading}
                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 flex items-center gap-2 shadow-md hover:scale-[1.02]"
                                        >
                                            <Zap className="w-4 h-4" />
                                            {actionLoading ? "Executing Unblock..." : "⚡ Universal Unblock & Pardon"}
                                        </button>
                                    )}
                                </div>

                                {/* Five-Pillar Perimeter Block Posture */}
                                <div>
                                    <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block mb-2">
                                        Perimeter Defense Posture (All Layers)
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                                        {/* 1. FMC SI Feed */}
                                        <div className={`p-2.5 rounded-lg border ${
                                            checkResult.blockPosture?.inFmcFeed
                                                ? "bg-red-500/10 border-red-500/30 text-red-200"
                                                : "bg-bg-card border-border-color text-text-muted"
                                        }`}>
                                            <span className="text-[10px] uppercase font-bold block mb-1">1. FMC Threat Feed</span>
                                            <span className="font-bold text-xs flex items-center gap-1">
                                                {checkResult.blockPosture?.inFmcFeed ? "🔴 IN FEED (Blocked)" : "🟢 Clean / Not in Feed"}
                                            </span>
                                        </div>

                                        {/* 2. Perimeter VPN / ASA Shun */}
                                        <div className={`p-2.5 rounded-lg border ${
                                            checkResult.blockPosture?.inPerimeterVpnShun
                                                ? "bg-red-500/10 border-red-500/30 text-red-200"
                                                : "bg-bg-card border-border-color text-text-muted"
                                        }`}>
                                            <span className="text-[10px] uppercase font-bold block mb-1">2. Perimeter ASA Shun</span>
                                            <span className="font-bold text-xs flex items-center gap-1">
                                                {checkResult.blockPosture?.inPerimeterVpnShun 
                                                    ? `🔴 SHUNNED (${checkResult.blockPosture.activeShunNodes?.length || 1} node${checkResult.blockPosture.activeShunNodes?.length === 1 ? '' : 's'})` 
                                                    : "🟢 Not Shunned"}
                                            </span>
                                        </div>

                                        {/* 3. Progressive Strikes */}
                                        <div className={`p-2.5 rounded-lg border ${
                                            checkResult.blockPosture?.strikeCount >= 2
                                                ? "bg-orange-500/10 border-orange-500/30 text-orange-200"
                                                : checkResult.blockPosture?.strikeCount === 1
                                                    ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                                                    : "bg-bg-card border-border-color text-text-muted"
                                        }`}>
                                            <span className="text-[10px] uppercase font-bold block mb-1">3. Citrix Strike Ledger</span>
                                            <span className="font-bold text-xs flex items-center gap-1">
                                                {checkResult.blockPosture?.strikeCount > 0 
                                                    ? `Strike ${checkResult.blockPosture.strikeCount} (${checkResult.blockPosture.strikeStatus})` 
                                                    : "🟢 Strike 0 (Pardoned/Clean)"}
                                            </span>
                                        </div>

                                        {/* 4. FMC ACP Geo-Fence */}
                                        <div className={`p-2.5 rounded-lg border ${
                                            checkResult.blockPosture?.fmcGeoStatus?.fmcGeoBlocked
                                                ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                                                : "bg-bg-card border-border-color text-text-muted"
                                        }`}>
                                            <span className="text-[10px] uppercase font-bold block mb-1">4. FMC Geo-Fence</span>
                                            <span className="font-bold text-xs flex items-center gap-1">
                                                {checkResult.blockPosture?.fmcGeoStatus?.isUsGeo 
                                                    ? "🟢 Domestic US (Rule 2)" 
                                                    : checkResult.blockPosture?.fmcGeoStatus?.fmcGeoBlocked
                                                    ? `⚠️ Non-US (${checkResult.blockPosture?.fmcGeoStatus?.countryCode})`
                                                    : "⚪ Unresolved (Geo Unverified)"}
                                            </span>
                                        </div>

                                        {/* 5. Permanent Blacklist */}
                                        <div className={`p-2.5 rounded-lg border ${
                                            checkResult.blockPosture?.isBlacklisted || checkResult.blockPosture?.isAsnBlacklisted
                                                ? "bg-red-500/10 border-red-500/30 text-red-200"
                                                : "bg-bg-card border-border-color text-text-muted"
                                        }`}>
                                            <span className="text-[10px] uppercase font-bold block mb-1">5. Guardian Blacklist</span>
                                            <span className="font-bold text-xs flex items-center gap-1">
                                                {checkResult.blockPosture?.isBlacklisted 
                                                    ? "🔴 IP Blacklisted" 
                                                    : checkResult.blockPosture?.isAsnBlacklisted
                                                        ? "🔴 ASN Blacklisted"
                                                        : "🟢 Clean"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Network Metadata & Telecom Identity */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                    <div className="bg-bg-card border border-border-color rounded-lg p-3 space-y-1.5">
                                        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                                            Network & ISP Identity
                                        </span>
                                        <div className="text-text-muted">
                                            ISP / Provider: <strong className="text-text-primary">{checkResult.networkProfile?.isp}</strong>
                                        </div>
                                        <div className="text-text-muted">
                                            Autonomous System: <strong className="text-accent-primary font-mono">{checkResult.networkProfile?.asn}</strong>
                                        </div>
                                        <div className="text-text-muted">
                                            Geolocation: <strong className="text-text-primary">{checkResult.networkProfile?.city}, {checkResult.networkProfile?.countryCode}</strong>
                                        </div>
                                    </div>

                                    <div className="bg-bg-card border border-border-color rounded-lg p-3 space-y-1.5">
                                        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block">
                                            Firewall Nodes & Telemetry
                                        </span>
                                        <div className="text-text-muted">
                                            Active Shuns on Nodes: <strong className="text-text-primary">{checkResult.blockPosture?.activeShunNodes?.length > 0 ? checkResult.blockPosture.activeShunNodes.join(", ") : "None"}</strong>
                                        </div>
                                        <div className="text-text-muted">
                                            Historical Shun Records: <strong className="text-text-primary">{checkResult.shunHistory?.nodes?.length || 0} event(s) logged</strong>
                                        </div>
                                        <div className="text-text-muted">
                                            Pending Queue Commands: <strong className="text-text-primary">{checkResult.pendingCommandsCount || 0}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* Recent VPN / Citrix Sessions */}
                                {checkResult.vpnTelemetry?.recentSessions?.length > 0 && (
                                    <div className="pt-2">
                                        <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                                            Recent AnyConnect VPN Sessions from this IP
                                        </span>
                                        <div className="overflow-x-auto rounded border border-border-color">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="bg-bg-card text-text-muted border-b border-border-color">
                                                    <tr>
                                                        <th className="py-1.5 px-2.5">User</th>
                                                        <th className="py-1.5 px-2.5">Status</th>
                                                        <th className="py-1.5 px-2.5">Gateway Stream</th>
                                                        <th className="py-1.5 px-2.5">Type</th>
                                                        <th className="py-1.5 px-2.5">Time</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border-color font-mono">
                                                    {checkResult.vpnTelemetry.recentSessions.slice(0, 5).map((s: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-bg-card/50">
                                                    <td className="py-1 px-2.5 font-semibold text-text-primary">
                                                        <a
                                                            href={`/queries/account-lockout?user=${encodeURIComponent(s.username)}`}
                                                            className="text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1 font-mono"
                                                            title="Investigate user account in Account Lockout Investigator"
                                                        >
                                                            {s.username}
                                                            <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                                        </a>
                                                    </td>
                                                    <td className="py-1 px-2.5">
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                            s.status === "SUCCESS" ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
                                                        }`}>
                                                            {s.status}
                                                        </span>
                                                    </td>
                                                    <td className="py-1 px-2.5 text-text-muted">{s.vpnStream || "AnyConnect"}</td>
                                                    <td className="py-1 px-2.5 text-text-muted">{s.vpnType || "SSL"}</td>
                                                    <td className="py-1 px-2.5 text-text-muted">{new Date(s.timestamp).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                    </>
                ) : (
                    /* Bulk Multi-IP Triage Workspace */
                    <div className="space-y-4">
                        <form onSubmit={handleBatchInspect} className="space-y-2">
                            <textarea
                                rows={4}
                                placeholder="Paste list of IPv4 addresses (comma-separated, space-separated, or one per line)..."
                                value={bulkInput}
                                onChange={(e) => setBulkInput(e.target.value)}
                                className="w-full bg-bg-surface border border-border-color rounded-lg p-3 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] text-text-muted">
                                    Supports up to 100 IPs simultaneously from HelpDesk tickets, logs, or incident reports.
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => { setBulkInput(""); setBulkResults([]); setSelectedIps(new Set()); }}
                                        className="px-3 py-1.5 border border-border-color hover:bg-bg-surface rounded-lg text-xs font-medium text-text-muted transition-colors cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={bulkLoading || !bulkInput.trim()}
                                        className="px-4 py-1.5 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                                    >
                                        {bulkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                        Inspect All IPs
                                    </button>
                                </div>
                            </div>
                        </form>

                        {/* Bulk Multi-Select Table & Actions */}
                        {bulkResults.length > 0 && (
                            <div className="space-y-3 pt-2">
                                {/* Action Bar */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-bg-surface border border-border-color rounded-xl text-xs">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <input
                                                type="checkbox"
                                                checked={selectedIps.size === bulkResults.length && bulkResults.length > 0}
                                                onChange={toggleSelectAll}
                                                className="cursor-pointer"
                                                id="select-all-bulk"
                                            />
                                            <label htmlFor="select-all-bulk" className="font-semibold text-text-primary cursor-pointer">
                                                Select All ({bulkResults.length})
                                            </label>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={selectOnlyBlocked}
                                            className="px-2 py-0.5 rounded text-[11px] bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20 font-medium transition-colors cursor-pointer"
                                        >
                                            Select Blocked Only ({bulkResults.filter(r => r.isCurrentlyBlocked).length})
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={copyTicketSummary}
                                            className="px-3 py-1.5 border border-border-color hover:bg-bg-dark rounded-lg text-xs font-medium text-text-primary transition-colors cursor-pointer flex items-center gap-1"
                                            title="Copy clean markdown report for ServiceNow / HelpDesk ticket"
                                        >
                                            {copiedSummary ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                            {copiedSummary ? "Copied!" : "Copy Summary for Ticket"}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleBulkUnblock}
                                            disabled={bulkActionLoading || selectedIps.size === 0}
                                            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Zap className="w-3.5 h-3.5" />
                                            {bulkActionLoading ? "Unblocking..." : `⚡ Bulk Unblock Selected (${selectedIps.size})`}
                                        </button>
                                    </div>
                                </div>

                                {/* Results Multi-Select Table */}
                                <div className="overflow-x-auto rounded-lg border border-border-color">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-bg-surface text-text-muted border-b border-border-color">
                                            <tr>
                                                <th className="py-2 px-3 w-8 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIps.size === bulkResults.length && bulkResults.length > 0}
                                                        onChange={toggleSelectAll}
                                                        className="cursor-pointer"
                                                    />
                                                </th>
                                                <th className="py-2 px-3 font-semibold">IP Address</th>
                                                <th className="py-2 px-3 font-semibold">Overall Verdict</th>
                                                <th className="py-2 px-3 font-semibold">FMC Feed</th>
                                                <th className="py-2 px-3 font-semibold">Perimeter Shun</th>
                                                <th className="py-2 px-3 font-semibold">Citrix Strikes</th>
                                                <th className="py-2 px-3 font-semibold">FMC GeoIP</th>
                                                <th className="py-2 px-3 font-semibold">ISP / Country</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-color font-mono">
                                            {bulkResults.map((r) => {
                                                const isSelected = selectedIps.has(r.ip);
                                                return (
                                                    <tr key={r.ip} className={`hover:bg-bg-surface/50 transition-colors ${isSelected ? "bg-accent-primary/5" : ""}`}>
                                                        <td className="py-2 px-3 text-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleSelectRow(r.ip)}
                                                                className="cursor-pointer"
                                                            />
                                                        </td>
                                                        <td className="py-2 px-3 font-bold text-text-primary">
                                                            {r.ip}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {r.isCurrentlyBlocked ? (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-300 border border-red-500/30">
                                                                    🔴 BLOCKED
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                                    🟢 CLEAR
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {r.blockPosture?.inFmcFeed ? (
                                                                <span className="text-red-400 font-bold">In Feed</span>
                                                            ) : (
                                                                <span className="text-emerald-400">Not in Feed</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {r.blockPosture?.inPerimeterVpnShun ? (
                                                                <span className="text-red-400 font-bold">Shunned ({r.blockPosture.activeShunNodes.length})</span>
                                                            ) : (
                                                                <span className="text-text-muted">None</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {r.blockPosture?.strikeCount > 0 ? (
                                                                <span className="text-amber-400 font-bold">Strike {r.blockPosture.strikeCount}</span>
                                                            ) : (
                                                                <span className="text-text-muted">Strike 0</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            {r.blockPosture?.fmcGeoStatus?.fmcGeoBlocked ? (
                                                                <span className="text-amber-300 font-bold">⚠️ Non-US ({r.networkProfile?.countryCode})</span>
                                                            ) : (
                                                                <span className="text-emerald-400">US</span>
                                                            )}
                                                        </td>
                                                        <td className="py-2 px-3 text-text-muted font-sans truncate max-w-[200px]" title={r.networkProfile?.isp}>
                                                            {r.networkProfile?.isp || "Unknown"} ({r.networkProfile?.countryCode || "US"})
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 3. Four-Stage Lifecycle & SLA Confirmation Modal / Alert */}
            {lifecycleResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-5 shadow-md space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                            <CheckCircle2 className="w-5 h-5" />
                            Confirmed Unblock & Feed Removal: <span className="font-mono text-white">{lifecycleResult.ip}</span>
                        </div>
                        <button
                            onClick={() => setLifecycleResult(null)}
                            className="text-text-muted hover:text-text-primary text-xs cursor-pointer"
                        >
                            Dismiss
                        </button>
                    </div>

                    <p className="text-xs text-text-muted">
                        Deterministic status of the 4 enforcement layers for this unblock operation:
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                        {/* Step 1 */}
                        <div className="p-3 bg-bg-surface rounded-lg border border-border-color space-y-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Step 1: Database Strike
                            </span>
                            <span className="font-semibold text-text-primary block">Reset to 0 (Pardoned)</span>
                            <span className="text-[10px] text-text-muted block">Status: Immediate (0s)</span>
                        </div>

                        {/* Step 2 */}
                        <div className="p-3 bg-bg-surface rounded-lg border border-border-color space-y-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Step 2: Feed Snapshot
                            </span>
                            <span className="font-semibold text-text-primary block">Removed from Feed File</span>
                            <span className="text-[10px] text-text-muted block">Status: Immediate (0s)</span>
                        </div>

                        {/* Step 3 */}
                        <div className="p-3 bg-bg-surface rounded-lg border border-border-color space-y-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Step 3: Perimeter ASAs
                            </span>
                            <span className="font-semibold text-text-primary block">CLI 'no shun' Executed</span>
                            <span className="text-[10px] text-emerald-400 font-bold block">Traffic passes wire NOW!</span>
                        </div>

                        {/* Step 4 */}
                        <div className="p-3 bg-bg-surface rounded-lg border border-accent-primary/40 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-accent-primary flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Step 4: FMC Background Sync
                            </span>
                            <span className="font-semibold text-text-primary block">
                                In ~{lifecycleResult.fmcSync?.estimatedMinutes || 10} minutes
                            </span>
                            <span className="text-[10px] text-text-muted block">
                                Next poll at: {lifecycleResult.fmcSync?.nextPollExpected ? new Date(lifecycleResult.fmcSync.nextPollExpected).toLocaleTimeString() : "Pending"}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* 4. Searchable Feed Entries Table */}
            <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h4 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <Server className="w-4 h-4 text-accent-primary" />
                            Feed Entries Table ({totalEntries.toLocaleString()} Total IPs)
                        </h4>
                        <p className="text-xs text-text-muted">
                            Search and inspect the actual entries currently being sent to Cisco FMC.
                        </p>
                    </div>

                    {/* Search Bar */}
                    <div className="w-full md:w-72">
                        <input
                            type="text"
                            placeholder="Filter feed entries by IP prefix..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPage(1);
                            }}
                            className="w-full bg-bg-surface border border-border-color rounded-lg px-3 py-1.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                        />
                    </div>
                </div>

                {/* Feed Table */}
                <div className="overflow-auto max-h-[500px] rounded-lg border border-border-color custom-scrollbar relative">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-bg-surface text-text-muted border-b border-border-color sticky top-0 z-10 shadow-sm backdrop-blur-md">
                            <tr>
                                <th className="py-2.5 px-3 font-semibold">Feed IP Address</th>
                                <th className="py-2.5 px-3 font-semibold">Feed Classification</th>
                                <th className="py-2.5 px-3 font-semibold">Detection Reason / Evidence</th>
                                <th className="py-2.5 px-3 font-semibold">ISP / Network Name</th>
                                <th className="py-2.5 px-3 font-semibold">Country</th>
                                <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-color">
                            {entries.length > 0 ? (
                                entries.map((item: any) => (
                                    <tr key={item.ip} className="hover:bg-bg-surface/50 transition-colors">
                                        <td className="py-2 px-3 font-mono font-medium text-text-primary">
                                            {item.ip}
                                        </td>
                                        <td className="py-2 px-3">
                                            {item.category === "BLACKLIST" && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                                                    Permanent Blacklist
                                                </span>
                                            )}
                                            {item.category === "RESIDENTIAL" && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
                                                    Progressive Strike
                                                </span>
                                            )}
                                            {item.category === "HOSTING_VPS" && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                                    Datacenter / VPS
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 px-3 text-text-muted max-w-[300px] truncate" title={item.reason}>
                                            {item.reason}
                                        </td>
                                        <td className="py-2 px-3 text-text-muted max-w-[200px] truncate" title={item.isp}>
                                            {item.isp}
                                        </td>
                                        <td className="py-2 px-3 text-text-muted font-mono">
                                            {item.country}
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveAndPardon(item.ip)}
                                                disabled={actionLoading}
                                                className="px-2 py-1 text-[11px] font-semibold text-red-400 hover:text-white hover:bg-red-500/80 rounded transition-colors border border-red-500/30 cursor-pointer"
                                            >
                                                Remove & Pardon
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="py-8 text-center text-text-muted">
                                        {loading ? "Loading live feed snapshot..." : "No matching IPs found in feed."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                <div className="pt-2 flex flex-wrap justify-between items-center gap-3 text-xs border-t border-border-color">
                    <span className="text-text-muted font-mono">
                        Showing <strong className="text-text-primary">{(page - 1) * pageSize + 1}</strong> to <strong className="text-text-primary">{Math.min(page * pageSize, pagination?.totalMatching || 0)}</strong> of <strong className="text-text-primary">{(pagination?.totalMatching || 0).toLocaleString()}</strong> matching IPs
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-2.5 py-1 rounded border border-border-color hover:bg-bg-surface disabled:opacity-40 transition-colors text-text-primary font-semibold flex items-center gap-1 cursor-pointer"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" /> Previous
                        </button>
                        <span className="px-2 font-mono text-accent-primary font-bold">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || totalPages === 0}
                            className="px-2.5 py-1 rounded border border-border-color hover:bg-bg-surface disabled:opacity-40 transition-colors text-text-primary font-semibold flex items-center gap-1 cursor-pointer"
                        >
                            Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
