import { useState, useEffect, useCallback } from "react";
import { Search, Server, Filter, ShieldAlert, Clock } from "lucide-react";

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
                                placeholder="Search IP..."
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
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
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
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
                                className="pl-9 w-full rounded border border-[var(--border-color)] bg-[var(--bg-default)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                                value={firewall}
                                onChange={(e) => setFirewall(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 bg-[var(--accent-primary)] text-white text-sm font-medium rounded hover:opacity-90 transition-opacity whitespace-nowrap">
                            Search
                        </button>
                        <button type="button" onClick={clearFilters} className="px-4 py-2 bg-[var(--bg-surface-hover)] text-[var(--text-primary)] text-sm font-medium rounded border border-[var(--border-color)] hover:bg-[var(--bg-default)] transition-colors whitespace-nowrap">
                            Clear
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
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 font-semibold">IP Address</th>
                                <th className="px-4 py-3 font-semibold">Lifecycle</th>
                                <th className="px-4 py-3 font-semibold">Firewall</th>
                                <th className="px-4 py-3 font-semibold">Network Intelligence</th>
                                <th className="px-4 py-3 font-semibold">Location</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-secondary)]">Loading directory...</td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-red-400">{error}</td>
                                </tr>
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-secondary)]">No IPs found matching the criteria.</td>
                                </tr>
                            ) : (
                                records.map((record) => (
                                    <tr key={record.id} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex flex-col gap-1.5">
                                                {record.isActive ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 w-fit">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></div> Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] border border-[var(--border-color)] w-fit">
                                                        Cleared
                                                    </span>
                                                )}
                                                {record.isBlacklisted && (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 w-fit">
                                                        <ShieldAlert className="w-3 h-3" /> Blacklisted
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-[var(--accent-primary)] whitespace-nowrap align-top">
                                            {record.ip}
                                        </td>
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
                                        <td className="px-4 py-3 text-[var(--text-secondary)] align-top">
                                            <div className="flex items-center gap-1.5">
                                                <Server className="h-3.5 w-3.5" />
                                                {record.firewall}
                                            </div>
                                        </td>
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
        </div>
    );
}
