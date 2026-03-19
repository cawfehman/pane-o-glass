"use client";

import { useState, useEffect, useCallback } from "react";

export default function TacacsPage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [tacacsResult, setTacacsResult] = useState<any>(null);
    const [error, setError] = useState("");
    const [isRecentMode, setIsRecentMode] = useState(true);
    
    // RBAC state
    const [hasTacacsPerm, setHasTacacsPerm] = useState(false);
    const [permsLoading, setPermsLoading] = useState(true);

    const fetchRecentLogs = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch('/api/ise/tacacs?query=recent&limit=25');
            const data = await res.json();
            if (res.ok) {
                setTacacsResult(data);
                setIsRecentMode(true);
            } else {
                throw new Error(data.error || "Failed to fetch recent logs");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const fetchPerms = async () => {
            try {
                // Probe the TACACS API
                const res = await fetch('/api/ise/tacacs?query=');
                const hasPerm = res.status !== 403;
                setHasTacacsPerm(hasPerm);
                
                if (hasPerm) {
                    await fetchRecentLogs();
                }
            } catch (e) {
                console.error("Failed to detect TACACS permissions");
            } finally {
                setPermsLoading(false);
            }
        };
        fetchPerms();
    }, [fetchRecentLogs]);

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!query.trim()) {
            fetchRecentLogs();
            return;
        }

        setLoading(true);
        setError("");
        setTacacsResult(null);
        setIsRecentMode(false);

        try {
            const res = await fetch(`/api/ise/tacacs?query=${encodeURIComponent(query)}`);
            const data = await res.json();
            
            if (res.ok) {
                setTacacsResult(data);
            } else {
                throw new Error(data.error || "Failed to fetch TACACS logs");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (permsLoading) return <div className="p-8 font-medium animate-pulse">Verifying TACACS+ Administration access...</div>;
    if (!hasTacacsPerm) return <div className="p-8 glass-card m-8 border-l-4 border-red-500 text-red-400">Access Denied: You do not have permission to view TACACS+ administration forensics.</div>;

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                        <h1>TACACS+ Administration</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Forensics for network device management.
                        </p>
                    </div>
                    <button 
                        onClick={fetchRecentLogs} 
                        className="btn-secondary" 
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={loading ? "animate-spin" : ""}><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        Refresh Events
                    </button>
                </div>

                <form onSubmit={handleSearch} className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '32px', marginTop: '24px' }}>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search Device IP, Name, or Admin User..."
                        style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem' }}
                        disabled={loading}
                    />
                    <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 'bold' }}>
                        {loading ? "Searching..." : "Filter Logs"}
                    </button>
                    {query && (
                        <button type="button" onClick={() => { setQuery(""); fetchRecentLogs(); }} className="btn-secondary" style={{ padding: '12px 16px', borderRadius: '8px' }}>
                            Clear
                        </button>
                    )}
                </form>

                {error && (
                    <div style={{ padding: '16px', borderLeft: '4px solid var(--accent-secondary)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-secondary)', marginBottom: '24px' }}>
                        <strong>Forensic Error:</strong> {error}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {tacacsResult && (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                            <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold' }}>
                                {isRecentMode ? "Latest 25 Administrative Events" : `Search Results for "${query}"`}
                            </h3>
                            {tacacsResult.found && (
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    Found {tacacsResult.failures.length} events
                                </span>
                            )}
                        </div>
                        
                        {tacacsResult.found && tacacsResult.failures ? (
                            <div>
                                {tacacsResult.failures.map((f: any, idx: number) => (
                                    <TacacsCard key={idx} event={f} />
                                ))}
                            </div>
                        ) : (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No TACACS+ logs found.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function TacacsCard({ event }: { event: any }) {
    const isPass = event.status === true;
    const accentColor = isPass ? '#10b981' : '#ef4444';
    const bgColor = isPass ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    return (
        <div className="glass-card" style={{ marginBottom: '24px', borderLeft: `6px solid ${accentColor}`, padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Log Event <span style={{ fontSize: '0.7rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                    </h4>
                    <p title="The exact time of the TACACS+ authentication or authorization event"><strong>Timestamp:</strong> {event.timestamp !== "Unknown" ? new Date(event.timestamp).toLocaleString() : "Unknown"}</p>
                    <p title="The final result returned by the TACACS+ engine"><strong>Result:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{event.failure_reason}</span></p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Administrator</h4>
                    <p title="The system administrator username that initiated this TACACS+ event"><strong>Username:</strong> {event.user_name || "N/A"}</p>
                    <p title="The source MAC address or identifier of the administrative connection"><strong>Client ID:</strong> <span style={{ fontFamily: 'monospace' }}>{event.calling_station_id}</span></p>
                    <p title="The Identity Store used to validate the credentials"><strong>Store:</strong> {event.identity_store || "Unknown"}</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Network Device</h4>
                    <p title="The IP address of the switch, router, or firewall being managed"><strong>Device IP:</strong> {event.nas_ip_address}</p>
                    <p title="The actual physical or logical port on the target device"><strong>Access Port:</strong> {event.nas_port_id}</p>
                    <p title="The friendly name assigned to the target device in ISE network resources"><strong>Device Name:</strong> {event.nas_identifier}</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Policy & Command</h4>
                    <p title="The privilege level assigned to the session"><strong>Privilege:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>Level {event.privilege_level}</span></p>
                    <p title="The specific command set or profile applied to this session"><strong>Command Set:</strong> {event.command_set}</p>
                    <p title="The ISE Authorization Rule matched for this administrative session"><strong>Matched Rule:</strong> {event.authorization_rule}</p>
                </div>
            </div>
            <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong>Processing Node:</strong> {event.acs_server} | <strong>Status ID:</strong> {event.failure_id}
            </div>
        </div>
    );
}
