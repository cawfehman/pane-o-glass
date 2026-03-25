"use client";

import { useState, useEffect } from 'react';
import { 
    Shield, Search, RefreshCw, Smartphone, Monitor, User, Activity, 
    Globe, Server, ChevronDown, ChevronUp, Terminal, ShieldCheck, 
    Key, Hash, Layers, Pocket, ExternalLink, BarChart3, Users, 
    MapPin, Calendar, Filter, ArrowUpRight, AlertCircle, Cpu,
    Network, Database, Zap, Lock, Unlock, Mail, Eye, Clock,
    LayoutDashboard, ArrowRight, MousePointer2, UserCheck, HardDrive,
    UserPlus, Link2
} from 'lucide-react';

const EntityCard = ({ type, data, onSearch }: { type: 'host' | 'account', data: any, onSearch: (v: string) => void }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [details, setDetails] = useState<any>(null);
    const [detections, setDetections] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [correlations, setCorrelations] = useState<{name: string, type: string, id?: string}[]>([]);

    const loadDetails = async () => {
        if (details && detections.length > 0) return;
        setLoadingDetails(true);
        try {
            // 1. Fetch Details
            const dUrl = type === 'host' 
                ? `/api/vectra?type=host_details&host_id=${data.id}` 
                : `/api/vectra?type=account_details&account_id=${data.id}`;
            const dRes = await fetch(dUrl);
            const fullData = await dRes.json();
            setDetails(fullData);

            // 2. Fetch High-Fidelity Detections
            const detUrl = type === 'host'
                ? `/api/vectra?type=detections&host_id=${data.id}`
                : `/api/vectra?type=detections&query=${encodeURIComponent(data.name)}`; 
            const detRes = await fetch(detUrl);
            const detData = await detRes.json();
            const rawDetections = detData.results || [];
            console.log(`[FORENSIC] Telemetry for ${data.name}:`, rawDetections);
            setDetections(rawDetections);

            // 3. Heuristic Identity Synthesis (Forensic Calculation)
            const accCounts: Record<string, {count: number, score: number}> = {};
            rawDetections.forEach((det: any) => {
                const name = det.account || det.account_name || det.account_info?.name;
                if (name && typeof name === 'string' && name.length > 2) {
                    accCounts[name] = { 
                        count: (accCounts[name]?.count || 0) + 1,
                        score: Math.max(accCounts[name]?.score || 0, det.threat || det.t_score || 0)
                    };
                }
            });

            const sortedAccs = Object.entries(accCounts).sort((a,b) => b[1].count - a[1].count || b[1].score - a[1].score);
            const synthesizedOwner = sortedAccs.length > 0 ? sortedAccs[0][0] : null;

            // Update fullData with synthesis if null
            if (!fullData.probable_owner && (synthesizedOwner || fullData.last_account_name)) {
                fullData._is_ident_synthesized = true;
                fullData.probable_owner = { 
                    name: synthesizedOwner || fullData.last_account_name,
                    id: null 
                };
            }

            // 4. Deep Correlation Extraction
            const links: any[] = [];
            const seen = new Set<string>();

            // Schema Associations
            if (fullData.probable_owner?.name) {
                links.push({ name: fullData.probable_owner.name, type: 'account' });
                seen.add(fullData.probable_owner.name);
            }
            if (fullData.last_account_name && !seen.has(fullData.last_account_name)) {
                links.push({ name: fullData.last_account_name, type: 'account' });
                seen.add(fullData.last_account_name);
            }
            if (fullData.probable_home?.name) {
                links.push({ name: fullData.probable_home.name, type: 'host' });
                seen.add(fullData.probable_home.name);
            }

            // Behavioral Traversal
            rawDetections.forEach((det: any) => {
                // Account Candidates
                [det.account, det.account_name, det.account_info?.name].forEach(cand => {
                    const name = typeof cand === 'string' ? cand : cand?.name;
                    if (name && name.length > 2 && !seen.has(name)) {
                        links.push({ name, type: 'account' });
                        seen.add(name);
                    }
                });

                // Host Candidates
                const hostCand = [
                    det.host, 
                    det.host_name, 
                    ...(det.dst_hosts?.map((h: any) => h.name) || []),
                    ...(det.src_hosts?.map((h: any) => h.name) || [])
                ];
                hostCand.forEach(cand => {
                    const name = typeof cand === 'string' ? cand : cand?.name;
                    if (name && name.length > 2 && !seen.has(name) && name !== data.name) {
                        links.push({ name, type: 'host' });
                        seen.add(name);
                    }
                });
            });

            setCorrelations(links);
            setDetails({...fullData}); 
        } catch (e) {
            console.error("Forensic Enrichment Failed:", e);
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        if (isExpanded) {
            loadDetails();
        }
    }, [isExpanded]);

    const threat = data.threat ?? data.t_score ?? 0;
    const certainty = data.certainty ?? data.c_score ?? 0;
    const threatColor = threat > 50 ? 'var(--status-error)' : threat > 20 ? 'var(--status-warning)' : 'var(--status-success)';
    const isActive = (threat > 0 || certainty > 0);

    return (
        <div className="glass-card" style={{ 
            marginBottom: '4px', 
            borderLeft: `4px solid ${isActive ? threatColor : 'var(--text-muted)'}`,
            padding: '12px 16px',
            animation: 'fadeIn 0.2s ease-out',
            opacity: isActive ? 1 : 0.8
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    <div style={{ 
                        background: isActive ? `${threatColor}22` : 'rgba(255,255,255,0.05)', 
                        padding: '10px', 
                        borderRadius: '10px',
                        border: `1px solid ${isActive ? threatColor : 'var(--glass-border)'}`
                    }}>
                        {type === 'host' ? <Monitor size={20} color={isActive ? "var(--accent-primary)" : "var(--text-muted)"} /> : <User size={20} color={isActive ? "var(--status-info)" : "var(--text-muted)"} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: '800', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name || data.ip || 'Unknown Entity'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {data.ip && <span>{data.ip} • </span>} 
                            Last Seen: {data.last_seen || 'N/A'}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ textAlign: 'right', minWidth: '80px' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: '900' }}>THREAT / CERTAINTY</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: isActive ? threatColor : 'var(--text-muted)' }}>
                            {threat} / {certainty}
                        </div>
                    </div>
                    {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>
            </div>

            {isExpanded && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {loadingDetails ? (
                        <div style={{ padding: '20px', textAlign: 'center' }}>
                            <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" />
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>Correlating forensic metadata...</p>
                        </div>
                    ) : (
                        <>
                            {/* Primary Attribution & Ownership Section */}
                            <div style={{ background: 'rgba(56, 189, 248, 0.05)', borderRadius: '12px', padding: '16px', border: '1px solid rgba(56, 189, 248, 0.2)', marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--status-info)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900' }}>
                                    <UserCheck size={14} />
                                    Forensic Entity Attribution
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                    {type === 'host' ? (
                                        <>
                                            <div className="attribution-box">
                                                <div className="attr-label">
                                                    {details?._is_ident_synthesized ? 'Probable Owner (Telemetry)' : 'Probable Owner (Modeling)'}
                                                </div>
                                                <div className="attr-value">
                                                    {details?.probable_owner ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <button 
                                                                className="pivot-link" 
                                                                onClick={(e) => { e.stopPropagation(); onSearch(details.probable_owner.name); }}
                                                            >
                                                                <User size={14} /> {details.probable_owner.name}
                                                            </button>
                                                            {details._is_ident_synthesized && (
                                                                <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                                                                    LEAD
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : <span className="attr-none">Identification in progress...</span>}
                                                </div>
                                            </div>
                                            <div className="attribution-box">
                                                <div className="attr-label">Last Known User (Login)</div>
                                                <div className="attr-value">
                                                    {details?.last_account_name ? (
                                                        <button 
                                                            className="pivot-link" 
                                                            onClick={(e) => { e.stopPropagation(); onSearch(details.last_account_name); }}
                                                        >
                                                            <Link2 size={14} /> {details.last_account_name}
                                                        </button>
                                                    ) : <span className="attr-none">No recent login data</span>}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="attribution-box">
                                                <div className="attr-label">Probable Home (Modeling)</div>
                                                <div className="attr-value">
                                                    {details?.probable_home ? (
                                                        <button 
                                                            className="pivot-link" 
                                                            onClick={(e) => { e.stopPropagation(); onSearch(details.probable_home.name); }}
                                                        >
                                                            <HardDrive size={14} /> {details.probable_home.name}
                                                        </button>
                                                    ) : <span className="attr-none">Modeling primary workstation...</span>}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <div className="info-stat">
                                    <Hash size={14} />
                                    <span>Vectra ID: <b>{data.id}</b></span>
                                </div>
                                <div className="info-stat">
                                    <Activity size={14} />
                                    <span>Associated Detections: <b>{detections.length || 0}</b></span>
                                </div>
                                {type === 'host' && details?.os && (
                                    <div className="info-stat">
                                        <Cpu size={14} />
                                        <span>OS: <b>{details.os}</b></span>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Zap size={14} color="var(--status-error)" />
                                        Recent Detections
                                    </h4>
                                    {detections.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {detections.slice(0, 5).map((det: any, i: number) => (
                                                    <div key={i} className="detection-row">
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                                            <span style={{ fontWeight: '800', fontSize: '0.8rem', color: 'var(--status-error)' }}>
                                                                {det.detection_type || det.type || det.category || 'Anomalous Behavior'}
                                                            </span>
                                                            {det.last_timestamp && (
                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Clock size={10} /> {new Date(det.last_timestamp).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                            {det.category || 'Forensic Metadata'} • Score: {det.threat || det.t_score || 0}
                                                        </div>
                                                    </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No behavioral anomalies detected.</p>
                                    )}
                                </div>

                                <div>
                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {type === 'host' ? <Link2 size={14} color="var(--status-info)" /> : <HardDrive size={14} color="var(--accent-primary)" />}
                                        Behavioral Correlation (Telemetry)
                                    </h4>
                                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px', border: '1px solid var(--glass-border)', minHeight: '60px' }}>
                                        {correlations.filter(c => c.name && c.name.trim().length > 0).length > 0 ? (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                {correlations.filter(c => c.name && c.name.trim().length > 0).map((c, i) => (
                                                    <button key={i} className="correlation-chip" onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSearch(c.name);
                                                    }}>
                                                        <Link2 size={12} /> {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                                                No secondary behavioral links.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .info-stat { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--glass-border); }
                .detection-row { padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid var(--glass-border); }
                .correlation-chip { background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: var(--text-primary); padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .correlation-chip:hover { background: var(--accent-primary); color: #000; border-color: var(--accent-primary); }
                
                .attribution-box { display: flex; flexDirection: column; gap: 4px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
                .attr-label { font-size: 0.65rem; color: var(--text-muted); textTransform: uppercase; fontWeight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .attr-value { font-size: 0.9rem; fontWeight: 700; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .attr-none { opacity: 0.5; font-style: italic; font-weight: 400; }
                .pivot-link { background: none; border: none; padding: 0; margin: 0; color: var(--status-info); cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; font-weight: 900; transition: color 0.2s; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .pivot-link:hover { color: var(--accent-primary); text-decoration: underline; }
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
        setQuery(searchQuery); // Ensure input state is synced
        
        const isEmail = searchQuery.includes('@');
        const isIPOrHost = (searchQuery.includes('.') && !isEmail);
        
        setActiveQuery(isQuickAction ? (typeOverride === 'hosts' ? 'Top 10 Critical Hosts' : 'Top 10 Critical Accounts') : searchQuery);
        
        let effectiveType: 'all' | 'hosts' | 'accounts' = searchType;
        if (typeOverride) {
            effectiveType = typeOverride;
        } else if (isQuickAction) {
            // Keep current for refresh
            effectiveType = searchType;
        } else if (isEmail) {
            effectiveType = 'accounts';
        } else if (isIPOrHost) {
            effectiveType = 'hosts';
        } else if (searchQuery.length > 0) {
            effectiveType = 'all'; 
        }
        
        setSearchType(effectiveType);

        try {
            const nameParam = isQuickAction ? '' : encodeURIComponent(searchQuery);
            const hrFilter = isQuickAction ? highRiskOnly : false;

            const baseParams = `query=${nameParam}&high_risk_only=${hrFilter}`;
            const hUrl = `/api/vectra?type=hosts&${baseParams}`;
            const aUrl = `/api/vectra?type=accounts&${baseParams}`;
            
            const fetches = [];
            if (effectiveType === 'all' || effectiveType === 'hosts') fetches.push(fetch(hUrl).then(r => r.json()));
            else fetches.push(Promise.resolve({ results: [] }));

            if (effectiveType === 'all' || effectiveType === 'accounts') fetches.push(fetch(aUrl).then(r => r.json()));
            else fetches.push(Promise.resolve({ results: [] }));

            const [hData, aData] = await Promise.all(fetches);
            
            if (hData.error || aData.error) {
                setError(hData.error || aData.error);
                return;
            }

            let hostsFinal = hData.results || [];
            let accountsFinal = aData.results || [];

            if (isQuickAction) {
                hostsFinal = hostsFinal.slice(0, 10);
                accountsFinal = accountsFinal.slice(0, 10);
            }

            setHosts(hostsFinal);
            setAccounts(accountsFinal);
            
            setCounts({
                hosts: hData.count || (hostsFinal.length),
                accounts: aData.count || (accountsFinal.length),
                active_detections: hostsFinal.reduce((acc: number, h: any) => acc + ((h.threat || h.t_score || 0) > 0 ? 1 : 0), 0)
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (hasSearched && activeQuery.startsWith('Top 10')) {
            loadVectraData('', true, searchType as any);
        }
    }, [highRiskOnly]);

    const handleSearch = (v: string) => {
        loadVectraData(v);
    };

    const handleQuickAction = (type: 'hosts' | 'accounts') => {
        setQuery('');
        loadVectraData('', true, type);
    };

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
                            Deep entity profiling and behavioral forensic analysis.
                        </p>
                    </div>
                    
                    {hasSearched && (
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => loadVectraData()} className="badge-action">
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
                            </button>
                            {activeQuery.startsWith('Top 10') && (
                                <button 
                                    onClick={() => { setHighRiskOnly(!highRiskOnly); }} 
                                    className="badge-action"
                                    style={{ background: highRiskOnly ? 'var(--status-error)' : 'rgba(255,255,255,0.05)', color: '#fff' }}
                                >
                                    <Shield size={14} /> {highRiskOnly ? "High Risk Only" : "All Results"}
                                </button>
                            )}
                            <button onClick={() => { setHasSearched(false); setQuery(''); }} className="badge-action" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <LayoutDashboard size={14} /> Reset
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
                                placeholder="Search Account Name, Email, Hostname, or IP..."
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
                </div>
            )}

            {/* Search Prompt Landing (If not searched) */}
            {!hasSearched && !loading && (
                <div style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
                    <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--accent-primary)', color: '#000', padding: '12px', borderRadius: '12px' }}><Monitor size={24} /></div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>Everything About Hosts</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Identify IP, OS, associations and discovery status regardless of current threat level.</p>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', fontSize: '0.8rem' }}>
                            <code style={{ color: 'var(--accent-primary)' }}>10.150.x.x</code>, <code style={{ color: 'var(--accent-primary)' }}>APP-SERVER-01</code>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '24px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                            <div style={{ background: 'var(--status-info)', color: '#000', padding: '12px', borderRadius: '12px' }}><User size={24} /></div>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '4px' }}>Deep Account Lookup</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Profile LDAP/O365 users, associated hosts, and historical behavior.</p>
                            </div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', fontSize: '0.8rem' }}>
                            <code style={{ color: 'var(--status-info)' }}>j.doe@company.org</code>, <code style={{ color: 'var(--status-info)' }}>adm_robert</code>
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
                    <p style={{ marginTop: '20px', color: 'var(--text-secondary)', fontWeight: '800', letterSpacing: '0.1em' }}>QUERYING VECTRA FORENSICS...</p>
                </div>
            )}

            {/* Results Section */}
            {hasSearched && !loading && (
                <div style={{ animation: 'fadeIn 0.4s ease-out', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                    <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: searchType === 'all' ? 'repeat(auto-fit, minmax(400px, 1fr))' : '1fr', 
                        gap: '24px', 
                        marginTop: '40px',
                        minWidth: 0
                    }}>
                        {(searchType === 'all' || searchType === 'hosts') && (
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                    <Monitor size={20} color="var(--accent-primary)" />
                                    {activeQuery.startsWith('Top 10') ? activeQuery : `Forensic Results for "${activeQuery}" (Hosts)`}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {hosts.length > 0 ? (
                                        hosts.map((h, i) => <EntityCard key={h.id || i} type="host" data={h} onSearch={handleSearch} />)
                                    ) : (
                                        <div className="glass-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            <Monitor size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p>No host information found matching this criteria.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {(searchType === 'all' || searchType === 'accounts') && (
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                    <User size={20} color="var(--status-info)" />
                                    {activeQuery.startsWith('Top 10') ? activeQuery : `Forensic Results for "${activeQuery}" (Accounts)`}
                                </h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {accounts.length > 0 ? (
                                        accounts.map((a, i) => <EntityCard key={a.id || i} type="account" data={a} onSearch={handleSearch} />)
                                    ) : (
                                        <div className="glass-card" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                            <User size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                            <p>No account information found matching this criteria.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <style jsx>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .info-stat { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: var(--text-secondary); background: rgba(255,255,255,0.02); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--glass-border); }
                .badge-action { background: rgba(var(--accent-primary-rgb), 0.1); border: 1px solid var(--accent-primary); color: var(--accent-primary); padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; }
                .badge-action:hover { background: var(--accent-primary); color: #000; }
                .detection-row { padding: 8px 10px; background: rgba(0,0,0,0.2); border-radius: 6px; border: 1px solid var(--glass-border); }
                .correlation-chip { background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); color: var(--text-primary); padding: 4px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s; }
                .correlation-chip:hover { background: var(--accent-primary); color: #000; border-color: var(--accent-primary); }
            `}</style>
        </div>
    );
}
