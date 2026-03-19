"use client";

import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, Wifi, User, Activity, Globe, Save, ChevronDown, ChevronUp, Terminal, ShieldCheck, Key, Hash, Layers, Pocket, ExternalLink } from 'lucide-react';

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

const TacacsCard = ({ event, onQuickSearch }: { event: any, onQuickSearch: (val: string) => void }) => {
    const [showRaw, setShowRaw] = useState(false);

    const safeStr = (v: any) => {
        if (v === null || v === undefined || v === "" || v === "N/A") return null;
        if (typeof v === 'string') return v;
        return String(v);
    };

    const isPass = event.status === "Passed" || event.status === true || event.status === "true";
    const accentColor = isPass ? 'var(--status-success)' : 'var(--status-error)';
    
    const isAccounting = event.command_set && event.command_set !== "N/A";

    const ClickableText = ({ label, value, icon: Icon }: any) => (
        <div 
            onClick={() => onQuickSearch(value)}
            title={`Click to filter logs for ${value}`}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px', 
                fontSize: '0.9rem', 
                cursor: 'pointer',
                transition: 'all 0.2s ease'
            }}
            className="hover-bright"
        >
            <Icon size={14} color="var(--text-secondary)" />
            <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
            <span style={{ fontWeight: '600', borderBottom: '1px dashed transparent', display: 'flex', alignItems: 'center', gap: '4px' }} className="hover-underline">
                {value}
                <ExternalLink size={10} style={{ opacity: 0.5 }} />
            </span>
        </div>
    );

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
                <div 
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => onQuickSearch(event.user_name)}
                    title={`Click to pivot search to User: ${event.user_name}`}
                    className="hover-bright"
                >
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
                <ClickableText label="Device" value={event.device_name} icon={Wifi} />
                <ClickableText label="Management IP" value={event.nas_ip_address} icon={Globe} />
                <ClickableText label="Source" value={event.calling_station_id} icon={Pocket} />
            </div>

            {/* Forensic Detail Bar (Badges) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {safeStr(event.identity_group) && (
                    <div 
                        onClick={() => onQuickSearch(event.identity_group)}
                        title={`Pivot search by Group: ${event.identity_group}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', background: 'rgba(var(--accent-primary-rgb), 0.1)', borderRadius: '6px', fontSize: '0.75rem', border: '1px solid var(--glass-border)', cursor: 'pointer' }}
                        className="hover-bright"
                    >
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
                        title="Toggle raw Cisco Syslog payload"
                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' }}
                    >
                        <Terminal size={14} /> {showRaw ? 'Hide Payload' : 'View Payload'}
                    </button>
                </div>
            </div>

            {/* Command Set Highlight */}
            {isAccounting && (
                <div style={{ padding: '12px 16px', background: '#000', borderRadius: '8px', border: '1px solid #333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <Activity size={14} color="var(--status-success)" />
                        <span style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.05em' }}>Administrative Command Executed</span>
                    </div>
                    <code 
                        style={{ color: 'var(--status-success)', fontSize: '1rem', fontWeight: '800', fontFamily: 'monospace', cursor: 'pointer' }}
                        onClick={() => onQuickSearch(event.command_set)}
                        title={`Search logs for command: ${event.command_set}`}
                    >
                        {event.command_set}
                    </code>
                </div>
            )}

            {showRaw && (
                <div style={{ marginTop: '12px', padding: '16px', background: '#000', borderRadius: '8px', border: '1px solid #222', overflowX: 'auto', animation: 'slideDown 0.2s ease-out' }}>
                    <p style={{ color: '#444', fontSize: '0.7rem', marginBottom: '8px', borderBottom: '1px solid #111', paddingBottom: '4px' }}>CISCO SYSLOG ARCHIVE PAYLOAD</p>
                    <code style={{ color: '#0f0', fontSize: '0.8rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', opacity: 0.8 }}>{event.raw_message}</code>
                </div>
            )}

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

    const handleQuickSearch = (val: string) => {
        setQuery(val);
        performSearch(val);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                        Interactive administrative monitoring. Click any field to quickly pivot forensic searches.
                    </p>
                </div>
                <button 
                    onClick={() => performSearch(query)}
                    disabled={isSearching}
                    className="glass-button"
                    title="Refresh forensic feed"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', height: 'fit-content' }}
                >
                    <RefreshCw size={18} className={isSearching ? 'animate-spin' : ''} />
                    Refresh Feed
                </button>
            </div>

            {/* STICKY SEARCH HEADER (v2.9.3) */}
            <div style={{ 
                position: 'sticky', 
                top: '0px', 
                zIndex: 100, 
                padding: '20px 0',
                background: 'linear-gradient(to bottom, var(--background-page) 80%, transparent)',
                backdropFilter: 'blur(8px)',
                marginBottom: '20px'
            }}>
                <div className="glass-card" style={{ padding: '24px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={20} />
                            <input 
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && performSearch(query)}
                                placeholder="Universal Search (Admin, Device, Command, or Group)..."
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
                            title="Execute forensic search"
                        >
                            {isSearching ? 'Searching...' : 'Search Logs'}
                        </button>
                    </div>
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
                                <TacacsCard key={idx} event={f} onQuickSearch={handleQuickSearch} />
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
            
            <style jsx>{`
                .hover-bright:hover {
                    filter: brightness(1.3);
                }
                .hover-underline:hover {
                    text-decoration: underline;
                }
                @keyframes slideDown {
                    from { transform: translateY(-10px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
