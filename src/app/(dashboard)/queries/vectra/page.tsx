"use client";

import { useState, useEffect } from 'react';
import { 
    Shield, Search, RefreshCw, Smartphone, Monitor, User, Activity, 
    Globe, Server, ChevronDown, ChevronUp, Terminal, ShieldCheck, 
    Key, Hash, Layers, Pocket, ExternalLink, BarChart3, Users, 
    MapPin, Calendar, Filter, ArrowUpRight, AlertCircle, Cpu,
    Network, Database, Zap, Lock, Unlock, Mail, Eye, Clock
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
                            {data.threat} / {data.certainty}
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
                            <Search size={12} /> Focus All Activity
                        </button>
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
                .info-stat { display: flex; alignItems: center; gap: 10px; font-size: 0.8rem; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--glass-border); }
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
    const [hosts, setHosts] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [counts, setCounts] = useState({ hosts: 0, accounts: 0, active_detections: 0 });

    const loadVectraData = async (searchQuery: string = query) => {
        setLoading(true);
        try {
            const [hRes, aRes] = await Promise.all([
                fetch(`/api/vectra?type=hosts&query=${encodeURIComponent(searchQuery)}`),
                fetch(`/api/vectra?type=accounts&query=${encodeURIComponent(searchQuery)}`)
            ]);
            
            const hData = await hRes.json();
            const aData = await aRes.json();
            
            setHosts(hData.results || []);
            setAccounts(aData.results || []);
            
            // Derive counts
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
        loadVectraData();
    }, []);

    const handleSearch = (v: string) => {
        setQuery(v);
        loadVectraData(v);
    };

    const topHosts = hosts.slice(0, 10).map(h => ({ name: h.name || h.ip, value: `${h.threat}/${h.certainty}` }));
    const topAccounts = accounts.slice(0, 10).map(a => ({ name: a.name, value: `${a.threat}/${a.certainty}` }));

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
                            <Network size={36} color="var(--accent-primary)" />
                            Vectra Forensic Analysis
                        </h1>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>AI-driven host profiling, threat detections, and account compromises.</p>
                    </div>
                    
                    <button onClick={() => loadVectraData()} disabled={loading} className="glass-button" style={{ padding: '12px 24px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        Refresh Intelligence
                    </button>
                </div>

                <div className="glass-card" style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                            <input 
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && loadVectraData()}
                                placeholder="Search Vectra Hosts, Accounts, IPs, or Threat Types..."
                                style={{ width: '100%', padding: '14px 16px 14px 48px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '10px', color: 'var(--text-primary)', outline: 'none' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', margin: '24px 0 40px' }}>
                <MetricList title="High-Risk Forensic Hosts" items={topHosts} icon={Monitor} color="var(--status-error)" />
                <MetricList title="Compromised Accounts" items={topAccounts} icon={User} color="var(--status-warning)" />
                
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                        <Monitor size={20} color="var(--accent-primary)" />
                        Prioritized Hosts
                    </h3>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}><RefreshCw className="animate-spin" /></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {hosts.map((h, i) => <EntityCard key={i} type="host" data={h} onSearch={handleSearch} />)}
                        </div>
                    )}
                </div>

                <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                        <User size={20} color="var(--status-info)" />
                        Prioritized Accounts
                    </h3>
                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center' }}><RefreshCw className="animate-spin" /></div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {accounts.map((a, i) => <EntityCard key={i} type="account" data={a} onSearch={handleSearch} />)}
                        </div>
                    )}
                </div>
            </div>
            
            <style jsx>{`
                .summary-card-analytic { padding: 24px; display: flex; flex-direction: column; justify-content: center; text-align: center; background: rgba(var(--accent-primary-rgb), 0.05); }
            `}</style>
        </div>
    );
}
