"use client";

import React, { useState, useMemo } from "react";
import { 
    AlertTriangle, 
    ShieldAlert, 
    ShieldCheck,
    Server, 
    Search, 
    ExternalLink, 
    Copy, 
    Check, 
    Info, 
    Wrench,
    ArrowUpRight,
    ArrowUp,
    ArrowDown,
    ArrowUpDown,
    X,
    Tag,
    Loader2
} from "lucide-react";
import { PaginationControls } from "@/components/common/PaginationControls";

interface FailureInvestigationTableProps {
    unreachableDevices: any[];
    onSelectDevice: (hostname: string) => void;
    onRefresh?: () => void;
}

type SortField = "hostname" | "platform" | "discoveredVia" | "port" | "reason" | "ip";

export default function FailureInvestigationTable({
    unreachableDevices,
    onSelectDevice,
    onRefresh
}: FailureInvestigationTableProps) {
    const [search, setSearch] = useState("");
    const [filterTab, setFilterTab] = useState<"all" | "active" | "vendor">("all");
    const [copiedHost, setCopiedHost] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);
    const [sortField, setSortField] = useState<SortField>("hostname");
    const [sortAsc, setSortAsc] = useState(true);
    const [updatingHost, setUpdatingHost] = useState<string | null>(null);
    const [localOverrides, setLocalOverrides] = useState<Record<string, { isVendor: boolean }>>({});

    const handleToggleVendorManaged = async (item: any) => {
        const host = item.hostname;
        const currentIsVendor = localOverrides[host] !== undefined 
            ? localOverrides[host].isVendor 
            : Boolean(item.isVendorManaged || item.tag === "VENDOR_MANAGED");
        const nextIsVendor = !currentIsVendor;

        // Optimistic UI update
        setLocalOverrides(prev => ({ ...prev, [host]: { isVendor: nextIsVendor } }));
        setUpdatingHost(host);

        try {
            if (!nextIsVendor) {
                const res = await fetch(`/api/crawler/overrides?hostname=${encodeURIComponent(host)}`, {
                    method: "DELETE"
                });
                if (!res.ok) throw new Error("Failed to remove override");
            } else {
                const res = await fetch("/api/crawler/overrides", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        hostname: host,
                        tag: "VENDOR_MANAGED",
                        reason: `Vendor Managed (${item.platform || "Discovered via CDP"})`,
                        excludeFromTopology: true,
                        excludeFromFailures: false,
                        ipAddress: item.ipAddress || item.ip_address || null
                    })
                });
                if (!res.ok) throw new Error("Failed to save override");
            }
            if (onRefresh) {
                onRefresh();
            }
        } catch (err) {
            console.error("Failed to toggle vendor managed state:", err);
            // Revert optimistic update on failure
            setLocalOverrides(prev => ({ ...prev, [host]: { isVendor: currentIsVendor } }));
        } finally {
            setUpdatingHost(null);
        }
    };

    // Calculate tab counts
    const counts = useMemo(() => {
        let active = 0;
        let vendor = 0;
        for (const d of unreachableDevices) {
            const isV = localOverrides[d.hostname] !== undefined 
                ? localOverrides[d.hostname].isVendor 
                : Boolean(d.isVendorManaged || d.tag === "VENDOR_MANAGED");
            if (isV) {
                vendor++;
            } else {
                active++;
            }
        }
        return { all: unreachableDevices.length, active, vendor };
    }, [unreachableDevices, localOverrides]);

    const filtered = useMemo(() => {
        let list = unreachableDevices;

        // Apply Tab Filter
        if (filterTab === "active") {
            list = list.filter(d => {
                const isV = localOverrides[d.hostname] !== undefined 
                    ? localOverrides[d.hostname].isVendor 
                    : Boolean(d.isVendorManaged || d.tag === "VENDOR_MANAGED");
                return !isV;
            });
        } else if (filterTab === "vendor") {
            list = list.filter(d => {
                const isV = localOverrides[d.hostname] !== undefined 
                    ? localOverrides[d.hostname].isVendor 
                    : Boolean(d.isVendorManaged || d.tag === "VENDOR_MANAGED");
                return isV;
            });
        }

        const query = search.trim().toLowerCase();
        if (!query) return list;

        return list.filter(d => {
            const disc = (d.discoveredVia || d.discovered_by || "").toLowerCase();
            const err = (d.failureReason || d.error || "").toLowerCase();
            const ip = (d.ipAddress || d.ip_address || "").toLowerCase();
            const host = (d.hostname || "").toLowerCase();
            const port = (d.discoveredPort || d.discovered_port || "").toLowerCase();
            const plat = (d.platform || "").toLowerCase();
            return host.includes(query) || disc.includes(query) || err.includes(query) || ip.includes(query) || port.includes(query) || plat.includes(query);
        });
    }, [unreachableDevices, search, filterTab, localOverrides]);

    const sorted = useMemo(() => {
        return [...filtered].sort((a, b) => {
            let valA = "";
            let valB = "";
            if (sortField === "hostname") {
                valA = a.hostname || "";
                valB = b.hostname || "";
            } else if (sortField === "platform") {
                valA = a.platform || "";
                valB = b.platform || "";
            } else if (sortField === "discoveredVia") {
                valA = a.discoveredVia || a.discovered_by || "";
                valB = b.discoveredVia || b.discovered_by || "";
            } else if (sortField === "port") {
                valA = a.discoveredPort || a.discovered_port || "";
                valB = b.discoveredPort || b.discovered_port || "";
            } else if (sortField === "reason") {
                valA = a.failureReason || a.error || "";
                valB = b.failureReason || b.error || "";
            } else if (sortField === "ip") {
                valA = a.ipAddress || a.ip_address || "";
                valB = b.ipAddress || b.ip_address || "";
            }
            const cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
            return sortAsc ? cmp : -cmp;
        });
    }, [filtered, sortField, sortAsc]);

    const paginatedItems = useMemo(() => {
        const start = (page - 1) * limit;
        return sorted.slice(start, start + limit);
    }, [sorted, page, limit]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortAsc(!sortAsc);
        } else {
            setSortField(field);
            setSortAsc(true);
        }
    };

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedHost(text);
        setTimeout(() => setCopiedHost(null), 2000);
    };

    const renderSortIndicator = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="w-3 h-3 text-slate-600 opacity-60 inline-block ml-1" />;
        }
        return sortAsc ? (
            <ArrowUp className="w-3 h-3 text-blue-400 inline-block ml-1" />
        ) : (
            <ArrowDown className="w-3 h-3 text-blue-400 inline-block ml-1" />
        );
    };

    return (
        <div className="flex-1 h-full min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            {/* Header & Search Bar */}
            <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 bg-slate-950/60 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                Failure Investigation Center
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                                    {unreachableDevices.length} Unreachable Nodes
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Switches detected via CDP peer advertisements that failed automated SSH crawl ingestion.
                            </p>
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs sm:ml-4 self-start sm:self-auto">
                        <button
                            type="button"
                            onClick={() => { setFilterTab("all"); setPage(1); }}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                filterTab === "all" ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <span>All Failures</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-700/60 text-slate-300 font-mono">
                                {counts.all}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setFilterTab("active"); setPage(1); }}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                filterTab === "active" ? "bg-red-950/70 border border-red-800/80 text-red-200 shadow-sm" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <span>Action Needed</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500/20 text-red-300 font-mono">
                                {counts.active}
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setFilterTab("vendor"); setPage(1); }}
                            className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 ${
                                filterTab === "vendor" ? "bg-purple-950/70 border border-purple-800/80 text-purple-200 shadow-sm" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <span>Vendor Managed</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 font-mono">
                                {counts.vendor}
                            </span>
                        </button>
                    </div>
                </div>

                <div className="relative w-full lg:w-72 shrink-0">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Filter by hostname, IP, platform, reason..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch("");
                                setPage(1);
                            }}
                            className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 rounded cursor-pointer"
                            title="Clear search"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Top Pagination Controls */}
            {filtered.length > 0 && (
                <div className="shrink-0 px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/90">
                    <PaginationControls
                        totalRecords={filtered.length}
                        page={page}
                        limit={limit}
                        limitOptions={[10, 25, 50, 100]}
                        onPageChange={setPage}
                        onLimitChange={(l) => {
                            setLimit(l);
                            setPage(1);
                        }}
                        showLimitSelector={true}
                    />
                </div>
            )}

            {/* Internally Scrollable Table Body */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar relative bg-slate-950/40">
                {filtered.length === 0 ? (
                    <div className="h-full min-h-[320px] flex flex-col items-center justify-center p-8 text-center space-y-2">
                        <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                            <Wrench className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-slate-200">
                            {unreachableDevices.length === 0 ? "Zero Unreachable Devices Detected!" : "No devices match your search filter."}
                        </p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {unreachableDevices.length === 0 
                                ? "All discovered network elements were successfully contacted, authenticated, and cataloged."
                                : "Try switching tabs or searching with a different hostname, platform, or error keyword."}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="sticky top-0 z-10 text-[11px] text-slate-400 bg-slate-900 border-b border-slate-800 uppercase font-semibold tracking-wider shadow-sm">
                            <tr>
                                <th className="py-3 px-3 text-center w-14 text-slate-500">
                                    #
                                </th>
                                <th 
                                    className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                                    onClick={() => handleSort("hostname")}
                                    title="Sort by Switch Hostname"
                                >
                                    <div className="flex items-center gap-1">
                                        Switch Hostname
                                        {renderSortIndicator("hostname")}
                                    </div>
                                </th>
                                <th 
                                    className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                                    onClick={() => handleSort("platform")}
                                    title="Sort by Discovered Platform (CDP)"
                                >
                                    <div className="flex items-center gap-1">
                                        Discovered Platform
                                        {renderSortIndicator("platform")}
                                    </div>
                                </th>
                                <th 
                                    className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                                    onClick={() => handleSort("discoveredVia")}
                                    title="Sort by Discovered Peer"
                                >
                                    <div className="flex items-center gap-1">
                                        Discovered By (CDP)
                                        {renderSortIndicator("discoveredVia")}
                                    </div>
                                </th>
                                <th 
                                    className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                                    onClick={() => handleSort("port")}
                                    title="Sort by Port"
                                >
                                    <div className="flex items-center gap-1">
                                        Port / Link
                                        {renderSortIndicator("port")}
                                    </div>
                                </th>
                                <th 
                                    className="py-3 px-4 cursor-pointer select-none hover:text-white transition"
                                    onClick={() => handleSort("reason")}
                                    title="Sort by Failure Reason"
                                >
                                    <div className="flex items-center gap-1">
                                        Failure Reason
                                        {renderSortIndicator("reason")}
                                    </div>
                                </th>
                                <th className="py-3 px-4">
                                    Recommended Remediation
                                </th>
                                <th className="py-3 px-4 text-right">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 font-mono">
                            {paginatedItems.map((item, idx) => {
                                const rowNumber = (page - 1) * limit + idx + 1;
                                const reason = item.failureReason || item.error || "Connection timed out on TCP/22";
                                const isAuth = reason.toLowerCase().includes("auth") || reason.toLowerCase().includes("tacacs");
                                const isTimeout = reason.toLowerCase().includes("timeout") || reason.toLowerCase().includes("timed out");
                                const discHost = item.discoveredVia || item.discovered_by;
                                const discPort = item.discoveredPort || item.discovered_port || "GigabitEthernet1/0/24";
                                const ipAddr = item.ipAddress || item.ip_address;
                                const isVendor = localOverrides[item.hostname] !== undefined 
                                    ? localOverrides[item.hostname].isVendor 
                                    : Boolean(item.isVendorManaged || item.tag === "VENDOR_MANAGED");
                                const isUpdatingThis = updatingHost === item.hostname;

                                return (
                                    <tr key={item.hostname || idx} className="hover:bg-slate-900/80 transition group">
                                        {/* Row Number */}
                                        <td className="py-3 px-3 text-center font-mono text-[11px] text-slate-500 font-semibold select-none">
                                            {rowNumber}
                                        </td>

                                        {/* Hostname & IP */}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className={`font-bold ${isVendor ? "text-purple-300" : "text-red-300 group-hover:text-red-200"}`}>
                                                    {item.hostname}
                                                </span>
                                                <button
                                                    onClick={() => handleCopy(item.hostname)}
                                                    className="text-slate-500 hover:text-slate-300 transition cursor-pointer"
                                                    title="Copy Hostname"
                                                >
                                                    {copiedHost === item.hostname ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                                {isVendor && (
                                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-bold bg-purple-950/80 text-purple-300 border border-purple-800/80">
                                                        Vendor Managed
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-slate-500 font-sans block">
                                                {ipAddr || "No IP in CDP payload"}
                                            </span>
                                        </td>

                                        {/* Discovered Platform (CDP) */}
                                        <td className="py-3 px-4 font-sans">
                                            {item.platform ? (
                                                <span 
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 max-w-[210px] truncate"
                                                    title={item.platform}
                                                >
                                                    {item.platform}
                                                </span>
                                            ) : (
                                                <span className="text-slate-500 text-[11px] italic">
                                                    Not reported in CDP
                                                </span>
                                            )}
                                        </td>

                                        {/* Discovered By Peer */}
                                        <td className="py-3 px-4 text-slate-300 font-medium font-sans">
                                            {discHost ? (
                                                <button
                                                    onClick={() => onSelectDevice(discHost)}
                                                    className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 cursor-pointer"
                                                    title={`View ${discHost} in Topology`}
                                                >
                                                    {discHost}
                                                    <ArrowUpRight className="w-3 h-3" />
                                                </button>
                                            ) : (
                                                <span className="text-slate-500">Seed Switch</span>
                                            )}
                                        </td>

                                        {/* Port / Link */}
                                        <td className="py-3 px-4 text-slate-400">
                                            {discPort}
                                        </td>

                                        {/* Failure Reason */}
                                        <td className="py-3 px-4">
                                            <div className="max-w-[280px]">
                                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase mb-1 ${
                                                    isVendor 
                                                        ? "bg-purple-950/80 text-purple-300 border border-purple-800/60"
                                                        : "bg-red-950/80 text-red-400 border border-red-800/60"
                                                }`}>
                                                    {isVendor ? "Vendor Managed" : isAuth ? "Auth Failure" : isTimeout ? "SSH Timeout" : "Unreachable"}
                                                </span>
                                                <p className="text-[11px] text-slate-300 truncate" title={reason}>
                                                    {reason}
                                                </p>
                                            </div>
                                        </td>

                                        {/* Remediation Tip */}
                                        <td className="py-3 px-4 font-sans text-[11px] text-slate-400">
                                            {isVendor ? (
                                                <span className="text-purple-300/90 flex items-center gap-1.5">
                                                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                                                    Flagged as vendor managed (excluded from topology graph)
                                                </span>
                                            ) : isAuth ? (
                                                <span className="text-amber-300/90 flex items-center gap-1.5">
                                                    <Info className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                                                    Check TACACS+/AAA privileges or crawler service account creds
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 flex items-center gap-1.5">
                                                    <Info className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                                    Verify switch VTY line ACL, management VLAN SVI, or firewall rules
                                                </span>
                                            )}
                                        </td>

                                        {/* Actions */}
                                        <td className="py-3 px-4 text-right font-sans">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Toggle Vendor Managed Button */}
                                                <button
                                                    onClick={() => handleToggleVendorManaged(item)}
                                                    disabled={isUpdatingThis}
                                                    className={`px-2 py-1 text-xs font-semibold rounded-lg border transition flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                                                        isVendor
                                                            ? "bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border-purple-700/60"
                                                            : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700"
                                                    }`}
                                                    title={isVendor ? "Remove Vendor Managed flag" : "Flag as Vendor Managed to exclude from topology"}
                                                >
                                                    {isUpdatingThis ? (
                                                        <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                                                    ) : isVendor ? (
                                                        <ShieldCheck className="w-3 h-3 text-purple-400" />
                                                    ) : (
                                                        <Tag className="w-3 h-3 text-slate-400" />
                                                    )}
                                                    <span>{isVendor ? "Unflag" : "Flag Vendor"}</span>
                                                </button>

                                                {discHost && (
                                                    <button
                                                        onClick={() => onSelectDevice(discHost)}
                                                        className="px-2 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 rounded-lg transition cursor-pointer"
                                                        title={`Inspect CDP peer ${discHost}`}
                                                    >
                                                        Inspect
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Bottom Pagination Controls */}
            {filtered.length > 0 && (
                <div className="shrink-0 px-4 py-2.5 bg-slate-950/80 border-t border-slate-800/90">
                    <PaginationControls
                        totalRecords={filtered.length}
                        page={page}
                        limit={limit}
                        limitOptions={[10, 25, 50, 100]}
                        onPageChange={setPage}
                        onLimitChange={(l) => {
                            setLimit(l);
                            setPage(1);
                        }}
                        showLimitSelector={true}
                    />
                </div>
            )}
        </div>
    );
}
