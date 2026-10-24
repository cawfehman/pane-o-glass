import { useState, useEffect, useCallback, useMemo } from "react";
import { 
    Server, ShieldAlert, Clock, SearchX, LayoutTemplate, Check, Download, 
    Info, RefreshCw, CheckCircle2, AlertTriangle, X, Unlock, Flame, 
    CheckSquare, Square, MinusSquare, FileSpreadsheet, Shield, ExternalLink,
    ClipboardCheck, Sparkles, Filter, Calendar
} from "lucide-react";
import { EnrichmentDetailsModal } from "./EnrichmentDetailsModal";
import { SmartSearchBar } from "@/components/common/SmartSearchBar";

interface ShunSummary {
    activeTotal: number;
    uniqueActiveIps: number;
    clearedTotal: number;
    totalTracked: number;
    lastSyncedAt: string | null;
    byFirewall: Array<{
        firewall: string;
        activeCount: number;
        clearedCount: number;
        totalCount: number;
    }>;
}

export interface ShunDatabaseTabProps {
    initialSearch?: string;
    onClose?: () => void;
    isModal?: boolean;
}

type TimeframeOption = "1h" | "4h" | "12h" | "24h" | "7d" | "30d" | "all";

export function ShunDatabaseTab({ initialSearch = "", onClose, isModal = false }: ShunDatabaseTabProps) {
    const [records, setRecords] = useState<any[]>([]);
    const [summary, setSummary] = useState<ShunSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    const [search, setSearch] = useState(initialSearch);
    const [activeSearch, setActiveSearch] = useState(initialSearch);
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cleared">("active");
    
    // Timeframe filters: 1h, 4h, 12h, 24h, 7d, 30d, all
    const [timeframe, setTimeframe] = useState<TimeframeOption>("all");
    const [timeField, setTimeField] = useState<"lastSeen" | "firstSeen">("lastSeen");

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    // Default to lastSeen desc to immediately show recently active/shunned IPs
    const [sortField, setSortField] = useState("lastSeen");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const [selectedIp, setSelectedIp] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Multi-select & Unshun State
    const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set());
    const [targetFleet, setTargetFleet] = useState<string>("all");
    
    // Unshun Modal State: defaults to removing from all 4 FWs, with option to select one or more
    const [unshunModal, setUnshunModal] = useState<{
        ips: string[];
        isAllFirewalls: boolean;
        selectedFirewalls: string[];
    } | null>(null);
    
    const [unshunExecuting, setUnshunExecuting] = useState(false);
    const [unshunResult, setUnshunResult] = useState<any | null>(null);
    const [unshunError, setUnshunError] = useState<string | null>(null);

    const [isSyncing, setIsSyncing] = useState(false);
    const [syncBanner, setSyncBanner] = useState<{
        type: "success" | "warning" | "error";
        message: string;
        details?: string;
    } | null>(null);

    const [visibleColumns, setVisibleColumns] = useState({
        status: true,
        ip: true,
        lifecycle: true,
        firewall: true,
        network: true,
        location: true,
        actions: true
    });
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    useEffect(() => {
        const savedCols = localStorage.getItem("pane-o-glass.shun-columns");
        if (savedCols) {
            try { setVisibleColumns(prev => ({ ...prev, ...JSON.parse(savedCols) })); } catch (e) {}
        }
        const savedLimit = localStorage.getItem("pane-o-glass.shun-limit");
        if (savedLimit) {
            try { setLimit(parseInt(savedLimit, 10)); } catch (e) {}
        }
    }, []);

    const handleLimitChange = (newLimit: number) => {
        setLimit(newLimit);
        setPage(1);
        localStorage.setItem("pane-o-glass.shun-limit", newLimit.toString());
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDir(sortDir === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortDir("desc");
        }
        setPage(1);
    };

    const toggleColumn = (col: keyof typeof visibleColumns) => {
        const updated = { ...visibleColumns, [col]: !visibleColumns[col] };
        setVisibleColumns(updated);
        localStorage.setItem("pane-o-glass.shun-columns", JSON.stringify(updated));
    };

    const handleExport = async (onlySelected = false) => {
        try {
            setIsExporting(true);
            const query = new URLSearchParams();
            if (onlySelected && selectedIps.size > 0) {
                query.append("ips", Array.from(selectedIps).join(","));
            } else {
                const term = (activeSearch || search).trim();
                if (term) query.append("search", term);
                if (statusFilter !== "all") query.append("status", statusFilter);
                if (timeframe !== "all") query.append("timeframe", timeframe);
                query.append("timeField", timeField);
                query.append("sortField", sortField);
                query.append("sortDir", sortDir);
            }
            
            window.location.href = `/api/firewall/shun-database/export?${query.toString()}`;
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            console.error("Export failed", err);
        } finally {
            setIsExporting(false);
        }
    };

    const fetchRecords = useCallback(async (
        searchOverride?: string, 
        statusOverride?: "all" | "active" | "cleared",
        timeframeOverride?: TimeframeOption
    ) => {
        setLoading(true);
        setError("");
        try {
            const currentSearch = searchOverride !== undefined ? searchOverride : activeSearch;
            const currentStatus = statusOverride !== undefined ? statusOverride : statusFilter;
            const currentTimeframe = timeframeOverride !== undefined ? timeframeOverride : timeframe;
            
            const query = new URLSearchParams({ 
                page: page.toString(),
                limit: limit.toString(),
                sortField,
                sortDir,
                status: currentStatus,
                timeframe: currentTimeframe,
                timeField
            });
            if (currentSearch) query.append("search", currentSearch);

            const res = await fetch(`/api/firewall/shun-database?${query.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setRecords(data.records);
                if (data.summary) setSummary(data.summary);
                setTotalPages(data.pagination.pages);
                setTotalRecords(data.pagination.total);
            } else {
                const err = await res.text();
                setError(err || "Failed to fetch records.");
            }
        } catch (err) {
            setError("Failed to load shun records.");
        } finally {
            setLoading(false);
        }
    }, [page, limit, activeSearch, statusFilter, timeframe, timeField, sortField, sortDir]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const handleManualSync = async () => {
        setIsSyncing(true);
        setSyncBanner(null);
        try {
            const res = await fetch("/api/firewall/shun-database", {
                method: "POST"
            });
            const data = await res.json();
            if (res.ok && data.success) {
                if (data.summary) setSummary(data.summary);
                const okFws = (data.firewalls || []).filter((f: any) => f.success);
                const failedFws = (data.firewalls || []).filter((f: any) => !f.success);
                const durationSec = ((data.durationMs || 0) / 1000).toFixed(1);
                const perFwSummary = (data.firewalls || [])
                    .map((f: any) => f.success ? `${f.firewall}: ${f.activeShuns}` : `${f.firewall}: failed`)
                    .join(" • ");

                setSyncBanner({
                    type: failedFws.length > 0 ? "warning" : "success",
                    message: `Synced ${data.totalActiveShuns?.toLocaleString() || 0} active shuns (${data.uniqueActiveIps?.toLocaleString() || 0} unique IPs) across ${okFws.length}/${(data.firewalls || []).length} firewalls in ${durationSec}s (+${data.newlyAddedTotal || 0} new, -${data.clearedTotal || 0} cleared).`,
                    details: perFwSummary
                });
                await fetchRecords();
            } else {
                setSyncBanner({
                    type: "error",
                    message: data.error || "Failed to sync live shuns from firewalls."
                });
            }
        } catch (err: any) {
            setSyncBanner({
                type: "error",
                message: err?.message || "Network error while syncing shun database."
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const clearFilters = () => {
        setSearch("");
        setActiveSearch("");
        setStatusFilter("active");
        setTimeframe("all");
        setTimeField("lastSeen");
        setPage(1);
        setSortField("lastSeen");
        setSortDir("desc");
        fetchRecords("", "active", "all");
    };

    const handleFirewallChipClick = (fwName: string) => {
        const nextTerm = activeSearch.trim().toLowerCase() === fwName.toLowerCase() ? "" : fwName;
        setSearch(nextTerm);
        setActiveSearch(nextTerm);
        setPage(1);
        fetchRecords(nextTerm);
    };

    // Quick Timeframe Selectors
    const handleTimeframeChange = (tf: TimeframeOption) => {
        setTimeframe(tf);
        setPage(1);
    };

    // Selection Calculations
    const pageIps = useMemo(() => Array.from(new Set(records.map(r => r.ip))), [records]);
    const isAllPageSelected = pageIps.length > 0 && pageIps.every(ip => selectedIps.has(ip));
    const isSomePageSelected = pageIps.some(ip => selectedIps.has(ip)) && !isAllPageSelected;

    const toggleSelectAllPage = () => {
        setSelectedIps(prev => {
            const next = new Set(prev);
            if (isAllPageSelected) {
                pageIps.forEach(ip => next.delete(ip));
            } else {
                pageIps.forEach(ip => next.add(ip));
            }
            return next;
        });
    };

    const toggleSelectIp = (ip: string) => {
        setSelectedIps(prev => {
            const next = new Set(prev);
            if (next.has(ip)) {
                next.delete(ip);
            } else {
                next.add(ip);
            }
            return next;
        });
    };

    const clearSelection = () => {
        setSelectedIps(new Set());
    };

    // Open Unshun Modal: defaults to removing from all 4 firewalls
    const openUnshunModalForIps = (ips: string[]) => {
        const allFwNames = summary?.byFirewall?.map(f => f.firewall) || [];
        setUnshunModal({
            ips,
            isAllFirewalls: true,
            selectedFirewalls: allFwNames
        });
        setUnshunResult(null);
        setUnshunError(null);
    };

    // Execute Unshun Operation
    const executeUnshun = async () => {
        if (!unshunModal || unshunModal.ips.length === 0) return;

        setUnshunExecuting(true);
        setUnshunError(null);
        setUnshunResult(null);

        const payload: any = {
            ipAddresses: unshunModal.ips,
            action: "remove"
        };

        if (unshunModal.isAllFirewalls) {
            payload.targetHost = "all";
        } else {
            payload.targetHosts = unshunModal.selectedFirewalls;
        }

        try {
            const res = await fetch("/api/firewall/shun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setUnshunResult(data);
                // Optimistically mark these IPs as inactive in local state
                setRecords(prev => prev.map(rec => {
                    if (unshunModal.ips.includes(rec.ip)) {
                        if (unshunModal.isAllFirewalls) {
                            return { ...rec, isActive: false, activeCount: 0, isShunnedAll: false };
                        } else {
                            const remaining = (rec.activeFirewalls || []).filter((fw: string) => !unshunModal.selectedFirewalls.includes(fw));
                            return {
                                ...rec,
                                activeFirewalls: remaining,
                                activeCount: remaining.length,
                                isShunnedAll: false,
                                isActive: remaining.length > 0
                            };
                        }
                    }
                    return rec;
                }));
                // Remove from selection
                setSelectedIps(prev => {
                    const next = new Set(prev);
                    unshunModal.ips.forEach(ip => next.delete(ip));
                    return next;
                });
                // Refresh summary count in background
                fetchRecords();
            } else {
                setUnshunError(data.error || data.stderr || "Failed to remove shun(s) on firewalls.");
            }
        } catch (err: any) {
            setUnshunError(err?.message || "Network error while connecting to firewalls.");
        } finally {
            setUnshunExecuting(false);
        }
    };

    const configuredFwsList = useMemo(() => {
        return summary?.byFirewall?.map(f => f.firewall) || [
            "Wilmington (Connect Primary)",
            "Wilmington (Connect Secondary)",
            "Keleman (Reconnect Primary)",
            "Keleman (Reconnect Secondary)"
        ];
    }, [summary]);

    return (
        <div className={`flex flex-col gap-0 h-full overflow-hidden ${isModal ? "bg-[var(--bg-surface)] text-[var(--text-primary)]" : ""}`}>
            {/* Modal Header Bar if rendered in modal dialog */}
            {isModal && (
                <div className="bg-slate-900 border-b border-slate-800 px-5 py-3.5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white flex items-center gap-2">
                                Perimeter Firewall Shunned IPs Database
                            </h2>
                            <p className="text-xs text-slate-400">
                                1 aggregated entry per IP address across all 4 firewalls. Filter by time window and un-shun across fleet.
                            </p>
                        </div>
                    </div>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}

            <div className="bg-[var(--bg-surface)] p-4 border-b border-[var(--border-color)] shadow-sm shrink-0 flex flex-col gap-3">
                {/* Metric Pills & Status Selector */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filter: Active Shuns */}
                        <button
                            type="button"
                            onClick={() => {
                                const next = statusFilter === "active" ? "all" : "active";
                                setStatusFilter(next);
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-2 ${
                                statusFilter === "active"
                                    ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-sm"
                                    : "bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/15"
                            }`}
                            title="Click to filter Active shuns only"
                        >
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span>Active Shuns:</span>
                            <span className="font-bold text-sm text-[var(--text-primary)]">
                                {summary ? summary.uniqueActiveIps.toLocaleString() : "—"}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] border-l border-red-500/30 pl-1.5">
                                Unique IPs
                            </span>
                        </button>

                        {/* Status Filter: Cleared */}
                        <button
                            type="button"
                            onClick={() => {
                                const next = statusFilter === "cleared" ? "all" : "cleared";
                                setStatusFilter(next);
                                setPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${
                                statusFilter === "cleared"
                                    ? "bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/50 text-[var(--text-primary)]"
                                    : "bg-[var(--bg-default)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                            title="Click to filter Cleared historical shuns"
                        >
                            <span>Cleared:</span>
                            <span className="font-semibold text-[var(--text-primary)]">
                                {summary ? summary.clearedTotal.toLocaleString() : "—"}
                            </span>
                        </button>

                        {/* Status Filter: All Records */}
                        <button
                            type="button"
                            onClick={() => {
                                setStatusFilter("all");
                                setPage(1);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                statusFilter === "all"
                                    ? "bg-slate-700/50 border-slate-600 text-white"
                                    : "bg-[var(--bg-default)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            }`}
                            title="Show all active and historical cleared shuns"
                        >
                            All Tracked ({summary ? summary.totalTracked.toLocaleString() : "—"})
                        </button>

                        {/* Per-Firewall Live Counts */}
                        {summary?.byFirewall && summary.byFirewall.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pl-1.5 border-l border-[var(--border-color)]">
                                {summary.byFirewall.map(fw => {
                                    const isSelected = activeSearch.trim().toLowerCase() === fw.firewall.toLowerCase();
                                    return (
                                        <button
                                            key={fw.firewall}
                                            type="button"
                                            onClick={() => handleFirewallChipClick(fw.firewall)}
                                            className={`px-2 py-1 rounded-md border text-[11px] font-mono transition-all flex items-center gap-1.5 ${
                                                isSelected
                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                                                    : "bg-[var(--bg-default)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-amber-500/40 hover:text-[var(--text-primary)]"
                                            }`}
                                            title={`Filter by ${fw.firewall} (${fw.activeCount} active)`}
                                        >
                                            <Server className="w-3 h-3 text-amber-400" />
                                            <span>{fw.firewall}:</span>
                                            <span className="font-bold text-[var(--text-primary)]">{fw.activeCount.toLocaleString()}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {summary?.lastSyncedAt && (
                            <span className="text-xs text-[var(--text-muted)] hidden md:flex items-center gap-1.5" title={new Date(summary.lastSyncedAt).toLocaleString()}>
                                <Clock className="w-3.5 h-3.5" />
                                Synced: <span className="text-[var(--text-secondary)] font-medium">{new Date(summary.lastSyncedAt).toLocaleTimeString()}</span>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                            title="SSH into all configured firewalls now and refresh active shun database"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                            {isSyncing ? "Querying Fleet..." : "Update Shun DB Now"}
                        </button>
                    </div>
                </div>

                {syncBanner && (
                    <div
                        className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                            syncBanner.type === "success"
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : syncBanner.type === "warning"
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                                : "bg-red-500/10 border-red-500/30 text-red-300"
                        }`}
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            {syncBanner.type === "success" ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                            ) : (
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                            )}
                            <span className="font-medium">{syncBanner.message}</span>
                            {syncBanner.details && (
                                <span className="text-[11px] opacity-80 font-mono">({syncBanner.details})</span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSyncBanner(null)}
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            aria-label="Dismiss notification"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Smart Search Bar */}
                <SmartSearchBar
                    value={search}
                    onChange={setSearch}
                    onSearch={(cleanTerm) => {
                        setSearch(cleanTerm);
                        setActiveSearch(cleanTerm);
                        setPage(1);
                        fetchRecords(cleanTerm);
                    }}
                    onReset={clearFilters}
                    placeholder="Omnisearch: IP, Subnet, ASN, Org, or Firewall (e.g. 198.51.100.1, AS15169, Microsoft)..."
                    buttonLabel="Search"
                    loading={loading}
                    supportedFields={["IP Address", "Firewall Host", "ASN", "Organization", "Country"]}
                    examples={["198.51.100.1", "Wilmington", "AS15169", "Microsoft OR Amazon"]}
                    enableBooleanHelp={true}
                    autoTrimOnSearch={true}
                    typeDetector={(term) => {
                        const clean = term.trim();
                        if (/^AS\d+$/i.test(clean)) {
                            return { label: `ASN: ${clean.toUpperCase()}`, colorClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
                        }
                        if (/-(?:fw|asa|firewall)|wilmington|keleman/i.test(clean)) {
                            return { label: "Firewall Node", colorClass: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
                        }
                        return null;
                    }}
                    filterControls={
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <button 
                                    type="button" 
                                    onClick={() => setShowColumnMenu(!showColumnMenu)} 
                                    className="px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    <LayoutTemplate className="w-3.5 h-3.5" /> Columns
                                </button>
                                {showColumnMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)}></div>
                                        <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl shadow-xl z-50 p-2 glass-card">
                                            <div className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2 mt-1">Toggle Columns</div>
                                            {Object.entries({
                                                status: "Status",
                                                ip: "IP Address",
                                                lifecycle: "Lifecycle",
                                                firewall: "Firewall Coverage",
                                                network: "Network Intel",
                                                location: "Location",
                                                actions: "Actions"
                                            }).map(([key, label]) => (
                                                <button 
                                                    key={key} 
                                                    type="button" 
                                                    onClick={() => toggleColumn(key as any)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors text-left"
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${visibleColumns[key as keyof typeof visibleColumns] ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white' : 'border-[var(--border-color)] text-transparent'}`}>
                                                        <Check className="w-3 h-3" />
                                                    </div>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <button 
                                type="button" 
                                onClick={() => handleExport(false)} 
                                disabled={isExporting} 
                                className="px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-hover)] hover:bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                                title="Export current filtered view (1 row per IP) to CSV"
                            >
                                <Download className="w-3.5 h-3.5" /> {isExporting ? "Exporting..." : "Export CSV"}
                            </button>
                        </div>
                    }
                />
                
                {/* Timeframe & Sort Controls Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)] pt-1">
                    {/* Timeframe Quick Buttons: 1h, 4h, 12h, 24h, 7d, all */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1 mr-1">
                            <Clock className="w-3.5 h-3.5 text-indigo-400" /> Timeframe:
                        </span>
                        {(["1h", "4h", "12h", "24h", "7d", "all"] as TimeframeOption[]).map(tf => {
                            const isSelected = timeframe === tf;
                            const label = tf === "all" ? "All Time" : `Last ${tf}`;
                            return (
                                <button
                                    key={tf}
                                    type="button"
                                    onClick={() => handleTimeframeChange(tf)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                        isSelected
                                            ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/50"
                                            : "bg-[var(--bg-default)] border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-indigo-500/40"
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}

                        {/* Time Field Filter (Verified/LastSeen vs FirstSeen) */}
                        <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[var(--border-color)]">
                            <select
                                value={timeField}
                                onChange={(e) => {
                                    setTimeField(e.target.value as "lastSeen" | "firstSeen");
                                    setPage(1);
                                }}
                                className="bg-[var(--bg-default)] border border-[var(--border-color)] rounded px-2 py-1 text-[11px] text-[var(--text-secondary)] focus:outline-none focus:border-indigo-500"
                                title="Determine whether timeframe window checks verified activity (last seen) or initial creation (first seen)"
                            >
                                <option value="lastSeen">Active / Verified in Window</option>
                                <option value="firstSeen">Newly Added in Window</option>
                            </select>
                        </div>
                    </div>

                    {/* Pagination status */}
                    <div className="flex items-center gap-4">
                        <span>Showing <span className="font-medium text-[var(--text-primary)]">{totalRecords > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-[var(--text-primary)]">{Math.min(page * limit, totalRecords)}</span> of <span className="font-medium text-[var(--text-primary)]">{totalRecords.toLocaleString()}</span> unique IPs</span>
                        <div className="flex items-center gap-1.5">
                            <span>Rows:</span>
                            <select 
                                value={limit} 
                                onChange={(e) => handleLimitChange(Number(e.target.value))}
                                className="bg-[var(--bg-default)] border border-[var(--border-color)] rounded px-2 py-1 text-xs focus:outline-none focus:border-[var(--accent-primary)]"
                            >
                                {[25, 50, 100, 250].map(val => (
                                    <option key={val} value={val}>{val}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Table Area: 1 row per unique IP */}
            <div className="flex-1 overflow-auto bg-[var(--bg-default)] relative">
                <div className="min-w-max h-full">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 shadow-sm border-b border-[var(--border-color)]">
                            <tr>
                                {/* Multi-select Checkbox Header */}
                                <th className="px-3 py-3 w-12 text-center select-none">
                                    <button
                                        type="button"
                                        onClick={toggleSelectAllPage}
                                        disabled={loading || records.length === 0}
                                        className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] focus:outline-none transition-colors"
                                        title={isAllPageSelected ? "Deselect all on this page" : "Select all on this page"}
                                    >
                                        {isAllPageSelected ? (
                                            <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                                        ) : isSomePageSelected ? (
                                            <MinusSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                    </button>
                                </th>
                                <th className="px-2 py-3 font-semibold text-[var(--text-muted)] w-10 text-center select-none">#</th>
                                {visibleColumns.status && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('isActive')}>
                                        <div className="flex items-center gap-1">Status <span className={sortField==='isActive'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='isActive'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.ip && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('ip')}>
                                        <div className="flex items-center gap-1">IP Address <span className={sortField==='ip'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='ip'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.firewall && (
                                    <th className="px-4 py-3 font-semibold select-none">
                                        Perimeter Coverage (Firewalls)
                                    </th>
                                )}
                                {visibleColumns.lifecycle && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('lastSeen')}>
                                        <div className="flex items-center gap-1">Activity Lifecycle <span className={sortField==='lastSeen'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='lastSeen'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.network && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('ipAsn')}>
                                        <div className="flex items-center gap-1">Network Intel <span className={sortField==='ipAsn'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='ipAsn'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.location && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('ipCountry')}>
                                        <div className="flex items-center gap-1">Location <span className={sortField==='ipCountry'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='ipCountry'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.actions && (
                                    <th className="px-4 py-3 font-semibold text-right select-none">Actions</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-3 py-4 text-center"><div className="h-4 w-4 bg-[var(--border-color)] rounded mx-auto"></div></td>
                                        <td className="px-2 py-4 text-center"><div className="h-4 w-6 bg-[var(--border-color)] rounded mx-auto"></div></td>
                                        {visibleColumns.status && <td className="px-4 py-4"><div className="h-5 w-16 bg-[var(--border-color)] rounded-full"></div></td>}
                                        {visibleColumns.ip && <td className="px-4 py-4"><div className="h-4 w-32 bg-[var(--border-color)] rounded"></div></td>}
                                        {visibleColumns.firewall && <td className="px-4 py-4"><div className="h-5 w-28 bg-[var(--border-color)] rounded-full"></div></td>}
                                        {visibleColumns.lifecycle && <td className="px-4 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="h-3 w-16 bg-[var(--border-color)] rounded"></div>
                                                <div className="h-2 w-24 bg-[var(--border-color)] rounded"></div>
                                            </div>
                                        </td>}
                                        {visibleColumns.network && <td className="px-4 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="h-3 w-20 bg-[var(--border-color)] rounded"></div>
                                                <div className="h-2 w-32 bg-[var(--border-color)] rounded"></div>
                                            </div>
                                        </td>}
                                        {visibleColumns.location && <td className="px-4 py-4"><div className="h-4 w-28 bg-[var(--border-color)] rounded"></div></td>}
                                        {visibleColumns.actions && <td className="px-4 py-4 text-right"><div className="h-6 w-24 bg-[var(--border-color)] rounded ml-auto"></div></td>}
                                    </tr>
                                ))
                            ) : error ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-16 text-center text-red-400">
                                        <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>{error}</p>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="px-4 py-20 text-center">
                                        <SearchX className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-50" />
                                        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">No shunned IPs found</h3>
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            {timeframe !== "all" 
                                                ? `No shunned IPs matched within the ${timeframe} timeframe window. Try extending to 24h, 7d, or All Time.` 
                                                : "Try adjusting your filters, searching a different subnet or resetting presets."}
                                        </p>
                                        {timeframe !== "all" && (
                                            <button
                                                type="button"
                                                onClick={() => handleTimeframeChange("all")}
                                                className="mt-3 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                                            >
                                                Switch to All Time
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                records.map((record, idx) => {
                                    const isSelected = selectedIps.has(record.ip);
                                    return (
                                        <tr 
                                            key={record.ip} 
                                            className={`transition-colors ${
                                                isSelected 
                                                    ? "bg-indigo-500/10 hover:bg-indigo-500/15" 
                                                    : "odd:bg-transparent even:bg-[var(--bg-surface)]/30 hover:bg-[var(--bg-surface-hover)]"
                                            }`}
                                        >
                                            {/* Row Checkbox */}
                                            <td className="px-3 py-3 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSelectIp(record.ip)}
                                                    className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] focus:outline-none transition-colors"
                                                    title={`Select ${record.ip} for bulk unshun`}
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                            <td className="px-2 py-3 text-center text-xs font-mono text-[var(--text-muted)] select-none">
                                                {(page - 1) * limit + idx + 1}
                                            </td>
                                            {visibleColumns.status && (
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex flex-col gap-1.5">
                                                        {record.isActive ? (
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 w-fit shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                                                </span>
                                                                Active Shun
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] w-fit">
                                                                Cleared
                                                            </span>
                                                        )}
                                                        {record.isBlacklisted && (
                                                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 w-fit shadow-[0_0_10px_rgba(168,85,247,0.2)]">
                                                                <ShieldAlert className="w-3 h-3" /> Blacklisted
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.ip && (
                                                <td className="px-4 py-3 font-mono font-medium text-[var(--accent-primary)] whitespace-nowrap align-top">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm">{record.ip}</span>
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.firewall && (
                                                <td className="px-4 py-3 text-[var(--text-secondary)] align-top whitespace-nowrap">
                                                    {record.isShunnedAll ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 w-fit shadow-sm shadow-emerald-500/10" title="Actively shunned on all 4 perimeter firewalls">
                                                                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                                                All 4 Firewalls Active
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-mono">
                                                                Full perimeter protection
                                                            </span>
                                                        </div>
                                                    ) : record.activeCount > 0 ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/40 w-fit">
                                                                <Server className="w-3 h-3 text-amber-400" />
                                                                {record.activeCount} of {record.configuredFirewallsCount || 4} Firewalls
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 font-mono truncate max-w-[220px]" title={record.activeFirewalls?.join(", ")}>
                                                                {record.activeFirewalls?.join(", ")}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] w-fit">
                                                            Cleared Across Fleet
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.lifecycle && (
                                                <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1.5 text-xs">
                                                            <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                                            <span className="font-semibold text-[var(--text-primary)]">{record.daysShunned}</span> Days
                                                        </div>
                                                        <div className="text-[11px] mt-1">
                                                            <span className="text-[var(--text-muted)]">First:</span> {new Date(record.firstSeen).toLocaleDateString()}
                                                        </div>
                                                        <div className="text-[11px]">
                                                            <span className="text-[var(--text-muted)]">Last Verified:</span> {new Date(record.lastSeen).toLocaleDateString()} {new Date(record.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                    </div>
                                                </td>
                                            )}
                                            {visibleColumns.network && (
                                                <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                                    {record.enrichedAt ? (
                                                        record.ipAsn ? (
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-semibold text-[var(--text-primary)]">{record.ipAsn}</span>
                                                                <span className="text-xs max-w-[200px] truncate" title={record.ipOrg}>
                                                                    {record.ipOrg || '-'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[var(--text-muted)]">No ASN Data</span>
                                                        )
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-500/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                            Pending Quota
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.location && (
                                                <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                                    {record.enrichedAt ? (
                                                        record.ipCountry ? (
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    {record.ipCountryCode && (
                                                                        <img 
                                                                            src={`https://flagcdn.com/16x12/${record.ipCountryCode.toLowerCase()}.png`}
                                                                            alt={record.ipCountryCode}
                                                                            className="rounded-[1px]"
                                                                        />
                                                                    )}
                                                                    <span className="text-[var(--text-primary)]">{record.ipCountry}</span>
                                                                </div>
                                                                {record.city && <span className="text-xs text-[var(--text-muted)]">{record.city}</span>}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[var(--text-muted)]">-</span>
                                                        )
                                                    ) : (
                                                        <span className="text-[var(--text-muted)]">...</span>
                                                    )}
                                                </td>
                                            )}
                                            {visibleColumns.actions && (
                                                <td className="px-4 py-3 text-right align-top whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {record.isActive && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openUnshunModalForIps([record.ip])}
                                                                className="px-2.5 py-1 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all flex items-center gap-1 shadow-sm"
                                                                title={`Remove perimeter shun for ${record.ip} (defaults to All 4 Firewalls)`}
                                                            >
                                                                <Unlock className="w-3 h-3" />
                                                                Unshun
                                                            </button>
                                                        )}
                                                        <button 
                                                            type="button"
                                                            onClick={() => setSelectedIp(record.ip)}
                                                            className="p-1 rounded bg-[var(--bg-default)] border border-[var(--border-color)] hover:bg-[var(--accent-primary)] hover:text-white hover:border-[var(--accent-primary)] text-[var(--text-secondary)] transition-colors shadow-sm"
                                                            title="View Raw Enrichment JSON"
                                                        >
                                                            <Info className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Floating Multi-Select Action Bar */}
                {selectedIps.size > 0 && (
                    <div className="sticky bottom-16 inset-x-0 mx-auto max-w-2xl z-30 px-4 py-2.5 bg-slate-900/95 border border-indigo-500/50 rounded-2xl shadow-2xl backdrop-blur-md flex flex-wrap items-center justify-between gap-3 text-xs text-white animate-in slide-in-from-bottom-3 duration-200">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-2.5 w-2.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
                            </span>
                            <span className="font-bold text-sm text-indigo-300">
                                {selectedIps.size}
                            </span>
                            <span className="text-slate-300">
                                Unique IP{selectedIps.size > 1 ? "s" : ""} Selected
                            </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Unshun Selected Button: opens modal with All 4 Firewalls default */}
                            <button
                                type="button"
                                onClick={() => openUnshunModalForIps(Array.from(selectedIps))}
                                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold transition-all shadow-md shadow-red-600/30 flex items-center gap-1.5"
                                title={`Unshun all ${selectedIps.size} selected IPs (defaults to all 4 firewalls)`}
                            >
                                <Unlock className="w-3.5 h-3.5" />
                                Unshun Selected ({selectedIps.size})
                            </button>

                            {/* Export Selected Button */}
                            <button
                                type="button"
                                onClick={() => handleExport(true)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors flex items-center gap-1"
                                title="Export selected IPs to CSV report"
                            >
                                <Download className="w-3 h-3" />
                                Export
                            </button>

                            {/* Clear Selection */}
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="px-2 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                                title="Clear selection"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Bottom Pagination */}
                <div className="sticky bottom-0 bg-[var(--bg-surface)] p-3 border-t border-[var(--border-color)] flex justify-between items-center text-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <span className="text-[var(--text-secondary)] text-xs">
                        Showing {totalRecords > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalRecords)} of {totalRecords.toLocaleString()} unique IPs
                    </span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors bg-[var(--bg-default)] text-[var(--text-primary)] text-xs">Previous</button>
                        <span className="px-3 font-medium text-[var(--accent-primary)] text-xs">Page {page} of {totalPages || 1}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="px-3 py-1.5 rounded border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors bg-[var(--bg-default)] text-[var(--text-primary)] text-xs">Next</button>
                    </div>
                </div>
            </div>

            {/* Raw JSON Enrichment Modal */}
            {selectedIp && (
                <EnrichmentDetailsModal 
                    ip={selectedIp} 
                    onClose={() => setSelectedIp(null)} 
                />
            )}

            {/* Unshun Confirmation Modal: Defaults to all 4 firewalls with option to select one or more */}
            {unshunModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-slate-200">
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                                    <Unlock className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">
                                        {unshunResult ? "Unshun Positive Confirmation" : "Confirm Perimeter Unshun"}
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        {unshunResult ? "Firewall verification and execution output" : `Defaults to all 4 perimeter firewalls with option to select specific nodes`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setUnshunModal(null);
                                    setUnshunResult(null);
                                    setUnshunError(null);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 overflow-y-auto space-y-4 text-xs">
                            {unshunResult ? (
                                <div className="space-y-4">
                                    {/* Verdict Banner */}
                                    <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                            <div>
                                                <div className="font-bold text-sm text-white">
                                                    Perimeter Un-Shun Successfully Executed
                                                </div>
                                                <div className="text-[11px] text-emerald-300/90 mt-0.5">
                                                    {unshunModal.ips.length} unique IP(s) un-shunned across {unshunResult.target}. Guardian Blacklist cleared and logged to audit log.
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Per-Node Verification Breakdown */}
                                    {unshunResult.positiveConfirmation?.nodeVerifications && (
                                        <div className="space-y-2">
                                            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                                                Node-by-Node Verification:
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {unshunResult.positiveConfirmation.nodeVerifications.map((node: any, idx: number) => (
                                                    <div 
                                                        key={idx}
                                                        className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                                                            node.success 
                                                                ? "bg-slate-950 border-emerald-500/30 text-slate-200" 
                                                                : "bg-red-950/20 border-red-500/30 text-red-300"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <Server className={`w-3.5 h-3.5 ${node.success ? "text-emerald-400" : "text-red-400"}`} />
                                                            <span className="font-mono font-medium">{node.node}</span>
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            node.success ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                                                        }`}>
                                                            {node.status}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Raw Output Preview */}
                                    {unshunResult.stdout && (
                                        <div className="space-y-1.5">
                                            <div className="text-[11px] font-semibold text-slate-400">
                                                Firewall Console Output:
                                            </div>
                                            <pre className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                                                {unshunResult.stdout}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-3.5 rounded-xl bg-amber-950/25 border border-amber-500/35 text-amber-300 flex items-start gap-2.5">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <div className="text-xs leading-relaxed">
                                            You are about to un-shun <span className="font-bold text-white">{unshunModal.ips.length}</span> unique IP address(es). This will SSH into the firewalls and execute <code className="font-mono text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded">no shun &lt;IP&gt;</code>, clear Guardian Blacklist, and record positive confirmation in <code className="font-mono text-amber-200 bg-amber-950/60 px-1 py-0.5 rounded">logs/shun-actions.log</code>.
                                        </div>
                                    </div>

                                    {/* Target Fleet Selection: Default All 4 FWs, with option to select one or more */}
                                    <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                                        <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                                            <span>Target Firewall Nodes:</span>
                                            <span className="text-[11px] text-indigo-400 font-normal">
                                                {unshunModal.isAllFirewalls ? "All 4 Firewalls (Recommended)" : `${unshunModal.selectedFirewalls.length} Firewall(s) Selected`}
                                            </span>
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {/* All 4 Firewalls Option (Default) */}
                                            <label className="flex items-center gap-2.5 p-2 rounded-lg bg-indigo-950/20 border border-indigo-500/40 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="fwMode"
                                                    checked={unshunModal.isAllFirewalls}
                                                    onChange={() => setUnshunModal({
                                                        ...unshunModal,
                                                        isAllFirewalls: true,
                                                        selectedFirewalls: configuredFwsList
                                                    })}
                                                    className="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div>
                                                    <div className="font-semibold text-white flex items-center gap-1.5">
                                                        <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                                        All 4 Perimeter Firewalls (Perimeter Fleet - Recommended)
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        Removes shun across the entire perimeter fleet (Wilmington & Keleman clusters)
                                                    </div>
                                                </div>
                                            </label>

                                            {/* Specific Firewall Nodes Option */}
                                            <label className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-800 hover:border-slate-700 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="fwMode"
                                                    checked={!unshunModal.isAllFirewalls}
                                                    onChange={() => setUnshunModal({
                                                        ...unshunModal,
                                                        isAllFirewalls: false
                                                    })}
                                                    className="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div>
                                                    <div className="font-semibold text-slate-200">
                                                        Select Specific Firewall Node(s)
                                                    </div>
                                                    <div className="text-[11px] text-slate-400">
                                                        Target only designated firewalls rather than all 4
                                                    </div>
                                                </div>
                                            </label>

                                            {/* Checkboxes if specific selected */}
                                            {!unshunModal.isAllFirewalls && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 pl-6">
                                                    {configuredFwsList.map(fwName => {
                                                        const isChecked = unshunModal.selectedFirewalls.includes(fwName);
                                                        return (
                                                            <label 
                                                                key={fwName} 
                                                                className={`p-2 rounded-lg border text-xs flex items-center gap-2 cursor-pointer transition-colors ${
                                                                    isChecked 
                                                                        ? "bg-slate-900 border-indigo-500/40 text-white" 
                                                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={(e) => {
                                                                        const next = e.target.checked
                                                                            ? [...unshunModal.selectedFirewalls, fwName]
                                                                            : unshunModal.selectedFirewalls.filter(f => f !== fwName);
                                                                        setUnshunModal({
                                                                            ...unshunModal,
                                                                            selectedFirewalls: next
                                                                        });
                                                                    }}
                                                                    className="rounded text-indigo-600 focus:ring-indigo-500"
                                                                />
                                                                <Server className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                                                <span className="font-mono truncate">{fwName}</span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* IP List Preview Chips */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>Target IP Address(es) ({unshunModal.ips.length} unique):</span>
                                        </div>
                                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 max-h-40 overflow-y-auto flex flex-wrap gap-1.5 font-mono text-xs">
                                            {unshunModal.ips.map(ip => (
                                                <span 
                                                    key={ip} 
                                                    className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center gap-1"
                                                >
                                                    {ip}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {unshunError && (
                                        <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                                            <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                            <span>{unshunError}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
                            {unshunResult ? (
                                <>
                                    <a
                                        href="/api/firewall/shun/log?download=true"
                                        download
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Download shun-actions.log
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUnshunModal(null);
                                            setUnshunResult(null);
                                            setUnshunError(null);
                                        }}
                                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-md shadow-indigo-600/30"
                                    >
                                        Close & Return to Database
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUnshunModal(null);
                                            setUnshunError(null);
                                        }}
                                        disabled={unshunExecuting}
                                        className="px-3.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>

                                    <button
                                        type="button"
                                        onClick={executeUnshun}
                                        disabled={unshunExecuting || unshunModal.ips.length === 0 || (!unshunModal.isAllFirewalls && unshunModal.selectedFirewalls.length === 0)}
                                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-all shadow-lg shadow-red-600/30 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {unshunExecuting ? (
                                            <>
                                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                Removing Shuns on Firewalls...
                                            </>
                                        ) : (
                                            <>
                                                <Unlock className="w-3.5 h-3.5" />
                                                Confirm Unshun ({unshunModal.ips.length} IPs on {unshunModal.isAllFirewalls ? "All 4 FWs" : `${unshunModal.selectedFirewalls.length} FWs`})
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}