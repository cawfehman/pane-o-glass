import { useState, useEffect, useCallback } from "react";
import { Server, ShieldAlert, Clock, SearchX, LayoutTemplate, Check, Download, Info, RefreshCw, CheckCircle2, AlertTriangle, X } from "lucide-react";
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

export function ShunDatabaseTab() {
    const [records, setRecords] = useState<any[]>([]);
    const [summary, setSummary] = useState<ShunSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    const [search, setSearch] = useState("");
    const [activeSearch, setActiveSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "cleared">("all");
    
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    const [sortField, setSortField] = useState("isActive");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const [selectedIp, setSelectedIp] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

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
        location: true
    });
    const [showColumnMenu, setShowColumnMenu] = useState(false);

    useEffect(() => {
        const savedCols = localStorage.getItem("pane-o-glass.shun-columns");
        if (savedCols) {
            try { setVisibleColumns(JSON.parse(savedCols)); } catch (e) {}
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

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const query = new URLSearchParams();
            const term = (activeSearch || search).trim();
            if (term) query.append("search", term);
            if (statusFilter !== "all") query.append("status", statusFilter);
            query.append("sortField", sortField);
            query.append("sortDir", sortDir);
            
            // Trigger browser download by setting location href
            window.location.href = `/api/firewall/shun-database/export?${query.toString()}`;
            
            // Allow time for navigation to initiate before re-enabling button
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (err) {
            console.error("Export failed", err);
        } finally {
            setIsExporting(false);
        }
    };

    const fetchRecords = useCallback(async (searchOverride?: string, statusOverride?: "all" | "active" | "cleared") => {
        setLoading(true);
        setError("");
        try {
            const currentSearch = searchOverride !== undefined ? searchOverride : activeSearch;
            const currentStatus = statusOverride !== undefined ? statusOverride : statusFilter;
            const query = new URLSearchParams({ 
                page: page.toString(), 
                limit: limit.toString(),
                sortField,
                sortDir,
                status: currentStatus
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
    }, [page, limit, activeSearch, statusFilter, sortField, sortDir]);

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
        setStatusFilter("all");
        setPage(1);
        setSortField("isActive");
        setSortDir("desc");
        fetchRecords("", "all");
    };

    const handleFirewallChipClick = (fwName: string) => {
        const nextTerm = activeSearch.trim().toLowerCase() === fwName.toLowerCase() ? "" : fwName;
        setSearch(nextTerm);
        setActiveSearch(nextTerm);
        setPage(1);
        fetchRecords(nextTerm);
    };

    return (
        <div className="flex flex-col gap-0 h-full overflow-hidden">
            <div className="bg-[var(--bg-surface)] p-4 border-b border-[var(--border-color)] shadow-sm shrink-0 flex flex-col gap-3">
                {/* Current Numbers & Manual Sync Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Status Filter / Metric Pills */}
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
                                {summary ? summary.activeTotal.toLocaleString() : "—"}
                            </span>
                            {summary && (
                                <span className="text-[11px] text-[var(--text-secondary)] border-l border-red-500/30 pl-2">
                                    {summary.uniqueActiveIps.toLocaleString()} unique IPs
                                </span>
                            )}
                        </button>

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

                        {/* Per-Firewall Live Counts */}
                        {summary?.byFirewall && summary.byFirewall.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pl-1 border-l border-[var(--border-color)]">
                                {summary.byFirewall.map(fw => {
                                    const isSelected = activeSearch.trim().toLowerCase() === fw.firewall.toLowerCase();
                                    return (
                                        <button
                                            key={fw.firewall}
                                            type="button"
                                            onClick={() => handleFirewallChipClick(fw.firewall)}
                                            className={`px-2.5 py-1 rounded-md border text-[11px] font-mono transition-all flex items-center gap-1.5 ${
                                                isSelected
                                                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300"
                                                    : "bg-[var(--bg-default)] border-[var(--border-color)] text-[var(--text-secondary)] hover:border-amber-500/40 hover:text-[var(--text-primary)]"
                                            }`}
                                            title={`Filter by ${fw.firewall} (${fw.activeCount} active / ${fw.totalCount} total)`}
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
                            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1.5" title={new Date(summary.lastSyncedAt).toLocaleString()}>
                                <Clock className="w-3.5 h-3.5" />
                                Last Synced: <span className="text-[var(--text-secondary)] font-medium">{new Date(summary.lastSyncedAt).toLocaleString()}</span>
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleManualSync}
                            disabled={isSyncing}
                            className="px-3.5 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/90 text-white text-xs font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                            title="SSH into all configured firewalls now and refresh active shun counts"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                            {isSyncing ? "Querying Firewalls..." : "Update Shun DB Now"}
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
                    placeholder="Omnisearch: IP, ASN, Org, or Firewall (e.g. cuh-fw1 AND NOT US)..."
                    buttonLabel="Search"
                    loading={loading}
                    supportedFields={["IP Address", "Firewall Host", "ASN", "Organization", "Country"]}
                    examples={["198.51.100.1", "cuh-fw1", "AS15169", "Microsoft OR Amazon"]}
                    enableBooleanHelp={true}
                    autoTrimOnSearch={true}
                    typeDetector={(term) => {
                        const clean = term.trim();
                        if (/^AS\d+$/i.test(clean)) {
                            return { label: `ASN: ${clean.toUpperCase()}`, colorClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
                        }
                        if (/-(?:fw|asa|firewall)/i.test(clean)) {
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
                                    className="px-3.5 py-3 rounded-xl border border-border-color bg-bg-surface-hover hover:bg-bg-surface text-text-secondary hover:text-text-primary text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap"
                                >
                                    <LayoutTemplate className="w-3.5 h-3.5" /> Columns
                                </button>
                                {showColumnMenu && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)}></div>
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-bg-surface border border-border-color rounded-xl shadow-xl z-50 p-2 glass-card">
                                            <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2 px-2 mt-1">Toggle Columns</div>
                                            {Object.entries({
                                                status: "Status",
                                                ip: "IP Address",
                                                lifecycle: "Lifecycle",
                                                firewall: "Firewall",
                                                network: "Network Intel",
                                                location: "Location"
                                            }).map(([key, label]) => (
                                                <button 
                                                    key={key} 
                                                    type="button" 
                                                    onClick={() => toggleColumn(key as any)}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-primary hover:bg-bg-surface-hover rounded-lg transition-colors text-left"
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${visibleColumns[key as keyof typeof visibleColumns] ? 'bg-accent-primary border-accent-primary text-white' : 'border-border-color text-transparent'}`}>
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
                                onClick={handleExport} 
                                disabled={isExporting} 
                                className="px-3.5 py-3 rounded-xl border border-border-color bg-bg-surface-hover hover:bg-bg-surface text-text-secondary hover:text-text-primary text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 whitespace-nowrap"
                            >
                                <Download className="w-3.5 h-3.5" /> {isExporting ? "Exporting..." : "Export"}
                            </button>
                        </div>
                    }
                />
                
                <div className="flex justify-between items-center text-sm text-[var(--text-secondary)] pt-2 border-t border-[var(--border-color)]">
                    <div className="flex items-center gap-4">
                        <span>Showing <span className="font-medium text-[var(--text-primary)]">{totalRecords > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-[var(--text-primary)]">{Math.min(page * limit, totalRecords)}</span> of <span className="font-medium text-[var(--text-primary)]">{totalRecords.toLocaleString()}</span> entries</span>
                        <div className="flex items-center gap-2">
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
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded hover:bg-[var(--bg-default)] disabled:opacity-50">Prev</button>
                        <span className="px-2 font-medium">Page {page} of {totalPages || 1}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="px-2 py-1 rounded hover:bg-[var(--bg-default)] disabled:opacity-50">Next</button>
                    </div>
                </div>
            </div>
            
            <div className="flex-1 overflow-auto bg-[var(--bg-default)] relative">
                <div className="min-w-max h-full">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 shadow-sm border-b border-[var(--border-color)]">
                            <tr>
                                <th className="px-3 py-3 font-semibold text-[var(--text-muted)] w-12 text-center select-none">#</th>
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
                                {visibleColumns.lifecycle && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('daysShunned')}>
                                        <div className="flex items-center gap-1">Lifecycle <span className={sortField==='daysShunned'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='daysShunned'&&sortDir==='asc'?'▲':'▼'}</span></div>
                                    </th>
                                )}
                                {visibleColumns.firewall && (
                                    <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-[var(--bg-surface-hover)] select-none group" onClick={() => handleSort('firewall')}>
                                        <div className="flex items-center gap-1">Firewall <span className={sortField==='firewall'?'text-[var(--accent-primary)]':'text-transparent group-hover:text-[var(--text-muted)]'}>{sortField==='firewall'&&sortDir==='asc'?'▲':'▼'}</span></div>
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
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-3 py-4 text-center"><div className="h-4 w-6 bg-[var(--border-color)] rounded mx-auto"></div></td>
                                        {visibleColumns.status && <td className="px-4 py-4"><div className="h-5 w-16 bg-[var(--border-color)] rounded-full"></div></td>}
                                        {visibleColumns.ip && <td className="px-4 py-4"><div className="h-4 w-32 bg-[var(--border-color)] rounded"></div></td>}
                                        {visibleColumns.lifecycle && <td className="px-4 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="h-3 w-16 bg-[var(--border-color)] rounded"></div>
                                                <div className="h-2 w-24 bg-[var(--border-color)] rounded"></div>
                                            </div>
                                        </td>}
                                        {visibleColumns.firewall && <td className="px-4 py-4"><div className="h-4 w-24 bg-[var(--border-color)] rounded"></div></td>}
                                        {visibleColumns.network && <td className="px-4 py-4">
                                            <div className="flex flex-col gap-2">
                                                <div className="h-3 w-20 bg-[var(--border-color)] rounded"></div>
                                                <div className="h-2 w-32 bg-[var(--border-color)] rounded"></div>
                                            </div>
                                        </td>}
                                        {visibleColumns.location && <td className="px-4 py-4"><div className="h-4 w-28 bg-[var(--border-color)] rounded"></div></td>}
                                    </tr>
                                ))
                            ) : error ? (
                                <tr>
                                    <td colSpan={(Object.values(visibleColumns).filter(Boolean).length || 1) + 1} className="px-4 py-16 text-center text-red-400">
                                        <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>{error}</p>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={(Object.values(visibleColumns).filter(Boolean).length || 1) + 1} className="px-4 py-20 text-center">
                                        <SearchX className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-50" />
                                        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">No IPs found</h3>
                                        <p className="text-sm text-[var(--text-secondary)]">Try adjusting your filters or wildcard patterns.</p>
                                    </td>
                                </tr>
                            ) : (
                                records.map((record, idx) => (
                                    <tr key={record.id} className="odd:bg-transparent even:bg-[var(--bg-surface)]/30 hover:bg-[var(--bg-surface-hover)] transition-colors">
                                        <td className="px-3 py-3 text-center text-xs font-mono text-[var(--text-muted)] select-none">
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
                                                            Active
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
                                            <td className="px-4 py-3 font-mono text-[var(--accent-primary)] whitespace-nowrap align-top">
                                                <div className="flex items-center gap-2">
                                                    {record.ip}
                                                    <button 
                                                        onClick={() => setSelectedIp(record.ip)}
                                                        className="p-1 rounded bg-[var(--bg-default)] border border-[var(--border-color)] hover:bg-[var(--accent-primary)] hover:text-white hover:border-[var(--accent-primary)] text-[var(--text-secondary)] transition-colors shadow-sm"
                                                        title="View Raw Enrichment JSON"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.lifecycle && (
                                            <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-1.5 text-xs">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        <span className="font-semibold text-[var(--text-primary)]">{record.daysShunned}</span> Days
                                                    </div>
                                                    <div className="text-[11px] mt-1">
                                                        <span className="text-[var(--text-muted)]">First:</span> {new Date(record.firstSeen).toLocaleDateString()}
                                                    </div>
                                                    <div className="text-[11px]">
                                                        <span className="text-[var(--text-muted)]">Last:</span> {new Date(record.lastSeen).toLocaleDateString()}
                                                    </div>
                                                </div>
                                            </td>
                                        )}
                                        {visibleColumns.firewall && (
                                            <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                                <div className="flex items-center gap-1.5">
                                                    <Server className="h-3.5 w-3.5" />
                                                    {record.firewall}
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
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Bottom Pagination */}
                <div className="sticky bottom-0 bg-[var(--bg-surface)] p-3 border-t border-[var(--border-color)] flex justify-between items-center text-sm shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <span className="text-[var(--text-secondary)]">Showing {totalRecords > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalRecords)} of {totalRecords.toLocaleString()} entries</span>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors bg-[var(--bg-default)] text-[var(--text-primary)]">Previous</button>
                        <span className="px-3 font-medium text-[var(--accent-primary)]">Page {page} of {totalPages || 1}</span>
                        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0} className="px-3 py-1.5 rounded border border-[var(--border-color)] hover:bg-[var(--bg-surface-hover)] disabled:opacity-50 transition-colors bg-[var(--bg-default)] text-[var(--text-primary)]">Next</button>
                    </div>
                </div>
            </div>

            {selectedIp && (
                <EnrichmentDetailsModal 
                    ip={selectedIp} 
                    onClose={() => setSelectedIp(null)} 
                />
            )}
        </div>
    );
}
