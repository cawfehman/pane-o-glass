"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
    FileText, 
    Search, 
    Download, 
    RefreshCw, 
    Calendar, 
    CheckCircle2, 
    XCircle, 
    AlertCircle, 
    Network, 
    Users, 
    UserCheck,
    UserX,
    UserMinus,
    Globe, 
    ArrowDownUp, 
    Activity, 
    Shield, 
    Clock, 
    Filter,
    ChevronLeft,
    ChevronRight,
    Info
} from "lucide-react";
import { ToolHelp } from "../ToolHelp";

export interface VpnReportEvent {
    id: string;
    username: string;
    sourceIp: string;
    assignedIp?: string | null;
    status: string; // "SUCCESS", "FAILURE", "DISCONNECT"
    duration?: number | null;
    bytesSent?: number | null;
    bytesReceived?: number | null;
    bytesTotal?: number | null;
    failureReason?: string | null;
    vpnType?: string | null;
    vpnStream?: string | null;
    ipAsn?: string | null;
    ipAsName?: string | null;
    ipAsDomain?: string | null;
    ipCountry?: string | null;
    ipCountryCode?: string | null;
    createdAt: string;

    // AD Enrichment
    adStatus?: "ACTIVE" | "DISABLED" | "NOT_FOUND";
    adLastCheckedAt?: string;
    adDisplayName?: string;
    adDepartment?: string;
    adTitle?: string;
}

