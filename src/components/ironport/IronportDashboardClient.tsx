"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, MailWarning, Activity, ServerCrash, RefreshCw, Search, Clock, AlertTriangle, FileText, Info, ExternalLink, Filter, Send, Inbox, Link2 } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";
import type { GraylogStats } from "@/lib/og-graylog";

export default function IronportDashboardClient() {
    const [stats, setStats] = useState<GraylogStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Timeframe range state (seconds): 3600=1h, 21600=6h, 43200=12h, 86400=24h, 259200=3d, 604800=7d
    const [timeframe, setTimeframe] = useState<number>(86400);

    // Tab state: "inbound" | "outbound" | "investigate"
    const [activeTab, setActiveTab] = useState<"inbound" | "outbound" | "investigate">("inbound");

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    const getVolumeQueryForTab = (tab: "inbound" | "outbound" | "investigate") => {
        return tab === "outbound" ? 'message:"outbound table"' : 'message:"inbound table"';
    };

    const fetchStats = async (selectedRange = timeframe, tab = activeTab) => {
        setLoading(true);
        setError(null);
        try {
            const vQuery = getVolumeQueryForTab(tab);
            const url = `/api/ironport/stats?range=${selectedRange}&volumeQuery=${encodeURIComponent(vQuery)}`;
            const res = await fetch(url);
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || "Failed to fetch IronPort stats");
            }
            const data = await res.json();
            
            const formatSeries = (series: any[]) => 
                (series || []).map(point => ({
                    ...point,
                    timeLabel: new Date(point.timestamp).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        ...(selectedRange > 86400 ? { month: 'numeric', day: 'numeric' } : {}) 
                    })
                }));

            setStats({
                ...data,
                totalVolumeChart: formatSeries(data.totalVolumeChart),
                delayedMessagesChart: formatSeries(data.delayedMessagesChart),
                urlRewritesChart: formatSeries(data.urlRewritesChart || data.phishingAlertsChart),
                malwareAlertsChart: formatSeries(data.malwareAlertsChart)
            });
        } catch (e: any) {
            setError(e.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (overrideQuery?: string) => {
        const queryToRun = overrideQuery || searchQuery;
        if (!queryToRun) return;

        if (overrideQuery) {
            setSearchQuery(overrideQuery);
            setActiveTab("investigate");
        }

        setSearchLoading(true);
        setSearchError(null);
        try {
            const res = await fetch("/api/ironport/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: queryToRun, limit: 100, range: timeframe })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.details || "Search failed");
            }

            const data = await res.json();
            setSearchResults(data);
        } catch (e: any) {
            setSearchError(e.message || "An unexpected error occurred during search.");
        } finally {
            setSearchLoading(false);
        }
    };

    const handleMidClick = (mid: string) => {
        handleSearch(`message:"MID ${mid}"`);
    };

    const handleTabChange = (newTab: "inbound" | "outbound" | "investigate") => {
        setActiveTab(newTab);
        if (newTab !== "investigate") {
            fetchStats(timeframe, newTab);
        }
    };

    const handleTimeframeChange = (newRange: number) => {
        setTimeframe(newRange);
        fetchStats(newRange, activeTab);
    };

    useEffect(() => {
        fetchStats(timeframe, activeTab);
        const interval = setInterval(() => fetchStats(timeframe, activeTab), 300000);
        return () => clearInterval(interval);
    }, [timeframe]);

    // Helper to format ISO timestamp into local Date + Time (e.g. Aug 6, 2026, 5:45:10 PM)
    const formatDateTime = (isoString: string) => {
        if (!isoString) return "-";
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    };

    // Helper to extract MID and delayed reasons specifically from IronPort syslog headers
    const parseMessage = (msg: string) => {
        let mid = null;
        const midMatch = msg.match(/MID (\d+)/);
        if (midMatch) mid = midMatch[1];

        let delayReason = null;
        const isDelaySyslog = msg.includes("Info: Delayed:") || msg.match(/ESA_mail_logs:\s*Info:\s*Delayed:/i);

        if (isDelaySyslog || msg.includes("Delayed:")) {
            const reasonMatch = msg.match(/Delayed:.*? - (.*?) \[/);
            if (reasonMatch) delayReason = reasonMatch[1];
            else {
                const altMatch = msg.match(/Delayed:.*?- (.*)/);
                if (altMatch) delayReason = altMatch[1];
            }
        }

        return { mid, delayReason, isDelaySyslog };
    };

    const getTimeframeLabel = (seconds: number) => {
        switch(seconds) {
            case 3600: return "Last 1 Hour";
            case 21600: return "Last 6 Hours";
            case 43200: return "Last 12 Hours";
            case 86400: return "Last 24 Hours";
            case 259200: return "Last 3 Days";
            case 604800: return "Last 7 Days";
            default: return "Selected Timeframe";
        }
    };

    // Construct merged multi-series data for Threats & Delays graph (focused strictly on Delays and Malware Threats)
    const getThreatsAndDelaysChartData = () => {
        if (!stats) return [];
        
        const mapByTime: Record<number, { timestamp: number; timeLabel: string; delayed: number; malware: number }> = {};

        const getOrCreate = (pt: any) => {
            if (!mapByTime[pt.timestamp]) {
                mapByTime[pt.timestamp] = {
                    timestamp: pt.timestamp,
                    timeLabel: pt.timeLabel,
                    delayed: 0,
                    malware: 0
                };
            }
            return mapByTime[pt.timestamp];
        };

        (stats.delayedMessagesChart || []).forEach(pt => { getOrCreate(pt).delayed = pt.count; });
        (stats.malwareAlertsChart || []).forEach(pt => { getOrCreate(pt).malware = pt.count; });

        return Object.values(mapByTime).sort((a, b) => a.timestamp - b.timestamp);
    };

    if (loading && !stats) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-[var(--text-muted)]">
                <RefreshCw className="w-8 h-8 animate-spin mb-4 text-[var(--accent-primary)]" />
                <p>Connecting to Graylog API & Aggregating IronPort Telemetry...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="glass-card bg-red-500/10 border-red-500/50 p-6 flex flex-col items-center justify-center text-center">
                <ServerCrash className="w-12 h-12 text-red-500 mb-4" />
                <h3 className="text-red-500 text-lg font-bold">Failed to load Dashboard</h3>
                <p className="text-[var(--text-primary)] mt-2">{error}</p>
                <button 
                    onClick={() => fetchStats(timeframe, activeTab)}
                    className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"
                >
                    Retry Connection
                </button>
            </div>
        );
    }

    if (!stats) return null;

    const mergedThreatData = getThreatsAndDelaysChartData();

    const renderMetricCard = (
        title: string, 
        value: number, 
        icon: any, 
        colorClass: string, 
        series: any[], 
        tooltipText: string,
        onClickHandler?: () => void,
        dataKey: string = "count"
    ) => (
        <div 
            className={`glass-card flex flex-col gap-4 overflow-hidden relative group transition-all duration-200 ${onClickHandler ? 'cursor-pointer hover:border-[var(--accent-primary)] hover:shadow-lg' : ''}`}
            onClick={onClickHandler}
            title={tooltipText}
        >
            <div className="flex justify-between items-start z-10 relative">
                <div>
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{title}</h3>
                        <div className="group/tooltip relative inline-block">
                            <Info className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]" />
                            <div className="absolute left-0 bottom-full mb-2 hidden group-hover/tooltip:block w-64 p-2.5 bg-[var(--bg-surface)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] rounded-md shadow-xl z-50 pointer-events-none leading-relaxed">
                                {tooltipText}
                            </div>
                        </div>
                    </div>
                    <p className={`text-3xl font-bold mt-1 ${colorClass}`}>{value.toLocaleString()}</p>
                </div>
                <div className={`p-2.5 rounded-xl bg-[var(--bg-surface-hover)] ${colorClass}`}>
                    {icon}
                </div>
            </div>

            {onClickHandler && (
                <div className="absolute top-3 right-3 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-[var(--bg-surface)] px-2 py-1 rounded border border-[var(--border-color)] flex items-center gap-1 z-20">
                    <span>Drill Down</span>
                    <ExternalLink className="w-3 h-3" />
                </div>
            )}

            <div className="h-20 w-full -mx-4 -mb-4 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={series} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id={`color-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="currentColor" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="currentColor" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <Tooltip 
                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                            itemStyle={{ color: 'var(--text-primary)' }}
                            labelStyle={{ color: 'var(--text-secondary)', marginBottom: '4px' }}
                        />
                        <Area 
                            type="monotone" 
                            dataKey={dataKey} 
                            stroke="currentColor" 
                            fillOpacity={1} 
                            fill={`url(#color-${title.replace(/\s+/g, '')})`} 
                            className={colorClass}
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-6">
            {/* Top Navigation Tabs & Scalable Timeframe Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 border-b border-[var(--border-color)] pb-3">
                {/* 3 Main Tabs: Inbound Telemetry | Outbound Telemetry | Investigate & Logs */}
                <div className="flex gap-2">
                    <button 
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'inbound' ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}
                        onClick={() => handleTabChange("inbound")}
                    >
                        <Inbox className="w-4 h-4" />
                        Inbound Telemetry
                    </button>
                    <button 
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'outbound' ? 'bg-blue-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}
                        onClick={() => handleTabChange("outbound")}
                    >
                        <Send className="w-4 h-4" />
                        Outbound Telemetry
                    </button>
                    <button 
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-2 ${activeTab === 'investigate' ? 'bg-[var(--accent-primary)] text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'}`}
                        onClick={() => handleTabChange("investigate")}
                    >
                        <Search className="w-4 h-4" />
                        Investigate & Logs
                    </button>
                </div>

                <div className="flex items-center gap-3 w-full xl:w-auto justify-between xl:justify-end">
                    {/* Scalable Timeframe Selector: 1h, 6h, 12h, 24h, 3d, 7d */}
                    <div className="flex items-center bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-1">
                        <Clock className="w-4 h-4 text-[var(--text-muted)] ml-2 mr-1" />
                        {[
                            { label: "1h", range: 3600 },
                            { label: "6h", range: 21600 },
                            { label: "12h", range: 43200 },
                            { label: "24h", range: 86400 },
                            { label: "3d", range: 259200 },
                            { label: "7d", range: 604800 },
                        ].map((item) => (
                            <button
                                key={item.range}
                                onClick={() => handleTimeframeChange(item.range)}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === item.range ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => fetchStats(timeframe, activeTab)}
                        disabled={loading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] text-sm transition-colors disabled:opacity-50"
                        title="Refresh data from Graylog"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        <span className="hidden md:inline">{loading ? "Refreshing..." : "Refresh"}</span>
                    </button>
                </div>
            </div>

            {/* Inbound Telemetry Tab */}
            {activeTab === "inbound" && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        {renderMetricCard(
                            "Inbound Clean Mail", 
                            stats.totalVolume, 
                            <Inbox className="w-5 h-5" />, 
                            "text-blue-500", 
                            stats.totalVolumeChart,
                            'Counts inbound clean mail evaluations in Graylog (message:"inbound table"). Matches Cisco IronPort GUI Inbound Clean Mail reporting.'
                        )}

                        {renderMetricCard(
                            "Delayed / Queue Issues", 
                            stats.delayedMessages, 
                            <MailWarning className="w-5 h-5" />, 
                            "text-amber-500", 
                            stats.delayedMessagesChart,
                            'Counts actual IronPort ESA queue delays (message:"Info: Delayed:"). Click to drill down into delay reasons.',
                            () => handleSearch('message:"Info: Delayed:"')
                        )}

                        {renderMetricCard(
                            "URL Rewrites", 
                            stats.urlRewrites || (stats as any).phishingAlerts || 0, 
                            <Link2 className="w-5 h-5" />, 
                            "text-orange-500", 
                            stats.urlRewritesChart || (stats as any).phishingAlertsChart || [],
                            'Counts URLs matched by reputation rules and redirected through Cisco Security Proxy (message:"Action: URL redirected to Cisco Security proxy"). Click to investigate.',
                            () => handleSearch('message:"Action: URL redirected to Cisco Security proxy"')
                        )}

                        {renderMetricCard(
                            "Malware Detections", 
                            stats.malwareAlerts, 
                            <ShieldAlert className="w-5 h-5" />, 
                            "text-red-500", 
                            stats.malwareAlertsChart,
                            'Counts non-clean Antivirus (McAfee/Sophos) or Cisco AMP verdicts. Click to investigate.',
                            () => handleSearch('message:"interim AV verdict using" AND NOT message:"CLEAN"')
                        )}
                    </div>

                    {/* Quick Inbound Drill-Down Banner */}
                    <div className="glass-card bg-[var(--bg-surface)] p-4 border border-[var(--border-color)] rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                                <Filter className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-[var(--text-primary)]">Inbound Incident Drill-Downs</h4>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Filter raw log streams directly by inbound category for {getTimeframeLabel(timeframe)}.</p>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap w-full md:w-auto">
                            <button 
                                onClick={() => handleSearch('message:"inbound table"')}
                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <Inbox className="w-3.5 h-3.5" />
                                All Inbound Mail
                            </button>
                            <button 
                                onClick={() => handleSearch('message:"Info: Delayed:"')}
                                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <MailWarning className="w-3.5 h-3.5" />
                                Delays ({stats.delayedMessages.toLocaleString()})
                            </button>
                            <button 
                                onClick={() => handleSearch('message:"Action: URL redirected to Cisco Security proxy"')}
                                className="px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <Link2 className="w-3.5 h-3.5" />
                                URL Rewrites ({(stats.urlRewrites || (stats as any).phishingAlerts || 0).toLocaleString()})
                            </button>
                            <button 
                                onClick={() => handleSearch('message:"interim AV verdict using" AND NOT message:"CLEAN"')}
                                className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Malware ({stats.malwareAlerts.toLocaleString()})
                            </button>
                        </div>
                    </div>

                    {/* Time-Series Charts */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="glass-card">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">Inbound Mail Flow Trend</h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Aggregated inbound clean mail ({getTimeframeLabel(timeframe)})</p>
                                </div>
                                <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-md font-semibold">
                                    Total: {stats.totalVolume.toLocaleString()}
                                </span>
                            </div>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats.totalVolumeChart} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                        <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
                                        <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                                            labelStyle={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}
                                        />
                                        <Line type="monotone" dataKey="count" name="Inbound Mail" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">Threats & Delivery Delays</h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Comparative incident frequency ({getTimeframeLabel(timeframe)})</p>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-semibold">Delayed Messages</span>
                                    <span className="text-xs px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded font-semibold">Malware Verdicts</span>
                                </div>
                            </div>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={mergedThreatData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                        <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
                                        <YAxis stroke="var(--text-muted)" fontSize={11} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                                            labelStyle={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}
                                        />
                                        <Line type="monotone" dataKey="delayed" name="Delayed Messages" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                        <Line type="monotone" dataKey="malware" name="Malware Verdicts" stroke="#ef4444" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Outbound Telemetry Tab */}
            {activeTab === "outbound" && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                        {renderMetricCard(
                            "Outbound Clean Mail", 
                            stats.totalVolume, 
                            <Send className="w-5 h-5" />, 
                            "text-blue-500", 
                            stats.totalVolumeChart,
                            'Counts outbound clean mail evaluations in Graylog (message:"outbound table"). Matches Cisco IronPort GUI Outbound Clean Mail reporting.'
                        )}

                        {renderMetricCard(
                            "Outbound Queue Delays", 
                            stats.delayedMessages, 
                            <MailWarning className="w-5 h-5" />, 
                            "text-amber-500", 
                            stats.delayedMessagesChart,
                            'Counts actual IronPort ESA queue delays for outbound mail. Click to investigate.',
                            () => handleSearch('message:"Info: Delayed:"')
                        )}

                        {renderMetricCard(
                            "Outbound URL Rewrites", 
                            stats.urlRewrites || (stats as any).phishingAlerts || 0, 
                            <Link2 className="w-5 h-5" />, 
                            "text-orange-500", 
                            stats.urlRewritesChart || (stats as any).phishingAlertsChart || [],
                            'Counts URL rewrites triggered on outbound messages.',
                            () => handleSearch('message:"Action: URL redirected to Cisco Security proxy"')
                        )}

                        {renderMetricCard(
                            "Outbound Malware Detections", 
                            stats.malwareAlerts, 
                            <ShieldAlert className="w-5 h-5" />, 
                            "text-red-500", 
                            stats.malwareAlertsChart,
                            'Counts malware verdicts on outbound mail.',
                            () => handleSearch('message:"interim AV verdict using" AND NOT message:"CLEAN"')
                        )}
                    </div>

                    {/* Quick Outbound Drill-Down Banner */}
                    <div className="glass-card bg-[var(--bg-surface)] p-4 border border-[var(--border-color)] rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
                                <Filter className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-[var(--text-primary)]">Outbound Incident Drill-Downs</h4>
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">Inspect outgoing email streams for compromise, spam spikes, or policy blocks ({getTimeframeLabel(timeframe)}).</p>
                            </div>
                        </div>
                        <div className="flex gap-2 flex-wrap w-full md:w-auto">
                            <button 
                                onClick={() => handleSearch('message:"outbound table"')}
                                className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <Send className="w-3.5 h-3.5" />
                                All Outbound Mail
                            </button>
                            <button 
                                onClick={() => handleSearch('message:"Info: Delayed:"')}
                                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                            >
                                <MailWarning className="w-3.5 h-3.5" />
                                Outbound Delays ({stats.delayedMessages.toLocaleString()})
                            </button>
                        </div>
                    </div>

                    {/* Time-Series Charts */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="glass-card">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">Outbound Mail Flow Trend</h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Aggregated outbound clean mail ({getTimeframeLabel(timeframe)})</p>
                                </div>
                                <span className="text-xs px-2.5 py-1 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-md font-semibold">
                                    Total: {stats.totalVolume.toLocaleString()}
                                </span>
                            </div>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={stats.totalVolumeChart} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                        <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
                                        <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => val >= 1000 ? `${(val/1000).toFixed(1)}k` : val} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                                            labelStyle={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}
                                        />
                                        <Line type="monotone" dataKey="count" name="Outbound Mail" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="glass-card">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">Outbound Delays & Alerts</h3>
                                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">Comparative incident frequency ({getTimeframeLabel(timeframe)})</p>
                                </div>
                                <div className="flex gap-2">
                                    <span className="text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-semibold">Delayed</span>
                                </div>
                            </div>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={mergedThreatData} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                                        <XAxis dataKey="timeLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
                                        <YAxis stroke="var(--text-muted)" fontSize={11} />
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                                            labelStyle={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}
                                        />
                                        <Line type="monotone" dataKey="delayed" name="Delayed Messages" stroke="#f59e0b" strokeWidth={2} dot={false} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Investigate & Logs Tab */}
            {activeTab === "investigate" && (
                <div className="flex flex-col gap-6">
                    <div className="glass-card">
                        <form 
                            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
                            className="flex gap-4 items-center"
                        >
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                                <input 
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder='Search Graylog Lucene (e.g. message:"inbound table" OR message:"outbound table" OR message:"Info: Delayed:" OR message:"MID 12345")'
                                    className="w-full pl-10 pr-4 py-3 bg-[var(--bg-default)] border border-[var(--border-color)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-[var(--accent-primary)] font-mono text-sm"
                                />
                            </div>
                            <button 
                                type="submit"
                                disabled={searchLoading || !searchQuery}
                                className="px-6 py-3 bg-[var(--accent-primary)] hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {searchLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                                Search ({getTimeframeLabel(timeframe)})
                            </button>
                        </form>
                        <div className="flex gap-2 mt-4 flex-wrap items-center">
                            <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mr-2 flex items-center h-8">Quick Filters:</span>
                            <button onClick={() => handleSearch('message:"inbound table"')} className="px-3 py-1 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 rounded-md text-xs font-semibold transition-colors flex items-center gap-1"><Inbox className="w-3 h-3" /> Inbound Mail</button>
                            <button onClick={() => handleSearch('message:"outbound table"')} className="px-3 py-1 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 rounded-md text-xs font-semibold transition-colors flex items-center gap-1"><Send className="w-3 h-3" /> Outbound Mail</button>
                            <button onClick={() => handleSearch('message:"Info: Delayed:"')} className="px-3 py-1 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30 rounded-md text-xs font-semibold transition-colors">Delayed Messages</button>
                            <button onClick={() => handleSearch('message:"Action: URL redirected to Cisco Security proxy"')} className="px-3 py-1 bg-orange-500/10 text-orange-500 hover:bg-orange-500/20 border border-orange-500/30 rounded-md text-xs font-semibold transition-colors">URL Rewrites</button>
                            <button onClick={() => handleSearch('message:"interim AV verdict using" AND NOT message:"CLEAN"')} className="px-3 py-1 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 rounded-md text-xs font-semibold transition-colors">Malware Verdicts</button>
                        </div>
                    </div>

                    {searchError && (
                        <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-500">
                            <AlertTriangle className="w-5 h-5" />
                            {searchError}
                        </div>
                    )}

                    {searchResults.length > 0 && (
                        <div className="glass-card p-0 overflow-hidden">
                            <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-surface-hover)] flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-semibold text-[var(--text-primary)]">Log Results ({searchResults.length}{searchResults.length === 100 ? '+' : ''})</h3>
                                    <span className="text-xs px-2 py-0.5 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded text-[var(--text-muted)] font-mono">
                                        Local Browser Time (Eastern)
                                    </span>
                                </div>
                                <span className="text-xs text-[var(--text-muted)]">Click any MID badge to isolate the complete thread</span>
                            </div>
                            <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[var(--bg-surface)] sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">Date & Time</th>
                                            <th className="p-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">Appliance</th>
                                            <th className="p-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">MID</th>
                                            <th className="p-3 text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border-color)]">Syslog Message Payload</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border-color)]">
                                        {searchResults.map((hit, idx) => {
                                            const msgObj = hit.message;
                                            const rawMsg = msgObj.message || "";
                                            const { mid, delayReason, isDelaySyslog } = parseMessage(rawMsg);
                                            
                                            return (
                                                <tr key={idx} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                                    <td className="p-3 text-xs text-[var(--text-primary)] whitespace-nowrap align-top font-mono">
                                                        {formatDateTime(msgObj.timestamp)}
                                                    </td>
                                                    <td className="p-3 text-xs text-[var(--text-secondary)] whitespace-nowrap align-top font-medium">
                                                        {msgObj.source?.split('.')[0] || "unknown"}
                                                    </td>
                                                    <td className="p-3 align-top">
                                                        {mid ? (
                                                            <button 
                                                                onClick={() => handleMidClick(mid)}
                                                                className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 rounded font-mono font-bold transition-colors"
                                                                title={`Click to trace full message thread for MID ${mid}`}
                                                            >
                                                                MID {mid}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-[var(--text-muted)]">-</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-xs font-mono text-[var(--text-secondary)] break-all align-top leading-relaxed">
                                                        {isDelaySyslog && delayReason ? (
                                                            <div>
                                                                <span className="inline-block px-2 py-0.5 bg-amber-500/20 text-amber-500 rounded text-xs font-bold mb-1 border border-amber-500/30">
                                                                    DELAY REASON: {delayReason}
                                                                </span>
                                                                <br/>
                                                                <span className="opacity-90">{rawMsg}</span>
                                                            </div>
                                                        ) : (
                                                            rawMsg
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {!searchLoading && searchResults.length === 0 && searchQuery && !searchError && (
                        <div className="glass-card flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                            <Search className="w-12 h-12 mb-4 opacity-50" />
                            <p>No messages found matching your query for {getTimeframeLabel(timeframe)}.</p>
                        </div>
                    )}

                    {!searchLoading && searchResults.length === 0 && !searchQuery && (
                        <div className="glass-card flex flex-col items-center justify-center py-16 text-[var(--text-muted)]">
                            <FileText className="w-12 h-12 mb-4 opacity-50" />
                            <p>Enter a search query or use a quick filter above to investigate raw Graylog logs.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
