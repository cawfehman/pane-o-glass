import { useState, useEffect, useCallback } from "react";
import { Search, Server, Filter, ShieldAlert, Clock, ShieldCheck, SearchX, LayoutTemplate, Check, Download, Info } from "lucide-react";
import { EnrichmentDetailsModal } from "./EnrichmentDetailsModal";

export function ShunDatabaseTab() {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    const [search, setSearch] = useState("");
    
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(50);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    const [sortField, setSortField] = useState("isActive");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    const [selectedIp, setSelectedIp] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

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
            if (search) query.append("search", search);
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

    const fetchRecords = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const query = new URLSearchParams({ 
                page: page.toString(), 
                limit: limit.toString(),
                sortField,
                sortDir 
            });
            if (search) query.append("search", search);

            const res = await fetch(`/api/firewall/shun-database?${query.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setRecords(data.records);
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
    }, [page, limit, search, sortField, sortDir]);

    useEffect(() => {
        fetchRecords();
    }, [fetchRecords]);

    const clearFilters = () => {
        setSearch("");
        setPage(1);
        setSortField("isActive");
        setSortDir("desc");
    };

    return (
        <div className="flex flex-col gap-0 h-full overflow-hidden">
            <div className="bg-[var(--bg-surface)] p-4 border-b border-[var(--border-color)] shadow-sm shrink-0 flex flex-col gap-4">
                <form 
                    onSubmit={(e) => { e.preventDefault(); setPage(1); fetchRecords(); }}
                    className="flex flex-col xl:flex-row gap-4 justify-between xl:items-center"
                >
                    <div className="flex flex-1 items-center gap-3 w-full xl:max-w-4xl">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--accent-primary)] opacity-70 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Omnisearch: IP (e.g. 150.25*.*), ASN, Org, or Firewall..."
                                className="pl-12 w-full h-[46px] rounded-lg border border-[var(--border-color)] bg-[var(--bg-default)] px-4 text-base focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all duration-200 shadow-inner"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="px-6 h-[46px] bg-[var(--accent-primary)] text-white text-base font-medium rounded-lg shadow-lg shadow-[var(--accent-primary)]/20 hover:shadow-[var(--accent-primary)]/40 hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap shrink-0">
                            Search
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 shrink-0">
                        <button type="button" onClick={clearFilters} className="px-4 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-sm font-medium rounded border border-[var(--border-color)] hover:bg-[var(--bg-default)] transition-colors whitespace-nowrap">
                            Clear
                        </button>
                        <div className="relative">
                            <button type="button" onClick={() => setShowColumnMenu(!showColumnMenu)} className="px-3 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-sm font-medium rounded border border-[var(--border-color)] hover:bg-[var(--bg-default)] transition-colors flex items-center gap-2">
                                <LayoutTemplate className="w-4 h-4" /> Columns
                            </button>
                            {showColumnMenu && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowColumnMenu(false)}></div>
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg shadow-xl z-50 p-2 glass-card">
                                        <div className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2 px-2 mt-1">Toggle Columns</div>
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
                                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded transition-colors text-left"
                                            >
                                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${visibleColumns[key as keyof typeof visibleColumns] ? 'bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white' : 'border-[var(--border-color)] text-transparent'}`}>
                                                    <Check className="w-3 h-3" />
                                                </div>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        <button type="button" onClick={handleExport} disabled={isExporting} className="px-3 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-sm font-medium rounded border border-[var(--border-color)] hover:bg-[var(--bg-default)] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            <Download className="w-4 h-4" /> {isExporting ? "Exporting..." : "Export"}
                        </button>
                    </div>
                </form>
                
                <div className="flex justify-between items-center text-sm text-[var(--text-secondary)] pt-2 border-t border-[var(--border-color)]">
                    <div className="flex items-center gap-4">
                        <span>Showing <span className="font-medium text-[var(--text-primary)]">{totalRecords > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-[var(--text-primary)]">{Math.min(page * limit, totalRecords)}</span> of <span className="font-medium text-[var(--text-primary)]">{totalRecords}</span> entries</span>
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
                                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length || 1} className="px-4 py-16 text-center text-red-400">
                                        <ShieldAlert className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                        <p>{error}</p>
                                    </td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={Object.values(visibleColumns).filter(Boolean).length || 1} className="px-4 py-20 text-center">
                                        <SearchX className="w-16 h-16 mx-auto mb-4 text-[var(--text-muted)] opacity-50" />
                                        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-1">No IPs found</h3>
                                        <p className="text-sm text-[var(--text-secondary)]">Try adjusting your filters or wildcard patterns.</p>
                                    </td>
                                </tr>
                            ) : (
                                records.map((record) => (
                                    <tr key={record.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
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
                    <span className="text-[var(--text-secondary)]">Showing {totalRecords > 0 ? (page - 1) * limit + 1 : 0} to {Math.min(page * limit, totalRecords)} of {totalRecords} entries</span>
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
