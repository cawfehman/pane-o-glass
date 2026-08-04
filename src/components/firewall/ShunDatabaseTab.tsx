import { useState, useEffect, useCallback } from "react";
import { Search, Server, Filter, ShieldAlert, Clock, ShieldCheck, SearchX, LayoutTemplate, Check, Download, Info } from "lucide-react";
import { EnrichmentDetailsModal } from "./EnrichmentDetailsModal";

export function ShunDatabaseTab() {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    const [search, setSearch] = useState("");
    const [asn, setAsn] = useState("");
    const [firewall, setFirewall] = useState("");
    
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

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
        const saved = localStorage.getItem("pane-o-glass.shun-columns");
        if (saved) {
            try { setVisibleColumns(JSON.parse(saved)); } catch (e) {}
        }
    }, []);

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
            if (asn) query.append("asn", asn);
            if (firewall) query.append("firewall", firewall);
            
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
            const params = new URLSearchParams();
            if (search) params.append("search", search);
            if (asn) params.append("asn", asn);
            if (firewall) params.append("firewall", firewall);
            params.append("page", page.toString());
            params.append("limit", "50");

            const res = await fetch(`/api/firewall/shun-database?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setRecords(data.records);
                setTotalPages(data.pagination.pages);
                setTotalRecords(data.pagination.total);
            } else {
                const err = await res.text();
                setError(err || "Failed to fetch records.");
            }
        } catch (e: any) {
            setError(e.message || "Failed to fetch records.");
        } finally {
            setLoading(false);
        }
    }, [search, asn, firewall, page]);

    useEffect(() => {
        fetchRecords();
    }, [page, fetchRecords]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        fetchRecords();
    };

    const clearFilters = () => {
        setSearch("");
        setAsn("");
        setFirewall("");
        setPage(1);
        setTimeout(() => fetchRecords(), 0);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="glass-card p-5 rounded-lg border border-[var(--border-color)]">
                <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 md:items-end">
                    <div className="flex-1 space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">IP Address (Wildcard)</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                placeholder="Search IP (e.g. 150.25*.*)..."
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all duration-200"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    
                    <div className="w-full md:w-48 space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">ASN</label>
                        <div className="relative">
                            <Filter className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                placeholder="e.g. AS15169"
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all duration-200"
                                value={asn}
                                onChange={(e) => setAsn(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48 space-y-1">
                        <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider block">Firewall Name</label>
                        <div className="relative">
                            <Server className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
                            <input
                                type="text"
                                placeholder="e.g. FW-East"
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all duration-200"
                                value={firewall}
                                onChange={(e) => setFirewall(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-[var(--accent-primary)] text-white text-sm font-medium rounded shadow-lg shadow-[var(--accent-primary)]/20 hover:shadow-[var(--accent-primary)]/40 hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap">
                            Search
                        </button>
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
            </div>

            <div className="glass-card rounded-lg border border-[var(--border-color)] overflow-hidden flex flex-col flex-1 min-h-[400px]">
                <div className="px-5 py-3 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-surface)]">
                    <h3 className="font-semibold text-[var(--text-primary)] m-0">Master Shun Directory <span className="text-xs text-[var(--text-secondary)] font-normal ml-2">({totalRecords} found)</span></h3>
                </div>
                
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-[var(--bg-surface)] text-[var(--text-secondary)] text-xs uppercase sticky top-0 z-10 shadow-sm border-b border-[var(--border-color)]">
                            <tr>
                                {visibleColumns.status && <th className="px-4 py-3 font-semibold">Status</th>}
                                {visibleColumns.ip && <th className="px-4 py-3 font-semibold">IP Address</th>}
                                {visibleColumns.lifecycle && <th className="px-4 py-3 font-semibold">Lifecycle</th>}
                                {visibleColumns.firewall && <th className="px-4 py-3 font-semibold">Firewall</th>}
                                {visibleColumns.network && <th className="px-4 py-3 font-semibold">Network Intelligence</th>}
                                {visibleColumns.location && <th className="px-4 py-3 font-semibold">Location</th>}
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
                                    <tr key={record.id} className="hover:bg-[var(--bg-surface-hover)] hover:-translate-y-[1px] hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.3)] transition-all duration-200">
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
                
                {totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)]">
                        <span className="text-sm text-[var(--text-secondary)]">
                            Showing page {page} of {totalPages}
                        </span>
                        <div className="flex gap-1">
                            <button 
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                                className="px-3 py-1 text-sm bg-[var(--bg-default)] border border-[var(--border-color)] rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-hover)] transition-colors"
                            >
                                Previous
                            </button>
                            <button 
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || loading}
                                className="px-3 py-1 text-sm bg-[var(--bg-default)] border border-[var(--border-color)] rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[var(--bg-surface-hover)] transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
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
