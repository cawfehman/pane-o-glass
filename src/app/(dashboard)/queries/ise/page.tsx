"use client";

import { useState, useEffect } from "react";
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

    // Initial Triage Load
    useEffect(() => {
        if (hasIsePerm) {
            setTriageLoading(true);
            fetch('/api/ise/triage')
                .then(res => res.json())
                .then(data => {
                    setTriageData(data);
                    setTriageLoading(false);
                })
                .catch(err => {
                    console.error("Failed to load triage data", err);
                    setTriageLoading(false);
                });
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

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
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
                    { id: 'history', label: 'Diagnostic History' }
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
                    <div style={{ display: 'grid', gridTemplateColumns: '700px 1fr', gap: '24px' }}>
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                Recent Forensic Signals (Last 24 Hours)
                            </h3>
                            
                            {!triageData ? (
                                <div style={{ padding: '60px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                                    <p style={{ color: 'var(--text-secondary)' }}>Synchronizing global failure telemetry...</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px' }}>Polling ISE Monitoring & Troubleshooting nodes.</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {triageData.failures && triageData.failures.length > 0 ? (
                                        triageData.failures.map((f: any, idx: number) => (
                                            <div 
                                                key={idx} 
                                                className="glass-card hover-glow" 
                                                style={{ padding: '12px 16px', borderLeft: '4px solid #ef4444', background: 'rgba(255,255,255,0.02)', cursor: 'pointer', transition: 'all 0.2s' }}
                                                onClick={() => { setQuery(f.calling_station_id); handleSearch(undefined, f.calling_station_id); }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{f.ad?.displayName || f.user_name}</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(f.timestamp).toLocaleTimeString()}</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{f.calling_station_id} · {f.nas_identifier}</span>
                                                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 'bold' }}>{f.failure_reason?.substring(0, 30)}...</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>No global RADIUS failures detected in the specified sample window.</p>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        <div className="glass-card">
                            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 8.38 8.38 0 0 1 3.8.9"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                Quick Start: Common Procedures
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {[
                                    { label: "New Employee Dot1x Troubleshooting", desc: "Identify AD linkage and certificate errors" },
                                    { label: "IoT Device Profiling Check", desc: "Verify MAB rules and device grouping" },
                                    { label: "High Risk Device Lockdown", desc: "Correlate Vectra detections with ISE posture" }
                                ].map((item, i) => (
                                    <div key={i} style={{ padding: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <h4 style={{ fontSize: '0.95rem', marginBottom: '4px', color: 'var(--accent-primary)' }}>{item.label}</h4>
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
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
