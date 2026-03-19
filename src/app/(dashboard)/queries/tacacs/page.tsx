"use client";

import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, Wifi, User, Activity, Globe, Save, ChevronDown, ChevronUp, Terminal, ShieldCheck, Key, Hash, Layers, Pocket } from 'lucide-react';

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
    authen_method: string;
    service: string;
    identity_group: string;
    shell_profile: string;
    raw_message: string;
}

const TacacsCard = ({ event }: { event: any }) => {
    const [showRaw, setShowRaw] = useState(false);

    const safeStr = (v: any) => {
        if (v === null || v === undefined || v === "" || v === "N/A") return null;
        if (typeof v === 'string') return v;
        return String(v);
    };

    const isPass = event.status === "Passed" || event.status === true || event.status === "true";
    const accentColor = isPass ? 'var(--status-success)' : 'var(--status-error)';
    const bgColor = isPass ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)';
    
    const isAccounting = event.command_set && event.command_set !== "N/A";

    return (
        <div className="glass-card" style={{ 
            marginBottom: '12px', 
            borderLeft: `4px solid ${accentColor}`,
            padding: '16px 20px',
            animation: 'fadeIn 0.2s ease-out',
            background: isAccounting ? 'rgba(var(--accent-primary-rgb), 0.02)' : 'var(--glass-bg)'
        }}>
            {/* Header Row: User & Status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ padding: '8px', background: 'var(--glass-bg)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <User size={18} color="var(--accent-primary)" />
                    </div>
                    <div>
                        <span style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{event.user_name || "Unknown"}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>Admin Session</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} /> {event.timestamp}
                    </span>
                    <span style={{ fontSize: '0.7rem', background: isPass ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: accentColor, padding: '2px 10px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold', border: `1px solid ${accentColor}44` }}>
                        {isPass ? 'Success' : 'Failed'}
                    </span>
                </div>
            </div>

            {/* Device Context Row */}
            <div style={{ display: 'flex', gap: '24px', marginBottom: '16px', padding: '10px 14px', background: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                    <Wifi size={14} color="var(--text-secondary)" />
                    <span style={{ color: 'var(--text-secondary)' }}>Device:</span>
                    <span style={{ fontWeight: '600' }}>{event.device_name || "Unknown Device"}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                    <Globe size={14} color="var(--text-secondary)" />
                    <span style={{ color: 'var(--text-secondary)' }}>Management IP:</span>
                    <span style={{ fontWeight: '600' }}>{event.nas_ip_address}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                    <Pocket size={14} color="var(--text-secondary)" />
                    <span style={{ color: 'var(--text-secondary)' }}>Source:</span>
                    <span style={{ fontWeight: '600' }}>{event.calling_station_id}</span>
                </div>
            </div>

            {/* Forensic Detail Bar (Badges) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {safeStr(event.identity_group) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(var(--accent-primary-rgb), 0.1)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--glass-border)' }}>
                        <Shield size={12} color="var(--accent-primary)" />
                        <span style={{ color: 'var(--text-secondary)' }}>Group:</span>
                        <span style={{ fontWeight: '700' }}>{event.identity_group}</span>
                    </div>
                )}
                {safeStr(event.privilege_level) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--glass-bg)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--glass-border)' }}>
                        <Hash size={12} color="var(--text-secondary)" />
                        <span style={{ color: 'var(--text-secondary)' }}>Privilege:</span>
                        <span style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>{event.privilege_level}</span>
                    </div>
                )}
                {safeStr(event.shell_profile) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'var(--glass-bg)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--glass-border)' }}>
                        <Layers size={12} color="var(--text-secondary)" />
                        <span style={{ color: 'var(--text-secondary)' }}>Profile:</span>
                        <span style={{ fontWeight: '700' }}>{event.shell_profile}</span>
                    </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{event.authen_method || "N/A"} / {event.service || "N/A"}</span>
                    <button 
                        onClick={() => setShowRaw(!showRaw)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                    >
                        <Terminal size={14} /> {showRaw ? 'Hide Payload' : 'View Payload'}
                    </button>
                </div>
            </div>

            {/* Command Set Highlight (Primary for Accounting) */}
            {isAccounting && (
                <div style={{ padding: '12px 16px', background: '#000', borderRadius: '8px', border: '1px solid #333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Activity size={14} color="var(--status-success)" />
                        <span style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Administrative Command Executed</span>
                    </div>
                    <code style={{ color: 'var(--status-success)', fontSize: '1rem', fontWeight: '800', fontFamily: 'monospace' }}>{event.command_set}</code>
                </div>
            )}

            {/* Raw Message (Hidden by Default) */}
            {showRaw && (
                <div style={{ marginTop: '12px', padding: '16px', background: '#000', borderRadius: '8px', border: '1px solid #222', overflowX: 'auto', animation: 'slideDown 0.2s ease-out' }}>
                    <p style={{ color: '#444', fontSize: '0.7rem', marginBottom: '8px', borderBottom: '1px solid #111', paddingBottom: '4px' }}>CISCO SYSLOG ARCHIVE PAYLOAD</p>
                    <code style={{ color: '#0f0', fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', opacity: 0.8 }}>{event.raw_message}</code>
                </div>
            )}

            {/* Failure Logic */}
            {(!isPass || (event.failure_reason && event.failure_reason !== "Success")) && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <p style={{ color: 'var(--status-error)', fontSize: '0.85rem', fontWeight: '600' }}>
                        Alert: {event.failure_reason || "Authentication Rejected"}
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

    const performSearch = async (searchQuery: string = '') => {
        setIsSearching(true);
        setError(null);
        try {
            const endpoint = searchQuery 
                ? `/api/ise/tacacs?query=${encodeURIComponent(searchQuery)}`
                : `/api/ise/tacacs`;
            
            const res = await fetch(endpoint);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            const sessions = data.sessions || [];
            setTacacsResult({ ...data, sessions });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        performSearch();
    }, []);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
            <div style={{ marginBottom: '40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Shield size={40} className="text-accent" />
                        TACACS+ Forensic Audit
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                        Linear administrative monitoring. Tracking command accountability and privilege elevations.
                    </p>
                </div>
                <button 
                    onClick={() => performSearch(query)}
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
                            placeholder="Universal Search (Admin, Device IP, Hostname, CmdSet, or LDAP Group)..."
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
                        {isSearching ? 'Analyzing...' : 'Execute Search'}
                    </button>
                </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Hash size={20} color="var(--accent-primary)" />
                    {query ? `Forensic Matches for "${query}"` : 'Real-Time Administrative Feed'}
                </h3>

                {isSearching ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[1, 2, 3].map(i => (
                            <div key={i} className="glass-card skeleton" style={{ height: '120px', animation: 'pulse 1.5s infinite' }}></div>
                        ))}
                    </div>
                ) : tacacsResult ? (
                    tacacsResult.found && tacacsResult.sessions.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {tacacsResult.sessions.map((f: any, idx: number) => (
                                <TacacsCard key={idx} event={f} />
                            ))}
                        </div>
                    ) : (
                        <div className="glass-card" style={{ textAlign: 'center', padding: '64px 32px' }}>
                            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--glass-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                                <Search size={32} color="var(--text-secondary)" />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Zero Forensic Matches</h3>
                            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                                {query ? `No administrative sessions match "${query}" in the active 1,000-record buffer.` : "The administrative feed is currently empty. Ensure your ISE node is sending syslog to port 1514."}
                            </p>
                        </div>
                    )
                ) : (
                    <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>Execute a forensic search to begin analyzing administrative activity.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
