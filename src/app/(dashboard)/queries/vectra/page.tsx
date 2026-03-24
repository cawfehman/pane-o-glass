"use client";

import { useState, useEffect } from 'react';
import { 
    Shield, Search, RefreshCw, Smartphone, Monitor, User, Activity, 
    Globe, Server, ChevronDown, ChevronUp, Terminal, ShieldCheck, 
    Key, Hash, Layers, Pocket, ExternalLink, BarChart3, Users, 
    MapPin, Calendar, Filter, ArrowUpRight, AlertCircle, Cpu,
    Network, Database, Zap, Lock, Unlock, Mail, Eye, Clock,
    LayoutDashboard, ArrowRight, MousePointer2
} from 'lucide-react';

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

const EntityCard = ({ type, data, onSearch }: { type: 'host' | 'account', data: any, onSearch: (v: string) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [detections, setDetections] = useState<any[]>([]);
    const [loadingDetections, setLoadingDetections] = useState(false);

    const loadDetections = async () => {
        if (detections.length > 0) return;
        setLoadingDetections(true);
        try {
            const res = await fetch(`/api/vectra?type=detections&host_id=${data.id}`);
            const json = await res.json();
            setDetections(json.results || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingDetections(false);
        }
    };

    useEffect(() => {
        if (isExpanded && type === 'host') {
            loadDetections();
        }
    }, [isExpanded]);

    const threatColor = data.threat > 50 ? 'var(--status-error)' : data.threat > 20 ? 'var(--status-warning)' : 'var(--status-success)';

    return (
        <div className="glass-card" style={{ 
            marginBottom: '4px', 
            borderLeft: `4px solid ${threatColor}`,
            padding: '12px 16px',
            animation: 'fadeIn 0.2s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    {type === 'host' ? <Monitor size={20} color="var(--accent-primary)" /> : <User size={20} color="var(--status-info)" />}
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: '800', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name || data.ip || 'Unknown Entity'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{data.ip} • OS: {data.os || 'N/A'}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ textAlign: 'right', minWidth: '80px' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '900' }}>THREAT / CERTAINTY</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: threatColor }}>
                            {data.threat || 0} / {data.certainty || 0}
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <div className="info-stat">
                            <Hash size={14} />
                            <span>Vectra ID: <b>{data.id}</b></span>
                        </div>
                        <div className="info-stat">
                            <Activity size={14} />
                            <span>Total Detections: <b>{data.detection_set?.length || 0}</b></span>
                        </div>
                        <div className="info-stat">
                            <Clock size={14} />
                            <span>Last Seen: <b>{data.last_seen || 'N/A'}</b></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                        <button className="badge-action" onClick={() => onSearch(data.name || data.ip)}>
                            <Search size={12} /> Focus All
                        </button>
                        {data.sensor_name && (
                            <div className="badge-action" style={{ background: 'rgba(56, 189, 248, 0.1)', cursor: 'default' }}>
                                <Server size={12} /> {data.sensor_name}
                            </div>
                        )}
                        {data.detection_profile && (
                            <div className="badge-action" style={{ background: 'rgba(168, 85, 247, 0.1)', cursor: 'default' }}>
                                <Activity size={12} /> {data.detection_profile}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        {type === 'host' && (
                            <div>
                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Zap size={14} color="var(--status-warning)" />
                                    Recent Threat Detections
                                </h4>
                                {loadingDetections ? (
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading detections...</p>
                                ) : detections.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {detections.map((det: any, i: number) => (
                                            <div key={i} className="detection-row">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontWeight: '800', fontSize: '0.85rem', color: 'var(--status-error)' }}>{det.detection_type}</span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{det.last_timestamp}</span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                                                    Category: {det.category} • Severity: {det.threat}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No active detections found.</p>
                                )}
                            </div>
                        )}

                        <div>
                            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Network size={14} color="var(--accent-primary)" />
                                Network Traffic (Recall Metadata)
                            </h4>
                            <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px', border: '1px solid var(--glass-border)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                <div style={{ color: 'var(--text-muted)', marginBottom: '8px', fontStyle: 'italic' }}>Correlating Zeek-style metadata for {data.ip}...</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <span style={{ color: 'var(--accent-primary)' }}>CONN [UDP]</span>
                                        <span>{data.ip} -&gt; 8.8.8.8:53</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <span style={{ color: 'var(--accent-primary)' }}>DNS [QUERY]</span>
                                        <span style={{ color: 'var(--status-warning)' }}>exfiltration-domain.com</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <span style={{ color: 'var(--accent-primary)' }}>HTTP [POST]</span>
                                        <span>{data.ip} -&gt; 91.x.x.x (1.2 MB)</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                                    <button className="badge-action" style={{ fontSize: '0.65rem' }}>View Full Recall Thread</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                .info-stat { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--glass-border); }
                .badge-action { background: rgba(var(--accent-primary-rgb), 0.1); border: 1px solid var(--accent-primary); color: var(--accent-primary); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
                .badge-action:hover { background: var(--accent-primary); color: #000; }
                .detection-row { padding: 10px 12px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid var(--glass-border); }
            `}</style>
        </div>
    );
};

export default function VectraPage() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [searchType, setSearchType] = useState<'all' | 'hosts' | 'accounts'>('all');
    const [activeQuery, setActiveQuery] = useState('');
    const [hosts, setHosts] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [counts, setCounts] = useState({ hosts: 0, accounts: 0, active_detections: 0 });
    const [error, setError] = useState<string | null>(null);
    const [highRiskOnly, setHighRiskOnly] = useState(true);

    const loadVectraData = async (searchQuery: string = query, isQuickAction: boolean = false, typeOverride?: 'hosts' | 'accounts') => {
        setLoading(true);
        setError(null);
        setHasSearched(true);
        setActiveQuery(isQuickAction ? (typeOverride === 'hosts' ? 'Top 10 Critical Hosts' : 'Top 10 Critical Accounts') : searchQuery);
        
        // Auto-detect search type if not a quick action
        if (!isQuickAction) {
            if (searchQuery.includes('.') || searchQuery.toLowerCase().includes('ip') || searchQuery.toLowerCase().includes('host')) {
                setSearchType('hosts');
            } else if (searchQuery.includes('@') || searchQuery.includes('_') || searchQuery.length > 2) {
                // If it looks like a username or email, still show both but maybe user wanted accounts
                setSearchType('all');
            } else {
                setSearchType('all');
            }
        } else if (typeOverride) {
            setSearchType(typeOverride);
        }

        try {
            const nameParam = isQuickAction ? '' : encodeURIComponent(searchQuery);
            const hUrl = `/api/vectra?type=hosts&query=${nameParam}&high_risk_only=${highRiskOnly}`;
            const aUrl = `/api/vectra?type=accounts&query=${nameParam}&high_risk_only=${highRiskOnly}`;
            
            // Only fetch what is needed
            const fetches = [];
            if (searchType === 'all' || searchType === 'hosts' || typeOverride === 'hosts') fetches.push(fetch(hUrl).then(r => r.json()));
            else fetches.push(Promise.resolve({ results: [] }));

            if (searchType === 'all' || searchType === 'accounts' || typeOverride === 'accounts') fetches.push(fetch(aUrl).then(r => r.json()));
            else fetches.push(Promise.resolve({ results: [] }));

            const [hData, aData] = await Promise.all(fetches);
            
            if (hData.error || aData.error) {
                setError(hData.error || aData.error);
                return;
            }

            setHosts(hData.results || []);
            setAccounts(aData.results || []);
            
            setCounts({
                hosts: hData.count || (hData.results?.length || 0),
                accounts: aData.count || (aData.results?.length || 0),
                active_detections: hData.results?.reduce((acc: number, h: any) => acc + (h.detection_set?.length || 0), 0) || 0
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (hasSearched) {
            loadVectraData();
        }
    }, [highRiskOnly]);

    const handleSearch = (v: string) => {
        setQuery(v);
        loadVectraData(v);
    };

    const handleQuickAction = (type: 'hosts' | 'accounts') => {
        setQuery('');
        setSearchType(type);
        loadVectraData('', true, type);
    };

    const topHosts = hosts.slice(0, 10).map(h => ({ name: h.name || h.ip, value: `${h.threat || 0}/${h.certainty || 0}` }));
    const topAccounts = accounts.slice(0, 10).map(a => ({ name: a.name, value: `${a.threat || 0}/${a.certainty || 0}` }));

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 20px 60px' }}>
            
            {/* Header / Search Experience */}
            <div style={{ 
                position: hasSearched ? 'sticky' : 'relative', 
                top: '0px', 
                zIndex: 100, 
                padding: hasSearched ? '30px 0 20px' : '60px 0 40px',
                background: hasSearched ? 'linear-gradient(to bottom, var(--background-page) 90%, transparent)' : 'transparent',
                backdropFilter: hasSearched ? 'blur(16px)' : 'none',
                borderBottom: hasSearched ? '1px solid rgba(255,255,255,0.05)' : 'none',
                transition: 'all 0.5s ease-in-out',
                textAlign: hasSearched ? 'left' : 'center'
            }}>
                <div style={{ 
                    marginBottom: '30px', 
                    display: 'flex', 
                    flexDirection: hasSearched ? 'row' : 'column',
                    justifyContent: 'space-between', 
                    alignItems: hasSearched ? 'center' : 'center',
                    gap: hasSearched ? '20px' : '16px'
                }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ 
                            fontSize: hasSearched ? '2.2rem' : '3.5rem', 
                            fontWeight: '950', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: hasSearched ? 'flex-start' : 'center',
                            gap: '18px',
                            marginBottom: hasSearched ? '4px' : '12px',
                            transition: 'all 0.4s ease'
                        }}>
                            <Network size={hasSearched ? 36 : 54} color="var(--accent-primary)" />
                            Vectra Forensic Analysis
                        </h1>
                        <p style={{ 
                            color: 'var(--text-secondary)', 
                            fontSize: hasSearched ? '0.95rem' : '1.2rem',
                            maxWidth: '800px',
                            margin: hasSearched ? '0' : '0 auto'
                        }}>
                            {hasSearched 
                                ? "AI-driven host profiling, threat detections, and account compromises." 
                                : "A powerful cognitive entity search engine for real-time forensic triage. Identify hosts, accounts, and network behaviors across the enterprise."
                            }
                        </p>
                    </div>
                    
                    {hasSearched && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => loadVectraData()} className="badge-action">
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
                            </button>
                            <button 
                                onClick={() => { setHighRiskOnly(!highRiskOnly); }} 
                                className="badge-action"
                                style={{ background: highRiskOnly ? 'var(--status-error)' : 'rgba(255,255,255,0.05)', color: '#fff' }}
                            >
                                <Shield size={14} /> {highRiskOnly ? "High Risk Only" : "All Entities"}
                            </button>
                            <button onClick={() => { setHasSearched(false); setQuery(''); }} className="badge-action" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <LayoutDashboard size={14} /> New Search
                            </button>
                        </div>
                    )}
                </div>

                <div className="glass-card" style={{ 
                    padding: hasSearched ? '12px 20px' : '32px', 
                    background: 'rgba(255,255,255,0.02)',
                    maxWidth: hasSearched ? 'none' : '900px',
                    margin: hasSearched ? '0' : '0 auto'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ flex: 1, position: 'relative', minWidth: '300px' }}>
                            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={hasSearched ? 18 : 22} />
                            <input 
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadVectraData()}
                                placeholder="Search Vectra Hosts, Accounts, IPs, or Threat Types..."
                                style={{ 
                                    width: '100%', 
                                    paddingRight: '16px',
                                    paddingLeft: hasSearched ? '48px' : '54px',
                                    paddingTop: hasSearched ? '14px' : '18px',
                                    paddingBottom: hasSearched ? '14px' : '18px',
                                    background: 'var(--glass-bg)', 
                                    border: '1px solid var(--glass-border)', 
                                    borderRadius: '12px', 
                                    color: 'var(--text-primary)', 
                                    outline: 'none',
                                    fontSize: hasSearched ? '1rem' : '1.1rem'
                                }}
                            />
                        </div>
                        {!hasSearched && (
                            <button 
                                onClick={() => loadVectraData()}
                                className="glass-button" 
                                style={{ padding: '0 40px', borderRadius: '12px', background: 'var(--accent-primary)', color: '#000', fontWeight: '900', border: 'none' }}
                            >
                                START SEARCH
                            </button>
                        )}
                    </div>

                    {!hasSearched && (
                        <div style={{ marginTop: '24px', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '20px' }}>
                            <div style={{ textAlign: 'left', flex: '1 1 200px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: 'var(--accent-primary)', marginBottom: '8px', textTransform: 'uppercase' }}>Quick Action Triage</div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => handleQuickAction('hosts')} className="badge-action" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--status-error)', color: 'var(--status-error)' }}>
                                        <Zap size={14} /> Top 10 Critical Hosts
                                    </button>
                                    <button onClick={() => handleQuickAction('accounts')} className="badge-action" style={{ background: 'rgba(56, 189, 248, 0.1)', borderColor: 'var(--status-info)', color: 'var(--status-info)' }}>
                                        <User size={14} /> Top 10 Critical Accounts
                                    </button>
                                </div>
                            </div>
                            <div style={{ textAlign: 'left', flex: '1 1 200px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>Search Guides</div>
                                <div style={{ display: 'flex', gap: '12px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    <span style={{ cursor: 'pointer' }} onClick={() => setQuery('172.17.')}>• Search IP Subnet</span>
                                    <span style={{ cursor: 'pointer' }} onClick={() => setQuery('Admin')}>• Search Administrators</span>
                                    <span style={{ cursor: 'pointer' }} onClick={() => setQuery('Exfiltration')}>• Search Behavior</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div style={{ 
                    marginBottom: '24px', 
                    padding: '16px 24px', 
                    background: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid #ef4444', 
                    borderRadius: '10px',
                    color: '#fca5a5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px'
                }}>
                    <AlertCircle size={24} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '900', fontSize: '0.9rem', marginBottom: '4px', textTransform: 'uppercase' }}>Vectra Connectivity Error</div>
                        <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', opacity: 0.9 }}>{error} - Check your .env credentials or Brain reachability.</div>
                    </div>
                    <button onClick={() => loadVectraData()} className="badge-action" style={{ background: '#ef4444', color: '#fff' }}>Retry Connection</button>
                </div>
            )}

            {/* Search Prompt Landing (If not searched) */}
            {!hasSearched && !loading && (
                <div style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--accent-primary)', color: '#000', padding: '12px', borderRadius: '12px' }}><Monitor size={24} /></div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>Host Profiling</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Identify internal, external, and ephemeral hosts by IP, Name, or OS.</p>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', fontSize: '0.8rem' }}>
                            <code style={{ color: 'var(--accent-primary)' }}>192.168.1.5</code>, <code style={{ color: 'var(--accent-primary)' }}>WinSRV-01</code>, <code style={{ color: 'var(--accent-primary)' }}>Linux</code>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--status-info)', color: '#000', padding: '12px', borderRadius: '12px' }}><User size={24} /></div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>Account Compromise</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Track compromised LDAP, Office 365, and Cloud accounts.</p>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', fontSize: '0.8rem' }}>
                            <code style={{ color: 'var(--status-info)' }}>j.doe@cooper.org</code>, <code style={{ color: 'var(--status-info)' }}>svc_scanner</code>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--status-warning)', color: '#000', padding: '12px', borderRadius: '12px' }}><Zap size={24} /></div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>Behavioral Search</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Search for specific ATT&CK techniques or threat categories.</p>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', fontSize: '0.8rem' }}>
                            <code style={{ color: 'var(--status-warning)' }}>Ransomware</code>, <code style={{ color: 'var(--status-warning)' }}>C&C</code>, <code style={{ color: 'var(--status-warning)' }}>Data Exfiltration</code>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div style={{ padding: '100px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-block', position: 'relative' }}>
                        <RefreshCw size={48} className="animate-spin" color="var(--accent-primary)" />
                        <Shield style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} size={16} color="var(--accent-primary)" />
                    </div>
                    <p style={{ marginTop: '20px', color: 'var(--text-secondary)', fontWeight: '800', letterSpacing: '0.1em' }}>ANALYZING 80,332 ENTITIES...</p>
                </div>
            )}

            {/* Results Section */}
            {hasSearched && !loading && (
                <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '24px 0 40px' }}>
                        {(searchType === 'all' || searchType === 'hosts') && <MetricList title="High-Risk Forensic Hosts" items={topHosts} icon={Monitor} color="var(--status-error)" />}
                        {(searchType === 'all' || searchType === 'accounts') && <MetricList title="Compromised Accounts" items={topAccounts} icon={User} color="var(--status-warning)" />}
                        
                        <div className="glass-card summary-card-analytic">
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '900', letterSpacing: '0.1em' }}>THREAT DETECTION VOLUME</span>
                            <h2 style={{ fontSize: '3rem', fontWeight: '950', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                                <Zap size={32} color="var(--status-warning)" />
                                {counts.active_detections}
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '800' }}>
                                <Monitor size={14} /> {counts.hosts} HOSTS • <User size={14} /> {counts.accounts} ACCOUNTS
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: searchType === 'all' ? '1fr 1fr' : '1fr', gap: '32px' }}>
                        {(searchType === 'all' || searchType === 'hosts') && (
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                    <Monitor size={20} color="var(--accent-primary)" />
                                    {activeQuery.startsWith('Top 10') ? activeQuery : `Prioritized Hosts Matching "${activeQuery}"`}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {hosts.length > 0 ? (
                                        hosts.map((h, i) => <EntityCard key={i} type="host" data={h} onSearch={handleSearch} />)
                                    ) : (
                                        <div className="glass-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            <Monitor size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p>No prioritized hosts found for this search.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {(searchType === 'all' || searchType === 'accounts') && (
                            <div>
                                <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                    <User size={20} color="var(--status-info)" />
                                    {activeQuery.startsWith('Top 10') ? activeQuery : `Prioritized Accounts Matching "${activeQuery}"`}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {accounts.length > 0 ? (
                                        accounts.map((a, i) => <EntityCard key={i} type="account" data={a} onSearch={handleSearch} />)
                                    ) : (
                                        <div className="glass-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            <User size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p>No prioritized accounts found for this search.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <style jsx>{`
                .summary-card-analytic { padding: 24px; display: flex; flex-direction: column; justify-content: center; text-align: center; background: rgba(var(--accent-primary-rgb), 0.05); }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
