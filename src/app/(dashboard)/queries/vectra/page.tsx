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

    const getPortalUrl = (type: 'host' | 'account' | 'detection', id: string | number) => {
        const baseUrl = 'https://207017482210.uw2.portal.vectra.ai';
        if (type === 'detection') return `${baseUrl}/detections/${id}`;
        return `${baseUrl}/${type}s/${id}`;
    };

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
                : `/api/vectra?type=detections&account_id=${data.id}`; 
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
            opacity: isActive ? 1 : 0.8,
            boxShadow: threat > 50 ? '0 0 20px rgba(239, 68, 68, 0.15)' : 'none'
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ fontWeight: '800', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {details?.name || data.name || data.ip || 'Unknown Entity'}
                            </div>
                            <a 
                                href={getPortalUrl(type, data.id)} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                                onClick={(e) => e.stopPropagation()}
                                title="View in Vectra Portal"
                            >
                                <ExternalLink size={14} />
                            </a>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {data.ip && <span>{data.ip} • </span>} 
                            Last Seen: {details?.last_seen || details?.last_timestamp || data.last_seen || 'N/A'}
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
                                                    {details?._is_ident_synthesized ? 'Confirmed Owner (Telemetry)' : 'Probable Owner (Modeling)'}
                                                </div>
                                                <div className="attr-value">
                                                    {(details?.probable_owner?.name || (typeof details?.probable_owner === 'string' && details.probable_owner) || details?.owner_name || details?.assigned_to || data?.probable_owner?.name || (typeof data?.probable_owner === 'string' && data.probable_owner) || data?.owner_name || data?.assigned_to) ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <button 
                                                                className="pivot-link" 
                                                                onClick={(e) => { e.stopPropagation(); onSearch(details?.probable_owner?.name || (typeof details?.probable_owner === 'string' ? details.probable_owner : '') || details?.owner_name || details?.assigned_to || data?.probable_owner?.name || (typeof data?.probable_owner === 'string' ? data.probable_owner : '') || data?.owner_name || data?.assigned_to); }}
                                                            >
                                                                <User size={14} /> {details?.probable_owner?.name || (typeof details?.probable_owner === 'string' ? details.probable_owner : '') || details?.owner_name || details?.assigned_to || data?.probable_owner?.name || (typeof data?.probable_owner === 'string' ? data.probable_owner : '') || data?.owner_name || data?.assigned_to}
                                                            </button>
                                                        </div>
                                                    ) : <span className="attr-none">Scanning behavioral history...</span>}
                                                </div>
                                            </div>
                                            <div className="attribution-box">
                                                <div className="attr-label">Last Known Interaction</div>
                                                <div className="attr-value">
                                                    {(details?.last_account_name || details?.last_user || details?.last_login_user || data?.last_account_name || data?.last_user || data?.last_login_user) ? (
                                                        <button 
                                                            className="pivot-link" 
                                                            onClick={(e) => { e.stopPropagation(); onSearch(details?.last_account_name || details?.last_user || details?.last_login_user || data?.last_account_name || data?.last_user || data?.last_login_user); }}
                                                        >
                                                            <Link2 size={14} /> {details?.last_account_name || details?.last_user || details?.last_login_user || data?.last_account_name || data?.last_user || data?.last_login_user}
                                                        </button>
                                                    ) : <span className="attr-none">No recent login telemetry</span>}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="attribution-box">
                                                <div className="attr-label">Probable Home (Modeling)</div>
                                                <div className="attr-value">
                                                    {(details?.probable_home?.name || (typeof details?.probable_home === 'string' && details.probable_home) || details?.home_host_name || details?.last_host || data?.probable_home?.name || (typeof data?.probable_home === 'string' && data.probable_home) || data?.home_host_name || data?.last_host) ? (
                                                        <button 
                                                            className="pivot-link" 
                                                            onClick={(e) => { e.stopPropagation(); onSearch(details?.probable_home?.name || (typeof details?.probable_home === 'string' ? details.probable_home : '') || details?.home_host_name || details?.last_host || data?.probable_home?.name || (typeof data?.probable_home === 'string' ? data.probable_home : '') || data?.home_host_name || data?.last_host); }}
                                                        >
                                                            <HardDrive size={14} /> {details?.probable_home?.name || (typeof details?.probable_home === 'string' ? details.probable_home : '') || details?.home_host_name || details?.last_host || data?.probable_home?.name || (typeof data?.probable_home === 'string' ? data.probable_home : '') || data?.home_host_name || data?.last_host}
                                                        </button>
                                                    ) : <span className="attr-none">Analyzing host affinity...</span>}
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
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontWeight: '800', fontSize: '0.8rem', color: 'var(--status-error)' }}>
                                                                    {det.detection_type || det.type || det.category || 'Anomalous Behavior'}
                                                                </span>
                                                                <a 
                                                                    href={getPortalUrl('detection', det.id)} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    style={{ color: 'rgba(239, 68, 68, 0.4)', display: 'flex', alignItems: 'center' }}
                                                                    title="Jump to Detection"
                                                                >
                                                                    <ArrowUpRight size={12} />
                                                                </a>
                                                            </div>
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
    const [triageLoading, setTriageLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'hosts' | 'accounts'>('dashboard');
    const [searchType, setSearchType] = useState<'all' | 'hosts' | 'accounts'>('all');
    const [activeQuery, setActiveQuery] = useState('');
    const [hosts, setHosts] = useState<any[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [triageHosts, setTriageHosts] = useState<any[]>([]);
    const [triageAccounts, setTriageAccounts] = useState<any[]>([]);
    const [triageStats, setTriageStats] = useState({ criticalHosts: 0, criticalAccounts: 0, topCategory: 'None' });
    const [detectionDist, setDetectionDist] = useState<Record<string, number>>({});
    const [counts, setCounts] = useState({ hosts: 0, accounts: 0, active_detections: 0 });
    const [error, setError] = useState<string | null>(null);
    const [highRiskOnly, setHighRiskOnly] = useState(true);

    const loadTriage = async () => {
        setTriageLoading(true);
        try {
            const res = await fetch(`/api/vectra/triage?t=${Date.now()}`);
            const data = await res.json();
            
            if (data.error) throw new Error(data.error);

            setTriageHosts(data.hosts || []);
            setTriageAccounts(data.accounts || []);
            setTriageStats(data.stats);
            setDetectionDist(data.detectionDistribution || {});
            
            setCounts({
                hosts: data.stats.totalHosts,
                accounts: data.stats.totalAccounts,
                active_detections: data.stats.totalDetections
            });

        } catch (e) {
            console.error("Triage Fetch Failed:", e);
            setError("Failed to synchronize behavioral triage. Try refreshing.");
        } finally {
            setTriageLoading(false);
        }
    };

    useEffect(() => {
        if (status === 'authenticated') {
            loadTriage();
        }
    }, [status]);

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
            
            // Auto-switch tab based on data presence
            if (effectiveType === 'hosts' || (effectiveType === 'all' && hostsFinal.length > 0)) {
                setActiveTab('hosts');
            } else if (effectiveType === 'accounts' || (effectiveType === 'all' && accountsFinal.length > 0)) {
                setActiveTab('accounts');
            }
            
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
                            <button onClick={() => { setHasSearched(false); setQuery(''); setActiveTab('dashboard'); }} className="badge-action" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <LayoutDashboard size={14} /> Reset
                            </button>
                        </div>
                    )}
                </div>

                <div className="glass-card" style={{ 
                    padding: hasSearched ? '12px 20px' : '32px', 
                    background: 'rgba(255,255,255,0.02)',
                    maxWidth: hasSearched ? 'none' : '900px',
                    margin: hasSearched ? '0' : '0 auto',
                    marginBottom: hasSearched ? '20px' : '0'
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
                </div>

                {/* Navigation Tabs */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '32px', flexShrink: 0, marginTop: hasSearched ? '0' : '24px' }}>
                    {([
                        { id: 'dashboard', label: 'Behavioral Triage' },
                        { id: 'hosts', label: 'Hosts' },
                        { id: 'accounts', label: 'Accounts' }
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                padding: '12px 24px',
                                background: activeTab === tab.id ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                                cursor: 'pointer',
                                fontSize: '0.95rem',
                                transition: 'all 0.2s ease',
                                marginBottom: '-1px'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
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

            {/* Triage Dashboard Tab */}
            {activeTab === 'dashboard' && !loading && (
                <div style={{ animation: 'fadeIn 0.4s ease-out', overflow: 'hidden' }}>
                    
                    {/* Behavioral Summary Bar */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                        {triageLoading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className="glass-card animate-pulse" style={{ height: '110px', background: 'rgba(255,255,255,0.02)' }} />
                            ))
                        ) : (
                            <>
                                <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--status-error)', background: 'rgba(239, 68, 68, 0.05)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>High-Confidence Critical Hosts</div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: '950', color: 'var(--status-error)' }}>{triageStats.criticalHosts}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Threat & Certainty {'>'} 50</div>
                                </div>
                                <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--accent-primary)', background: 'rgba(56, 189, 248, 0.05)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>High-Confidence Identities</div>
                                    <div style={{ fontSize: '2.2rem', fontWeight: '950', color: 'var(--accent-primary)' }}>{triageStats.criticalAccounts}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Verified Behavioral Risks</div>
                                </div>
                                <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid var(--status-info)', background: 'rgba(59, 130, 246, 0.05)' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '900', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Active Campaign Type</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: '950', color: 'var(--status-info)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={triageStats.topCategory}>
                                        {triageStats.topCategory}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>Most Frequent Behavior</div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Detection Distribution Chart */}
                    <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: '900', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Activity size={16} color="var(--accent-primary)" />
                            Behavioral Detection Distribution (Top 5)
                        </div>
                        {triageLoading ? (
                            <div style={{ height: '40px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }} className="animate-pulse" />
                        ) : (
                            <>
                                <div style={{ height: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden', display: 'flex' }}>
                                    {Object.entries(detectionDist).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([cat, count], i) => {
                                        const colors = ['#ef4444', '#f59e0b', '#38bdf8', '#10b981', '#8b5cf6'];
                                        const total = Object.values(detectionDist).reduce((a, b) => a + b, 0);
                                        const width = (count / total) * 100;
                                        return (
                                            <div 
                                                key={cat} 
                                                style={{ width: `${width}%`, background: colors[i % colors.length], height: '100%', transition: 'width 0.5s ease' }} 
                                                title={`${cat}: ${count}`} 
                                            />
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
                                    {Object.entries(detectionDist).sort((a,b) => b[1] - a[1]).slice(0, 5).map(([cat, count], i) => (
                                        <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: ['#ef4444', '#f59e0b', '#38bdf8', '#10b981', '#8b5cf6'][i] }} />
                                            <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
                                            <span style={{ fontWeight: 'bold' }}>{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="glass-card" style={{ padding: '24px', marginBottom: '24px', borderTop: '4px solid var(--accent-primary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Entity Triage Heatmap</h3>
                            <button onClick={() => loadTriage()} className="badge-action">
                                <RefreshCw size={14} className={triageLoading ? "animate-spin" : ""} /> Refresh Pulse
                            </button>
                        </div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                            {/* Critical Hosts */}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                    <Monitor size={20} color="var(--accent-primary)" />
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Critical Hosts</h4>
                                </div>
                                {triageLoading ? (
                                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                        <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" />
                                    </div>
                                ) : triageHosts.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {triageHosts.map((h, i) => <EntityCard key={h.id || i} type="host" data={h} onSearch={handleSearch} />)}
                                    </div>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No high-risk hosts detected.</p>
                                )}
                            </div>

                            {/* Critical Accounts */}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                    <User size={20} color="var(--status-info)" />
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Critical Accounts</h4>
                                </div>
                                {triageLoading ? (
                                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                                        <RefreshCw size={24} className="animate-spin" color="var(--accent-primary)" />
                                    </div>
                                ) : triageAccounts.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {triageAccounts.map((a, i) => <EntityCard key={a.id || i} type="account" data={a} onSearch={handleSearch} />)}
                                    </div>
                                ) : (
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No high-risk accounts detected.</p>
                                )}
                            </div>
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
                <div style={{ animation: 'fadeIn 0.4s ease-out', width: '100%' }}>
                    
                    {/* Hosts Tab View */}
                    {activeTab === 'hosts' && (
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                <Monitor size={20} color="var(--accent-primary)" />
                                Forensic Results for "{activeQuery}" (Hosts)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {hosts.length > 0 ? (
                                    hosts.map((h, i) => <EntityCard key={h.id || i} type="host" data={h} onSearch={handleSearch} />)
                                ) : (
                                    <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <Monitor size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                                        <p style={{ fontSize: '1.1rem' }}>No host metadata found matching your query.</p>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Try searching by IP or exact Hostname.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Accounts Tab View */}
                    {activeTab === 'accounts' && (
                        <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                                <User size={20} color="var(--status-info)" />
                                Forensic Results for "{activeQuery}" (Accounts)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {accounts.length > 0 ? (
                                    accounts.map((a, i) => <EntityCard key={a.id || i} type="account" data={a} onSearch={handleSearch} />)
                                ) : (
                                    <div className="glass-card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <User size={48} style={{ opacity: 0.1, marginBottom: '16px' }} />
                                        <p style={{ fontSize: '1.1rem' }}>No account metadata found matching your query.</p>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Try searching by Email address or SamAccountName.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
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
