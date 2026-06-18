"use client";

import { useState, useEffect } from "react";
import { 
    Search, Wifi, ShieldAlert, AlertCircle, CheckCircle, 
    ArrowUpRight, ArrowDownLeft, Clock, Database, Globe, User 
} from "lucide-react";

export default function VpnTroubleshootingPage() {
    const [searchQuery, setSearchQuery] = useState("");
    const [searching, setSearching] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<any>(null);
    const [syncNotification, setSyncNotification] = useState<string | null>(null);
    const [syncRange, setSyncRange] = useState<number>(2100);
    const [syncStatus, setSyncStatus] = useState("Syncing...");

    const [activeTab, setActiveTab] = useState<"feed" | "security" | "bandwidth">("feed");
    const [sortKey, setSortKey] = useState<string>("createdAt");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
    const [bandwidthScope, setBandwidthScope] = useState<string>("last30days");
    const [securityScope, setSecurityScope] = useState<string>("last24hours");
    const [feedSubTab, setFeedSubTab] = useState<"all" | "success" | "failure">("all");
    const [displayRows, setDisplayRows] = useState<number>(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("vpn_display_rows");
            if (saved) {
                const parsed = parseInt(saved, 10);
                if ([25, 50, 100, 200].includes(parsed)) return parsed;
            }
        }
        return 25;
    });

    const handleDisplayRowsChange = (val: number) => {
        setDisplayRows(val);
        localStorage.setItem("vpn_display_rows", val.toString());
    };

    const [topFailedUsernames, setTopFailedUsernames] = useState<any[]>([]);
    const [topFailedValidUsernames, setTopFailedValidUsernames] = useState<any[]>([]);

    const [successfulIps, setSuccessfulIps] = useState<any[]>([]);
    const [failedIps, setFailedIps] = useState<any[]>([]);
    const [topUploadEvents, setTopUploadEvents] = useState<any[]>([]);
    const [topDownloadEvents, setTopDownloadEvents] = useState<any[]>([]);
    const [recentEvents, setRecentEvents] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    
    // Active Directory user enrichment maps
    const [adUsers, setAdUsers] = useState<Record<string, any>>({});
    const [hoveredUser, setHoveredUser] = useState<string | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });

    const fetchDashboardData = async () => {
        try {
            setError("");
            const res = await fetch(`/api/vpn/events?bandwidthScope=${bandwidthScope}&securityScope=${securityScope}`);
            if (!res.ok) throw new Error("Failed to load VPN events");
            const data = await res.json();
            setSuccessfulIps(data.successfulIps || []);
            setFailedIps(data.failedIps || []);
            setTopUploadEvents(data.topUploadEvents || []);
            setTopDownloadEvents(data.topDownloadEvents || []);
            setTopFailedUsernames(data.topFailedUsernames || []);
            setTopFailedValidUsernames(data.topFailedValidUsernames || []);
            setRecentEvents(data.recentEvents || []);
            setLastSync(data.lastSync || null);
            if (data.adUsers) {
                setAdUsers(prev => ({ ...prev, ...data.adUsers }));
            }
        } catch (err: any) {
            setError(err.message || "An error occurred while loading dashboard data.");
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async () => {
        setSyncing(true);
        setError("");
        setSyncNotification(null);
        setSyncStatus("Initializing connection to Graylog...");

        const statuses = [
            "Contacting Graylog SIEM API...",
            "Retrieving AnyConnect connection logs...",
            "Parsing client IP leases & authentication codes...",
            "Enriching geolocation & AS intelligence...",
            "Correlating active session logs in SQLite DB...",
            "Updating dashboard metrics..."
        ];
        let currentIdx = 0;
        const intervalId = setInterval(() => {
            if (currentIdx < statuses.length) {
                setSyncStatus(statuses[currentIdx]);
                currentIdx++;
            }
        }, 2200);

        try {
            const res = await fetch("/api/vpn/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ range: syncRange })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Sync request failed");
            }
            const data = await res.json();
            const count = data.syncedCount ?? 0;
            
            const minutes = Math.round(syncRange / 60);
            const rangeStr = minutes >= 1440 
                ? `${Math.round(minutes / 1440)} day(s)` 
                : minutes >= 60 
                ? `${Math.round(minutes / 60)} hour(s)` 
                : `${minutes} minute(s)`;
            setSyncNotification(`Sync complete! Retransmitted/synced ${count} event${count === 1 ? "" : "s"} from the last ${rangeStr}.`);
            
            // Auto-clear notification after 5 seconds
            setTimeout(() => {
                setSyncNotification(null);
            }, 5000);

            await fetchDashboardData();
        } catch (err: any) {
            setError(err.message || "Failed to trigger log sync.");
        } finally {
            clearInterval(intervalId);
            setSyncing(false);
            setSyncRange(2100); // Reset UI selector back to 35 minutes default
        }
    };

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }

        setSearching(true);
        try {
            setError("");
            const res = await fetch(`/api/vpn/events?q=${encodeURIComponent(searchQuery)}`);
            if (!res.ok) throw new Error("Search request failed");
            const data = await res.json();
            setSearchResults(data.results || []);
            if (data.adUsers) {
                setAdUsers(prev => ({ ...prev, ...data.adUsers }));
            }
        } catch (err: any) {
            setError(err.message || "An error occurred during search.");
        } finally {
            setSearching(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
    }, [bandwidthScope, securityScope]);

    const isNonUs = (evt: any) => {
        return evt?.ipCountryCode && evt.ipCountryCode.toUpperCase() !== "US";
    };

    const requestSort = (key: string) => {
        let direction: "asc" | "desc" = "asc";
        if (sortKey === key && sortOrder === "asc") {
            direction = "desc";
        }
        setSortKey(key);
        setSortOrder(direction);
    };

    const getFilteredEvents = (events: any[] | null) => {
        if (!events) return [];
        if (feedSubTab === "success") {
            return events.filter(evt => evt.status === "SUCCESS" || evt.status === "DISCONNECT");
        }
        if (feedSubTab === "failure") {
            return events.filter(evt => evt.status === "FAILURE");
        }
        return events;
    };

    const getSortedData = (dataList: any[]) => {
        if (!sortKey) return dataList;
        return [...dataList].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];

            // Normalize timestamp / date sorting
            if (sortKey === "createdAt") {
                valA = new Date(valA).getTime();
                valB = new Date(valB).getTime();
            }

            // Fallback for missing/null values
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;

            if (typeof valA === "string") {
                return sortOrder === "asc" 
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA);
            } else {
                return sortOrder === "asc"
                    ? (valA > valB ? 1 : -1)
                    : (valB > valA ? 1 : -1);
            }
        });
    };

    // Format functions
    const formatBytes = (bytes: number | null): string => {
        if (bytes === null || bytes === undefined) return "N/A";
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const formatDuration = (seconds: number | null): string => {
        if (seconds === null || seconds === undefined) return "N/A";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [
            h > 0 ? `${h}h` : "",
            m > 0 ? `${m}m` : "",
            `${s}s`
        ].filter(Boolean).join(" ");
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        });
    };

    const formatSessionTimes = (evt: any) => {
        if (!evt.createdAt || !evt.duration) return "No duration data";
        const stop = new Date(evt.createdAt);
        const start = new Date(stop.getTime() - (evt.duration * 1000));
        
        const formatTime = (d: Date) => {
            return d.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
        };
        
        return `${formatTime(start)} to ${formatTime(stop)}`;
    };

    const handleMouseEnter = (e: React.MouseEvent, username: string) => {
        const userAd = adUsers[username];
        if (!userAd) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        
        // Position it above the hovered element (approx height 140px, width 260px)
        let top = rect.top - 145;
        let left = rect.left + (rect.width / 2) - 130;
        
        // Bounds checking
        if (top < 10) {
            // Not enough space at the top, position it below
            top = rect.bottom + 10;
        }
        if (left < 10) {
            left = 10;
        } else if (left + 260 > window.innerWidth - 10) {
            left = window.innerWidth - 270;
        }
        
        setTooltipPos({ top, left });
        setHoveredUser(username);
    };

    // Render User with Active Directory hover details
    const renderUserHover = (username: string, keyId: string) => {
        const userAd = adUsers[username];
        return (
            <span 
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: userAd ? 'help' : 'default' }}
                onMouseEnter={(e) => handleMouseEnter(e, username)}
                onMouseLeave={() => setHoveredUser(null)}
            >
                <User size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <span style={{ 
                    borderBottom: userAd ? '1px dotted var(--text-secondary)' : 'none', 
                    color: 'var(--text-primary)', 
                    fontWeight: 500 
                }}>
                    {username}
                </span>
            </span>
        );
    };

    const renderSortableHeader = (label: string, key: string) => {
        const isCurrent = sortKey === key;
        return (
            <th 
                onClick={() => requestSort(key)}
                style={{ 
                    padding: '14px 16px', 
                    color: isCurrent ? 'var(--accent-primary)' : 'var(--text-secondary)', 
                    fontWeight: 600, 
                    background: 'var(--bg-surface)', 
                    position: 'sticky', 
                    top: 0, 
                    zIndex: 10,
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {label}
                    {isCurrent && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>
                            {sortOrder === "asc" ? " ▲" : " ▼"}
                        </span>
                    )}
                </div>
            </th>
        );
    };

    return (
        <div className="wide-layout" style={{ paddingBottom: '3rem', width: '100%' }}>
            {/* Header Area containing Title and Less Prominent SIEM Poller widget */}
            <header style={{ 
                marginBottom: '2rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                flexWrap: 'wrap', 
                gap: '16px' 
            }}>
                <div>
                    <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>
                        VPN Connectivity & Troubleshooting
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', margin: 0 }}>
                        Real-time ingestion, intelligence, and search for Secure Client VPN sessions.
                    </p>
                    <p style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '0.825rem', marginTop: '6px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} />
                        Data may be up to 30 minutes old. For the latest logs, click <strong>Sync Now</strong>.
                    </p>
                </div>

                {/* Streamlined SIEM Poller Widget */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ 
                        fontSize: '0.8rem', 
                        padding: '6px 12px', 
                        borderRadius: '12px', 
                        background: 'var(--bg-surface)', 
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        alignItems: 'flex-start'
                    }} title={lastSync?.message || undefined}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                background: lastSync?.status === "FAILURE" ? '#ef4444' : '#22c55e',
                                boxShadow: lastSync?.status === "FAILURE" ? '0 0 8px #ef4444' : '0 0 8px #22c55e'
                            }} />
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
                                SIEM Poller: {lastSync ? `${lastSync.status} (${formatDate(lastSync.lastRun)})` : "Idle"}
                            </span>
                        </div>
                        {syncing ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '16px', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 600 }}>
                                <span style={{ animation: 'pulse 1.5s infinite' }}>🔄</span>
                                <span>{syncStatus}</span>
                            </div>
                        ) : lastSync?.message ? (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', paddingLeft: '16px' }}>
                                {lastSync.message}
                            </span>
                        ) : null}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <select
                            value={syncRange}
                            onChange={(e) => setSyncRange(Number(e.target.value))}
                            disabled={syncing}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value={2100}>Last 35 Mins</option>
                            <option value={14400}>Last 4 Hours</option>
                            <option value={86400}>Last 24 Hours</option>
                            <option value={604800}>Last 7 Days</option>
                            <option value={2592000}>Last 30 Days</option>
                        </select>
                        <button 
                            onClick={handleSync} 
                            disabled={syncing}
                            className="btn-secondary"
                            style={{ 
                                padding: '6px 12px', 
                                borderRadius: '8px', 
                                fontSize: '0.8rem', 
                                fontWeight: 600, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px' 
                            }}
                        >
                            <Clock size={12} />
                            {syncing ? "Syncing..." : "Sync Now"}
                        </button>
                    </div>
                </div>
            </header>

            {syncNotification && (
                <div className="glass-card" style={{ 
                    border: '1px solid rgba(34, 197, 94, 0.2)', 
                    background: 'rgba(34, 197, 94, 0.05)', 
                    color: '#22c55e', 
                    padding: '16px', 
                    borderRadius: '8px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <CheckCircle size={20} style={{ color: '#22c55e' }} />
                    <span>{syncNotification}</span>
                </div>
            )}

            {error && (
                <div className="glass-card" style={{ 
                    border: '1px solid rgba(239, 68, 68, 0.2)', 
                    background: 'rgba(239, 68, 68, 0.05)', 
                    color: '#ef4444', 
                    padding: '16px', 
                    borderRadius: '8px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* Tabs Navigation Layout */}
            <div style={{ 
                display: 'flex', 
                gap: '12px', 
                marginBottom: '24px', 
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '8px'
            }}>
                <button 
                    onClick={() => setActiveTab("feed")}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        background: activeTab === "feed" ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === "feed" ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        border: activeTab === "feed" ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Activity Feed
                </button>
                <button 
                    onClick={() => setActiveTab("security")}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        background: activeTab === "security" ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === "security" ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        border: activeTab === "security" ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Security Insights
                </button>
                <button 
                    onClick={() => setActiveTab("bandwidth")}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        background: activeTab === "bandwidth" ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                        color: activeTab === "bandwidth" ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        border: activeTab === "bandwidth" ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Bandwidth Analytics
                </button>
            </div>

            {/* TAB CONTENT: feed */}
            {activeTab === "feed" && (
                <>
                    {/* Sticky Search Bar (retains position on scroll with solid background & z-index) */}
                    <section style={{ 
                        position: 'sticky', 
                        top: '0px', 
                        zIndex: 110, 
                        background: 'var(--bg-background)', 
                        padding: '16px 0',
                        borderBottom: '1px solid var(--border-color)',
                        marginBottom: '2.5rem'
                    }}>
                        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={20} style={{ 
                                    position: 'absolute', 
                                    left: '14px', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    color: 'var(--text-muted)' 
                                }} />
                                <input
                                    type="text"
                                    placeholder="Search by Username, IP address, or Date (e.g. YYYY-MM-DD)..."
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        if (!e.target.value.trim()) setSearchResults(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '14px 14px 14px 44px',
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '10px',
                                        color: 'var(--text-primary)',
                                        fontSize: '1rem',
                                        outline: 'none',
                                        transition: 'border-color 0.2s'
                                    }}
                                />
                            </div>
                            <button 
                                type="submit" 
                                className="btn-primary" 
                                disabled={searching}
                                style={{ padding: '0 24px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {searching ? "Searching..." : "Search"}
                            </button>
                            {searchResults !== null && (
                                <button 
                                    type="button" 
                                    className="btn-secondary"
                                    onClick={() => {
                                        setSearchQuery("");
                                        setSearchResults(null);
                                    }}
                                    style={{ padding: '0 18px', borderRadius: '10px' }}
                                >
                                    Clear
                                </button>
                            )}
                        </form>
                        
                        {/* Subtabs Selector & Row Limit */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={() => setFeedSubTab("all")}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: feedSubTab === "all" ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-surface)',
                                        color: feedSubTab === "all" ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                        border: '1px solid',
                                        borderColor: feedSubTab === "all" ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    All Events
                                </button>
                                <button
                                    onClick={() => setFeedSubTab("success")}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: feedSubTab === "success" ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-surface)',
                                        color: feedSubTab === "success" ? '#22c55e' : 'var(--text-secondary)',
                                        border: '1px solid',
                                        borderColor: feedSubTab === "success" ? 'rgba(34, 197, 94, 0.3)' : 'var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Successful Connections
                                </button>
                                <button
                                    onClick={() => setFeedSubTab("failure")}
                                    style={{
                                        padding: '6px 14px',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: feedSubTab === "failure" ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-surface)',
                                        color: feedSubTab === "failure" ? '#ef4444' : 'var(--text-secondary)',
                                        border: '1px solid',
                                        borderColor: feedSubTab === "failure" ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Authentication Failures
                                </button>
                            </div>

                            {/* Row Limit Selector */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Rows:</span>
                                <select
                                    value={displayRows}
                                    onChange={(e) => handleDisplayRowsChange(Number(e.target.value))}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                    <option value={200}>200</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Search Results */}
                    {searchResults !== null && (
                        <section style={{ marginBottom: '2.5rem' }}>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>
                                Search Results ({searchResults.length})
                            </h2>
                            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: '400px', width: '100%' }}>
                                    <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                                                {renderSortableHeader("Timestamp", "createdAt")}
                                                {renderSortableHeader("User", "username")}
                                                {renderSortableHeader("Source IP", "sourceIp")}
                                                {renderSortableHeader("ISP / AS Info", "ipAsName")}
                                                {renderSortableHeader("Status", "status")}
                                                {renderSortableHeader("Duration", "duration")}
                                                {renderSortableHeader("Upload (Tx)", "bytesSent")}
                                                {renderSortableHeader("Download (Rx)", "bytesReceived")}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {getFilteredEvents(searchResults).length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                        No matching VPN events found for the selected subtab.
                                                    </td>
                                                </tr>
                                            ) : (
                                                getSortedData(getFilteredEvents(searchResults)).slice(0, displayRows).map((evt) => (
                                                    <tr key={evt.id} style={{ 
                                                        borderBottom: '1px solid var(--border-color)', 
                                                        transition: 'background-color 0.2s',
                                                        borderLeft: isNonUs(evt) ? '4px solid #f59e0b' : 'none',
                                                        background: isNonUs(evt) ? 'rgba(245, 158, 11, 0.04)' : 'transparent'
                                                    }} className="table-row-hover">
                                                        <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>{formatDate(evt.createdAt)}</td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                                                            {renderUserHover(evt.username, evt.id + "-search")}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                                                         <div>{evt.sourceIp}</div>
                                                         {evt.assignedIp && (
                                                             <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                 <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>Assigned:</span> <span>{evt.assignedIp}</span>
                                                             </div>
                                                         )}
                                                     </td>
                                                        <td style={{ padding: '14px 16px', fontSize: '0.875rem' }}>
                                                            {evt.ipAsName ? (
                                                                <span style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        {evt.ipAsName}
                                                                        {isNonUs(evt) && (
                                                                            <span style={{ 
                                                                                fontSize: '0.7rem', 
                                                                                background: 'rgba(245, 158, 11, 0.15)', 
                                                                                color: '#fbbf24', 
                                                                                padding: '2px 6px', 
                                                                                borderRadius: '4px',
                                                                                fontWeight: 700
                                                                            }}>
                                                                                ⚠️ Non-US ({evt.ipCountryCode})
                                                                            </span>
                                                                        )}
                                                                    </strong>
                                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                        {evt.ipAsn} • {evt.ipCountryCode || evt.ipCountry || "Unknown"}
                                                                    </span>
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: 'var(--text-muted)' }}>Local / Unenriched</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{ 
                                                                display: 'inline-flex', 
                                                                alignItems: 'center', 
                                                                gap: '4px',
                                                                padding: '4px 8px', 
                                                                borderRadius: '6px', 
                                                                fontSize: '0.8rem',
                                                                fontWeight: 600,
                                                                background: evt.status === "FAILURE" ? 'rgba(239, 68, 68, 0.15)' : evt.status === "SUCCESS" ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                                color: evt.status === "FAILURE" ? '#f87171' : evt.status === "SUCCESS" ? '#4ade80' : '#60a5fa'
                                                            }}>
                                                                {evt.status === "FAILURE" ? (
                                                                    <>
                                                                        <ShieldAlert size={12} />
                                                                        FAIL: {evt.failureReason || "Authentication"}
                                                                    </>
                                                                ) : evt.status === "SUCCESS" ? (
                                                                    <>
                                                                        <CheckCircle size={12} />
                                                                        CONNECTED
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <Clock size={12} />
                                                                        DISCONNECTED
                                                                    </>
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                            {evt.duration ? formatDuration(evt.duration) : "-"}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                            {evt.bytesSent ? formatBytes(evt.bytesSent) : "-"}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                            {evt.bytesReceived ? formatBytes(evt.bytesReceived) : "-"}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Recent activity timeline */}
                    <section style={{ width: '100%' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Database size={20} style={{ color: 'var(--accent-primary)' }} />
                            Recent Activity Feed
                        </h2>
                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
                            <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: '550px', width: '100%' }}>
                                <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                                            {renderSortableHeader("Timestamp", "createdAt")}
                                            {renderSortableHeader("User", "username")}
                                            {renderSortableHeader("Source IP", "sourceIp")}
                                            {renderSortableHeader("ISP / AS Info", "ipAsName")}
                                            {renderSortableHeader("Status", "status")}
                                            {renderSortableHeader("Duration", "duration")}
                                            {renderSortableHeader("Upload (Tx)", "bytesSent")}
                                            {renderSortableHeader("Download (Rx)", "bytesReceived")}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    Loading recent activities...
                                                </td>
                                            </tr>
                                        ) : getFilteredEvents(recentEvents).length === 0 ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    No VPN events captured yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            getSortedData(getFilteredEvents(recentEvents)).slice(0, displayRows).map((evt) => (
                                                <tr key={evt.id} style={{ 
                                                    borderBottom: '1px solid var(--border-color)', 
                                                    transition: 'background-color 0.2s',
                                                    borderLeft: isNonUs(evt) ? '4px solid #f59e0b' : 'none',
                                                    background: isNonUs(evt) ? 'rgba(245, 158, 11, 0.04)' : 'transparent'
                                                }} className="table-row-hover">
                                                    <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>{formatDate(evt.createdAt)}</td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                                                        {renderUserHover(evt.username, evt.id + "-timeline")}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                                                        <div>{evt.sourceIp}</div>
                                                        {evt.assignedIp && (
                                                            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>Assigned:</span> <span>{evt.assignedIp}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.875rem' }}>
                                                        {evt.ipAsName ? (
                                                            <span style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    {evt.ipAsName}
                                                                    {isNonUs(evt) && (
                                                                        <span style={{ 
                                                                            fontSize: '0.7rem', 
                                                                            background: 'rgba(245, 158, 11, 0.15)', 
                                                                            color: '#fbbf24', 
                                                                            padding: '2px 6px', 
                                                                            borderRadius: '4px',
                                                                            fontWeight: 700
                                                                        }}>
                                                                            ⚠️ Non-US ({evt.ipCountryCode})
                                                                        </span>
                                                                    )}
                                                                </strong>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    {evt.ipAsn} • {evt.ipCountryCode || evt.ipCountry || "Unknown"}
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)' }}>Local / Unenriched</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <span style={{ 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '4px',
                                                            padding: '4px 8px', 
                                                            borderRadius: '6px', 
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            background: evt.status === "FAILURE" ? 'rgba(239, 68, 68, 0.15)' : evt.status === "SUCCESS" ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                                            color: evt.status === "FAILURE" ? '#f87171' : evt.status === "SUCCESS" ? '#4ade80' : '#60a5fa'
                                                        }}>
                                                            {evt.status === "FAILURE" ? (
                                                                <>
                                                                    <ShieldAlert size={12} />
                                                                    FAIL
                                                                </>
                                                            ) : evt.status === "SUCCESS" ? (
                                                                <>
                                                                    <CheckCircle size={12} />
                                                                    CONNECTED
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Clock size={12} />
                                                                    DISCONNECTED
                                                                </>
                                                            )}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                        {evt.duration ? formatDuration(evt.duration) : "-"}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                        {evt.bytesSent ? formatBytes(evt.bytesSent) : "-"}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>
                                                        {evt.bytesReceived ? formatBytes(evt.bytesReceived) : "-"}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {/* TAB CONTENT: security */}
            {activeTab === "security" && (
                <>
                    {/* Time Window Selector for Security Insights */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '16px', gap: '8px' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Select Scope:</span>
                        <select
                            value={securityScope}
                            onChange={(e) => setSecurityScope(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                background: 'var(--bg-surface)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="last24hours">Last 24 Hours</option>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last7days">Last 7 Days</option>
                            <option value="last14days">Last 14 Days</option>
                            <option value="last30days">Last 30 Days</option>
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '2.5rem' }}>
                        {/* Last 10 Successful Source IPs */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '8px', borderRadius: '8px' }}>
                                    <Wifi size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Last 10 Unique Successful Source IPs</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Latest active connections</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading successful IPs...</p>
                            ) : successfulIps.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No successful connections recorded yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {successfulIps.map((evt) => {
                                        const nonUs = isNonUs(evt);
                                        return (
                                            <div key={evt.id} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                padding: '12px 14px',
                                                borderRadius: '8px', 
                                                background: nonUs ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255,255,255,0.01)',
                                                border: '1px solid var(--border-color)',
                                                borderLeft: nonUs ? '4px solid #f59e0b' : '1px solid var(--border-color)',
                                                gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {evt.sourceIp}
                                                        {nonUs && (
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                background: 'rgba(245, 158, 11, 0.15)', 
                                                                color: '#fbbf24', 
                                                                padding: '1px 5px', 
                                                                borderRadius: '4px',
                                                                fontWeight: 700
                                                            }}>
                                                                ⚠️ Non-US ({evt.ipCountryCode})
                                                            </span>
                                                        )}
                                                    </span>
                                                    {evt.assignedIp && (
                                                        <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>Assigned:</span> <span>{evt.assignedIp}</span>
                                                        </div>
                                                    )}
                                                    {evt.ipAsName ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }} title={`${evt.ipAsn} • ${evt.ipCountryCode || evt.ipCountry || "Unknown"}`}>
                                                            <Globe size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                                                                {evt.ipAsName}
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Globe size={11} style={{ flexShrink: 0 }} /> Private / Local IP
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {renderUserHover(evt.username, evt.id + "-succ")}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={11} /> {formatDate(evt.createdAt)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Last 10 Failed Source IPs */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px', borderRadius: '8px' }}>
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Last 10 Unique Failed Source IPs</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Recent failures</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading failed IPs...</p>
                            ) : failedIps.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No connection failures recorded yet.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {failedIps.map((evt) => {
                                        const nonUs = isNonUs(evt);
                                        return (
                                            <div key={evt.id} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                padding: '12px 14px',
                                                borderRadius: '8px', 
                                                background: nonUs ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255,255,255,0.01)',
                                                border: '1px solid var(--border-color)',
                                                borderLeft: nonUs ? '4px solid #f59e0b' : '1px solid var(--border-color)',
                                                gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {evt.sourceIp}
                                                        {nonUs && (
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                background: 'rgba(245, 158, 11, 0.15)', 
                                                                color: '#fbbf24', 
                                                                padding: '1px 5px', 
                                                                borderRadius: '4px',
                                                                fontWeight: 700
                                                            }}>
                                                                ⚠️ Non-US ({evt.ipCountryCode})
                                                            </span>
                                                        )}
                                                    </span>
                                                    {evt.ipAsName ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }} title={`${evt.ipAsn} • ${evt.ipCountryCode || evt.ipCountry || "Unknown"}`}>
                                                            <Globe size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                                                                {evt.ipAsName}
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Globe size={11} style={{ flexShrink: 0 }} /> Private / Local IP
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {renderUserHover(evt.username, evt.id + "-fail")}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 500, display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                                                        <ShieldAlert size={11} /> {evt.failureReason || "Failed"}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top 25 Failed Usernames (All) */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px', borderRadius: '8px' }}>
                                    <ShieldAlert size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Top 25 Failed Usernames (All)</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Highest connection rejections</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading failed usernames...</p>
                            ) : topFailedUsernames.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No failed username attempts recorded.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {topFailedUsernames.map((u, index) => (
                                        <div key={index} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between', 
                                            padding: '12px 14px',
                                            borderRadius: '8px', 
                                            background: 'rgba(255,255,255,0.01)',
                                            border: '1px solid var(--border-color)',
                                            gap: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', width: '24px', textAlign: 'center' }}>
                                                    #{index + 1}
                                                </span>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                                                    {renderUserHover(u.username, "sec-fail-all-" + index)}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.9rem', color: '#f87171', fontWeight: 700 }}>
                                                {u.count} attempt{u.count === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Top 25 Failed Valid Usernames */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '520px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', padding: '8px', borderRadius: '8px' }}>
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Top 25 Failed Valid Usernames</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Corporate name-name patterns</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading failed corporate usernames...</p>
                            ) : topFailedValidUsernames.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No failed corporate username attempts recorded.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {topFailedValidUsernames.map((u, index) => (
                                        <div key={index} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'space-between', 
                                            padding: '12px 14px',
                                            borderRadius: '8px', 
                                            background: 'rgba(255,255,255,0.01)',
                                            border: '1px solid var(--border-color)',
                                            gap: '12px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', width: '24px', textAlign: 'center' }}>
                                                    #{index + 1}
                                                </span>
                                                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                                                    {renderUserHover(u.username, "sec-fail-val-" + index)}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.9rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
                                                {u.count} attempt{u.count === 1 ? "" : "s"}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* TAB CONTENT: bandwidth */}
            {activeTab === "bandwidth" && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
                    {/* Time Scope selector */}
                    <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        background: 'var(--bg-surface)', 
                        padding: '12px 18px', 
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                Analytics Period (Individual VPN Sessions)
                            </span>
                            <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Shows maximum bandwidth consumption per connection (not aggregated across sessions).
                            </p>
                        </div>
                        <select
                            value={bandwidthScope}
                            onChange={(e) => setBandwidthScope(e.target.value)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                background: 'var(--bg-background)',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="today">Today (Since 00:00)</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last7days">Last 7 Days</option>
                            <option value="last14days">Last 2 Weeks</option>
                            <option value="last30days">Last 30 Days</option>
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '2.5rem' }}>
                        {/* Top 10 Sessions by Upload (Tx) */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '540px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', padding: '8px', borderRadius: '8px' }}>
                                    <ArrowUpRight size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Top 10 Individual Sessions by Upload (Tx)</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Highest outbound data transfer</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading bandwidth stats...</p>
                            ) : topUploadEvents.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No session data transfer recorded for this period.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {topUploadEvents.map((evt) => {
                                        const nonUs = isNonUs(evt);
                                        return (
                                            <div key={evt.id} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                padding: '12px 14px',
                                                borderRadius: '8px', 
                                                background: nonUs ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255,255,255,0.01)',
                                                border: '1px solid var(--border-color)',
                                                borderLeft: nonUs ? '4px solid #f59e0b' : '1px solid var(--border-color)',
                                                gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {evt.sourceIp}
                                                        {nonUs && (
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                background: 'rgba(245, 158, 11, 0.15)', 
                                                                color: '#fbbf24', 
                                                                padding: '1px 5px', 
                                                                borderRadius: '4px',
                                                                fontWeight: 700
                                                            }}>
                                                                ⚠️ Non-US ({evt.ipCountryCode})
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                                                        {evt.ipAsName || "Private / Local IP"}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={11} style={{ flexShrink: 0 }} /> {formatSessionTimes(evt)}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {renderUserHover(evt.username, evt.id + "-top-up")}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 700 }}>
                                                        {formatBytes(evt.bytesSent)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Top 10 Sessions by Download (Rx) */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '540px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '8px', borderRadius: '8px' }}>
                                    <ArrowDownLeft size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Top 10 Individual Sessions by Download (Rx)</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Highest inbound data transfer</p>
                                </div>
                            </div>
                            {loading ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>Loading bandwidth stats...</p>
                            ) : topDownloadEvents.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px' }}>No session data transfer recorded for this period.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflowY: 'auto', paddingRight: '6px' }}>
                                    {topDownloadEvents.map((evt) => {
                                        const nonUs = isNonUs(evt);
                                        return (
                                            <div key={evt.id} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'space-between', 
                                                padding: '12px 14px',
                                                borderRadius: '8px', 
                                                background: nonUs ? 'rgba(245, 158, 11, 0.04)' : 'rgba(255,255,255,0.01)',
                                                border: '1px solid var(--border-color)',
                                                borderLeft: nonUs ? '4px solid #f59e0b' : '1px solid var(--border-color)',
                                                gap: '12px'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {evt.sourceIp}
                                                        {nonUs && (
                                                            <span style={{ 
                                                                fontSize: '0.65rem', 
                                                                background: 'rgba(245, 158, 11, 0.15)', 
                                                                color: '#fbbf24', 
                                                                padding: '1px 5px', 
                                                                borderRadius: '4px',
                                                                fontWeight: 700
                                                            }}>
                                                                ⚠️ Non-US ({evt.ipCountryCode})
                                                            </span>
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                                                        {evt.ipAsName || "Private / Local IP"}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={11} style={{ flexShrink: 0 }} /> {formatSessionTimes(evt)}
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        {renderUserHover(evt.username, evt.id + "-top-dl")}
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 700 }}>
                                                        {formatBytes(evt.bytesReceived)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Global viewport-fixed tooltip to avoid container clipping or screen edge overflow */}
            {hoveredUser && adUsers[hoveredUser] && (
                <div style={{
                    position: 'fixed',
                    top: `${tooltipPos.top}px`,
                    left: `${tooltipPos.left}px`,
                    zIndex: 9999, // Render over everything
                    width: '260px',
                    padding: '12px',
                    background: 'rgba(15, 18, 25, 0.99)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    textAlign: 'left',
                    backdropFilter: 'blur(10px)',
                    pointerEvents: 'none'
                }}>
                    <div style={{ 
                        fontWeight: 700, 
                        fontSize: '0.85rem', 
                        marginBottom: '6px', 
                        color: 'var(--accent-primary)', 
                        borderBottom: '1px solid rgba(255,255,255,0.08)', 
                        paddingBottom: '4px' 
                    }}>
                        {adUsers[hoveredUser].displayName || hoveredUser}
                    </div>
                    {adUsers[hoveredUser].title && (
                        <div style={{ marginBottom: '4px' }}><strong>Title:</strong> {adUsers[hoveredUser].title}</div>
                    )}
                    {adUsers[hoveredUser].department && (
                        <div style={{ marginBottom: '4px' }}><strong>Dept:</strong> {adUsers[hoveredUser].department}</div>
                    )}
                    {adUsers[hoveredUser].email && (
                        <div style={{ marginBottom: '4px' }}><strong>Email:</strong> {adUsers[hoveredUser].email}</div>
                    )}
                    {adUsers[hoveredUser].phone && (
                        <div><strong>Phone:</strong> {adUsers[hoveredUser].phone}</div>
                    )}
                </div>
            )}
        </div>
    );
}
