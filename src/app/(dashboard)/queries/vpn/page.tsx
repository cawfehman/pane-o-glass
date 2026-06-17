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

    const [successfulIps, setSuccessfulIps] = useState<any[]>([]);
    const [failedIps, setFailedIps] = useState<any[]>([]);
    const [recentEvents, setRecentEvents] = useState<any[]>([]);
    const [searchResults, setSearchResults] = useState<any[] | null>(null);
    
    // Active Directory user enrichment maps
    const [adUsers, setAdUsers] = useState<Record<string, any>>({});
    const [hoveredUser, setHoveredUser] = useState<string | null>(null);

    const fetchDashboardData = async () => {
        try {
            setError("");
            const res = await fetch("/api/vpn/events");
            if (!res.ok) throw new Error("Failed to load VPN events");
            const data = await res.json();
            setSuccessfulIps(data.successfulIps || []);
            setFailedIps(data.failedIps || []);
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
        try {
            const res = await fetch("/api/vpn/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ range: 86400 }) // Fetch last 24 hours to capture historical events
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Sync request failed");
            }
            await fetchDashboardData();
        } catch (err: any) {
            setError(err.message || "Failed to trigger log sync.");
        } finally {
            setSyncing(false);
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
    }, []);

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

    // Render User with Active Directory hover details
    const renderUserHover = (username: string, keyId: string) => {
        const userAd = adUsers[username];
        return (
            <span 
                style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: userAd ? 'help' : 'default' }}
                onMouseEnter={() => userAd && setHoveredUser(keyId)}
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
                {hoveredUser === keyId && userAd && (
                    <div style={{
                        position: 'absolute',
                        bottom: '125%',
                        left: '0',
                        zIndex: 150,
                        width: '260px',
                        padding: '12px',
                        background: 'rgba(15, 18, 25, 0.98)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
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
                            {userAd.displayName || username}
                        </div>
                        {userAd.title && (
                            <div style={{ marginBottom: '4px' }}><strong>Title:</strong> {userAd.title}</div>
                        )}
                        {userAd.department && (
                            <div style={{ marginBottom: '4px' }}><strong>Dept:</strong> {userAd.department}</div>
                        )}
                        {userAd.email && (
                            <div style={{ marginBottom: '4px' }}><strong>Email:</strong> {userAd.email}</div>
                        )}
                        {userAd.phone && (
                            <div><strong>Phone:</strong> {userAd.phone}</div>
                        )}
                    </div>
                )}
            </span>
        );
    };

    return (
        <div className="page-container" style={{ paddingBottom: '3rem', width: '100%', maxWidth: '100%' }}>
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
                </div>

                {/* Streamlined SIEM Poller Widget */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ 
                        fontSize: '0.8rem', 
                        padding: '6px 12px', 
                        borderRadius: '20px', 
                        background: 'var(--bg-surface)', 
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
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
            </header>

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
                                // Allow searching by Username, IP, or Day/Date
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
                                    <tr style={{ position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>Timestamp</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>User</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>Source IP</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>ISP / AS Info</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>Status</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>Duration</th>
                                        <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>Total Tx/Rx</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {searchResults.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                No matching VPN events found.
                                            </td>
                                        </tr>
                                    ) : (
                                        searchResults.map((evt) => (
                                            <tr key={evt.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }} className="table-row-hover">
                                                <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>{formatDate(evt.createdAt)}</td>
                                                <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                                                    {renderUserHover(evt.username, evt.id + "-search")}
                                                </td>
                                                <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.95rem' }}>{evt.sourceIp}</td>
                                                <td style={{ padding: '14px 16px', fontSize: '0.875rem' }}>
                                                    {evt.ipAsName ? (
                                                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                                                            <strong style={{ color: 'var(--text-primary)' }}>{evt.ipAsName}</strong>
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
                                                    {evt.bytesTotal ? formatBytes(evt.bytesTotal) : "-"}
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

            {/* Main Dashboard Stats cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px', marginBottom: '2.5rem' }}>
                
                {/* Last 10 Successful Source IPs (with internal scrolling) */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
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
                            {successfulIps.map((evt) => (
                                <div key={evt.id} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    padding: '12px 14px',
                                    borderRadius: '8px', 
                                    background: 'rgba(255,255,255,0.01)',
                                    border: '1px solid var(--border-color)',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                                            {evt.sourceIp}
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
                                            {renderUserHover(evt.username, evt.id + "-succ")}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={11} /> {formatDate(evt.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Last 10 Failed Source IPs (with internal scrolling) */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '480px' }}>
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
                            {failedIps.map((evt) => (
                                <div key={evt.id} style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    padding: '12px 14px',
                                    borderRadius: '8px', 
                                    background: 'rgba(255,255,255,0.01)',
                                    border: '1px solid var(--border-color)',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '1.05rem', color: '#f87171' }}>
                                            {evt.sourceIp}
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
                            ))}
                        </div>
                    )}
                </div>

            </div>

            {/* Recent activity timeline (With sticky table headers and internal scroll container) */}
            <section style={{ width: '100%' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Database size={20} style={{ color: 'var(--accent-primary)' }} />
                    Recent Activity Feed
                </h2>
                <div className="glass-card" style={{ padding: 0, overflow: 'hidden', width: '100%' }}>
                    <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: '550px', width: '100%' }}>
                        <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>Timestamp</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>User</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>Source IP</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>ISP / AS Info</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>Status</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>Duration</th>
                                    <th style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 10 }}>Data Transfer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            Loading recent activities...
                                        </td>
                                    </tr>
                                ) : recentEvents.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No VPN events captured yet.
                                        </td>
                                    </tr>
                                ) : (
                                    recentEvents.map((evt) => (
                                        <tr key={evt.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background-color 0.2s' }} className="table-row-hover">
                                            <td style={{ padding: '14px 16px', fontSize: '0.9rem' }}>{formatDate(evt.createdAt)}</td>
                                            <td style={{ padding: '14px 16px', fontWeight: 500 }}>
                                                {renderUserHover(evt.username, evt.id + "-timeline")}
                                            </td>
                                            <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: '0.95rem' }}>{evt.sourceIp}</td>
                                            <td style={{ padding: '14px 16px', fontSize: '0.875rem' }}>
                                                {evt.ipAsName ? (
                                                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <strong style={{ color: 'var(--text-primary)' }}>{evt.ipAsName}</strong>
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
                                                {evt.bytesTotal ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-secondary)' }} title="Bytes Tx">
                                                            <ArrowUpRight size={12} /> {formatBytes(evt.bytesSent)}
                                                        </span>
                                                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--text-secondary)' }} title="Bytes Rx">
                                                            <ArrowDownLeft size={12} /> {formatBytes(evt.bytesReceived)}
                                                        </span>
                                                    </span>
                                                ) : "-"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
}
