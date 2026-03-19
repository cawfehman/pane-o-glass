"use client";

import { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, Wifi, User, Activity, Globe, Save, ChevronDown, ChevronUp, Terminal, ShieldCheck, Key, Hash, Layers, Pocket, ExternalLink, BarChart3, Users, Monitor, MapPin, Calendar, Filter, ArrowUpRight, AlertCircle } from 'lucide-react';

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

const CiscoPayloadHighlighter = ({ raw }: { raw: string }) => {
    if (!raw) return null;
    const regex = /([a-zA-Z0-9_\-\s]+?)(=)("(.*?)"|\[(.*?)\]|(.+?))(?=\s*[a-zA-Z0-9_\-\s]+?=|,|\]|$)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(raw)) !== null) {
        if (match.index > lastIndex) {
            parts.push(<span key={`text-${lastIndex}`} style={{ color: '#666' }}>{raw.substring(lastIndex, match.index)}</span>);
        }
        const key = match[1];
        const eq = match[2];
        const val = match[3];
        parts.push(<span key={`key-${match.index}`} style={{ color: '#eab308', fontWeight: 'bold' }}>{key}</span>);
        parts.push(<span key={`eq-${match.index}`} style={{ color: '#999' }}>{eq}</span>);
        parts.push(<span key={`val-${match.index}`} style={{ color: '#22c55e' }}>{val}</span>);
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < raw.length) {
        parts.push(<span key={`tail-${lastIndex}`} style={{ color: '#666' }}>{raw.substring(lastIndex)}</span>);
    }
    return <code style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{parts}</code>;
};