export default function VpnReportingClient() {
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [timeframe, setTimeframe] = useState<number>(86400); // 24h default
    const [isCustomDate, setIsCustomDate] = useState<boolean>(false);
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    
    // Dataset & Loading State
    const [events, setEvents] = useState<VpnReportEvent[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(50);

    // Summary Metrics
    const [totalEventsReturned, setTotalEventsReturned] = useState<number>(0);
    const [totalTimeframeEvents, setTotalTimeframeEvents] = useState<number>(0);
    const [dbTotalCount, setDbTotalCount] = useState<number>(0);
    const [earliestRecordDate, setEarliestRecordDate] = useState<string | null>(null);
    const [uniqueUsers, setUniqueUsers] = useState<number>(0);
    const [uniqueValidUsers, setUniqueValidUsers] = useState<number>(0);
    const [activeAdUsersCount, setActiveAdUsersCount] = useState<number>(0);
    const [disabledAdUsersCount, setDisabledAdUsersCount] = useState<number>(0);
    const [notFoundAdUsersCount, setNotFoundAdUsersCount] = useState<number>(0);
    const [uniqueIps, setUniqueIps] = useState<number>(0);
    const [successCount, setSuccessCount] = useState<number>(0);
    const [failureCount, setFailureCount] = useState<number>(0);
    const [disconnectCount, setDisconnectCount] = useState<number>(0);
    const [totalBytes, setTotalBytes] = useState<number>(0);
    const [dbSpeedMs, setDbSpeedMs] = useState<number | null>(null);

    const fetchReportData = useCallback(async () => {
        setLoading(true);
        setError(null);
        setCurrentPage(1); // Reset page to 1 on new query

        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set("query", searchQuery);
            if (statusFilter !== "ALL") params.set("status", statusFilter);

            if (isCustomDate && (startDate || endDate)) {
                if (startDate) params.set("startDate", new Date(startDate).toISOString());
                if (endDate) params.set("endDate", new Date(endDate).toISOString());
            } else {
                params.set("range", timeframe.toString());
            }

            params.set("limit", "5000");
            params.set("_t", Date.now().toString());

            const res = await fetch(`/api/vpn/reporting?${params.toString()}`, {
                cache: "no-store",
                headers: { "Pragma": "no-cache", "Cache-Control": "no-cache" }
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || `HTTP ${res.status}`);
            }

            const data = await res.json();

            setEvents(data.events || []);
            setTotalEventsReturned(data.totalEventsReturned || 0);
            setTotalTimeframeEvents(data.totalTimeframeEvents || 0);
            setDbTotalCount(data.dbTotalCount || 0);
            setEarliestRecordDate(data.earliestRecordDate || null);
            setUniqueUsers(data.uniqueUsersCount || 0);
            setUniqueValidUsers(data.uniqueValidUsersCount || 0);
            setActiveAdUsersCount(data.activeAdUsersCount || 0);
            setDisabledAdUsersCount(data.disabledAdUsersCount || 0);
            setNotFoundAdUsersCount(data.notFoundAdUsersCount || 0);
            setUniqueIps(data.uniqueIpsCount || 0);
            setSuccessCount(data.successCount || 0);
            setFailureCount(data.failureCount || 0);
            setDisconnectCount(data.disconnectCount || 0);
            setTotalBytes(data.totalBytesTransferred || 0);
            if (data.responseTimeMs !== undefined) setDbSpeedMs(data.responseTimeMs);

        } catch (err: any) {
            console.error("VPN Reporting Fetch Error:", err);
            setError(err.message || "Failed to load VPN reporting dataset");
        } finally {
            setLoading(false);
        }
    }, [searchQuery, timeframe, isCustomDate, startDate, endDate, statusFilter]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    // Client-side pagination calculations
    const totalPages = Math.ceil(events.length / itemsPerPage) || 1;
    const paginatedEvents = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return events.slice(start, start + itemsPerPage);
    }, [events, currentPage, itemsPerPage]);

    // Format bytes cleanly (KB, MB, GB, TB)
    const formatBytes = (bytes?: number | null) => {
        if (!bytes || bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    // Format duration in human-readable time (e.g. 2h 15m 30s)
    const formatDuration = (seconds?: number | null) => {
        if (!seconds || seconds <= 0) return "--";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${m}m ${s}s`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    };

    // Export to CSV Function
    const handleExportCsv = () => {
        if (events.length === 0) return;

        const headers = [
            "Row #",
            "Timestamp (ISO)",
            "Username",
            "AD Account Status",
            "AD Display Name",
            "AD Department",
            "AD Title",
            "AD Status Verified Date",
            "Event Status",
            "Source IP",
            "Assigned IP",
            "Duration (Seconds)",
            "Formatted Duration",
            "Bytes Sent",
            "Bytes Received",
            "Total Bytes",
            "Formatted Bytes Total",
            "VPN Type",
            "Gateway Stream",
            "Failure Reason",
            "ASN",
            "ISP / Organization",
            "Country"
        ];

        const escapeCsv = (val: any) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const rows = events.map((e, idx) => [
            escapeCsv(idx + 1),
            escapeCsv(new Date(e.createdAt).toISOString()),
            escapeCsv(e.username),
            escapeCsv(e.adStatus || "NOT_FOUND"),
            escapeCsv(e.adDisplayName || ""),
            escapeCsv(e.adDepartment || ""),
            escapeCsv(e.adTitle || ""),
            escapeCsv(e.adLastCheckedAt ? new Date(e.adLastCheckedAt).toLocaleString() : ""),
            escapeCsv(e.status),
            escapeCsv(e.sourceIp),
            escapeCsv(e.assignedIp || ""),
            escapeCsv(e.duration || 0),
            escapeCsv(formatDuration(e.duration)),
            escapeCsv(e.bytesSent || 0),
            escapeCsv(e.bytesReceived || 0),
            escapeCsv(e.bytesTotal || 0),
            escapeCsv(formatBytes(e.bytesTotal)),
            escapeCsv(e.vpnType || ""),
            escapeCsv(e.vpnStream || ""),
            escapeCsv(e.failureReason || ""),
            escapeCsv(e.ipAsn || ""),
            escapeCsv(e.ipAsName || ""),
            escapeCsv(e.ipCountry || "")
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        link.setAttribute("href", url);
        link.setAttribute("download", `vpn_reporting_export_${timestamp}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Shared Pagination Controls Render Function
    const renderPaginationBar = (position: "top" | "bottom") => (
        <div className={`p-3 bg-[var(--bg-default)] border-[var(--border-color)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)] font-mono ${
            position === "top" ? "border-b rounded-t-xl" : "border-t rounded-b-xl"
        }`}>
            <div className="flex items-center gap-3">
                <span className="font-semibold text-[var(--text-primary)]">
                    Showing {events.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} – {Math.min(currentPage * itemsPerPage, events.length)} of {events.length.toLocaleString()} returned records
                </span>
                {totalTimeframeEvents > events.length && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px]">
                        Query capped at {events.length.toLocaleString()} of {totalTimeframeEvents.toLocaleString()} timeframe matches
                    </span>
                )}
            </div>

            <div className="flex items-center gap-4">
                {/* Items per page selector */}
                <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <select
                        value={itemsPerPage}
                        onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                        }}
                        className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                    </select>
                </div>

                {/* Page Navigation Buttons */}
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1 || loading}
                        className="px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--border-color)]/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold transition-colors"
                    >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                    </button>

                    <span className="px-2 font-bold text-[var(--text-primary)]">
                        Page {currentPage} of {totalPages}
                    </span>

                    <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage >= totalPages || loading}
                        className="px-2.5 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-[var(--border-color)]/50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-semibold transition-colors"
                    >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            {/* Top Controls & Filter Bar */}
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-2xs">
                
                {/* Search Bar & Status Selector */}
                <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                        <input
                            type="text"
                            placeholder="Search by Username, Source IP, Assigned IP, Gateway..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && fetchReportData()}
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-indigo-400 shrink-0" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer"
                        >
                            <option value="ALL">All Event Types</option>
                            <option value="SUCCESS">SUCCESS Only (🟢)</option>
                            <option value="FAILURE">FAILURE Only (🔴)</option>
                            <option value="DISCONNECT">DISCONNECT Only (🔵)</option>
                        </select>
                    </div>
                </div>

                {/* Timeframe Presets & Custom Range */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-[var(--bg-default)] p-1 rounded-lg border border-[var(--border-color)] text-xs font-semibold">
                        {[
                            { label: "1h", value: 3600 },
                            { label: "24h", value: 86400 },
                            { label: "7d", value: 604800 },
                            { label: "30d", value: 2592000 },
                            { label: "All", value: 0 }
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => {
                                    setIsCustomDate(false);
                                    setTimeframe(t.value);
                                }}
                                className={`px-2.5 py-1 rounded-md transition-colors ${
                                    !isCustomDate && timeframe === t.value
                                        ? "bg-indigo-600 text-white font-bold shadow-xs"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                        
                        <button
                            onClick={() => setIsCustomDate(!isCustomDate)}
                            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
                                isCustomDate 
                                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Custom</span>
                        </button>
                    </div>

                    {/* Refresh & CSV Export Buttons */}
                    <button
                        onClick={fetchReportData}
                        disabled={loading}
                        className="p-2 rounded-lg bg-[var(--bg-default)] hover:bg-[var(--border-color)]/40 border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                        title="Refresh Report Data"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
                    </button>

                    <button
                        onClick={handleExportCsv}
                        disabled={events.length === 0}
                        className="px-3 py-2 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Download className="w-4 h-4" />
                        <span>Export CSV ({events.length.toLocaleString()})</span>
                    </button>
                </div>
            </div>

            {/* Custom Date Inputs if Toggle Active */}
            {isCustomDate && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-wrap items-center gap-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-300">Start Date & Time:</span>
                        <input 
                            type="datetime-local" 
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-indigo-300">End Date & Time:</span>
                        <input 
                            type="datetime-local" 
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <button
                        onClick={fetchReportData}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold text-xs shadow-xs hover:bg-indigo-500 transition-colors"
                    >
                        Apply Date Range
                    </button>
                </div>
            )}

            {/* Earliest Record Info Banner */}
            {earliestRecordDate && (
                <div className="px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs sm:text-sm text-indigo-300 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                        <span>
                            <strong className="text-[var(--text-primary)]">Earliest Record Available:</strong>{" "}
                            <span className="font-mono text-indigo-200">{new Date(earliestRecordDate).toLocaleString()}</span>
                            {" "}({Math.floor((Date.now() - new Date(earliestRecordDate).getTime()) / (1000 * 60 * 60 * 24))} days of history stored)
                        </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-xs">
                        <span className="px-2.5 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                            Total DB Records: {dbTotalCount.toLocaleString()}
                        </span>
                        <span className="text-[var(--text-secondary)]">Pruning: Retaining All Records</span>
                    </div>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Summary KPI Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Total Events</span>
                        <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-[var(--text-primary)]">
                        {loading ? "--" : totalTimeframeEvents.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Unique Users</span>
                        <Users className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-[var(--text-primary)]">
                        {loading ? "--" : uniqueUsers.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/30 flex flex-col gap-1 bg-emerald-500/5">
                    <div className="flex items-center justify-between text-xs text-emerald-400 font-semibold" title="AD LDAP verified active accounts">
                        <span>Active AD Users</span>
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-emerald-300">
                        {loading ? "--" : activeAdUsersCount.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-rose-500/30 flex flex-col gap-1 bg-rose-500/5">
                    <div className="flex items-center justify-between text-xs text-rose-400 font-semibold" title="AD LDAP accounts currently disabled or terminated">
                        <span>Disabled AD Users</span>
                        <UserX className="w-4 h-4 text-rose-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-rose-300">
                        {loading ? "--" : disabledAdUsersCount.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Unique Source IPs</span>
                        <Globe className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-[var(--text-primary)]">
                        {loading ? "--" : uniqueIps.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Successful Logins</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-emerald-400">
                        {loading ? "--" : successCount.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Failed Attempts</span>
                        <XCircle className="w-4 h-4 text-rose-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-rose-400">
                        {loading ? "--" : failureCount.toLocaleString()}
                    </span>
                </div>

                <div className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
                        <span>Total Data Transfer</span>
                        <ArrowDownUp className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="text-lg font-bold font-mono text-amber-400 truncate">
                        {loading ? "--" : formatBytes(totalBytes)}
                    </span>
                </div>
            </div>

            {/* Main Log Table Container */}
            <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] overflow-hidden shadow-2xs flex flex-col">
                
                {/* TOP PAGINATION BAR */}
                {renderPaginationBar("top")}

                {/* Zebra-Striped Table */}
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                        <thead>
                            <tr className="bg-[var(--bg-default)] border-b border-[var(--border-color)] text-[var(--text-secondary)] font-mono text-xs uppercase tracking-wider">
                                <th className="p-3 w-12 text-center">#</th>
                                <th className="p-3">Timestamp</th>
                                <th className="p-3">Username & AD Status</th>
                                <th className="p-3">Event Status</th>
                                <th className="p-3">Source IP</th>
                                <th className="p-3">Assigned IP</th>
                                <th className="p-3">Duration</th>
                                <th className="p-3">Data Transfer</th>
                                <th className="p-3">Gateway / ISP</th>
                                <th className="p-3">Details / Failure Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                        Querying PostgreSQL VPN Telemetry Database & Verifying Active Directory Status...
                                    </td>
                                </tr>
                            ) : paginatedEvents.length === 0 ? (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                        No VPN events match the specified query and timeframe filters.
                                    </td>
                                </tr>
                            ) : (
                                paginatedEvents.map((evt, idx) => {
                                    const rowNumber = (currentPage - 1) * itemsPerPage + idx + 1;
                                    const isEven = idx % 2 === 0;

                                    return (
                                        <tr 
                                            key={evt.id} 
                                            className={`transition-colors ${
                                                isEven 
                                                    ? "bg-[var(--bg-surface)] hover:bg-indigo-500/10" 
                                                    : "bg-[var(--bg-default)]/40 hover:bg-indigo-500/10"
                                            }`}
                                        >
                                            {/* Row Number */}
                                            <td className="p-3 text-center font-mono text-xs text-[var(--text-secondary)] font-semibold select-none">
                                                {rowNumber}
                                            </td>

                                            {/* Timestamp */}
                                            <td className="p-3 font-mono whitespace-nowrap text-xs text-[var(--text-secondary)]">
                                                {new Date(evt.createdAt).toLocaleString()}
                                            </td>

                                            {/* Username & AD Status Badge */}
                                            <td className="p-3 font-mono">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-semibold text-indigo-400">
                                                        {evt.username || "unknown"}
                                                    </span>
                                                    
                                                    {/* AD Status Indicator */}
                                                    {evt.adStatus === "ACTIVE" && (
                                                        <span 
                                                            className="inline-flex items-center gap-1 text-[11px] font-sans font-bold text-emerald-400"
                                                            title={`AD Verified Active User: ${evt.adDisplayName || evt.username}${evt.adTitle ? ` (${evt.adTitle})` : ""}${evt.adDepartment ? ` - ${evt.adDepartment}` : ""}\nVerified as of: ${new Date(evt.adLastCheckedAt || Date.now()).toLocaleString()}`}
                                                        >
                                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                                            ACTIVE IN AD
                                                        </span>
                                                    )}

                                                    {evt.adStatus === "DISABLED" && (
                                                        <span 
                                                            className="inline-flex items-center gap-1 text-[11px] font-sans font-bold text-rose-400"
                                                            title={`AD Account Disabled / Terminated: ${evt.adDisplayName || evt.username}\nVerified as of: ${new Date(evt.adLastCheckedAt || Date.now()).toLocaleString()}`}
                                                        >
                                                            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                                                            DISABLED IN AD
                                                        </span>
                                                    )}

                                                    {evt.adStatus === "NOT_FOUND" && (
                                                        <span 
                                                            className="inline-flex items-center gap-1 text-[11px] font-sans font-medium text-amber-400/80"
                                                            title={`Account Not Found in AD as of ${new Date(evt.adLastCheckedAt || Date.now()).toLocaleString()}`}
                                                        >
                                                            <span className="w-2 h-2 rounded-full bg-amber-400/80"></span>
                                                            NOT IN AD
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Event Status Badge */}
                                            <td className="p-3 whitespace-nowrap">
                                                {evt.status === "SUCCESS" && (
                                                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-xs font-mono inline-flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        SUCCESS
                                                    </span>
                                                )}
                                                {evt.status === "FAILURE" && (
                                                    <span className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-xs font-mono inline-flex items-center gap-1">
                                                        <XCircle className="w-3 h-3" />
                                                        FAILURE
                                                    </span>
                                                )}
                                                {evt.status === "DISCONNECT" && (
                                                    <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold text-xs font-mono inline-flex items-center gap-1">
                                                        <Activity className="w-3 h-3" />
                                                        DISCONNECT
                                                    </span>
                                                )}
                                            </td>

                                            {/* Source IP */}
                                            <td className="p-3 font-mono text-[var(--text-primary)]">
                                                {evt.sourceIp}
                                            </td>

                                            {/* Assigned IP */}
                                            <td className="p-3 font-mono text-[var(--text-secondary)]">
                                                {evt.assignedIp || "--"}
                                            </td>

                                            {/* Duration */}
                                            <td className="p-3 font-mono whitespace-nowrap text-xs text-[var(--text-primary)]">
                                                {formatDuration(evt.duration)}
                                            </td>

                                            {/* Data Transfer */}
                                            <td className="p-3 font-mono whitespace-nowrap text-xs text-[var(--text-primary)]">
                                                {formatBytes(evt.bytesTotal)}
                                            </td>

                                            {/* Gateway Stream / ISP */}
                                            <td className="p-3 text-xs max-w-[180px]">
                                                <div className="font-semibold text-[var(--text-primary)] truncate">
                                                    {evt.vpnStream || "AnyConnect Cluster"}
                                                </div>
                                                {evt.ipAsName && (
                                                    <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                                        {evt.ipAsName}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Details / Failure Reason */}
                                            <td className="p-3 text-xs max-w-[240px] truncate text-[var(--text-secondary)]">
                                                {evt.failureReason || (evt.status === "SUCCESS" ? "Session Authenticated" : "Clean Teardown")}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* BOTTOM PAGINATION BAR */}
                {renderPaginationBar("bottom")}
            </div>
        </div>
    );
}
