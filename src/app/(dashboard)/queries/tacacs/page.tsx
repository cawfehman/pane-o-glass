"use client";

import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, Wifi, User, Activity, Globe, Save } from 'lucide-react';

interface TacacsEvent {
    timestamp: string;
    user_name: string;
    calling_station_id: string;
    nas_ip_address: string;
    nas_port_id: string;
    failure_reason: string;
    failure_id: string;
    status: boolean;
    acs_server: string;
    nas_identifier: string;
    privilege_level: string;
    command_set: string;
    authorization_rule: string;
    identity_store: string;
}

const TacacsCard = ({ event }: { event: any }) => {
    // Defensive rendering to prevent crashes on non-string data
    const safeStr = (v: any) => {
        if (v === null || v === undefined) return "N/A";
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    };

    const isPass = event.status === true || event.status === "true";
    const accentColor = isPass ? 'var(--status-success)' : 'var(--status-error)';
    const bgColor = isPass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    return (
        <div className="glass-card" style={{ 
            marginBottom: '16px', 
            borderLeft: `4px solid ${accentColor}`,
            padding: '20px',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Log Event <span style={{ fontSize: '0.7rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={16} color="var(--text-secondary)" />
                            <span style={{ fontWeight: '600', fontSize: '1.1rem' }}>{safeStr(event.user_name)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <Clock size={14} />
                            <span>{safeStr(event.timestamp)}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <Wifi size={14} />
                            <span>Device: {safeStr(event.nas_ip_address)} ({safeStr(event.nas_identifier)})</span>
                        </div>
                    </div>
                </div>

                <div style={{ borderLeft: '1px solid var(--glass-border)', paddingLeft: '24px' }}>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Forensic Details</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem' }}>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Privilege Level</p>
                            <p style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>{safeStr(event.privilege_level)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Command Set</p>
                            <p style={{ fontWeight: 'bold' }}>{safeStr(event.command_set)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Identity Store</p>
                            <p>{safeStr(event.identity_store)}</p>
                        </div>
                        <div>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2px' }}>Auth Rule</p>
                            <p>{safeStr(event.authorization_rule)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {!isPass && (
                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', border: '1px dashed var(--status-error)' }}>
                    <p style={{ color: 'var(--status-error)', fontSize: '0.875rem', fontWeight: '500' }}>
                        Failure Reason: {safeStr(event.failure_reason)} (ID: {safeStr(event.failure_id)})
                    </p>
                </div>
            )}
        </div>
    );
};

export default function TacacsPage() {
    const [query, setQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [tacacsResult, setTacacsResult] = useState<{ found: boolean, failures: TacacsEvent[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const performSearch = async (searchQuery: string = 'recent') => {
        setIsSearching(true);
        setError(null);
        try {
            const res = await fetch(`/api/ise/tacacs?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setTacacsResult(data);
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
                        Search administrative activity, command sets, and privilege level forensic logs.
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
                            placeholder="Search by Admin Username, Device IP, or Device Name..."
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
                <p style={{ marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Tip: Leave query empty to see the most recent administrative activity across all systems.
                </p>
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
                    tacacsResult.found && tacacsResult.failures.length > 0 ? (
                        <div>
                            {tacacsResult.failures.map((f: any, idx: number) => (
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