const TacacsCard = ({ event, onQuickSearch }: { event: any, onQuickSearch: (val: string) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    const safeStr = (v: any) => {
        if (v === null || v === undefined || v === "" || v === "N/A") return null;
        if (typeof v === 'string') return v;
        return String(v);
    };

    const isPass = event.status === "Passed" || event.status === true || event.status === "Success";
    const accentColor = isPass ? 'var(--status-success)' : 'var(--status-error)';
    const isAccounting = event.command_set && event.command_set !== "N/A";

    const ClickableText = ({ label, value, icon: Icon }: any) => (
        <div 
            onClick={(e) => { e.stopPropagation(); onQuickSearch(value); }}
            title={`Pivot search to ${value}`}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}
            className="hover-bright"
        >
            <Icon size={12} color="var(--text-secondary)" />
            <span style={{ color: 'var(--text-secondary)' }}>{label}:</span>
            <span style={{ fontWeight: '600', borderBottom: '1px dashed transparent' }} className="hover-underline">{value}</span>
        </div>
    );

    if (!isExpanded) {
        return (
            <div 
                onClick={() => setIsExpanded(true)}
                className="glass-card feed-card-compact"
                style={{ 
                    marginBottom: '4px', 
                    borderLeft: `3px solid ${accentColor}`,
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    background: isAccounting ? 'rgba(var(--accent-primary-rgb), 0.05)' : 'var(--glass-bg)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '140px' }}>
                        <User size={14} color="var(--accent-primary)" />
                        <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>{event.user_name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px' }}>
                        <Wifi size={14} color="var(--text-secondary)" />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{event.device_name}</span>
                    </div>
                    {isAccounting && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                            <Activity size={12} color="var(--status-success)" />
                            <code style={{ fontSize: '0.8rem', color: 'var(--status-success)', opacity: 0.9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.command_set}</code>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.8 }}>{event.timestamp.split('T')[1].split('.')[0]}</span>
                    <ChevronDown size={14} color="var(--text-secondary)" />
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card" style={{ 
            marginBottom: '12px', 
            borderLeft: `4px solid ${accentColor}`,
            padding: '16px 20px',
            animation: 'fadeIn 0.2s ease-out',
            background: 'var(--glass-bg-elevated)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => onQuickSearch(event.user_name)}>
                    <div style={{ padding: '8px', background: 'var(--glass-bg)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <User size={20} color="var(--accent-primary)" />
                    </div>
                    <div>
                        <span style={{ fontWeight: '800', fontSize: '1.2rem' }}>{event.user_name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>Forensic Analytics</span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{event.timestamp}</span>
                    <button onClick={() => setIsExpanded(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <ChevronUp size={20} />
                    </button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <ClickableText label="Network Device" value={event.device_name} icon={Wifi} />
                <ClickableText label="Target IP" value={event.nas_ip_address} icon={Globe} />
                <ClickableText label="Source" value={event.calling_station_id} icon={Pocket} />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {safeStr(event.identity_group) && (
                    <div onClick={() => onQuickSearch(event.identity_group)} className="badge-clickable">
                        <Shield size={12} color="var(--accent-primary)" />
                        <span>Group: <b>{event.identity_group}</b></span>
                    </div>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button onClick={() => setShowRaw(!showRaw)} className="text-button">
                        <Terminal size={14} /> {showRaw ? 'Hide Payload' : 'Syntax-Highlight Payload'}
                    </button>
                </div>
            </div>

            {isAccounting && (
                <div className="command-box-analytic">
                    <Activity size={14} color="var(--status-success)" />
                    <code onClick={() => onQuickSearch(event.command_set)}>{event.command_set}</code>
                </div>
            )}

            {showRaw && (
                <div className="raw-payload-highlighted">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #222', paddingBottom: '4px' }}>
                        <span style={{ fontSize: '0.65rem', color: '#444', fontWeight: 'bold' }}>CISCO GREEDY FORENSIC HIGHLIGHTER (v3.0.3)</span>
                        <span style={{ fontSize: '0.65rem', color: '#eab308' }}>KEY <span style={{ color: '#666' }}>=</span> <span style={{ color: '#22c55e' }}>VALUE</span></span>
                    </div>
                    <CiscoPayloadHighlighter raw={event.raw_message} />
                </div>
            )}
        </div>
    );
};

// --- IRON-CLAD MODIFIED METRIC UI (v3.2.3) ---
const MetricList = ({ title, items, icon: Icon, color }: any) => (
    <div className="glass-card" style={{ flex: 1, padding: '16px', minWidth: '280px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
            <Icon size={18} color={color} />
            <span style={{ fontWeight: '800', fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {items && items.length > 0 ? items.map((item: any, idx: number) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px', width: '100%', minWidth: 0, padding: '4px 0' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '500', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: '0 1 auto', minWidth: 0, maxWidth: 'calc(100% - 70px)' }} title={item.name}>
                        {item.name}
                    </span>
                    <div style={{ flex: 1, borderBottom: '1px dotted rgba(255,255,255,0.1)', margin: '0 4px', opacity: 0.5, height: '8px' }}></div>
                    <span style={{ flex: '0 0 auto', fontSize: '0.75rem', fontWeight: '800', padding: '2px 8px', borderRadius: '4px', background: `${color}22`, color: color, minWidth: '42px', textAlign: 'center' }}>
                        {item.value}
                    </span>
                </div>
            )) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '10px' }}>No Data</p>
            )}
        </div>
    </div>
);

export default function TacacsPage() {
    const [query, setQuery] = useState('');
    const [window, setWindow] = useState('1h');
    const [isSearching, setIsSearching] = useState(false);
    const [tacacsResult, setTacacsResult] = useState<{ found: boolean, sessions: TacacsEvent[], metrics?: any } | null>(null);

    const performSearch = async (searchQuery: string = query, timeWindow: string = window) => {
        setIsSearching(true);
        try {
            const res = await fetch(`/api/ise/tacacs?query=${encodeURIComponent(searchQuery)}&window=${timeWindow}`);
            const data = await res.json();
            setTacacsResult(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSearching(false);
        }
    };

    const handleQuickSearch = (val: string) => {
        setQuery(val);
        performSearch(val, window);
        document.querySelector('.feed-anchor')?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleWindowChange = (newWindow: string) => {
        setWindow(newWindow);
        performSearch(query, newWindow);
    };

    useEffect(() => {
        performSearch();
    }, []);

    const totalEvents = tacacsResult?.metrics?.total_events || 0;
    const failures = tacacsResult?.metrics?.failures || 0;

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 20px 60px' }}>
            
            <div style={{ 
                position: 'sticky', 
                top: '0px', 
                zIndex: 100, 
                padding: '30px 0 20px',
                background: 'linear-gradient(to bottom, var(--background-page) 90%, transparent)',
                backdropFilter: 'blur(16px)',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <Shield size={36} color="var(--accent-primary)" />
                            Forensic Intelligence
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Administrative command accountability & behavioral statistics.</p>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '4px', border: '1px solid var(--glass-border)' }}>
                            <Calendar size={14} style={{ margin: '0 8px', color: 'var(--text-secondary)' }} />
                            {['15m', '1h', '12h', '24h', '7d'].map((w) => (
                                <button
                                    key={w}
                                    onClick={() => handleWindowChange(w)}
                                    style={{ 
                                        padding: '6px 16px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '800', border: 'none', cursor: 'pointer',
                                        background: window === w ? 'var(--accent-primary)' : 'transparent',
                                        color: window === w ? '#000' : 'var(--text-secondary)',
                                        transition: 'all 0.2s xase'
                                    }}
                                >
                                    {w}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => performSearch()} disabled={isSearching} className="glass-button" style={{ padding: '10px' }}>
                            <RefreshCw size={18} className={isSearching ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                            <input 
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && performSearch()}
                                placeholder="Search Command Strings, User Identities, or Device Hostnames..."
                                style={{ width: '100%', padding: '14px 16px 14px 48px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '24px 0 40px' }}>
                <MetricList title="Top Administrative Users" items={tacacsResult?.metrics?.top_usernames} icon={Users} color="var(--accent-primary)" />
                <MetricList title="Top Source Ingress" items={tacacsResult?.metrics?.top_sources} icon={MapPin} color="var(--status-warning)" />
                <MetricList title="Network Device Focus" items={tacacsResult?.metrics?.top_devices} icon={Monitor} color="var(--status-info)" />
                
                <div className="glass-card summary-card-analytic">
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '900', letterSpacing: '0.1em' }}>BUFFER VOLUME ({window})</span>
                    <h2 style={{ fontSize: '3rem', fontWeight: '950' }}>{totalEvents}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: failures > 0 ? 'var(--status-error)' : 'var(--status-success)', fontSize: '0.8rem', fontWeight: '800' }}>
                        <AlertCircle size={14} />
                        {failures} FAILURES
                    </div>
                </div>
            </div>

            <div className="feed-anchor" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <Activity size={20} color="var(--accent-primary)" />
                    High-Density Forensic Feed
                </h3>
                <span className="count-badge">{tacacsResult?.sessions?.length || 0} RECORDS</span>
            </div>

            {isSearching ? (
                <div style={{ textAlign: 'center', padding: '120px' }}>
                    <RefreshCw size={48} className="animate-spin" style={{ color: 'var(--accent-primary)', opacity: 0.3 }} />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {tacacsResult?.sessions?.map((event, idx) => (
                        <TacacsCard key={idx} event={event} onQuickSearch={handleQuickSearch} />
                    ))}
                </div>
            )}
            
            <style jsx>{`
                .feed-card-compact:hover { background: rgba(255,255,255,0.05) !important; z-index: 10; }
                .summary-card-analytic { padding: 24px; display: flex; flex-direction: column; justify-content: center; text-align: center; background: rgba(var(--accent-primary-rgb), 0.05); }
                .command-box-analytic { padding: 12px 14px; background: #000; border-radius: 6px; border: 1px solid #222; margin-top: 12px; display: flex; align-items: center; gap: 10px; }
                .command-box-analytic code { color: var(--status-success); font-weight: 800; cursor: pointer; font-size: 1rem; }
                .raw-payload-highlighted { margin-top: 12px; padding: 16px; background: #080808; border-radius: 8px; border: 1px solid #222; overflow-x: auto; font-family: 'JetBrains Mono', monospace; }
                .badge-clickable { display: flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(var(--accent-primary-rgb), 0.1); border-radius: 6px; font-size: 0.75rem; border: 1px solid var(--glass-border); cursor: pointer; }
                .text-button { background: none; border: none; color: var(--accent-primary); font-size: 0.75rem; cursor: pointer; display: flex; alignItems: center; gap: 6px; padding: 4px; opacity: 0.8; }
                .count-badge { font-size: 0.7rem; font-weight: 900; background: var(--accent-primary); color: #000; padding: 2px 10px; border-radius: 4px; }
            `}</style>
        </div>
    );
}
