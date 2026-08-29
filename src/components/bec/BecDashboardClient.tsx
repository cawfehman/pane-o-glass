"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
    ShieldAlert, 
    ExternalLink, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    Settings, 
    Plus, 
    Trash2, 
    RotateCcw,
    X,
    Bell,
    Mail,
    Globe,
    Lock,
    BarChart3,
    Key,
    Layers,
    Filter,
    Users,
    ChevronRight,
    ArrowUpRight,
    Zap
} from "lucide-react";
import { 
    OFFICIAL_M365_AUTH_ENDPOINTS, 
    M365AuthEndpoint,
    GraylogBecImpersonationAggregation,
    GraylogTopDomainAggregation,
    GraylogThirdPartyOAuthAggregation,
    GraylogThirdPartyOAuthItem
} from "@/lib/og-graylog";

export default function BecDashboardClient() {
    const [timeframe, setTimeframe] = useState<number>(3600); // 1h default (3600s) for lightning fast load
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    
    // Master Dataset State (Single Query from Graylog)
    const [masterBecData, setMasterBecData] = useState<GraylogBecImpersonationAggregation[]>([]);
    const [masterTopDomains, setMasterTopDomains] = useState<GraylogTopDomainAggregation[]>([]);
    const [masterOauthLinks, setMasterOauthLinks] = useState<GraylogThirdPartyOAuthAggregation[]>([]);
    const [masterTotalUrls, setMasterTotalUrls] = useState<number>(0);
    const [masterTotalMessages, setMasterTotalMessages] = useState<number>(0);
    
    // Auto Refresh Interval State (0 = Off, 60 = 60s, 300 = 5m)
    const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0);

    // Drill-Down Modal State for Non-MS OAuth Providers
    const [selectedProvider, setSelectedProvider] = useState<GraylogThirdPartyOAuthAggregation | null>(null);
    const [selectedModalRecipient, setSelectedModalRecipient] = useState<string | null>(null);
    const [modalSearch, setModalSearch] = useState<string>("");

    // Auth Endpoints Modal State
    const [showEndpointModal, setShowEndpointModal] = useState<boolean>(false);
    const [authEndpoints, setAuthEndpoints] = useState<M365AuthEndpoint[]>(OFFICIAL_M365_AUTH_ENDPOINTS);
    const [newUrl, setNewUrl] = useState<string>("");
    const [newRole, setNewRole] = useState<string>("");

    // Module View Tab State
    const [activeTab, setActiveTab] = useState<"incidents" | "url_search">("incidents");

    // Unwrapped URL & Domain Search Engine State
    const [urlSearchQuery, setUrlSearchQuery] = useState<string>("");
    const [urlSearchResults, setUrlSearchResults] = useState<any[]>([]);
    const [urlSearchLoading, setUrlSearchLoading] = useState<boolean>(false);
    const [urlSearchTotalMatches, setUrlSearchTotalMatches] = useState<number>(0);
    const [urlSearchTotalDbCount, setUrlSearchTotalDbCount] = useState<number>(0);
    const [urlSearchSpeedMs, setUrlSearchSpeedMs] = useState<number | null>(null);
    const [hasSearchedUrls, setHasSearchedUrls] = useState<boolean>(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Performance / Speed Badge State
    const [dbSpeedMs, setDbSpeedMs] = useState<number | null>(null);

    // Unwrapped URL Search Handler
    const executeUrlSearch = useCallback(async (queryToUse?: string) => {
        const q = queryToUse !== undefined ? queryToUse : urlSearchQuery;
        setUrlSearchLoading(true);
        setHasSearchedUrls(true);
        try {
            const params = new URLSearchParams();
            if (q) params.set("query", q);
            params.set("limit", "500");
            params.set("_t", Date.now().toString());

            const res = await fetch(`/api/bec/urls/search?${params.toString()}`, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            setUrlSearchResults(data.urls || []);
            setUrlSearchTotalMatches(data.totalMatches || 0);
            setUrlSearchTotalDbCount(data.totalDatabaseUrls || 0);
            setUrlSearchSpeedMs(data.responseTimeMs || null);
        } catch (err: any) {
            console.error("URL Search Error:", err);
        } finally {
            setUrlSearchLoading(false);
        }
    }, [urlSearchQuery]);

    // CSV Exporter for Unwrapped URL Search Results
    const exportUrlSearchResultsToCsv = () => {
        if (!urlSearchResults || urlSearchResults.length === 0) return;
        const headers = ["Timestamp", "Domain (Target Host)", "Unwrapped Destination URL", "Message ID (MID)", "Recipient", "Sender", "Subject"];
        const rows = urlSearchResults.map(item => [
            new Date(item.createdAt).toISOString(),
            item.targetHost || "",
            `"${(item.destUrl || "").replace(/"/g, '""')}"`,
            item.mid || "",
            item.recipient || "",
            item.sender || "",
            `"${(item.subject || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `unwrapped_urls_search_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Query Execution from Local SQLite Database (Instant <5ms load)
    const fetchMasterBecData = useCallback(async (rangeToFetch: number = timeframe) => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/bec/stats?range=${rangeToFetch}&_t=${Date.now()}`, {
                cache: 'no-store',
                headers: {
                    'Pragma': 'no-cache',
                    'Cache-Control': 'no-cache'
                }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data.responseTimeMs !== undefined) {
                setDbSpeedMs(data.responseTimeMs);
            }
            
            if (data.becThreats && Array.isArray(data.becThreats)) {
                setMasterBecData(data.becThreats);
            } else {
                setMasterBecData([]);
            }
            if (data.topUnwrappedDomains && Array.isArray(data.topUnwrappedDomains)) {
                setMasterTopDomains(data.topUnwrappedDomains);
            } else {
                setMasterTopDomains([]);
            }
            if (data.thirdPartyOAuthLinks && Array.isArray(data.thirdPartyOAuthLinks)) {
                setMasterOauthLinks(data.thirdPartyOAuthLinks);
            } else {
                setMasterOauthLinks([]);
            }
            if (data.totalEvaluatedUrls !== undefined) {
                setMasterTotalUrls(data.totalEvaluatedUrls);
            }
            if (data.totalEvaluatedMessages !== undefined) {
                setMasterTotalMessages(data.totalEvaluatedMessages);
            }
        } catch (e: any) {
            console.error("BEC Stats Fetch Error:", e);
            setError(e.message || "Failed to load BEC Threat Intelligence dataset");
        } finally {
            setLoading(false);
        }
    }, [timeframe]);

    useEffect(() => {
        const saved = localStorage.getItem("pane_m365_auth_endpoints");
        if (saved) {
            try { setAuthEndpoints(JSON.parse(saved)); } catch (e) {}
        }
        fetchMasterBecData(3600);
    }, [fetchMasterBecData]);

    // Auto-refresh timer when autoRefreshInterval > 0
    useEffect(() => {
        if (autoRefreshInterval <= 0) return;
        const timer = setInterval(() => {
            fetchMasterBecData(timeframe);
        }, autoRefreshInterval * 1000);
        return () => clearInterval(timer);
    }, [autoRefreshInterval, timeframe, fetchMasterBecData]);

    // Active Dataset derived directly from API range query (no double filtering required)
    const activeBecData = useMemo(() => Array.isArray(masterBecData) ? masterBecData : [], [masterBecData]);
    const activeOauthLinks = useMemo(() => Array.isArray(masterOauthLinks) ? masterOauthLinks : [], [masterOauthLinks]);

    const handleSaveEndpoints = (updated: M365AuthEndpoint[]) => {
        setAuthEndpoints(updated);
        localStorage.setItem("pane_m365_auth_endpoints", JSON.stringify(updated));
    };

    const handleAddEndpoint = () => {
        if (!newUrl) return;
        const formattedUrl = newUrl.startsWith("http") ? newUrl : `https://${newUrl}`;
        const updated = [...authEndpoints, { url: formattedUrl, role: newRole || "Custom Authentication Endpoint" }];
        handleSaveEndpoints(updated);
        setNewUrl("");
        setNewRole("");
    };

    const handleDeleteEndpoint = (urlToDelete: string) => {
        const updated = authEndpoints.filter(e => e.url !== urlToDelete);
        handleSaveEndpoints(updated);
    };

    const handleResetDefaults = () => {
        handleSaveEndpoints(OFFICIAL_M365_AUTH_ENDPOINTS);
    };

    // Filter BEC threats based on search query safely
    const filteredBecData = useMemo(() => {
        if (!Array.isArray(activeBecData)) return [];
        return activeBecData.filter(item => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return (
                (item.mid && item.mid.toLowerCase().includes(q)) ||
                (item.subject && item.subject.toLowerCase().includes(q)) ||
                (item.sender && item.sender.toLowerCase().includes(q)) ||
                (item.recipient && item.recipient.toLowerCase().includes(q)) ||
                (item.targetHost && item.targetHost.toLowerCase().includes(q)) ||
                (item.destUrl && item.destUrl.toLowerCase().includes(q)) ||
                (item.threatCategory && item.threatCategory.toLowerCase().includes(q))
            );
        });
    }, [activeBecData, searchQuery]);

    const fakePortalCount = useMemo(() => {
        if (!Array.isArray(activeBecData)) return 0;
        return activeBecData.filter(d => d.threatTier === "CRITICAL").length;
    }, [activeBecData]);

    const tokenTheftCount = useMemo(() => {
        if (!Array.isArray(activeBecData)) return 0;
        return activeBecData.filter(d => d.threatTier === "HIGH").length;
    }, [activeBecData]);

    const maxDomainCount = useMemo(() => {
        if (!Array.isArray(masterTopDomains) || masterTopDomains.length === 0) return 1;
        return Math.max(...masterTopDomains.map(d => d.count));
    }, [masterTopDomains]);

    // Modal Unique Targeted Recipients List
    const modalUniqueRecipients = useMemo(() => {
        if (!selectedProvider || !selectedProvider.items) return [];
        const rcptMap: Record<string, number> = {};
        selectedProvider.items.forEach(it => {
            const email = it.recipient && it.recipient.includes("@") && !it.recipient.startsWith("Not") && !it.recipient.startsWith("unknown") ? it.recipient : "Unknown Inbox";
            rcptMap[email] = (rcptMap[email] || 0) + 1;
        });
        return Object.entries(rcptMap)
            .map(([email, count]) => ({ email, count }))
            .sort((a, b) => b.count - a.count);
    }, [selectedProvider]);

    // Modal Filtered Items by Recipient & Search Text
    const filteredModalItems = useMemo(() => {
        if (!selectedProvider || !selectedProvider.items) return [];
        let list = selectedProvider.items;
        if (selectedModalRecipient) {
            list = list.filter(it => it.recipient === selectedModalRecipient);
        }
        if (modalSearch) {
            const q = modalSearch.toLowerCase();
            list = list.filter(it => 
                it.mid.toLowerCase().includes(q) ||
                (it.recipient && it.recipient.toLowerCase().includes(q)) ||
                (it.sender && it.sender.toLowerCase().includes(q)) ||
                (it.subject && it.subject.toLowerCase().includes(q)) ||
                (it.host && it.host.toLowerCase().includes(q))
            );
        }
        return list;
    }, [selectedProvider, selectedModalRecipient, modalSearch]);

    // Modal Deduplicated Groups by Unique Message MID
    const modalUniqueMidGroups = useMemo(() => {
        const groups: Record<string, {
            mid: string;
            urlCount: number;
            recipient?: string;
            sender?: string;
            subject?: string;
            host: string;
            destUrl: string;
            timestamp: string;
        }> = {};

        filteredModalItems.forEach(item => {
            const key = item.mid;
            if (!groups[key]) {
                groups[key] = {
                    mid: item.mid,
                    urlCount: 0,
                    recipient: item.recipient,
                    sender: item.sender,
                    subject: item.subject,
                    host: item.host,
                    destUrl: item.destUrl,
                    timestamp: item.timestamp
                };
            }
            groups[key].urlCount += 1;
            if (!groups[key].recipient && item.recipient) groups[key].recipient = item.recipient;
            if (!groups[key].sender && item.sender) groups[key].sender = item.sender;
            if (!groups[key].subject && item.subject) groups[key].subject = item.subject;
        });

        return Object.values(groups);
    }, [filteredModalItems]);

    return (
        <div className="flex flex-col gap-6">
            {/* 24x7 Daemon Health & Alert Target Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-[var(--text-primary)]">24x7 BEC Threat Monitor Daemon</h3>
                            <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                ACTIVE (60s Cycle)
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                            Continuous server-side background ingestion | Instant Alert Target: <strong className="text-blue-400 font-mono font-semibold">Designated Security Admins</strong>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        onClick={() => setShowEndpointModal(true)}
                        className="px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] flex items-center gap-2 transition-colors"
                    >
                        <Settings className="w-4 h-4 text-amber-400" />
                        <span>Official Auth Registry ({authEndpoints.length})</span>
                    </button>

                    {/* Instant In-Memory Timeframe Filter Controls */}
                    <div className="flex items-center bg-[var(--bg-default)] p-1 rounded-lg border border-[var(--border-color)] text-xs sm:text-sm overflow-x-auto custom-scrollbar">
                        {[
                            { label: "10m", value: 600 },
                            { label: "30m", value: 1800 },
                            { label: "1h", value: 3600 },
                            { label: "4h", value: 14400 },
                            { label: "12h", value: 43200 },
                            { label: "24h", value: 86400 },
                            { label: "7d", value: 604800 },
                            { label: "30d", value: 2592000 },
                            { label: "All", value: 0 }
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => {
                                    setTimeframe(t.value);
                                    fetchMasterBecData(t.value);
                                }}
                                className={`px-3 py-1.5 rounded-md transition-colors font-semibold whitespace-nowrap text-xs sm:text-sm ${
                                    timeframe === t.value 
                                        ? "bg-blue-600 text-white font-bold shadow-xs" 
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <select
                            value={autoRefreshInterval}
                            onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value, 10))}
                            className="px-3 py-2 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] font-semibold focus:outline-none focus:border-blue-500"
                            title="Auto-refresh interval"
                        >
                            <option value={0}>Auto: OFF</option>
                            <option value={60}>Auto: 60s</option>
                            <option value={300}>Auto: 5m</option>
                        </select>

                        {dbSpeedMs !== null && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-semibold" title="Instant SQLite local DB response time">
                                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                <span>{dbSpeedMs}ms</span>
                            </div>
                        )}

                        <button
                            onClick={() => fetchMasterBecData(timeframe)}
                            disabled={loading}
                            className="p-2.5 rounded-lg bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] transition-colors disabled:opacity-50"
                            title="Re-query Local DB"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
                        </button>
                    </div>
                </div>
            {/* BEC Sub-Tool Navigation Bar */}
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3 gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab("incidents")}
                        className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                            activeTab === "incidents"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
                        }`}
                    >
                        <ShieldAlert className="w-4 h-4" />
                        <span>BEC Threat Incidents & Impersonation</span>
                    </button>

                    <button
                        onClick={() => {
                            setActiveTab("url_search");
                            if (!hasSearchedUrls) executeUrlSearch();
                        }}
                        className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer ${
                            activeTab === "url_search"
                                ? "bg-blue-600 text-white shadow-xs"
                                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
                        }`}
                    >
                        <Globe className="w-4 h-4 text-emerald-400" />
                        <span>Unwrapped URL & Domain Finder</span>
                    </button>
                </div>
            </div>

            {activeTab === "url_search" ? (
                <div className="flex flex-col gap-6">
                    {/* Search Control Box */}
                    <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col gap-4 shadow-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                                    <Search className="w-5 h-5 text-emerald-400" />
                                    <span>Unwrapped URL & Domain Deep Search</span>
                                </h3>
                                <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
                                    Search across <strong className="text-[var(--text-primary)] font-mono">{urlSearchTotalDbCount.toLocaleString()}</strong> historical unwrapped destination URLs by domain name, full URL, Message ID (MID), or recipient inbox.
                                </p>
                            </div>

                            {urlSearchResults.length > 0 && (
                                <button
                                    onClick={exportUrlSearchResultsToCsv}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors shrink-0 cursor-pointer shadow-xs"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    <span>Export CSV ({urlSearchResults.length})</span>
                                </button>
                            )}
                        </div>

                        {/* Search Input Bar & Wildcard Presets */}
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <div className="relative flex-1">
                                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                                    <input
                                        type="text"
                                        placeholder="Search domain (e.g. *.claims, *.zip, ticketsatwork.com), full URL, MID, or recipient..."
                                        value={urlSearchQuery}
                                        onChange={(e) => setUrlSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && executeUrlSearch()}
                                        className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-mono transition-colors"
                                    />
                                    {urlSearchQuery && (
                                        <button
                                            onClick={() => { setUrlSearchQuery(""); executeUrlSearch(""); }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                <button
                                    onClick={() => executeUrlSearch()}
                                    disabled={urlSearchLoading}
                                    className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                                >
                                    {urlSearchLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                    <span>Search URLs</span>
                                </button>
                            </div>

                            {/* Wildcard & TLD Quick Presets */}
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="text-[var(--text-secondary)] font-semibold flex items-center gap-1">
                                    <Filter className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Wildcard Presets:</span>
                                </span>
                                {[
                                    { label: "*.claims", value: "*.claims" },
                                    { label: "*.zip", value: "*.zip" },
                                    { label: "*.top", value: "*.top" },
                                    { label: "*.xyz", value: "*.xyz" },
                                    { label: "*.ru", value: "*.ru" },
                                    { label: "*.email.*", value: "*.email.*" }
                                ].map(p => (
                                    <button
                                        key={p.value}
                                        onClick={() => {
                                            setUrlSearchQuery(p.value);
                                            executeUrlSearch(p.value);
                                        }}
                                        className="px-2.5 py-1 rounded-md bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-blue-400 border border-blue-500/20 font-mono font-bold transition-colors cursor-pointer"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Results Summary Metadata Bar */}
                        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-mono border-t border-[var(--border-color)] pt-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span>
                                    Matches: <strong className="text-[var(--text-primary)] font-bold">{urlSearchTotalMatches.toLocaleString()}</strong> {urlSearchTotalMatches > 500 && `(Displaying top 500)`}
                                </span>
                            </div>

                            {urlSearchSpeedMs !== null && (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                    <Zap className="w-3.5 h-3.5" />
                                    <span>Query executed in {urlSearchSpeedMs}ms</span>
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                                        <th className="p-3">Timestamp</th>
                                        <th className="p-3">Domain (Target Host)</th>
                                        <th className="p-3">Domain Age / NOD Risk</th>
                                        <th className="p-3">Unwrapped Destination URL</th>
                                        <th className="p-3">Message ID (MID)</th>
                                        <th className="p-3">Recipient</th>
                                        <th className="p-3">Sender / Subject</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)] text-xs">
                                    {urlSearchLoading ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                                Querying 500,000+ unwrapped URLs in PostgreSQL database...
                                            </td>
                                        </tr>
                                    ) : urlSearchResults.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="p-8 text-center text-sm text-[var(--text-secondary)]">
                                                {hasSearchedUrls ? "No unwrapped URLs match your search query." : "Enter a domain (e.g. *.claims), URL substring, MID, or recipient email to search."}
                                            </td>
                                        </tr>
                                    ) : (
                                        urlSearchResults.map((item) => (
                                            <tr key={item.id} className="hover:bg-[var(--bg-default)]/60 transition-colors">
                                                <td className="p-3 text-[var(--text-secondary)] font-mono whitespace-nowrap">
                                                    {new Date(item.createdAt).toLocaleString()}
                                                </td>

                                                {/* Domain / Target Host */}
                                                <td className="p-3 font-mono font-bold text-[var(--text-primary)] whitespace-nowrap">
                                                    <span 
                                                        onClick={() => { setUrlSearchQuery(item.targetHost); executeUrlSearch(item.targetHost); }}
                                                        className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 cursor-pointer transition-colors"
                                                        title="Click to filter search by this domain"
                                                    >
                                                        {item.targetHost}
                                                    </span>
                                                </td>

                                                {/* Domain Age / NOD & Frequency Risk Status */}
                                                <td className="p-3 font-mono whitespace-nowrap">
                                                    <div className="flex flex-col gap-1 items-start">
                                                        {item.isNewlyObserved24h ? (
                                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20" title="First unwrapped in your emails in the last 24 hours">
                                                                🆕 FIRST SEEN &lt;24H
                                                            </span>
                                                        ) : item.isNewlyObserved7d ? (
                                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20" title="First unwrapped in your emails in the last 7 days">
                                                                ⚠️ FIRST SEEN &lt;7D
                                                            </span>
                                                        ) : item.isRareLowFrequency ? (
                                                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Established domain (>30d), BUT only seen 3 times or fewer across 500,000 unwrapped URLs! High potential anomaly/phish.">
                                                                🚨 RARE (Seen {item.totalSeenCount}x)
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-[var(--bg-default)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                                                                Established ({item.ageDays || 0}d)
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                                                            Seen {item.totalSeenCount ? item.totalSeenCount.toLocaleString() : 1}x total
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Unwrapped Destination URL */}
                                                <td className="p-3 font-mono max-w-[340px]">
                                                    <div className="flex items-center gap-1.5 group">
                                                        <a
                                                            href={item.destUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-400 hover:underline truncate group-hover:text-blue-300 font-medium"
                                                            title={item.destUrl}
                                                        >
                                                            {item.destUrl}
                                                        </a>
                                                        <a
                                                            href={item.destUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-[var(--text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                                            title="Open URL in new tab"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    </div>
                                                </td>

                                                {/* MID */}
                                                <td className="p-3 font-mono text-[var(--text-primary)] whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="px-2 py-0.5 rounded bg-[var(--bg-default)] border border-[var(--border-color)] font-bold text-[11px]">
                                                            MID: {item.mid}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Recipient */}
                                                <td className="p-3 font-semibold text-[var(--text-primary)] max-w-[180px] truncate font-mono">
                                                    {item.recipient && item.recipient !== "unknown" ? (
                                                        <span className="text-emerald-400">{item.recipient}</span>
                                                    ) : (
                                                        <span className="text-[var(--text-muted)] font-normal italic">unknown</span>
                                                    )}
                                                </td>

                                                {/* Sender & Subject */}
                                                <td className="p-3 max-w-[220px]">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="font-semibold text-[var(--text-primary)] truncate" title={item.subject || "No Subject"}>
                                                            {item.subject || "No Subject"}
                                                        </div>
                                                        <div className="text-[11px] text-[var(--text-secondary)] font-mono truncate" title={item.sender}>
                                                            From: {item.sender || "unknown"}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">Total Unwrapped URLs Evaluated</span>
                        <Globe className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-3xl font-black text-[var(--text-primary)]">{masterTotalUrls.toLocaleString()}</span>
                        <span className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)]">{masterTotalMessages.toLocaleString()} unique msgs</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-red-500/20 bg-red-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-bold text-red-400 uppercase tracking-wider">Fake M365 Portals</span>
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-3xl font-black text-red-400">{fakePortalCount}</span>
                        <span className="text-xs font-mono font-semibold text-red-400/80">+10.0 Priority Boost</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider">OAuth Token Theft Links</span>
                        <Bell className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-3xl font-black text-amber-400">{tokenTheftCount}</span>
                        <span className="text-xs font-mono font-semibold text-amber-400/80">+6.0 Priority Boost</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-indigo-500/20 bg-indigo-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs sm:text-sm font-bold text-indigo-400 uppercase tracking-wider">Non-MS Identity Providers</span>
                        <Key className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-3xl font-black text-indigo-400">{activeOauthLinks.length}</span>
                        <span className="text-xs sm:text-sm font-semibold text-indigo-400/80">3rd-Party SSO</span>
                    </div>
                </div>
            </div>

            {/* Split Visual Telemetry Grid: Top Unwrapped Hostnames + Non-MS OAuth Discoveries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Panel A: Top Unwrapped Destination Domains */}
                <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-color)]">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-blue-400" />
                                <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                    Top Unwrapped Destination Domains (Top 15)
                                </h4>
                            </div>
                            <span className="text-xs text-[var(--text-secondary)] font-medium">Click to filter table</span>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-sm font-medium text-[var(--text-secondary)]">
                                Aggregating unwrapped hostnames...
                            </div>
                        ) : masterTopDomains.length === 0 ? (
                            <div className="py-12 text-center text-sm font-medium text-[var(--text-secondary)]">
                                No unwrapped destination domains found in selected timeframe.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                                {masterTopDomains.map((d, idx) => {
                                    const fillPercent = Math.max(8, (d.count / maxDomainCount) * 100);
                                    return (
                                        <button
                                            key={d.domain}
                                            onClick={() => {
                                                setUrlSearchQuery(d.domain);
                                                setActiveTab("url_search");
                                                executeUrlSearch(d.domain);
                                            }}
                                            className="group flex flex-col gap-1 text-left w-full hover:bg-[var(--bg-default)] p-2 rounded-lg transition-colors"
                                        >
                                            <div className="flex items-center justify-between text-xs sm:text-sm font-mono">
                                                <span className="font-bold text-[var(--text-primary)] group-hover:text-blue-400 truncate max-w-[280px]">
                                                    #{idx + 1} {d.domain}
                                                </span>
                                                <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                                                    <span className="font-bold text-[var(--text-primary)] text-sm">{d.count}</span>
                                                    <span className="text-xs font-semibold">({d.percentage})</span>
                                                </div>
                                            </div>
                                            <div className="w-full bg-[var(--bg-default)] rounded-full h-2 overflow-hidden">
                                                <div 
                                                    className="bg-blue-500 h-2 rounded-full group-hover:bg-blue-400 transition-all duration-300"
                                                    style={{ width: `${fillPercent}%` }}
                                                />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Panel B: Non-Microsoft Third-Party OAuth & Identity Discoveries */}
                <div className="p-5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--border-color)]">
                            <div className="flex items-center gap-2">
                                <Key className="w-5 h-5 text-indigo-400" />
                                <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                                    Non-Microsoft Third-Party OAuth / SSO Discoveries ({activeOauthLinks.length})
                                </h4>
                            </div>
                            <span className="text-xs text-[var(--text-secondary)] font-medium">Click card to drill down</span>
                        </div>

                        {loading ? (
                            <div className="py-12 text-center text-sm font-medium text-[var(--text-secondary)]">
                                Aggregating third-party identity providers...
                            </div>
                        ) : activeOauthLinks.length === 0 ? (
                            <div className="py-12 text-center text-sm font-medium text-[var(--text-secondary)]">
                                No non-Microsoft OAuth or SSO links detected in selected timeframe.
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto custom-scrollbar pr-1">
                                {activeOauthLinks.map((item, idx) => (
                                    <div
                                        key={`${item.provider}-${idx}`}
                                        className="p-4 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] flex flex-col gap-3 text-xs sm:text-sm shadow-2xs hover:border-indigo-500/40 transition-colors"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="px-3 py-1 rounded text-xs sm:text-sm font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                                                    {item.provider}
                                                </span>
                                                <span className="text-xs sm:text-sm font-semibold text-[var(--text-secondary)]">
                                                    {item.uniqueRecipientsCount} Employee Inboxes
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 font-mono font-bold text-[var(--text-primary)] text-sm">
                                                <span>{item.count} Links</span>
                                                <span className="text-xs font-medium text-[var(--text-secondary)]">({item.percentage})</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]/50">
                                            <div className="flex items-center gap-1.5 flex-wrap max-w-[70%]">
                                                {(item.topHosts || item.sampleLinks || []).map((h, hIdx) => (
                                                    <span key={hIdx} className="px-2.5 py-1 rounded bg-[var(--bg-surface)] text-[var(--text-primary)] font-mono text-xs border border-[var(--border-color)] truncate max-w-[180px]">
                                                        {h}
                                                    </span>
                                                ))}
                                            </div>

                                            <button
                                                onClick={() => setSelectedProvider(item)}
                                                className="px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
                                            >
                                                <span>Drill Down</span>
                                                <ArrowUpRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                    <input
                        type="text"
                        placeholder="Search by MID, Subject, Sender, Target Recipient, Target Host, or Threat Category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-sm sm:text-base text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1"
                            title="Clear search filter"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery("")}
                        className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors"
                    >
                        <Filter className="w-3.5 h-3.5" />
                        <span>Filter: "{searchQuery}" (Clear)</span>
                    </button>
                )}
            </div>

            {/* BEC Threat Table */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-default)] flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <ShieldAlert className="w-5 h-5 text-amber-400" />
                        <h4 className="text-xs sm:text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            M365 BEC Threat Hunting Feed ({filteredBecData.length})
                        </h4>
                    </div>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                        Showing authentication endpoints & impersonated portals
                    </span>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-base font-semibold text-[var(--text-secondary)]">
                        Evaluating M365 Authentication Endpoints...
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-base font-semibold text-red-400">
                        {error}
                    </div>
                ) : filteredBecData.length === 0 ? (
                    <div className="p-12 text-center text-sm sm:text-base font-medium text-[var(--text-secondary)]">
                        No M365 BEC or OAuth threat vectors detected in selected timeframe.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-xs">
                                    <th className="py-3.5 px-4">Delivery Time</th>
                                    <th className="py-3.5 px-4">Message MID</th>
                                    <th className="py-3.5 px-4">Subject Line</th>
                                    <th className="py-3.5 px-4">Sender ➔ Target Recipient</th>
                                    <th className="py-3.5 px-4">Target Host & Unwrapped URL</th>
                                    <th className="py-3.5 px-4">Threat Category</th>
                                    <th className="py-3.5 px-4 text-center">Priority Boost</th>
                                    <th className="py-3.5 px-4 text-right">Triage Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {filteredBecData.map((item, idx) => (
                                    <tr key={`${item.mid}-${idx}`} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                        <td className="py-3.5 px-4 text-[var(--text-secondary)] font-mono whitespace-nowrap text-xs sm:text-sm">
                                            {item.timestamp ? new Date(item.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                                        </td>
                                        <td className="py-3.5 px-4 font-mono font-bold text-blue-400 whitespace-nowrap text-sm">
                                            MID {item.mid}
                                        </td>
                                        <td className="py-3.5 px-4 max-w-[240px] truncate text-[var(--text-primary)] font-semibold text-sm" title={item.subject || "No Subject"}>
                                            {item.subject || "No Subject Header"}
                                        </td>
                                        <td className="py-3.5 px-4 max-w-[240px] truncate">
                                            <div className="text-blue-400 font-mono text-xs font-semibold" title={item.sender}>
                                                FROM: {item.sender || "unknown"}
                                            </div>
                                            <div className="text-indigo-400 font-mono text-xs font-semibold" title={item.recipient}>
                                                TO: {item.recipient || "unknown"}
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 max-w-[280px] truncate">
                                            <div className="font-mono font-bold text-amber-400 text-xs sm:text-sm" title={item.targetHost}>
                                                {item.targetHost}
                                            </div>
                                            <div className="font-mono text-xs text-[var(--text-secondary)] truncate" title={item.destUrl}>
                                                {item.destUrl}
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                                                item.threatTier === "CRITICAL"
                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            }`}>
                                                {item.threatCategory}
                                            </span>
                                        </td>
                                        <td className="py-3.5 px-4 text-center font-mono font-bold text-amber-400 text-sm">
                                            +{item.impersonationBoost.toFixed(1)}
                                        </td>
                                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                            <a
                                                href={`/queries/ironport?query=esa_mid:${item.mid}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-3 py-1.5 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors"
                                            >
                                                <span>Trace MID</span>
                                                <ExternalLink className="w-4 h-4" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            )}

            {/* Panel B Provider Drill-Down Modal */}
            {selectedProvider && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-5xl w-full p-6 shadow-2xl flex flex-col max-h-[88vh]">
                        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
                            <div className="flex items-center gap-3">
                                <Key className="w-6 h-6 text-indigo-400" />
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
                                        <span>Third-Party Identity Provider Drill-Down:</span>
                                        <span className="text-indigo-400 font-mono px-2.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-base sm:text-lg">{selectedProvider.provider}</span>
                                    </h3>
                                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1 font-medium">
                                        Targeting <strong className="text-indigo-400 font-mono text-sm">{selectedProvider.uniqueRecipientsCount} Employee Inboxes</strong> across <strong className="text-amber-400 font-mono text-sm">{selectedProvider.count} Auth Links</strong>
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => { setSelectedProvider(null); setSelectedModalRecipient(null); setModalSearch(""); }} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-default)]">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Interactive Employee Inbox Filter Chips */}
                        <div className="py-3.5 border-b border-[var(--border-color)] flex flex-col gap-2.5 bg-[var(--bg-default)]/50 -mx-6 px-6">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-indigo-400" />
                                    <span>Targeted Employee Inboxes ({modalUniqueRecipients.length}):</span>
                                </span>
                                {selectedModalRecipient && (
                                    <button 
                                        onClick={() => setSelectedModalRecipient(null)}
                                        className="text-xs sm:text-sm font-bold text-blue-400 hover:underline"
                                    >
                                        Show All Inboxes ({modalUniqueRecipients.length})
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap max-h-28 overflow-y-auto custom-scrollbar pr-1">
                                <button
                                    onClick={() => setSelectedModalRecipient(null)}
                                    className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-mono font-bold transition-colors ${
                                        selectedModalRecipient === null 
                                            ? "bg-indigo-600 text-white shadow-xs" 
                                            : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-color)]"
                                    }`}
                                >
                                    All Inboxes ({selectedProvider.items.length})
                                </button>
                                {modalUniqueRecipients.map((rcpt) => (
                                    <button
                                        key={rcpt.email}
                                        onClick={() => setSelectedModalRecipient(selectedModalRecipient === rcpt.email ? null : rcpt.email)}
                                        className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-mono transition-colors flex items-center gap-2 ${
                                            selectedModalRecipient === rcpt.email
                                                ? "bg-indigo-600 text-white font-bold shadow-xs"
                                                : "bg-[var(--bg-surface)] text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/20"
                                        }`}
                                    >
                                        <span className="font-semibold">{rcpt.email}</span>
                                        <span className="px-2 py-0.5 text-xs rounded bg-black/30 font-bold">{rcpt.count}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Search Filter input for MIDs, Subjects, Recipients */}
                        <div className="pt-3.5 pb-2 flex items-center gap-3">
                            <div className="relative flex-1">
                                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                                <input 
                                    type="text"
                                    placeholder="Filter modal by MID, Subject, Recipient, Sender, or Host..."
                                    value={modalSearch}
                                    onChange={(e) => setModalSearch(e.target.value)}
                                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-indigo-500 font-medium"
                                />
                                {modalSearch && (
                                    <button onClick={() => setModalSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                                        ×
                                    </button>
                                )}
                            </div>
                            <span className="text-xs sm:text-sm text-[var(--text-secondary)] font-mono font-semibold whitespace-nowrap">
                                Showing {modalUniqueMidGroups.length} Unique MIDs
                            </span>
                        </div>

                        {/* Detailed Targeted Inbox List Table (Deduplicated by Unique MID) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar my-2 pr-1">
                            <table className="w-full text-left text-xs sm:text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-xs sticky top-0 bg-[var(--bg-surface)] z-10">
                                        <th className="py-3 px-3.5">Delivery Time</th>
                                        <th className="py-3 px-3.5">Unique Message MID</th>
                                        <th className="py-3 px-3.5">Subject Line</th>
                                        <th className="py-3 px-3.5">Target Employee Inbox (Recipient)</th>
                                        <th className="py-3 px-3.5">Sender Email</th>
                                        <th className="py-3 px-3.5">Destination Host & URL</th>
                                        <th className="py-3 px-3.5 text-center">Instances</th>
                                        <th className="py-3 px-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {modalUniqueMidGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-8 text-center text-sm font-medium text-[var(--text-secondary)]">
                                                No matching unique message MIDs found for selected inbox filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        modalUniqueMidGroups.map((item) => (
                                            <tr key={item.mid} className="hover:bg-[var(--bg-default)] transition-colors">
                                                <td className="py-3 px-3.5 font-mono text-[var(--text-secondary)] whitespace-nowrap text-xs sm:text-sm">
                                                    {item.timestamp ? new Date(item.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                                                </td>
                                                <td className="py-3 px-3.5 font-mono font-bold text-blue-400 whitespace-nowrap text-sm">
                                                    MID {item.mid}
                                                </td>
                                                <td className="py-3 px-3.5 max-w-[200px] truncate text-[var(--text-primary)] font-semibold text-sm" title={item.subject || "No Subject Header"}>
                                                    {item.subject || "No Subject Header"}
                                                </td>
                                                <td className="py-3 px-3.5 font-mono font-bold text-indigo-400 max-w-[200px] truncate text-xs sm:text-sm" title={item.recipient || "unknown"}>
                                                    <button 
                                                        onClick={() => item.recipient && setSelectedModalRecipient(item.recipient)}
                                                        className="hover:underline text-left cursor-pointer"
                                                        title="Click to filter by this employee inbox"
                                                    >
                                                        {item.recipient || "unknown"}
                                                    </button>
                                                </td>
                                                <td className="py-3 px-3.5 font-mono text-[var(--text-secondary)] max-w-[180px] truncate text-xs sm:text-sm font-medium" title={item.sender || "unknown"}>
                                                    {item.sender || "unknown"}
                                                </td>
                                                <td className="py-3 px-3.5 max-w-[220px] truncate">
                                                    <div className="font-mono font-bold text-amber-400 text-xs sm:text-sm" title={item.host}>
                                                        {item.host}
                                                    </div>
                                                    <div className="font-mono text-xs text-[var(--text-secondary)] truncate" title={item.destUrl}>
                                                        {item.destUrl}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                                                    <span className="px-2.5 py-1 rounded text-xs font-bold font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        {item.urlCount} {item.urlCount === 1 ? "link" : "links"}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-3.5 text-right whitespace-nowrap">
                                                    <a
                                                        href={`/queries/ironport?query=esa_mid:${item.mid}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="px-3 py-1.5 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 font-bold text-xs sm:text-sm inline-flex items-center gap-1.5 transition-colors"
                                                    >
                                                        <span>Trace MID</span>
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="pt-3.5 border-t border-[var(--border-color)] flex items-center justify-between">
                            <span className="text-xs sm:text-sm text-[var(--text-secondary)] font-mono font-semibold">
                                Total: {modalUniqueMidGroups.length} Unique Messages ({filteredModalItems.length} Link Occurrences)
                            </span>
                            <button
                                onClick={() => { setSelectedProvider(null); setSelectedModalRecipient(null); setModalSearch(""); }}
                                className="px-5 py-2.5 bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl font-bold text-xs sm:text-sm transition-colors cursor-pointer"
                            >
                                Close Drill-Down
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Official Auth Endpoints Registry Modal */}
            {showEndpointModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
                            <div className="flex items-center gap-3">
                                <Settings className="w-6 h-6 text-amber-400" />
                                <div>
                                    <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)]">Official M365 Authentication Endpoint Registry</h3>
                                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] font-medium">Authoritative list of legitimate Entra ID, SSPR, and OAuth endpoints</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEndpointModal(false)} className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-default)]">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Endpoint List Table */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1">
                            <table className="w-full text-left text-xs sm:text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-xs">
                                        <th className="py-3 px-3.5">Official Endpoint URL</th>
                                        <th className="py-3 px-3.5">IdP / OAuth Role</th>
                                        <th className="py-3 px-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {authEndpoints.map((ep, idx) => (
                                        <tr key={`${ep.url}-${idx}`} className="hover:bg-[var(--bg-default)] transition-colors">
                                            <td className="py-3 px-3.5 font-mono text-blue-400 font-bold text-xs sm:text-sm">{ep.url}</td>
                                            <td className="py-3 px-3.5 text-[var(--text-primary)] font-semibold text-xs sm:text-sm">{ep.role}</td>
                                            <td className="py-3 px-3.5 text-right">
                                                <button
                                                    onClick={() => handleDeleteEndpoint(ep.url)}
                                                    className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                                    title="Remove Endpoint"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Add New Endpoint Inputs */}
                        <div className="pt-4 border-t border-[var(--border-color)] flex flex-col gap-3">
                            <span className="text-xs sm:text-sm font-bold text-[var(--text-primary)]">Add Custom Official Auth Endpoint</span>
                            <div className="flex items-center gap-2.5">
                                <input
                                    type="text"
                                    placeholder="https://adfs.cooperhealth.edu/adfs/ls"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-medium"
                                />
                                <input
                                    type="text"
                                    placeholder="Custom ADFS Endpoint"
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                    className="w-1/3 px-3.5 py-2.5 rounded-xl bg-[var(--bg-default)] border border-[var(--border-color)] text-xs sm:text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 font-medium"
                                />
                                <button
                                    onClick={handleAddEndpoint}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span>Add</span>
                                </button>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={handleResetDefaults}
                                    className="text-xs sm:text-sm text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 cursor-pointer"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    <span>Reset 14 Official Defaults</span>
                                </button>

                                <button
                                    onClick={() => setShowEndpointModal(false)}
                                    className="px-5 py-2.5 bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl font-bold text-xs sm:text-sm cursor-pointer"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
