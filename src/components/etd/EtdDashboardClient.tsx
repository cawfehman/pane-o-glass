"use client";

import { useState, useEffect } from "react";
import { 
    ShieldAlert, 
    RefreshCw, 
    ExternalLink, 
    Search, 
    Mail, 
    Inbox, 
    Clock, 
    CheckCircle2, 
    AlertTriangle, 
    FileText, 
    Send,
    Filter,
    ArrowUpRight,
    LucideIcon
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import { EtdSummaryStats, EtdRetrospectiveVerdict } from "@/lib/etd";
import Link from "next/link";

export function EtdDashboardClient() {
    const [timeframe, setTimeframe] = useState<number>(86400); // Default 24h
    const [stats, setStats] = useState<EtdSummaryStats | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [filterCategory, setFilterCategory] = useState<string>("all");
    const [searchFilter, setSearchFilter] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(1);

    const fetchEtdStats = async (rangeSec: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/etd/retrospective?rangeSeconds=${rangeSec}`);
            if (res.ok) {
                const data: EtdSummaryStats = await res.json();
                setStats(data);
            }
        } catch (e) {
            console.error("Failed to fetch ETD retrospective stats:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEtdStats(timeframe);
    }, [timeframe]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterCategory, searchFilter, timeframe]);

    const handleExportCsv = () => {
        if (!stats || !stats.verdicts || stats.verdicts.length === 0) return;
        const headers = ["Message ID", "Gateway MID", "Received UTC", "Verdict Type", "Subject", "Sender", "Target Recipient", "Exposure Delta (Mins)", "Remediation Status", "Cisco CMD Link"];
        const rows = stats.verdicts.map(v => [
            `"${v.messageId}"`,
            `"${v.mid || ''}"`,
            `"${v.receivedTimestamp}"`,
            `"${v.verdictType}"`,
            `"${v.subject.replace(/"/g, '""')}"`,
            `"${v.sender.replace(/"/g, '""')}"`,
            `"${v.recipient.replace(/"/g, '""')}"`,
            `"${v.exposureDeltaMinutes}"`,
            `"${v.remediationStatus}"`,
            `"${v.ciscoCmdUrl}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Cisco_ETD_Retrospective_Threat_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const formatDateTime = (isoStr: string) => {
        if (!isoStr) return "";
        const date = new Date(isoStr);
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true
        });
    };

    const renderMetricCard = (
        title: string,
        value: number | string,
        icon: React.ReactNode,
        colorClass: string,
        subtext: string,
        onClick?: () => void
    ) => (
        <div 
            onClick={onClick}
            className={`glass-card p-5 border border-[var(--border-color)] rounded-xl flex flex-col justify-between transition-all ${onClick ? 'cursor-pointer hover:border-[var(--accent-primary)] hover:scale-[1.01]' : ''}`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">{title}</p>
                    <h3 className={`text-2xl font-extrabold mt-1.5 ${colorClass}`}>
                        {typeof value === "number" ? value.toLocaleString() : value}
                    </h3>
                </div>
                <div className={`p-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] ${colorClass}`}>
                    {icon}
                </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-3 leading-relaxed">{subtext}</p>
        </div>
    );

    const getTimeframeLabel = (sec: number) => {
        switch (sec) {
            case 3600: return "Last 1 Hour";
            case 21600: return "Last 6 Hours";
            case 43200: return "Last 12 Hours";
            case 86400: return "Last 24 Hours";
            case 259200: return "Last 3 Days";
            case 604800: return "Last 7 Days";
            default: return "Selected Timeframe";
        }
    };

    let filteredVerdicts = stats?.verdicts || [];
    if (filterCategory !== "all") {
        if (filterCategory === "scam") {
            filteredVerdicts = filteredVerdicts.filter(v => v.verdictType === "RETROSPECTIVE_SCAM");
        } else if (filterCategory === "phish") {
            filteredVerdicts = filteredVerdicts.filter(v => v.verdictType === "RETROSPECTIVE_PHISH");
        } else if (filterCategory === "malware") {
            filteredVerdicts = filteredVerdicts.filter(v => v.verdictType === "RETROSPECTIVE_MALWARE");
        } else if (filterCategory === "high_exposure") {
            filteredVerdicts = filteredVerdicts.filter(v => v.exposureDeltaMinutes >= 15);
        }
    }

    if (searchFilter) {
        const queryLower = searchFilter.toLowerCase();
        filteredVerdicts = filteredVerdicts.filter(v => 
            v.subject.toLowerCase().includes(queryLower) ||
            v.sender.toLowerCase().includes(queryLower) ||
            v.recipient.toLowerCase().includes(queryLower) ||
            v.messageId.toLowerCase().includes(queryLower) ||
            (v.mid && v.mid.includes(queryLower))
        );
    }

    const itemsPerPage = 10;
    const totalPages = Math.max(1, Math.ceil(filteredVerdicts.length / itemsPerPage));
    const safePage = Math.min(currentPage, totalPages);
    const paginatedVerdicts = filteredVerdicts.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

    return (
        <div className="internal-scroll-layout flex flex-col gap-6 p-6 max-w-[1700px] mx-auto w-full">
            {/* Standard Query Header */}
            <div className="shrink-0 flex flex-col gap-4">
                <QueryHeader 
                    title="Cisco ETD Retrospective Center"
                    description="Monitor cloud retrospective threat verdicts (Scam, Phishing, Malware), calculate user exposure window deltas, track M365 auto-clawbacks, and deep-link directly to Cisco CMD portal incident records."
                    toolId="etd"
                    icon={<ShieldAlert className="w-6 h-6 text-red-400" />}
                    actions={
                        <div className="flex items-center gap-3">
                            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shadow-sm">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Cisco ETD API & Graylog Stream Connected
                            </span>

                            {/* Timeframe Selector */}
                            <div className="flex bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-color)]">
                                {[
                                    { label: "1h", value: 3600 },
                                    { label: "6h", value: 21600 },
                                    { label: "12h", value: 43200 },
                                    { label: "24h", value: 86400 },
                                    { label: "3d", value: 259200 },
                                    { label: "7d", value: 604800 }
                                ].map((t) => (
                                    <button
                                        key={t.value}
                                        onClick={() => setTimeframe(t.value)}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === t.value ? 'bg-[var(--accent-primary)] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={handleExportCsv}
                                disabled={!stats || !stats.verdicts || stats.verdicts.length === 0}
                                className="px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                title="Export Executive CSV Threat Report"
                            >
                                <FileText size={14} />
                                <span>Export Executive CSV</span>
                            </button>

                            <button 
                                onClick={() => fetchEtdStats(timeframe)}
                                disabled={loading}
                                className="p-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                                title="Refresh Telemetry"
                            >
                                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                    }
                />
            </div>

            {/* Scrolling Body Container */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6 flex flex-col gap-6">
                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                    {renderMetricCard(
                        "Total Retrospective Verdicts",
                        stats?.totalRetrospectiveVerdicts || 0,
                        <ShieldAlert className="w-5 h-5" />,
                        "text-red-400",
                        `Post-delivery verdicts applied across M365 inboxes for ${getTimeframeLabel(timeframe)}.`,
                        () => setFilterCategory("all")
                    )}

                    {renderMetricCard(
                        "Retrospective Scams & Phishing",
                        (stats?.scamCount || 0) + (stats?.phishCount || 0),
                        <Mail className="w-5 h-5" />,
                        "text-amber-400",
                        `Cloud threat intelligence verdicts for Scam (${stats?.scamCount || 0}) and Phishing (${stats?.phishCount || 0}).`,
                        () => setFilterCategory("scam")
                    )}

                    {renderMetricCard(
                        "Retrospective Malware",
                        stats?.malwareCount || 0,
                        <AlertTriangle className="w-5 h-5" />,
                        "text-rose-400",
                        `Critical malware verdicts retroactively identified post-delivery.`,
                        () => setFilterCategory("malware")
                    )}

                    {renderMetricCard(
                        "Avg Exposure Window",
                        `${stats?.avgExposureDeltaMinutes || 0} mins`,
                        <Clock className="w-5 h-5" />,
                        "text-cyan-400",
                        `Average elapsed time between gateway inbox delivery and Cisco ETD cloud clawback.`,
                        () => setFilterCategory("high_exposure")
                    )}
                </div>

                {/* Retrospective Incident Table Card */}
                <div className="glass-card bg-[var(--bg-surface)] p-5 border border-[var(--border-color)] rounded-xl flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-[var(--border-color)] pb-3">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-lg bg-red-500/10 text-red-400">
                                <ShieldAlert className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                                    Cisco ETD Retrospective Threat Incident Feed
                                </h4>
                                <p className="text-xs text-[var(--text-secondary)]">
                                    Track post-delivery clawbacks, exposure deltas, and deep-link directly to Cisco CMD portal incident records.
                                </p>
                            </div>
                        </div>

                        {/* Search & Category Filter Bar */}
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                                <input 
                                    type="text"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                    placeholder="Filter by MID, Message-ID, Subject, User..."
                                    className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg-default)] border border-[var(--border-color)] rounded-lg text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] font-mono"
                                />
                            </div>

                            <div className="flex items-center gap-1 bg-[var(--bg-default)] p-1 border border-[var(--border-color)] rounded-lg text-xs font-semibold">
                                <button
                                    onClick={() => setFilterCategory("all")}
                                    className={`px-2.5 py-1 rounded transition-colors ${filterCategory === "all" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setFilterCategory("scam")}
                                    className={`px-2.5 py-1 rounded transition-colors ${filterCategory === "scam" ? "bg-amber-500 text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    Scams ({stats?.scamCount || 0})
                                </button>
                                <button
                                    onClick={() => setFilterCategory("phish")}
                                    className={`px-2.5 py-1 rounded transition-colors ${filterCategory === "phish" ? "bg-orange-500 text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    Phishing ({stats?.phishCount || 0})
                                </button>
                                <button
                                    onClick={() => setFilterCategory("malware")}
                                    className={`px-2.5 py-1 rounded transition-colors ${filterCategory === "malware" ? "bg-rose-600 text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                                >
                                    Malware ({stats?.malwareCount || 0})
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                                    <th className="py-2.5 px-3">Received Time (UTC)</th>
                                    <th className="py-2.5 px-3">Message-ID / Gateway MID</th>
                                    <th className="py-2.5 px-3">Subject Line</th>
                                    <th className="py-2.5 px-3">Sender & Target User</th>
                                    <th className="py-2.5 px-3">ETD Verdict</th>
                                    <th className="py-2.5 px-3">Exposure Delta</th>
                                    <th className="py-2.5 px-3">Remediation Status</th>
                                    <th className="py-2.5 px-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)] text-xs font-mono">
                                {paginatedVerdicts.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-8 text-center text-[var(--text-muted)] italic font-sans">
                                            No retrospective threat verdict incidents found matching current filter criteria.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedVerdicts.map((v, idx) => {
                                        let verdictBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-bold">RETROSPECTIVE SCAM</span>;
                                        if (v.verdictType === "RETROSPECTIVE_PHISH") {
                                            verdictBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-orange-500/15 text-orange-400 border border-orange-500/30 font-bold">RETROSPECTIVE PHISH</span>;
                                        } else if (v.verdictType === "RETROSPECTIVE_MALWARE") {
                                            verdictBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 border border-rose-500/30 font-bold">RETROSPECTIVE MALWARE</span>;
                                        }

                                        let remBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1 w-fit"><Inbox size={10} /> PURGED BY ETD</span>;
                                        if (v.remediationStatus === "QUARANTINED_BY_ESA") {
                                            remBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 border border-purple-500/30 font-bold flex items-center gap-1 w-fit"><CheckCircle2 size={10} /> QUARANTINED</span>;
                                        } else if (v.remediationStatus === "PENDING_MANUAL_REVIEW") {
                                            remBadge = <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30 font-bold flex items-center gap-1 w-fit"><AlertTriangle size={10} /> MANUAL REVIEW</span>;
                                        }

                                        return (
                                            <tr key={idx} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                                <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-secondary)] text-[11px]">
                                                    {formatDateTime(v.receivedTimestamp)}
                                                </td>
                                                <td className="py-2.5 px-3 max-w-[200px] truncate">
                                                    <div className="font-bold text-cyan-400 truncate" title={v.messageId}>
                                                        {v.messageId}
                                                    </div>
                                                    {v.mid && (
                                                        <span className="text-[10px] text-blue-400 font-semibold block mt-0.5">
                                                            Gateway MID {v.mid}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 font-sans font-semibold text-[var(--text-primary)] max-w-[240px] truncate" title={v.subject}>
                                                    {v.subject}
                                                </td>
                                                <td className="py-2.5 px-3 max-w-[220px]">
                                                    <div className="truncate text-cyan-400 font-semibold" title={`From: ${v.sender}`}>
                                                        <span className="text-[9px] uppercase font-bold text-cyan-400/90 px-1 rounded bg-cyan-500/10 border border-cyan-500/20 mr-1">FROM</span>
                                                        {v.sender}
                                                    </div>
                                                    <div className="truncate text-indigo-300 mt-0.5" title={`To: ${v.recipient}`}>
                                                        <span className="text-[9px] uppercase font-bold text-indigo-400/90 px-1 rounded bg-indigo-500/10 border border-indigo-500/20 mr-1">TO</span>
                                                        {v.recipient}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {verdictBadge}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${v.exposureDeltaMinutes >= 15 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-[var(--bg-default)] text-[var(--text-secondary)] border border-[var(--border-color)]'}`}>
                                                        {v.exposureDeltaMinutes} mins
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    {remBadge}
                                                </td>
                                                <td className="py-2.5 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {v.exposureDeltaMinutes >= 15 && (
                                                            <Link
                                                                href={`/notifications?template=RETROSPECTIVE_ADVISORY&target=${encodeURIComponent(v.recipient)}`}
                                                                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded font-semibold text-[11px] transition-colors flex items-center gap-1"
                                                                title="Stage employee for Security Advisory or password reset in Notification Center"
                                                            >
                                                                <Send size={12} />
                                                                <span>Stage Advisory</span>
                                                            </Link>
                                                        )}

                                                        {v.mid && (
                                                            <Link
                                                                href={`/queries/ironport?tab=investigate&query=MID+${v.mid}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded font-semibold text-[11px] transition-colors flex items-center gap-1"
                                                                title="Open IronPort Investigate & Logs tab in new window and trace MID"
                                                            >
                                                                Trace MID
                                                            </Link>
                                                        )}

                                                        <a
                                                            href={v.ciscoCmdUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded font-semibold text-[11px] transition-colors flex items-center gap-1"
                                                            title="Open official Cisco CMD portal record"
                                                        >
                                                            <span>CMD Portal</span>
                                                            <ArrowUpRight size={12} />
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)] font-sans">
                        <div className="font-medium font-mono">
                            Showing <span className="font-bold text-[var(--text-primary)]">{filteredVerdicts.length > 0 ? (safePage - 1) * itemsPerPage + 1 : 0}–{Math.min(safePage * itemsPerPage, filteredVerdicts.length)}</span> of <span className="font-bold text-[var(--text-primary)]">{filteredVerdicts.length}</span> retrospective threat incidents
                        </div>

                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={safePage <= 1}
                                className="px-2.5 py-1 bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors text-[11px]"
                            >
                                ◀ Prev
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setCurrentPage(p)}
                                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors ${safePage === p ? "bg-[var(--accent-primary)] text-white shadow-sm" : "bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] text-[var(--text-secondary)]"}`}
                                >
                                    {p}
                                </button>
                            ))}

                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={safePage >= totalPages}
                                className="px-2.5 py-1 bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors text-[11px]"
                            >
                                Next ▶
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
