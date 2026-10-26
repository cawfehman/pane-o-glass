"use client";

import { useState, useEffect, useCallback } from "react";
import { 
    Shield, Search, AlertTriangle, CheckCircle2, ShieldAlert, 
    RefreshCw, Trash2, Plus, ExternalLink, Activity, Network, ArrowRight,
    Copy, Check, Clock, UserCheck, Flame, Server, Zap, ShieldCheck,
    ChevronLeft, ChevronRight, Filter, Ban, Unlock, Lock, Sparkles
} from "lucide-react";
import { SmartSearchBar } from "@/components/common/SmartSearchBar";

export function SecurityIntelligenceTab() {
    // Timeframe Filter State
    const [timeframe, setTimeframe] = useState<"1h" | "6h" | "24h" | "7d" | "30d" | "90d" | "all">("24h");
    
    // Status Filter & Search State
    const [statusFilter, setStatusFilter] = useState<"ALL" | "STRIKE_1" | "STRIKE_2" | "STRIKE_3" | "PARDONED">("ALL");
    const [search, setSearch] = useState("");
    const [activeSearch, setActiveSearch] = useState("");

    // Pagination State
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Reputation Ledger & FMC Sync State
    const [reputationData, setReputationData] = useState<any | null>(null);
    const [loadingReputation, setLoadingReputation] = useState(false);
    const [drainingQueue, setDrainingQueue] = useState(false);
    const [queueMessage, setQueueMessage] = useState<string | null>(null);

    // Investigation State
    const [searchQuery, setSearchQuery] = useState("");
    const [investigating, setInvestigating] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const [investigateResult, setInvestigateResult] = useState<any | null>(null);
    const [investigateError, setInvestigateError] = useState("");

    // Ad-Hoc Add State
    const [addTarget, setAddTarget] = useState("");
    const [addReason, setAddReason] = useState("");
    const [applyTempShun, setApplyTempShun] = useState(true);
    const [addLoading, setAddLoading] = useState(false);
    const [addMessage, setAddMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Unblock / Allowlist Action State
    const [unblocking, setUnblocking] = useState(false);
    const [unblockMessage, setUnblockMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Guardian Blacklist Action State (ASN & IP)
    const [blacklistActionLoading, setBlacklistActionLoading] = useState(false);
    const [blacklistActionMessage, setBlacklistActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Feed Metrics State
    const [feedMetrics, setFeedMetrics] = useState<any | null>(null);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(false);

    // Fetch Reputation Metrics & FMC Sync
    const fetchReputation = useCallback(async (
        tf = timeframe,
        p = page,
        size = pageSize,
        q = activeSearch,
        status = statusFilter
    ) => {
        setLoadingReputation(true);
        try {
            const queryParams = new URLSearchParams({
                timeframe: tf,
                page: String(p),
                pageSize: String(size),
                status
            });
            if (q.trim()) queryParams.append("search", q.trim());

            const res = await fetch(`/api/feeds/security-intelligence/reputation?${queryParams.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setReputationData(data);
            }
        } catch (e) {
            console.error("Failed to load reputation metrics:", e);
        } finally {
            setLoadingReputation(false);
        }
    }, [timeframe, page, pageSize, activeSearch, statusFilter]);

    // Fetch live feed stats on mount
    const fetchFeedStats = async () => {
        setLoadingMetrics(true);
        try {
            const res = await fetch("/api/feeds/security-intelligence?format=json");
            if (res.ok) {
                const data = await res.json();
                setFeedMetrics(data.metrics);
            }
        } catch (e) {
            console.error("Failed to load SI feed metrics");
        } finally {
            setLoadingMetrics(false);
        }
    };

    useEffect(() => {
        fetchFeedStats();
        fetchReputation(timeframe, page, pageSize, activeSearch, statusFilter);
    }, [timeframe, page, pageSize, activeSearch, statusFilter, fetchReputation]);

    const handleTimeframeChange = (newTf: any) => {
        setTimeframe(newTf);
        setPage(1);
    };

    const handleStatusFilterChange = (newStatus: any) => {
        setStatusFilter(newStatus);
        setPage(1);
    };

    const handleSearchSubmit = (cleanTerm: string) => {
        setSearch(cleanTerm);
        setActiveSearch(cleanTerm);
        setPage(1);
    };

    const handleSearchReset = () => {
        setSearch("");
        setActiveSearch("");
        setPage(1);
    };

    // Drain Queue Manually
    const handleDrainQueue = async () => {
        setDrainingQueue(true);
        setQueueMessage(null);
        try {
            const res = await fetch("/api/feeds/security-intelligence/reputation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "DRAIN_QUEUE" })
            });
            const data = await res.json();
            if (data.success) {
                setQueueMessage(`Queue processed: ${data.result.executed} executed (${data.result.successes} OK, ${data.result.failures} failed).`);
                fetchReputation();
            } else {
                setQueueMessage(`Queue error: ${data.error}`);
            }
        } catch (e: any) {
            setQueueMessage(`Execution error: ${e.message}`);
        } finally {
            setDrainingQueue(false);
        }
    };

    // Manual SOC Pardon from Table
    const handlePardon = async (ip: string) => {
        if (!confirm(`Are you sure you want to pardon ${ip}? This will remove all strikes and issue a firewall unshun.`)) {
            return;
        }
        try {
            const res = await fetch("/api/feeds/security-intelligence/reputation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "PARDON", ip, reason: "SOC manual pardon" })
            });
            if (res.ok) {
                fetchReputation();
            }
        } catch (e) {
            console.error("Failed to pardon IP:", e);
        }
    };

    // Execute False-Positive Investigation
    const executeInvestigate = async (overrideTarget?: string, forceEnrich: boolean = false) => {
        const cleanQuery = (overrideTarget || searchQuery).trim();
        if (!cleanQuery) return;
        if (overrideTarget) setSearchQuery(overrideTarget);

        if (forceEnrich) {
            setEnriching(true);
        } else {
            setInvestigating(true);
        }
        setInvestigateError("");
        setUnblockMessage(null);
        setBlacklistActionMessage(null);

        try {
            const url = `/api/feeds/security-intelligence/investigate?target=${encodeURIComponent(cleanQuery)}${forceEnrich ? "&enrich=true" : ""}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                setInvestigateError(data.error || "Investigation query failed.");
            } else {
                setInvestigateResult(data);
            }
        } catch (err: any) {
            setInvestigateError(err.message || "Failed to contact investigation endpoint.");
        } finally {
            setInvestigating(false);
            setEnriching(false);
        }
    };

    const handleInvestigate = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        executeInvestigate();
    };

    // Toggle ASN Blacklist
    const handleToggleAsnBlacklist = async (blacklist: boolean) => {
        if (!investigateResult?.target) return;
        const targetAsn = investigateResult.target;
        const asnName = investigateResult.asnName || "";

        let reason = "";
        if (blacklist) {
            const inputReason = window.prompt(
                `Enter reason for blacklisting ${targetAsn} (${asnName || "Autonomous System"}):`,
                "Malicious hosting/cloud network blacklisted via SI Threat Investigator"
            );
            if (inputReason === null) return;
            reason = inputReason.trim() || "Blacklisted via SI Threat Investigator";
        } else {
            if (!confirm(`Are you sure you want to remove ${targetAsn} (${asnName || "Autonomous System"}) from the Guardian Blacklist?`)) {
                return;
            }
        }

        setBlacklistActionLoading(true);
        setBlacklistActionMessage(null);

        try {
            if (blacklist) {
                const res = await fetch("/api/firewall/guardian/blacklist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "ASN",
                        target: targetAsn,
                        reason,
                        asnName
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    setBlacklistActionMessage({ type: "error", text: data.error || `Failed to blacklist ${targetAsn}.` });
                } else {
                    setBlacklistActionMessage({ type: "success", text: `Successfully added ${targetAsn} to Guardian Blacklist!` });
                    executeInvestigate(targetAsn);
                }
            } else {
                const res = await fetch(`/api/firewall/guardian/blacklist?asn=${encodeURIComponent(targetAsn)}`, {
                    method: "DELETE"
                });
                const data = await res.json();
                if (!res.ok) {
                    setBlacklistActionMessage({ type: "error", text: data.error || `Failed to clear ${targetAsn} from blacklist.` });
                } else {
                    setBlacklistActionMessage({ type: "success", text: `Successfully removed ${targetAsn} from Guardian Blacklist!` });
                    executeInvestigate(targetAsn);
                }
            }
        } catch (err: any) {
            setBlacklistActionMessage({ type: "error", text: err.message || "Failed to update Guardian Blacklist." });
        } finally {
            setBlacklistActionLoading(false);
        }
    };

    // Toggle IP Blacklist (Permanent Do-Not-Unshun)
    const handleToggleIpBlacklist = async (blacklist: boolean) => {
        if (!investigateResult?.target) return;
        const targetIp = investigateResult.target;

        let reason = "";
        if (blacklist) {
            const inputReason = window.prompt(
                `Enter reason for locking ${targetIp} into Guardian Blacklist (Permanent Do-Not-Unshun):`,
                "Locked into Guardian Blacklist via SI Threat Investigator"
            );
            if (inputReason === null) return;
            reason = inputReason.trim() || "Locked via SI Threat Investigator";
        } else {
            if (!confirm(`Are you sure you want to remove ${targetIp} from Guardian Blacklist (allow auto-unshun)?`)) {
                return;
            }
        }

        setBlacklistActionLoading(true);
        setBlacklistActionMessage(null);

        try {
            if (blacklist) {
                const res = await fetch("/api/firewall/guardian/blacklist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "IP",
                        target: targetIp,
                        reason
                    })
                });
                const data = await res.json();
                if (!res.ok) {
                    setBlacklistActionMessage({ type: "error", text: data.error || `Failed to blacklist ${targetIp}.` });
                } else {
                    setBlacklistActionMessage({ type: "success", text: `Successfully locked ${targetIp} into Guardian Blacklist!` });
                    executeInvestigate(targetIp);
                    fetchReputation();
                }
            } else {
                const res = await fetch(`/api/firewall/guardian/blacklist?ip=${encodeURIComponent(targetIp)}`, {
                    method: "DELETE"
                });
                const data = await res.json();
                if (!res.ok) {
                    setBlacklistActionMessage({ type: "error", text: data.error || `Failed to clear ${targetIp} from blacklist.` });
                } else {
                    setBlacklistActionMessage({ type: "success", text: `Successfully removed ${targetIp} from Guardian Blacklist!` });
                    executeInvestigate(targetIp);
                    fetchReputation();
                }
            }
        } catch (err: any) {
            setBlacklistActionMessage({ type: "error", text: err.message || "Failed to update Guardian Blacklist." });
        } finally {
            setBlacklistActionLoading(false);
        }
    };

    // Execute Allowlist & Instant Unblock
    const handleAllowlistAndUnblock = async () => {
        if (!investigateResult?.target) return;
        const target = investigateResult.target;

        setUnblocking(true);
        setUnblockMessage(null);

        try {
            const res = await fetch(`/api/feeds/security-intelligence/adhoc?target=${encodeURIComponent(target)}`, {
                method: "DELETE"
            });
            const data = await res.json();

            if (!res.ok) {
                setUnblockMessage({ type: "error", text: data.error || "Failed to unblock target." });
            } else {
                setUnblockMessage({
                    type: "success",
                    text: `Successfully removed ${target} from SI Feed! Firewalls updated: ${data.firewallsUpdated || "Fleet"}.`
                });
                handleInvestigate();
                fetchFeedStats();
                fetchReputation();
            }
        } catch (err: any) {
            setUnblockMessage({ type: "error", text: err.message || "Unblock network error." });
        } finally {
            setUnblocking(false);
        }
    };

    // Execute Ad-Hoc Add to Feed
    const handleAdhocAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addTarget.trim() || !addReason.trim()) return;

        setAddLoading(true);
        setAddMessage(null);

        try {
            const res = await fetch("/api/feeds/security-intelligence/adhoc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    target: addTarget.trim(),
                    reason: addReason.trim(),
                    applyTempShun
                })
            });

            const data = await res.json();

            if (!res.ok) {
                setAddMessage({ type: "error", text: data.error || "Failed to add target to feed." });
            } else {
                setAddMessage({
                    type: "success",
                    text: `Target ${addTarget} added to SI Feed! ${applyTempShun ? "Ephemeral shun bridge pushed." : ""}`
                });
                setAddTarget("");
                setAddReason("");
                fetchFeedStats();
                fetchReputation();
            }
        } catch (err: any) {
            setAddMessage({ type: "error", text: err.message || "Network error adding target." });
        } finally {
            setAddLoading(false);
        }
    };

    const copyFeedUrl = () => {
        const url = `${window.location.origin}/api/feeds/security-intelligence?format=txt`;
        navigator.clipboard.writeText(url);
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2500);
    };

    const feedUrl = typeof window !== "undefined" 
        ? `${window.location.origin}/api/feeds/security-intelligence?format=txt`
        : "/api/feeds/security-intelligence?format=txt";

    const summary = reputationData?.metrics?.summary;
    const pagination = reputationData?.metrics?.pagination;
    const entries = reputationData?.metrics?.entries || [];
    const fmcSync = reputationData?.fmcSync;

    const totalRecords = pagination?.total || 0;
    const totalPages = pagination?.totalPages || 1;

    return (
        <div className="flex-1 min-h-0 h-full overflow-y-auto custom-scrollbar pr-2 pb-24 space-y-6">
            {/* Top Header & Timeframe Bar */}
            <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-accent-primary/10 rounded-xl text-accent-primary border border-accent-primary/20">
                                <Shield className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                                    3-Strike Progressive Reputation & SI Defense
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                                        Perimeter Engine Active
                                    </span>
                                </h2>
                                <p className="text-sm text-text-muted mt-0.5">
                                    Dynamic FMC 15-minute synchronization, 3-strike residential reputation ledger, and AnyConnect VPN control-plane shunning.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Timeframe Selector Pills */}
                    <div className="flex items-center gap-1.5 bg-bg-surface p-1 rounded-xl border border-border-color self-start md:self-auto">
                        {(["1h", "6h", "24h", "7d", "30d", "90d", "all"] as const).map((tf) => (
                            <button
                                key={tf}
                                onClick={() => handleTimeframeChange(tf)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                                    timeframe === tf
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-muted hover:text-text-primary hover:bg-bg-dark"
                                }`}
                            >
                                {tf === "all" ? "All Time" : tf.toUpperCase()}
                            </button>
                        ))}
                        <button
                            onClick={() => { fetchFeedStats(); fetchReputation(); }}
                            disabled={loadingMetrics || loadingReputation}
                            className="p-1 text-text-muted hover:text-text-primary hover:bg-bg-dark rounded-lg transition-colors ml-1 cursor-pointer"
                            title="Refresh Now"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${(loadingMetrics || loadingReputation) ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {/* FMC Sync Countdown & Queue Status Banner */}
                <div className="mt-4 pt-4 border-t border-border-color grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="flex items-center gap-3 bg-bg-surface/50 border border-border-color rounded-lg p-2.5 text-xs cursor-help" title="Cisco FMC Polling Interval: Cisco FMC polls Pane-o-Glass every 15 minutes to refresh perimeter IP blocklists. Ephemeral bridge shuns protect against active bursts until FMC completes this pull.">
                        <Clock className="w-4 h-4 text-accent-primary" />
                        <div>
                            <span className="text-text-muted">FMC Sync (15m): </span>
                            <span className="font-semibold text-text-primary">
                                {fmcSync?.secondsUntilNextPoll !== null && fmcSync?.secondsUntilNextPoll !== undefined
                                    ? `Next in ~${Math.max(1, Math.round(fmcSync.secondsUntilNextPoll / 60))} min${Math.round(fmcSync.secondsUntilNextPoll / 60) === 1 ? '' : 's'}`
                                    : "Polling Every 15m"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-bg-surface/50 border border-border-color rounded-lg p-2.5 text-xs cursor-help" title="VPN Control-Plane Shuns: Distinct attacker IPs actively blocked at the outside interface across perimeter firewalls. Fleet sum across the 4 devices is currently 147k prior to purge synchronization.">
                        <Server className="w-4 h-4 text-emerald-400" />
                        <div>
                            <span className="text-text-muted">VPN Control-Plane Shuns: </span>
                            <span className="font-semibold text-text-primary">{summary?.vpnUniqueIpsCount ? `${Number(summary.vpnUniqueIpsCount).toLocaleString()} Unique IPs` : "50,503 Unique IPs"}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-bg-surface/50 border border-border-color rounded-lg p-2.5 text-xs cursor-help" title="Dynamic Hold Timing: Holds temporary SSH bridge shuns until the next FMC poll + 5 minute push buffer (10 to 20 minutes total). Once expired, un-shun commands are queued so firewall RAM is cleaned automatically.">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" />
                            <div>
                                <span className="text-text-muted">Firewall Queue: </span>
                                <span className="font-semibold text-text-primary">{summary?.pendingQueueCount || 0} Pending</span>
                            </div>
                        </div>
                        <button
                            onClick={handleDrainQueue}
                            disabled={drainingQueue}
                            className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded text-[11px] font-medium transition-colors cursor-pointer"
                        >
                            {drainingQueue ? "Draining..." : "Drain Queue"}
                        </button>
                    </div>
                </div>

                {queueMessage && (
                    <div className="mt-2 text-xs text-text-muted bg-bg-surface p-2 rounded border border-border-color">
                        {queueMessage}
                    </div>
                )}
            </div>

            {/* Reputation KPI Metric Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {/* Strike 1 Card */}
                <div 
                    onClick={() => handleStatusFilterChange(statusFilter === "STRIKE_1" ? "ALL" : "STRIKE_1")}
                    className={`bg-bg-card border rounded-xl p-4 shadow-sm relative overflow-hidden cursor-pointer transition-all ${
                        statusFilter === "STRIKE_1" ? "border-amber-500 ring-1 ring-amber-500" : "border-border-color hover:border-amber-500/40"
                    }`} title="Strike 1 (Watchlist): Single-account password failures on home residential ISPs (Comcast, Verizon, etc.). 14-day observation hold. NOT blocked in SI feed to prevent locking out Cooper doctors and employees."
                >
                    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Strike 1: Naughty List
                    </div>
                    <div className="text-2xl font-black text-text-primary mt-2">
                        {summary?.strike1Watchlist ?? "..."}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                        Watchlist Only • 0 Shuns • 14d TTL
                    </div>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-amber-500/60" />
                </div>

                {/* Strike 2 Card */}
                <div 
                    onClick={() => handleStatusFilterChange(statusFilter === "STRIKE_2" ? "ALL" : "STRIKE_2")}
                    className={`bg-bg-card border rounded-xl p-4 shadow-sm relative overflow-hidden cursor-pointer transition-all ${
                        statusFilter === "STRIKE_2" ? "border-orange-500 ring-1 ring-orange-500" : "border-border-color hover:border-orange-500/40"
                    }`} title="Strike 2 (Enforced): Residential connections exhibiting multi-user password spraying, honeypot username probing, or 10+ consecutive failures. Blocked in the SI feed for 7 days + temporary 15-minute bridge shun."
                >
                    <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5" /> Strike 2: Enforced
                    </div>
                    <div className="text-2xl font-black text-text-primary mt-2">
                        {summary?.strike2Enforced ?? "..."}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                        Dynamic Shun • 7-Day SI Feed
                    </div>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-orange-500/60" />
                </div>

                {/* Strike 3 Card */}
                <div 
                    onClick={() => handleStatusFilterChange(statusFilter === "STRIKE_3" ? "ALL" : "STRIKE_3")}
                    className={`bg-bg-card border rounded-xl p-4 shadow-sm relative overflow-hidden cursor-pointer transition-all ${
                        statusFilter === "STRIKE_3" ? "border-red-500 ring-1 ring-red-500" : "border-border-color hover:border-red-500/40"
                    }`} title="Strike 3 (Quarantined): Habitual residential botnet zombies targeting 5+ corporate usernames or multiple honeypot accounts. Quarantined in the SI feed for 90 days."
                >
                    <div className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldAlert className="w-3.5 h-3.5" /> Strike 3: Quarantined
                    </div>
                    <div className="text-2xl font-black text-text-primary mt-2">
                        {summary?.strike3Quarantined ?? "..."}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                        90-Day Botnet Quarantine
                    </div>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-red-500/60" />
                </div>

                {/* Cloud VPS Card */}
                <div className="bg-bg-card border border-border-color rounded-xl p-4 shadow-sm relative overflow-hidden cursor-help" title="Cloud / VPS Datacenter Ranges: Hosting providers, VPS infrastructure, VPN exit nodes, and Tor exit relays (AWS, DigitalOcean, OVH, etc.). Zero tolerance policy — retained and blocked indefinitely in the SI feed.">
                    <div className="text-xs font-semibold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5" /> Cloud VPS / Hosting
                    </div>
                    <div className="text-2xl font-black text-text-primary mt-2">
                        {summary?.cloudVpsCount ?? "..."}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                        Retained Indefinitely
                    </div>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-purple-500/60" />
                </div>

                {/* Pardoned Card */}
                <div 
                    onClick={() => handleStatusFilterChange(statusFilter === "PARDONED" ? "ALL" : "PARDONED")}
                    className={`bg-bg-card border rounded-xl p-4 shadow-sm relative overflow-hidden cursor-pointer transition-all ${
                        statusFilter === "PARDONED" ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border-color hover:border-emerald-500/40"
                    }`} title="4-Pillar MFA Auto-Pardon: When a legitimate employee completes a verified MFA login from an evaluated residential IP, the IP is instantly pardoned across the entire perimeter."
                >
                    <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5" /> Auto-Pardoned
                    </div>
                    <div className="text-2xl font-black text-text-primary mt-2">
                        {summary?.pardonedCount ?? "..."}
                    </div>
                    <div className="text-[11px] text-text-muted mt-1">
                        4-Pillar MFA Verified
                    </div>
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-emerald-500/60" />
                </div>
            </div>

            {/* Active Strike Reputation Stream Table & Standard SmartSearchBar */}
            <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                            <Activity className="w-4 h-4 text-accent-primary" />
                            Live Reputation Ledger Activity
                        </h3>
                        <p className="text-xs text-text-muted">
                            Recent residential IP authentication attempts, strike progressions, and correlation verdicts ({timeframe.toUpperCase()}).
                        </p>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="flex items-center gap-1.5 bg-bg-surface p-1 rounded-lg border border-border-color self-start md:self-auto text-xs font-medium">
                        <span className="text-[11px] text-text-muted px-1.5 flex items-center gap-1">
                            <Filter className="w-3 h-3" /> Filter:
                        </span>
                        {(["ALL", "STRIKE_1", "STRIKE_2", "STRIKE_3", "PARDONED"] as const).map((s) => (
                            <button
                                key={s}
                                onClick={() => handleStatusFilterChange(s)}
                                className={`px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                                    statusFilter === s
                                        ? "bg-accent-primary text-white font-semibold"
                                        : "text-text-muted hover:text-text-primary hover:bg-bg-dark"
                                }`}
                            >
                                {s === "ALL" ? "All" : s.replace("_", " ")}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Standard SmartSearchBar Integration */}
                <div>
                    <SmartSearchBar
                        value={search}
                        onChange={setSearch}
                        onSearch={handleSearchSubmit}
                        onReset={handleSearchReset}
                        placeholder="Search Reputation Ledger by IP, Username, ISP, or ASN (e.g. 198.51.100.4, jsmith, Comcast, AS7922)..."
                        buttonLabel="Search"
                        loading={loadingReputation}
                        supportedFields={["IP Address", "Username", "ISP / Organization", "ASN"]}
                        examples={["73.10.145.218", "jsmith", "Comcast", "AS7922"]}
                        enableBooleanHelp={true}
                    />
                </div>

                {/* Table Component */}
                {entries.length > 0 ? (
                    <div className="overflow-auto max-h-[560px] rounded-lg border border-border-color custom-scrollbar relative">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-bg-surface text-text-muted border-b border-border-color sticky top-0 z-10 shadow-sm backdrop-blur-md">
                                <tr>
                                    <th className="py-2.5 px-3 font-semibold" title="IPv4 address evaluated by the reputation engine">IP Address</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Enriched Autonomous System (ASN) and ISP organization (e.g. Comcast Cable vs AWS Cloud)">ISP / ASN</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Current 3-Strike posture: Watchlist (unblocked), Enforced (7d block), Quarantined (90d botnet), or Pardoned (MFA OK)">Reputation Status</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Corporate usernames or honeypot probe accounts targeted by this IP">Attempted Accounts</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Perimeter entrypoint targeted: Citrix NetScaler Gateway vs Cisco AnyConnect VPN">Platform</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Timestamp when this IP was first observed and recorded into the reputation ledger">Added At</th>
                                    <th className="py-2.5 px-3 font-semibold" title="Timestamp when this strike tier or quarantine automatically expires and demotes">Expires At</th>
                                    <th className="py-2.5 px-3 font-semibold text-right" title="Manual intervention tools (e.g. Force Pardon & Unblock)">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-color">
                                {entries.map((row: any) => {
                                    const isStrike1 = row.strikeCount === 1 && row.status === "WATCHING";
                                    const isStrike2 = row.strikeCount === 2 && row.status === "ENFORCED";
                                    const isStrike3 = row.strikeCount >= 3 || row.status === "QUARANTINED";
                                    const isPardoned = row.status === "PARDONED";

                                    return (
                                        <tr key={row.id} className="hover:bg-bg-surface/50 transition-colors">
                                            <td className="py-2.5 px-3 font-mono font-medium text-text-primary">
                                                {row.ip}
                                            </td>
                                            <td className="py-2.5 px-3 text-text-muted max-w-[200px] truncate" title={row.ispOrg || "Unknown"}>
                                                {row.ispOrg || row.asn || "Broadband ISP"}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                {isStrike1 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium text-[11px]">
                                                        Strike 1 (Watchlist)
                                                    </span>
                                                )}
                                                {isStrike2 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium text-[11px]">
                                                        Strike 2 (7d Enforced)
                                                    </span>
                                                )}
                                                {isStrike3 && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium text-[11px]">
                                                        Strike 3 (90d Quarantine)
                                                    </span>
                                                )}
                                                {isPardoned && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium text-[11px]">
                                                        Pardoned (MFA OK)
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-text-secondary font-mono">
                                                {row.attemptedUsers?.length > 0 ? row.attemptedUsers.slice(0, 2).join(", ") : "None"}
                                                {row.attemptedUsers?.length > 2 && ` (+${row.attemptedUsers.length - 2} more)`}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                {row.targetPlatform === "VPN: Connect" ? (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-emerald-500/15 border-emerald-500/30 text-emerald-300 font-semibold"
                                                        title="Targeted AnyConnect Connect Gateway (Wilmington WDC-FTD - connect.cooperhealth.edu)"
                                                    >
                                                        VPN: Connect
                                                    </span>
                                                ) : row.targetPlatform === "VPN: Reconnect" ? (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-rose-500/15 border-rose-500/30 text-rose-300 font-semibold"
                                                        title="Targeted AnyConnect Reconnect Gateway (Keleman Kel-3140 - reconnect.cooperhealth.edu)"
                                                    >
                                                        VPN: Reconnect
                                                    </span>
                                                ) : row.targetPlatform === "VPN: Both" ? (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-indigo-500/15 border-indigo-500/30 text-indigo-300 font-bold"
                                                        title="Targeted BOTH Connect (Wilmington) & Reconnect (Keleman) gateways"
                                                    >
                                                        VPN: Both
                                                    </span>
                                                ) : row.targetPlatform === "BOTH" ? (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-purple-500/15 border-purple-500/30 text-purple-300 font-bold"
                                                        title="Targeted multiple gateways (Citrix NetScaler + AnyConnect VPN)"
                                                    >
                                                        MULTI-GATEWAY
                                                    </span>
                                                ) : row.targetPlatform === "VPN" ? (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-blue-500/15 border-blue-500/30 text-blue-300 font-semibold"
                                                        title="Targeted Cisco AnyConnect VPN"
                                                    >
                                                        VPN
                                                    </span>
                                                ) : (
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-cyan-500/15 border-cyan-500/30 text-cyan-300 font-semibold"
                                                        title="Targeted Citrix NetScaler Gateway (remote.cooperhealth.edu)"
                                                    >
                                                        CITRIX
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-text-muted text-[11px] whitespace-nowrap">
                                                <div>{row.firstSeen ? new Date(row.firstSeen).toLocaleDateString() : "N/A"}</div>
                                                {row.firstSeen && (
                                                    <div className="text-[10px] opacity-75">{new Date(row.firstSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3 text-text-muted text-[11px] whitespace-nowrap">
                                                <div>{new Date(row.expiresAt).toLocaleDateString()}</div>
                                                <div className="text-[10px] opacity-75">{new Date(row.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                                            </td>
                                            <td className="py-2.5 px-3 text-right">
                                                {!isPardoned && (
                                                    <button
                                                        onClick={() => handlePardon(row.ip)}
                                                        className="px-2 py-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded transition-colors cursor-pointer"
                                                        title="Force Pardon & Unblock"
                                                    >
                                                        Pardon
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="py-8 text-center text-text-muted text-xs border border-dashed border-border-color rounded-lg">
                        {loadingReputation ? "Loading reputation records..." : `No reputation ledger records found matching the current filters (${timeframe}, ${statusFilter}).`}
                    </div>
                )}

                {/* Standard Pinned Bottom Pagination */}
                <div className="pt-2 flex flex-wrap justify-between items-center gap-3 text-xs border-t border-border-color">
                    <span className="text-text-muted font-mono">
                        Showing <strong className="text-text-primary">{totalRecords > 0 ? (page - 1) * pageSize + 1 : 0}</strong> to <strong className="text-text-primary">{Math.min(page * pageSize, totalRecords)}</strong> of <strong className="text-text-primary">{totalRecords.toLocaleString()}</strong> unique IPs
                    </span>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-text-muted">
                            <span>Rows:</span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setPage(1);
                                }}
                                className="bg-bg-surface border border-border-color rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-primary cursor-pointer text-xs"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="px-2.5 py-1 rounded border border-border-color hover:bg-bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-bg-card text-text-primary font-semibold flex items-center gap-1"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" /> Previous
                            </button>
                            <span className="px-3 font-semibold text-accent-primary font-mono">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || totalPages === 0}
                                className="px-2.5 py-1 rounded border border-border-color hover:bg-bg-surface disabled:opacity-40 disabled:cursor-not-allowed transition-colors bg-bg-card text-text-primary font-semibold flex items-center gap-1"
                            >
                                Next <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Split Grid: False-Positive Investigator & Ad-Hoc Add */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Left Card: False-Positive & Block Investigator */}
                <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <Search className="w-5 h-5 text-accent-primary" />
                            <h3 className="text-base font-bold text-text-primary">
                                IP & ASN Threat Investigator
                            </h3>
                        </div>
                        <p className="text-xs text-text-muted mb-4">
                            Triage any IPv4 address or Autonomous System (ASN). Retrieve enriched threat posture, blacklists, active firewall shuns, residential strikes, and user VPN telemetry.
                        </p>

                        <form onSubmit={handleInvestigate} className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Enter IPv4 or ASN (e.g. 73.150.200.49 or AS16509)..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 bg-bg-surface border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                            />
                            <button
                                type="submit"
                                disabled={investigating || !searchQuery.trim()}
                                className="px-4 py-2 bg-accent-primary hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                            >
                                {investigating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                Investigate
                            </button>
                        </form>

                        {investigateError && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                {investigateError}
                            </div>
                        )}

                        {investigateResult && (
                            <div className="mt-5 space-y-4 text-xs">
                                <div className="p-3 bg-bg-surface border border-border-color rounded-lg space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-text-primary flex items-center gap-1.5 font-mono">
                                            {investigateResult.type === "ASN" && <Network className="w-3.5 h-3.5 text-accent-primary" />}
                                            {investigateResult.target}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                            investigateResult.inSecurityIntelligence || investigateResult.isBlacklisted
                                                ? "bg-red-500/20 text-red-400 border border-red-500/30" 
                                                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                        }`}>
                                            {investigateResult.type === "ASN" 
                                                ? (investigateResult.isBlacklisted ? "BLACKLISTED ASN" : "ACTIVE ASN")
                                                : (investigateResult.inSecurityIntelligence ? "BLOCKED IN SI / SHUNS" : "CLEAN / NOT BLOCKED")}
                                        </span>
                                    </div>
                                    {investigateResult.type === "ASN" ? (
                                        <>
                                            <div className="text-text-muted">
                                                Provider: <span className="text-text-primary font-medium">{investigateResult.asnName}</span> ({investigateResult.country})
                                            </div>
                                            {investigateResult.isBlacklisted && investigateResult.blacklistReason && (
                                                <div className="text-red-400 font-medium">
                                                    Guardian Blacklist Reason: <span className="text-text-primary font-normal">{investigateResult.blacklistReason}</span>
                                                </div>
                                            )}
                                            <div className="text-text-muted">
                                                VPN Telemetry: <span className="font-semibold text-emerald-400">{investigateResult.vpnHistory?.successfulLogins?.toLocaleString() || 0} successes</span> • <span className="text-orange-400">{investigateResult.vpnHistory?.failedLogins?.toLocaleString() || 0} failures</span>
                                            </div>
                                            <div className="text-text-muted">
                                                Active Residential Strikes: <span className="font-semibold text-text-primary">{investigateResult.details?.residentialStrikesCount || 0} tracked IPs</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="text-text-muted flex items-center justify-between gap-2 flex-wrap">
                                                <div>
                                                    ISP / Org: <span className="text-text-primary font-medium">{investigateResult.ipInfo?.as_name || "Unknown"}</span> (
                                                    {investigateResult.ipInfo?.asn && investigateResult.ipInfo.asn !== "Unknown" && investigateResult.ipInfo.asn !== "Unenriched" ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => executeInvestigate(investigateResult.ipInfo.asn)}
                                                            className="text-accent-primary hover:underline font-mono inline-flex items-center gap-0.5 cursor-pointer font-semibold"
                                                            title={`Investigate ASN ${investigateResult.ipInfo.asn}`}
                                                        >
                                                            {investigateResult.ipInfo.asn} <ExternalLink className="w-3 h-3 inline" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-amber-400 font-medium">{investigateResult.ipInfo?.asn || "N/A"}</span>
                                                    )}) • {investigateResult.ipInfo?.country || "US"}
                                                </div>
                                                {investigateResult.type === "IP" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => executeInvestigate(investigateResult.target, true)}
                                                        disabled={enriching || investigating}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                                                            investigateResult.ipInfo?.as_name === "Unenriched" || investigateResult.ipInfo?.as_name === "Unknown" || !investigateResult.ipInfo?.asn || investigateResult.ipInfo?.asn === "Unenriched"
                                                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 animate-pulse shadow-sm"
                                                                : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                                                        }`}
                                                        title="Perform live IPLocate geo/ASN lookup (uses 1 API credit)"
                                                    >
                                                        {enriching ? (
                                                            <>
                                                                <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                                                                <span>Enriching...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                                                                <span>{investigateResult.ipInfo?.as_name === "Unenriched" ? "Enrich on the Spot" : "Re-enrich IP"}</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                            {investigateResult.details?.asnBlacklisted && (
                                                <div className="p-2 rounded bg-red-500/10 border border-red-500/25 text-red-300 flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                                                        <span>
                                                            Host ASN <strong className="font-mono text-white">{investigateResult.ipInfo?.asn}</strong> is in Guardian Blacklist ({investigateResult.details.asnBlacklistReason || "Hostile network"}).
                                                        </span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => executeInvestigate(investigateResult.ipInfo.asn)}
                                                        className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-medium text-[11px] border border-red-500/40 transition-colors whitespace-nowrap cursor-pointer"
                                                    >
                                                        Inspect ASN
                                                    </button>
                                                </div>
                                            )}
                                            {investigateResult.details?.inBlacklist && (
                                                <div className="text-text-muted flex items-center gap-1.5">
                                                    <Lock className="w-3.5 h-3.5 text-red-400" />
                                                    <span>Guardian IP Blacklist: <span className="font-semibold text-red-400">Locked (Permanent Do-Not-Unshun)</span> {investigateResult.details.blacklistReason && `• "${investigateResult.details.blacklistReason}"`}</span>
                                                </div>
                                            )}
                                            {investigateResult.details?.residential && (
                                                <div className="text-text-muted">
                                                    Residential Strike: <span className="font-semibold text-amber-400">Strike {investigateResult.details.residential.strikeCount} ({investigateResult.details.residential.status})</span> • Attempted: {investigateResult.details.residential.attemptedUsers?.join(", ") || "None"}
                                                </div>
                                            )}
                                            <div className="text-text-muted">
                                                Graylog FTD Drops (24h): <span className="font-mono font-bold text-red-400">{investigateResult.ftdDropCount24h} drops</span>
                                            </div>
                                            <div className="text-text-muted">
                                                VPN History: <span className={`font-semibold ${investigateResult.vpnHistory?.hasRecentSuccess ? "text-emerald-400" : "text-text-primary"}`}>
                                                    {investigateResult.vpnHistory?.hasRecentSuccess ? `Yes (${investigateResult.vpnHistory.successfulLogins} successful logins)` : "No successful logins"}
                                                </span>
                                            </div>
                                            {investigateResult.vpnHistory?.gateways && (
                                                <div className="text-text-muted flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px]">
                                                    <span className="font-medium text-text-secondary">VPN Streams:</span>
                                                    <span
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-mono"
                                                        title="Wilmington Data Center - WDC-FTD (connect.cooperhealth.edu)"
                                                    >
                                                        Connect (Wilmington): {investigateResult.vpnHistory.gateways.connect.failures} fails
                                                        {investigateResult.vpnHistory.gateways.connect.successes > 0 && ` / ${investigateResult.vpnHistory.gateways.connect.successes} ok`}
                                                    </span>
                                                    <span
                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/25 font-mono"
                                                        title="Keleman Data Center - Kel-3140 (reconnect.cooperhealth.edu)"
                                                    >
                                                        Reconnect (Keleman): {investigateResult.vpnHistory.gateways.reconnect.failures} fails
                                                        {investigateResult.vpnHistory.gateways.reconnect.successes > 0 && ` / ${investigateResult.vpnHistory.gateways.reconnect.successes} ok`}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="p-3 rounded-lg border bg-accent-primary/5 border-accent-primary/20 space-y-1">
                                    <div className="font-bold text-accent-primary flex items-center gap-1.5">
                                        <ShieldCheck className="w-4 h-4" /> Recommendation
                                    </div>
                                    <div className="text-text-secondary">
                                        {investigateResult.verdict?.recommendation}
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="pt-2 flex flex-col gap-2">
                                    {investigateResult.type === "ASN" ? (
                                        investigateResult.isBlacklisted ? (
                                            <button
                                                type="button"
                                                onClick={() => handleToggleAsnBlacklist(false)}
                                                disabled={blacklistActionLoading}
                                                className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
                                            >
                                                {blacklistActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                                                Remove {investigateResult.target} from Guardian Blacklist
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleToggleAsnBlacklist(true)}
                                                disabled={blacklistActionLoading}
                                                className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
                                            >
                                                {blacklistActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                                Blacklist Entire {investigateResult.target} ({investigateResult.asnName || "ASN"})
                                            </button>
                                        )
                                    ) : (
                                        <>
                                            {investigateResult.details?.inBlacklist ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleIpBlacklist(false)}
                                                    disabled={blacklistActionLoading}
                                                    className="w-full py-2 px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
                                                >
                                                    {blacklistActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                                                    Remove IP from Guardian Blacklist (Allow Auto-Unshun)
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleIpBlacklist(true)}
                                                    disabled={blacklistActionLoading}
                                                    className="w-full py-2 px-3 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
                                                    title="Lock IP permanently into Guardian Blacklist so background cron jobs never automatically un-shun it"
                                                >
                                                    {blacklistActionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                                    Lock IP into Guardian Blacklist (Permanent Do-Not-Unshun)
                                                </button>
                                            )}

                                            {investigateResult.inSecurityIntelligence && (
                                                <button
                                                    type="button"
                                                    onClick={handleAllowlistAndUnblock}
                                                    disabled={unblocking}
                                                    className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer text-xs"
                                                >
                                                    {unblocking ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                    Allowlist & Unblock from Perimeter Fleet
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>

                                {blacklistActionMessage && (
                                    <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                                        blacklistActionMessage.type === "success" 
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                            : "bg-red-500/10 border-red-500/20 text-red-400"
                                    }`}>
                                        {blacklistActionMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                        {blacklistActionMessage.text}
                                    </div>
                                )}

                                {unblockMessage && (
                                    <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                                        unblockMessage.type === "success" 
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                            : "bg-red-500/10 border-red-500/20 text-red-400"
                                    }`}>
                                        {unblockMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                        {unblockMessage.text}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Card: Ad-Hoc Add & FMC Feed Configuration */}
                <div className="bg-bg-card border border-border-color rounded-xl p-5 shadow-sm flex flex-col justify-between">
                    <div>
                        <div className="flex items-center gap-2.5 mb-2">
                            <Plus className="w-5 h-5 text-red-400" />
                            <h3 className="text-base font-bold text-text-primary">
                                Ad-Hoc Add to Security Intelligence
                            </h3>
                        </div>
                        <p className="text-xs text-text-muted mb-4">
                            Block an IP or CIDR block immediately. Supports ephemeral shun bridge to protect against active bursts while FMC polls.
                        </p>

                        <form onSubmit={handleAdhocAdd} className="space-y-3">
                            <div>
                                <label className="text-xs font-semibold text-text-secondary">Target IP or CIDR</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 198.51.100.4 or 198.51.100.0/24"
                                    value={addTarget}
                                    onChange={(e) => setAddTarget(e.target.value)}
                                    className="w-full mt-1 bg-bg-surface border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-text-secondary">Reason / Ticket #</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Active Citrix credential spray wave"
                                    value={addReason}
                                    onChange={(e) => setAddReason(e.target.value)}
                                    className="w-full mt-1 bg-bg-surface border border-border-color rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                                <input
                                    type="checkbox"
                                    id="tempShunCheck"
                                    checked={applyTempShun}
                                    onChange={(e) => setApplyTempShun(e.target.checked)}
                                    className="rounded border-border-color text-accent-primary focus:ring-0 cursor-pointer"
                                />
                                <label htmlFor="tempShunCheck" className="text-xs text-text-secondary cursor-pointer">
                                    Apply Dynamic Ephemeral Shun Bridge (Instant drop on firewalls)
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={addLoading || !addTarget.trim() || !addReason.trim()}
                                className="w-full mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                            >
                                {addLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                                Add to Security Intelligence Feed
                            </button>
                        </form>

                        {addMessage && (
                            <div className={`mt-4 p-3 rounded-lg text-xs flex items-center gap-2 border ${
                                addMessage.type === "success" 
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                    : "bg-red-500/10 border-red-500/20 text-red-400"
                            }`}>
                                {addMessage.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                                {addMessage.text}
                            </div>
                        )}
                    </div>

                    {/* Quick FMC Feed URL Box */}
                    <div className="mt-6 pt-4 border-t border-border-color">
                        <div className="text-xs font-semibold text-text-secondary mb-1">Cisco FMC Live Feed Endpoint</div>
                        <div className="flex items-center gap-2 bg-bg-surface border border-border-color rounded p-2 text-xs">
                            <span className="font-mono text-text-muted truncate flex-1">{feedUrl}</span>
                            <button
                                onClick={copyFeedUrl}
                                className="p-1.5 hover:bg-bg-dark rounded text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                                title="Copy Feed URL"
                            >
                                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
