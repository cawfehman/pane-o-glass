"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { 
    Eye, Plus, Search, Trash2, RefreshCw, Copy, Check, 
    ShieldCheck, AlertTriangle, ShieldAlert, Server, SearchX,
    Filter, Clock, CheckCircle2, UserCheck, Shield
} from "lucide-react";

interface MonitoredItem {
    id?: string;
    ip: string;
    description: string | null;
    createdBy: string | null;
    createdAt: string;
}

interface MonitoredWatchlistTabProps {
    onCountChange?: (count: number) => void;
}

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export function MonitoredWatchlistTab({ onCountChange }: MonitoredWatchlistTabProps) {
    const [items, setItems] = useState<MonitoredItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);

    // Form state
    const [newIp, setNewIp] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [adding, setAdding] = useState(false);
    const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

    // Copy & Delete feedback
    const [copiedIp, setCopiedIp] = useState<string | null>(null);
    const [deletingIp, setDeletingIp] = useState<string | null>(null);

    // Fetch monitored IPs
    const fetchMonitoredIps = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/firewall/guardian/monitored");
            if (res.ok) {
                const data = await res.json();
                const list: MonitoredItem[] = data.items || [];
                setItems(list);
                if (onCountChange) {
                    onCountChange(list.length);
                }
            } else {
                const errData = await res.json().catch(() => ({}));
                console.error("Failed to fetch monitored IPs:", errData.error || res.statusText);
            }
        } catch (err) {
            console.error("Failed to fetch monitored IPs", err);
        } finally {
            setLoading(false);
        }
    }, [onCountChange]);

    useEffect(() => {
        fetchMonitoredIps();
    }, [fetchMonitoredIps]);

    // Handle Add IP
    const handleAddMonitored = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedIp = newIp.trim();
        const trimmedDesc = newDesc.trim();

        if (!trimmedIp) return;

        if (!IPV4_REGEX.test(trimmedIp)) {
            setMessage({ text: "Please enter a valid IPv4 address (e.g. 198.51.100.25)", isError: true });
            return;
        }

        setAdding(true);
        setMessage(null);
        try {
            const res = await fetch("/api/firewall/guardian/monitored", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ip: trimmedIp, description: trimmedDesc })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setMessage({ text: `Successfully added ${trimmedIp} to Guardian monitored watchlist.` });
                setNewIp("");
                setNewDesc("");
                fetchMonitoredIps();
            } else {
                setMessage({ text: data.error || "Failed to add monitored IP", isError: true });
            }
        } catch (err: any) {
            setMessage({ text: err.message || "Failed to add monitored IP", isError: true });
        } finally {
            setAdding(false);
        }
    };

    // Handle Delete IP
    const handleDeleteMonitored = async (ip: string) => {
        if (!confirm(`Are you sure you want to remove ${ip} from the Guardian monitored watchlist?`)) {
            return;
        }
        setDeletingIp(ip);
        try {
            const res = await fetch(`/api/firewall/guardian/monitored?ip=${encodeURIComponent(ip)}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchMonitoredIps();
            } else {
                const err = await res.json().catch(() => ({}));
                alert(`Error deleting IP: ${err.error || "Failed to delete"}`);
            }
        } catch (err) {
            console.error("Failed to delete monitored IP", err);
        } finally {
            setDeletingIp(null);
        }
    };

    const handleCopy = (ip: string) => {
        navigator.clipboard.writeText(ip);
        setCopiedIp(ip);
        setTimeout(() => setCopiedIp(null), 2000);
    };

    // Filter items
    const filteredItems = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.trim().toLowerCase();
        return items.filter(m => 
            (m.ip && m.ip.toLowerCase().includes(q)) ||
            (m.description && m.description.toLowerCase().includes(q)) ||
            (m.createdBy && m.createdBy.toLowerCase().includes(q))
        );
    }, [items, search]);

    // Metric counts
    const totalCount = items.length;
    const systemCount = items.filter(i => i.createdBy?.includes(".env") || i.createdBy?.toLowerCase().includes("system")).length;
    const adminCount = totalCount - systemCount;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
    const paginatedItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredItems.slice(start, start + pageSize);
    }, [filteredItems, page, pageSize]);

    return (
        <div className="space-y-6">
            {/* Top Overview & Hero Card */}
            <div className="bg-bg-card border border-border-color rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="p-3 bg-cyan-500/10 rounded-xl text-cyan-400 border border-cyan-500/20">
                            <Eye className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-xl font-bold text-text-primary tracking-tight">
                                    Guardian Monitored Watchlist
                                </h2>
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono font-semibold flex items-center gap-1.5">
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    Active FTD Protection
                                </span>
                            </div>
                            <p className="text-xs text-text-muted mt-1 max-w-3xl leading-relaxed">
                                Monitored IPs are actively inspected by the Guardian daemon on every pass across all 4 Cisco FTD firewalls. 
                                Entries on this list are protected from automatic blocking, shunning, and strike progression to safeguard authorized gateways, partner uplinks, and internal VIPs.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center">
                        <button
                            type="button"
                            onClick={() => fetchMonitoredIps()}
                            disabled={loading}
                            className="px-3 py-2 bg-bg-surface hover:bg-bg-surface/80 text-text-secondary hover:text-text-primary border border-border-color rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-sm"
                            title="Refresh Watchlist"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-border-color/60">
                    <div className="bg-bg-surface/60 border border-border-color/60 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-cyan-400" />
                            Total Monitored
                        </div>
                        <div className="text-xl font-bold font-mono text-cyan-400 mt-1">
                            {totalCount}
                        </div>
                    </div>

                    <div className="bg-bg-surface/60 border border-border-color/60 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Admin Configured
                        </div>
                        <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                            {adminCount}
                        </div>
                    </div>

                    <div className="bg-bg-surface/60 border border-border-color/60 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 text-blue-400" />
                            .env Synced
                        </div>
                        <div className="text-xl font-bold font-mono text-blue-400 mt-1">
                            {systemCount}
                        </div>
                    </div>

                    <div className="bg-bg-surface/60 border border-border-color/60 rounded-xl p-3">
                        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-violet-400" />
                            Cluster Scope
                        </div>
                        <div className="text-xs font-bold font-mono text-violet-300 mt-2 flex items-center gap-1">
                            FTD1, FTD2, FTD3, FTD4
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Monitored IP Card */}
            <div className="p-4 bg-bg-card border border-border-color rounded-2xl shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-accent-primary" />
                    <h3 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                        Add IP to Guardian Monitored Watchlist
                    </h3>
                </div>
                <p className="text-xs text-text-muted">
                    Specify an IPv4 address and justification. The Guardian daemon will immediately flag this host as monitored and protected from automated perimeter isolation.
                </p>

                <form onSubmit={handleAddMonitored} className="flex flex-col sm:flex-row gap-3 items-center">
                    <input
                        type="text"
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="IPv4 address (e.g. 198.51.100.25)..."
                        className="w-full sm:w-64 bg-bg-surface border border-border-color rounded-xl px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary shadow-inner"
                    />
                    <input
                        type="text"
                        value={newDesc}
                        onChange={(e) => setNewDesc(e.target.value)}
                        placeholder="Purpose / Justification (e.g. Critical Partner Gateway, Telehealth Provider)..."
                        className="w-full sm:flex-1 bg-bg-surface border border-border-color rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary shadow-inner"
                    />
                    <button
                        type="submit"
                        disabled={adding || !newIp.trim()}
                        className="w-full sm:w-auto px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                    >
                        {adding ? (
                            <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                Adding...
                            </>
                        ) : (
                            <>
                                <Plus className="w-3.5 h-3.5" />
                                Add to Watchlist
                            </>
                        )}
                    </button>
                </form>

                {message && (
                    <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                        message.isError 
                            ? "bg-rose-950/40 text-rose-300 border-rose-800" 
                            : "bg-emerald-950/40 text-emerald-300 border-emerald-800"
                    }`}>
                        {message.isError ? (
                            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                        )}
                        <span>{message.text}</span>
                        <button
                            type="button"
                            onClick={() => setMessage(null)}
                            className="ml-auto text-xs opacity-60 hover:opacity-100 cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* Top Search & Pagination Bar */}
            <div className="bg-bg-card p-3.5 rounded-2xl border border-border-color flex flex-col md:flex-row gap-3 items-center justify-between shadow-sm">
                <div className="relative w-full md:w-80">
                    <Search className="w-3.5 h-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => { 
                            setSearch(e.target.value); 
                            setPage(1); 
                        }}
                        placeholder="Filter monitored IPs, reasons, or author..."
                        className="w-full bg-bg-surface border border-border-color rounded-xl pl-9 pr-8 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary shadow-inner"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => { setSearch(""); setPage(1); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs cursor-pointer"
                        >
                            ✕
                        </button>
                    )}
                </div>

                {/* Top Pagination & Rows Controls */}
                <div className="flex items-center gap-3 text-xs text-text-muted w-full md:w-auto justify-between md:justify-end">
                    <span>
                        Showing <span className="font-semibold text-text-primary">{filteredItems.length > 0 ? (page - 1) * pageSize + 1 : 0}</span> to <span className="font-semibold text-text-primary">{Math.min(page * pageSize, filteredItems.length)}</span> of <span className="font-semibold text-text-primary">{filteredItems.length}</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                        <span>Rows:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => { 
                                setPageSize(Number(e.target.value)); 
                                setPage(1); 
                            }}
                            className="bg-bg-surface border border-border-color rounded-lg px-2 py-1 text-xs text-text-primary focus:outline-none cursor-pointer"
                        >
                            {[10, 25, 50, 100].map(val => (
                                <option key={val} value={val}>{val}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-2.5 py-1 rounded-lg bg-bg-surface text-text-primary border border-border-color disabled:opacity-40 hover:bg-bg-surface/80 transition cursor-pointer"
                        >
                            Prev
                        </button>
                        <span className="px-2 font-mono text-text-secondary text-xs">
                            {page} / {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || totalPages === 0}
                            className="px-2.5 py-1 rounded-lg bg-bg-surface text-text-primary border border-border-color disabled:opacity-40 hover:bg-bg-surface/80 transition cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            {/* Table Container with Sticky Header */}
            <div className="overflow-auto max-h-[600px] rounded-2xl border border-border-color bg-bg-card shadow-sm relative">
                <table className="w-full text-xs text-left border-collapse min-w-max">
                    <thead className="bg-bg-surface text-text-muted uppercase text-[10px] sticky top-0 z-10 shadow-sm border-b border-border-color tracking-wider">
                        <tr>
                            <th className="py-3 px-3 w-12 text-center select-none font-semibold">#</th>
                            <th className="py-3 px-4 font-semibold">Monitored IP</th>
                            <th className="py-3 px-4 font-semibold">Description / Purpose</th>
                            <th className="py-3 px-4 font-semibold">Configured By</th>
                            <th className="py-3 px-4 font-semibold">Date Added</th>
                            <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color/60 font-mono">
                        {loading && items.length === 0 ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="py-3 px-3 text-center"><div className="h-3 w-4 bg-border-color/40 rounded mx-auto" /></td>
                                    <td className="py-3 px-4"><div className="h-4 w-28 bg-border-color/40 rounded" /></td>
                                    <td className="py-3 px-4"><div className="h-4 w-48 bg-border-color/40 rounded" /></td>
                                    <td className="py-3 px-4"><div className="h-4 w-24 bg-border-color/40 rounded" /></td>
                                    <td className="py-3 px-4"><div className="h-4 w-20 bg-border-color/40 rounded" /></td>
                                    <td className="py-3 px-4 text-right"><div className="h-4 w-12 bg-border-color/40 rounded ml-auto" /></td>
                                </tr>
                            ))
                        ) : paginatedItems.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="py-14 text-center text-text-muted font-sans">
                                    <SearchX className="w-8 h-8 mx-auto mb-2 opacity-40 text-text-muted" />
                                    <p className="font-medium text-sm">No monitored IPs matching filter.</p>
                                    <p className="text-xs text-text-muted mt-1">Try refining your search query or add a new IP above.</p>
                                </td>
                            </tr>
                        ) : (
                            paginatedItems.map((item, idx) => (
                                <tr 
                                    key={item.ip} 
                                    className="odd:bg-transparent even:bg-bg-surface/30 hover:bg-bg-surface/60 transition group"
                                >
                                    <td className="py-3 px-3 text-center text-text-muted select-none text-[11px]">
                                        {(page - 1) * pageSize + idx + 1}
                                    </td>
                                    <td className="py-3 px-4 font-bold text-cyan-400 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            <span>{item.ip}</span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(item.ip)}
                                                className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-bg-surface rounded text-text-muted hover:text-text-primary cursor-pointer"
                                                title="Copy IP"
                                            >
                                                {copiedIp === item.ip ? (
                                                    <Check className="w-3 h-3 text-emerald-400" />
                                                ) : (
                                                    <Copy className="w-3 h-3" />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 font-sans text-text-secondary max-w-md truncate">
                                        {item.description || <span className="text-text-muted italic">—</span>}
                                    </td>
                                    <td className="py-3 px-4 font-sans whitespace-nowrap">
                                        {item.createdBy?.includes(".env") ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
                                                {item.createdBy}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
                                                {item.createdBy || "Admin"}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-text-muted text-[11px] whitespace-nowrap">
                                        {item.createdAt ? new Date(item.createdAt).toLocaleDateString(undefined, {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric"
                                        }) : "—"}
                                    </td>
                                    <td className="py-3 px-4 text-right font-sans whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteMonitored(item.ip)}
                                                disabled={deletingIp === item.ip}
                                                className="p-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer disabled:opacity-40"
                                                title={`Remove ${item.ip} from Watchlist`}
                                            >
                                                {deletingIp === item.ip ? (
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Bottom Pagination Bar */}
            <div className="bg-bg-card p-3 rounded-2xl border border-border-color flex justify-between items-center text-xs text-text-muted shadow-sm">
                <span>
                    Showing {filteredItems.length > 0 ? (page - 1) * pageSize + 1 : 0} to {Math.min(page * pageSize, filteredItems.length)} of {filteredItems.length} entries
                </span>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 rounded-lg border border-border-color bg-bg-surface hover:bg-bg-surface/80 text-text-primary disabled:opacity-40 transition cursor-pointer"
                    >
                        Previous
                    </button>
                    <span className="px-3 font-semibold text-accent-primary">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || totalPages === 0}
                        className="px-3 py-1.5 rounded-lg border border-border-color bg-bg-surface hover:bg-bg-surface/80 text-text-primary disabled:opacity-40 transition cursor-pointer"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
