"use client";

import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, Wifi, User, Activity, Globe, Save, ChevronDown, ChevronUp, Terminal } from 'lucide-react';

interface TacacsEvent {
    timestamp: string;
    user_name: string;
    calling_station_id: string;
    nas_ip_address: string;
    nas_port_id: string;
    failure_reason: string;
    failure_id: string;
    status: string;
    server: string;
    device_name: string;
    command_set: string;
    privilege_level: string;
    authen_type: string;
    service: string;
    raw_message: string;
}

const TacacsCard = ({ event }: { event: any }) => {
    const [showRaw, setShowRaw] = useState(false);

    const safeStr = (v: any) => {
        if (v === null || v === undefined) return "N/A";
        if (typeof v === 'string') return v;
        return String(v);
    };

    const isPass = event.status === "Passed" || event.status === true || event.status === "true";
    const accentColor = isPass ? 'var(--status-success)' : 'var(--status-error)';
    const bgColor = isPass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    return (
        <div className="glass-card" style={{ 
            marginBottom: '16px', 
            borderLeft: `4px solid ${accentColor}`,
            padding: '20px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Log Event <span style={{ fontSize: '0.7rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                        </h4>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {safeStr(event.timestamp)}
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ padding: '8px', background: 'var(--glass-bg)', borderRadius: '8px' }}>
                                <User size={20} color="var(--accent-primary)" />
                            </div>
                            <div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '-2px' }}>Administrative User</p>
                                <p style={{ fontWeight: '700', fontSize: '1.2rem' }}>{safeStr(event.user_name)}</p>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                <Globe size={14} />
                                <span>Source: {safeStr(event.calling_station_id)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                <Wifi size={14} />
                                <span>Device: {safeStr(event.nas_ip_address)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Forensic Properties</h4>
                        <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => setShowRaw(!showRaw)}>
                            <Terminal size={14} /> {showRaw ? 'Hide Raw' : 'View Source'}
                        </span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1px' }}>Network Device</p>
                            <p style={{ fontWeight: '700' }}>{safeStr(event.device_name || event.nas_identifier)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1px' }}>ISE Processing Node</p>
                            <p style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>{safeStr(event.server || event.acs_server)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1px' }}>Privilege Level</p>
                            <p style={{ fontWeight: '700' }}>{safeStr(event.privilege_level)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1px' }}>Service Type</p>
                            <p style={{ fontWeight: '700' }}>{safeStr(event.service || event.authen_type)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {event.command_set && event.command_set !== "N/A" && (
                <div style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--glass-bg)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>Command Executed</p>
                    <code style={{ color: 'var(--accent-primary)', fontSize: '0.95rem', fontWeight: '700' }}>{safeStr(event.command_set)}</code>
                </div>
            )}

            {showRaw && (
                <div style={{ marginTop: '16px', padding: '16px', background: '#000', borderRadius: '8px', border: '1px solid #333', overflowX: 'auto' }}>
                    <p style={{ color: '#666', fontSize: '0.7rem', marginBottom: '8px', borderBottom: '1px solid #222', paddingBottom: '4px' }}>RAW CISCO SYSLOG PAYLOAD</p>
                    <code style={{ color: '#0f0', fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{safeStr(event.raw_message)}</code>
                </div>
            )}

            {(!isPass || event.failure_reason !== "Success") && event.status !== "Passed" && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px dashed var(--status-error)' }}>
                    <p style={{ color: 'var(--status-error)', fontSize: '0.875rem', fontWeight: '500' }}>
                        Failure Reason: {safeStr(event.failure_reason)}
                    </p>
                </div>
            )}
        </div>
    );
};

export default function TacacsPage() {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [tacacsResult, setTacacsResult] = useState<{ found: boolean, sessions: TacacsEvent[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const performSearch = async (searchQuery: string = 'recent') => {
        setIsSearching(true);
        setError(null);
        try {
            const res = await fetch(`/api/ise/tacacs?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const sessions = data.sessions || data.failures || [];
            setTacacsResult({ ...data, sessions });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        performSearch('recent');
    }, []);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Shield size={40} className="text-accent" />
                        TACACS+ Administration
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                        Real-time forensic monitoring of Device Admin authentication, authorization, and command execution.
                    </p>
                </div>
                <button 
                    onClick={() => performSearch()}
                    disabled={isSearching}
                    className="glass-button"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', height: 'fit-content' }}
                >
                    <RefreshCw size={18} className={isSearching ? 'animate-spin' : ''} />
                    Refresh Feed
                </button>
            </div>

            <div className="glass-card" style={{ padding: '32px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={20} />
                        <input 
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
                            placeholder="Search by Admin Username, Device IP, or Command String..."
                            style={{ 
                                width: '100%', 
                                padding: '16px 16px 16px 48px',
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '12px',
                                color: 'var(--text-primary)',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <button 
                        onClick={() => performSearch(query)}
                        disabled={isSearching}
                        className="glass-button primary"
                        style={{ padding: '0 32px' }}
                    >
                        {isSearching ? 'Searching...' : 'Search Logs'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="glass-card" style={{ padding: '24px', border: '1px solid var(--status-error)', background: 'rgba(239, 68, 68, 0.05)', marginBottom: '32px' }}>
                    <p style={{ color: 'var(--status-error)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Activity size={20} />
                        Forensic Error: {error}
                    </p>
                </div>
            )}

            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={20} color="var(--accent-primary)" />
                    {query ? `Search Results for "${query}"` : 'Recent Administrative Activity'}
                </h3>

                {isSearching ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="glass-card skeleton" style={{ height: '140px', animation: 'pulse 1.5s infinite' }}></div>
                        ))}
                    </div>
                ) : tacacsResult ? (
                    tacacsResult.found && tacacsResult.sessions.length > 0 ? (
                        <div>
                            {tacacsResult.sessions.map((f: any, idx: number) => (
                                <TacacsCard key={idx} event={f} />
                            ))}
                        </div>
                    ) : (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '64px 32px' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                                <Search size={32} color="var(--text-secondary)" />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>No TACACS+ Logs Found</h3>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                                {query ? `We couldn't find any administrative events matching "${query}" in the specified time window.` : "No administrative activity has been recorded in the last 7 days."}
                            </p>
                        </div>
                    )
                ) : (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>Enter a search query or refresh to load recent activity.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
