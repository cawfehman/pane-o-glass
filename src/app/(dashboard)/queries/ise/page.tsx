"use client";

import { useState, useEffect } from "react";
import { AlertCircle, RefreshCw, History } from "lucide-react";
import ConnectionPath from "@/components/ise/ConnectionPath";
import EnrichedEndpointCard from "@/components/ise/EnrichedEndpointCard";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [endpointResult, setEndpointResult] = useState<any>(null);
    const [historyResult, setHistoryResult] = useState<any>(null);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<"dashboard" | "live" | "history">("dashboard");
    const [error, setError] = useState("");
    
    // RBAC state
    const [hasIsePerm, setHasIsePerm] = useState(false);
    const [permsLoading, setPermsLoading] = useState(true);

    useEffect(() => {
        const fetchPerms = async () => {
            try {
                const res = await fetch('/api/ise/session?query=');
                setHasIsePerm(res.status !== 403);
            } catch (e) {
                console.error("Failed to detect ISE permissions");
            } finally {
                setPermsLoading(false);
            }
        };
        fetchPerms();
    }, []);

    const [triageData, setTriageData] = useState<any>(null);
    const [triageLoading, setTriageLoading] = useState(false);
    const [triageStatus, setTriageStatus] = useState("");

    const loadTriage = async () => {
        setTriageLoading(true);
        setTriageStatus("Synchronizing with ISE MnT nodes...");
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s client-side timeout

        try {
            const res = await fetch('/api/ise/triage', { 
                cache: 'no-store',
                signal: controller.signal 
            });
            const data = await res.json();
            
            if (data.error) {
                setTriageData({ error: data.error });
            } else {
                setTriageData(data);
            }
        } catch (err: any) {
            console.error("Failed to load triage data", err);
            setTriageData({ error: err.name === 'AbortError' ? "ISE API Timeout (20s)" : "ISE Connection Error" });
        } finally {
            clearTimeout(timeoutId);
            setTriageLoading(false);
            setTriageStatus("");
        }
    };

    // Initial Triage Load
    useEffect(() => {
        if (hasIsePerm) {
            loadTriage();
        }
    }, [hasIsePerm]);

    const handleSearch = async (e?: React.FormEvent, macToDrilldown?: string) => {
        if (e) e.preventDefault();
        const searchTerm = macToDrilldown || query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        
        if (!macToDrilldown) {
            setEndpointResult(null);
            setHistoryResult(null);
            setDiscoveryResult(null);
        }

        try {
            // Fetch Live Session
            const sessionRes = await fetch(`/api/ise/session?query=${encodeURIComponent(searchTerm)}`);
            const sessionData = await sessionRes.json();

            // If we found multiple MACs for a username/IP, show discovery first
            if (sessionData.found && sessionData.sessions && sessionData.sessions.length > 1 && !macToDrilldown) {
                setDiscoveryResult(sessionData);
                setActiveTab("live");
            } else {
                const primarySession = sessionData.sessions?.[0] || null;
                setEndpointResult(primarySession);
                
                // If we have a session or a MAC, fetch history
                const searchVal = macToDrilldown || primarySession?.calling_station_id || searchTerm;
                const historyRes = await fetch(`/api/ise/failures?query=${encodeURIComponent(searchVal)}`);
                const historyData = await historyRes.json();
                setHistoryResult(historyData);
                
                setActiveTab(primarySession ? "live" : "history");
                if (!macToDrilldown) setQuery(searchTerm);
            }

        } finally {
            setLoading(false);
        }
    };

    const DistributionBar = ({ label, count, total, color = 'var(--accent-primary)' }: { label: string, count: number, total: number, color?: string }) => {
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{count} ({percent}%)</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: color, borderRadius: '2px', transition: 'width 0.5s ease-out' }} />
                </div>
            </div>
        );
    };

    if (permsLoading) return <div className="p-8">Verifying Cisco ISE access...</div>;
    if (!hasIsePerm) return <div className="p-8 glass-card m-8 border-l-4 border-red-500 text-red-400">Access Denied: You do not have permission to view RADIUS endpoint forensics.</div>;

    return (
        <div className="internal-scroll-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header Section */}
            <div style={{ flexShrink: 0, paddingBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
                    <div>
                        <h1 style={{ marginBottom: '8px' }}>Cisco ISE Center</h1>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: '600px' }}>
                            Unified identity and network forensics. Correlated results from ISE, AD, and Vectra AI.
                        </p>
                    </div>
                    {(loading || triageLoading) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                            <div className="spinner-small"></div>
                            Synchronizing MnT Data...
                        </div>
                    )}
                </div>

                {/* Primary Search Bar */}
                <form onSubmit={(e) => handleSearch(e)} className="glass-card" style={{ display: 'flex', gap: '16px', padding: '16px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Enter MAC, IP, or Username..."
                            style={{ 
                                width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', 
                                border: '1px solid var(--border-color)', background: 'var(--bg-card)', 
                                color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' 
                            }}
                            disabled={loading}
                        />
                        <svg style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 32px', borderRadius: '12px', fontWeight: 'bold', minWidth: '140px' }}>
                        Search
                    </button>
                    {query && (
                        <button type="button" onClick={() => { setQuery(""); setDiscoveryResult(null); setEndpointResult(null); setHistoryResult(null); setActiveTab("dashboard"); }} className="btn-secondary" style={{ padding: '0 20px', borderRadius: '12px' }}>
                            Reset
                        </button>
                    )}
                </form>

                {error && (
                    <div style={{ marginTop: '16px', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        <strong>Forensic lookup failed:</strong> {error}
                    </div>
                )}
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '32px', flexShrink: 0 }}>
                {([
                    { id: 'dashboard', label: 'Triage Dashboard' },
                    { id: 'live', label: 'Live Session' },
                    { id: 'history', label: 'Connection History' }
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

            {/* Body Content */}
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                
                {/* Triage Dashboard Tab */}
                {activeTab === "dashboard" && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <AlertCircle size={20} color={triageData?.stats?.failures > 0 ? "#ef4444" : "#38bdf8"} />
                                Site Health & Triage Heatmap (Live)
                            </h3>
                            
                            {triageLoading && !triageData && (
                                <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{triageStatus || "Synchronizing global site telemetry..."}</p>
                                    <div style={{ width: '100%', maxWidth: '300px', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', margin: '0 auto', overflow: 'hidden', position: 'relative' }}>
                                        <div className="shimmer" style={{ 
                                            position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', 
                                            background: 'linear-gradient(90deg, transparent, var(--accent-primary), transparent)',
                                            animation: 'shimmer-move 1.5s infinite linear'
                                        }}></div>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '16px' }}>Polling ISE Session Directory (14,000+ Endpoints).</p>
                                </div>
                            )}

                            {!triageLoading && triageData?.error && (
                                <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                    <p style={{ color: '#ef4444', marginBottom: '16px' }}><strong>Triage Sync Failed:</strong> {triageData.error}</p>
                                    <button onClick={() => loadTriage()} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Retry Sync</button>
                                </div>
                            )}

                            {!triageLoading && triageData && !triageData.error && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {triageData.hotlist && triageData.hotlist.length > 0 ? (
                                                triageData.hotlist.map((item: any, idx: number) => {
                                                    // Dynamic health color
                                                    let healthColor = '#10b981'; // Emerald
                                                    if (item.successRate < 90) healthColor = '#ef4444'; // Red
                                                    else if (item.successRate < 100) healthColor = '#f59e0b'; // Amber

                                                    return (
                                                        <div 
                                                            key={idx} 
                                                            className="glass-card" 
                                                            style={{ padding: '16px', borderLeft: `4px solid ${healthColor}`, background: 'rgba(255,255,255,0.02)', transition: 'all 0.2s' }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                                                        <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>Forensic Triage Heatmap (Sampled)</h3>
                                                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></div>
                                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Critical (&lt;90%)</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }}></div>
                                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stressed (90-99%)</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '12px' }}>
                                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }}></div>
                                                                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Healthy (100%)</span>
                                                                            </div>
                                                                            
                                                                            <button 
                                                                                onClick={() => loadTriage()} 
                                                                                className="btn-secondary" 
                                                                                style={{ padding: '4px 10px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                                                                                title="Refresh Forensics"
                                                                            >
                                                                                <RefreshCw size={12} />
                                                                                Refresh
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                        <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 'bold', margin: 0 }}>
                                                                            {item.displayName}
                                                                        </h4>
                                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                                            <span style={{ fontSize: '0.75rem', padding: '2px 10px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                                                                                {item.count.toLocaleString()} Total
                                                                            </span>
                                                                            <span style={{ fontSize: '0.75rem', padding: '2px 10px', background: healthColor, color: 'black', borderRadius: '12px', fontWeight: 'bold' }}>
                                                                                {item.successRate}% Health
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                                                                        <strong>Primary Node:</strong> {item.nas}
                                                                    </p>

                                                                    {/* Wireless Section */}
                                                                    {item.wireless && Object.keys(item.wireless).length > 0 && (
                                                                        <div style={{ marginBottom: '16px' }}>
                                                                            <p style={{ fontSize: '0.65rem', color: 'var(--accent-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 'bold' }}>Wireless (SSID Groups)</p>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                                {Object.entries(item.wireless).map(([ssid, macObjs]: [string, any]) => (
                                                                                    <div key={ssid}>
                                                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{ssid}</p>
                                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                                            {macObjs.map((obj: any) => (
                                                                                                <button 
                                                                                                    key={obj.mac}
                                                                                                    onClick={(e) => { e.stopPropagation(); setQuery(obj.mac); handleSearch(undefined, obj.mac); }}
                                                                                                    className="mac-button"
                                                                                                    style={obj.status === 'failure' ? { background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', color: '#ef4444' } : {}}
                                                                                                >
                                                                                                    {obj.mac}
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Wired Section */}
                                                                    {item.wired && Object.keys(item.wired).length > 0 && (
                                                                        <div>
                                                                            <p style={{ fontSize: '0.65rem', color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', fontWeight: 'bold' }}>Wired (Protocol Groups)</p>
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                                                {Object.entries(item.wired).map(([method, macObjs]: [string, any]) => (
                                                                                    <div key={method}>
                                                                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>{method}</p>
                                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                                            {macObjs.map((obj: any) => (
                                                                                                <button 
                                                                                                    key={obj.mac}
                                                                                                    onClick={(e) => { e.stopPropagation(); setQuery(obj.mac); handleSearch(undefined, obj.mac); }}
                                                                                                    className="mac-button"
                                                                                                    style={obj.status === 'failure' ? { background: 'rgba(239, 68, 68, 0.2)', borderColor: '#ef4444', color: '#ef4444' } : {}}
                                                                                                >
                                                                                                    {obj.mac}
                                                                                                </button>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                        <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(16, 185, 129, 0.05)', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                            <svg style={{ marginBottom: '16px', color: '#10b981' }} width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                            <p style={{ color: '#10b981', fontWeight: 'bold' }}>Authentication Health: Optimal</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>No high-frequency RADIUS failures detected in the current window.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <div className="glass-card" style={{ borderTop: '4px solid var(--accent-primary)' }}>
                                <h4 style={{ marginBottom: '6px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>Live Distribution</h4>
                                <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '20px', fontStyle: 'italic' }}>
                                    Snapshot of 100 Sampled RADIUS Sessions
                                </p>
                                
                                <div style={{ marginBottom: '24px' }}>
                                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Site Distribution (Sampled)</p>
                                    {triageData?.siteDistribution && Object.entries(triageData.siteDistribution).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6).map(([site, count]) => (
                                        <DistributionBar key={site} label={site} count={count as number} total={triageData.stats.total} color="var(--accent-primary)" />
                                    ))}
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>SSID Distribution (Sampled)</p>
                                    {triageData?.ssidDistribution && Object.entries(triageData.ssidDistribution).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 6).map(([ssid, count]) => (
                                        <DistributionBar key={ssid} label={ssid} count={count as number} total={triageData.stats.total} color="var(--accent-secondary)" />
                                    ))}
                                </div>

                                <div>
                                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' }}>Auth Protocol (Sampled)</p>
                                    {triageData?.authDistribution && Object.entries(triageData.authDistribution).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([method, count]) => (
                                        <DistributionBar key={method} label={method.toUpperCase()} count={count as number} total={triageData.stats.total} color="#4ade80" />
                                    ))}
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* Forensic Result Tabs */}
                {(endpointResult || historyResult || discoveryResult) && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
                        <button 
                            onClick={() => setActiveTab('live')}
                            style={{ 
                                padding: '8px 20px', 
                                borderRadius: '6px', 
                                fontSize: '0.85rem', 
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: activeTab === 'live' ? 'var(--accent-primary)' : 'transparent',
                                color: activeTab === 'live' ? 'black' : 'var(--text-secondary)'
                            }}
                        >
                            Active Telemetry
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            style={{ 
                                padding: '8px 20px', 
                                borderRadius: '6px', 
                                fontSize: '0.85rem', 
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: activeTab === 'history' ? 'var(--accent-primary)' : 'transparent',
                                color: activeTab === 'history' ? 'black' : 'var(--text-secondary)'
                            }}
                        >
                            Historical Logs
                        </button>
                    </div>
                )}

                {/* Live Session Tab */}
                {activeTab === "live" && (
                    <div>
                        {discoveryResult ? (
                            <div>
                                <h3 style={{ marginBottom: '16px' }}>Identity Conflict Detected: Multiple Devices for '{query}'</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                                    {discoveryResult.sessions.map((item: any, idx: number) => (
                                        <div key={idx} className="glass-card hover-glow" style={{ cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => handleSearch(undefined, item.calling_station_id)}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--accent-primary)' }}>{item.calling_station_id}</span>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.framed_ip_address}</span>
                                            </div>
                                            <p style={{ fontSize: '0.9rem', marginBottom: '16px' }}><strong>Profile:</strong> {item.endpoint_profile || "Unknown"}</p>
                                            <button className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem' }}>Enrich & Expand &rarr;</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : endpointResult ? (
                            <EnrichedEndpointCard session={endpointResult} />
                        ) : (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>No Active Network Session Found</p>
                                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The endpoint may be offline or connected via a non-monitored segment.</p>
                                {historyResult?.found && (
                                    <button onClick={() => setActiveTab("history")} className="btn-secondary" style={{ marginTop: '24px' }}>View Recent Diagnostic Logs</button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Diagnostic History Tab */}
                {activeTab === "history" && (
                    <div>
                        {historyResult && historyResult.found && historyResult.failures ? (
                            historyResult.failures.map((f: any, idx: number) => (
                                <EnrichedEndpointCard key={idx} session={f} isHistory={true} />
                            ))
                        ) : (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>No Forensic History Available</p>
                                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>ISE hasn't logged any RADIUS events for this target in the last 24 hours.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
