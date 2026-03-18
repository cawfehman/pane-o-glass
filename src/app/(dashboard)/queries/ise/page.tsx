"use client";

import { useState } from "react";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [endpointResult, setEndpointResult] = useState<any>(null);
    const [historyResult, setHistoryResult] = useState<any>(null);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [activeView, setActiveView] = useState<"discovery" | "details">("discovery");
    const [activeTab, setActiveTab] = useState<"live" | "history">("live");
    const [error, setError] = useState("");

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
            // STEP 1: Always check for active session first (ERS)
            const sessionRes = await fetch(`/api/ise/session?query=${encodeURIComponent(searchTerm)}`);
            const sessionData = await sessionRes.json();

            // If it's a username search, ISE ERS API returns a specific structure via our wrapper
            if (sessionData.found && sessionData.sessions && sessionData.sessions.length > 1 && !macToDrilldown) {
                // Discovery mode: multiple MACs found for this user
                setDiscoveryResult(sessionData);
                setActiveView("discovery");
            } else {
                // Single MAC or specific drilldown
                setEndpointResult(sessionData.sessions?.[0] || null);
                setActiveView("details");
                if (!macToDrilldown) setQuery(searchTerm);

                // STEP 2: Simultaneously fetch 24h Auth History (MnT)
                const historyRes = await fetch(`/api/ise/failures?query=${encodeURIComponent(searchTerm)}`);
                const historyData = await historyRes.json();
                setHistoryResult(historyData);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0 }}>
                <h1 style={{ marginBottom: '8px' }}>Cisco ISE Center</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Unified real-time endpoint status and 24-hour forensic diagnostic history.</p>

                <form onSubmit={(e) => handleSearch(e)} className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Enter MAC, IP, or Username..."
                        style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem' }}
                        disabled={loading}
                    />
                    <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 'bold' }}>
                        {loading ? "Analyzing ISE..." : "Search"}
                    </button>
                </form>

                {error && (
                    <div style={{ padding: '16px', borderLeft: '4px solid var(--accent-secondary)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-secondary)', marginBottom: '24px' }}>
                        <strong>Search Failed:</strong> {error}
                    </div>
                )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {activeView === "discovery" && discoveryResult && (
                    <div>
                        <h3 style={{ marginBottom: '16px' }}>MAC Addresses associated with '{query}'</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                            {discoveryResult.sessions.map((item: any, idx: number) => (
                                <div key={idx} className="glass-card" style={{ cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'border-color 0.2s' }} onClick={() => handleSearch(undefined, item.calling_station_id)}>
                                    <h4 style={{ color: 'var(--accent-primary)', marginBottom: '12px', fontFamily: 'monospace' }}>{item.calling_station_id}</h4>
                                    <p style={{ fontSize: '0.9rem', marginBottom: '4px' }}><strong>IP Address:</strong> {item.framed_ip_address || "Unknown"}</p>
                                    <p style={{ fontSize: '0.9rem', marginBottom: '12px' }}><strong>Connected To:</strong> {item.nas_identifier || "Unknown"}</p>
                                    <button className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem', padding: '8px' }}>View Full Profile & History</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeView === "details" && (
                    <div>
                        {discoveryResult && (
                            <button 
                                onClick={() => setActiveView("discovery")}
                                style={{ 
                                    background: 'transparent', 
                                    border: 'none', 
                                    color: 'var(--accent-primary)', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    marginBottom: '16px',
                                    paddingLeft: '0',
                                    fontWeight: 'bold'
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                Back to MAC Selection
                            </button>
                        )}
                        {/* Tab Headers */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
                            <button 
                                onClick={() => setActiveTab("live")}
                                style={{ 
                                    padding: '12px 24px', 
                                    background: activeTab === 'live' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    border: 'none',
                                    borderBottom: activeTab === 'live' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    color: activeTab === 'live' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    marginBottom: '-1px'
                                }}
                            >
                                Live Status
                            </button>
                            <button 
                                onClick={() => setActiveTab("history")}
                                style={{ 
                                    padding: '12px 24px', 
                                    background: activeTab === 'history' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    border: 'none',
                                    borderBottom: activeTab === 'history' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    color: activeTab === 'history' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    marginBottom: '-1px'
                                }}
                            >
                                24h Diagnostic History
                            </button>
                        </div>

                        {/* Live Status Tab */}
                        {activeTab === "live" && (
                            <div>
                                {!endpointResult ? (
                                    <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No active session found right now.</p>
                                        <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The device may be offline. Check the <strong>Diagnostic History</strong> tab for recent events.</p>
                                    </div>
                                ) : (
                                    <EndpointCard session={endpointResult} />
                                )}
                            </div>
                        )}

                        {/* History Tab */}
                        {activeTab === "history" && (
                            <div>
                                {historyResult && historyResult.found && historyResult.failures ? (
                                    historyResult.failures.map((f: any, idx: number) => (
                                        <FailureCard key={idx} failure={f} />
                                    ))
                                ) : (
                                    <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                                        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>No authentication logs found for the last 24 hours.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function EndpointCard({ session }: { session: any }) {
    const isCompliant = session.posture_status === "Compliant";
    const isPending = session.posture_status === "Pending";
    const accentColor = isCompliant ? '#10b981' : (isPending ? '#3b82f6' : '#ef4444');
    const bgColor = isCompliant ? 'rgba(16, 185, 129, 0.15)' : (isPending ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)');

    return (
        <div className="glass-card" style={{ 
            marginBottom: '24px', 
            borderLeft: `6px solid ${accentColor}`, 
            padding: '24px' 
        }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Identity
                        <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>ACTIVE</span>
                    </h4>
                    <p><strong>Username:</strong> {session.user_name || "N/A"}</p>
                    <p><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace' }}>{session.calling_station_id}</span></p>
                    <p><strong>IP Address:</strong> <span style={{ fontFamily: 'monospace' }}>{session.framed_ip_address || "N/A"}</span></p>
                </div>

                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Network Location</h4>
                    <p><strong>Device IP:</strong> {session.nas_ip_address}</p>
                    <p><strong>Port/SSID:</strong> {session.nas_port_id}</p>
                    <p><strong>Switch:</strong> {session.nas_identifier}</p>
                </div>

                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Posture State</h4>
                    <p><strong>Profile:</strong> <span style={{ color: 'var(--accent-primary)' }}>{session.endpoint_profile || "Unknown"}</span></p>
                    <p><strong>Posture:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{session.posture_status || "Unknown"}</span></p>
                    <span style={{ fontSize: '0.75rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        {session.posture_status || "UNKNOWN"}
                    </span>
                </div>

                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>MDM & Compliance</h4>
                    <p><strong>MDM Reachable:</strong> {session.mdm_reachable || "N/A"}</p>
                    <p><strong>MDM Compliant:</strong> {session.mdm_compliant || "N/A"}</p>
                    <p><strong>Audit ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{session.audit_session_id?.substring(0, 16)}...</span></p>
                </div>
            </div>
            
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', fontSize: '0.9rem' }}>
                <p><strong>AuthZ Rule:</strong> {session.authorization_rule || "Unknown"}</p>
                <p><strong>Auth Method:</strong> {session.authentication_method || "Unknown"}</p>
                <p><strong>Auth Protocol:</strong> {session.authentication_protocol || "Unknown"}</p>
                <p><strong>ACS Server:</strong> {session.acs_server || "Unknown"}</p>
            </div>
        </div>
    );
}

function FailureCard({ failure }: { failure: any }) {
    const [expanded, setExpanded] = useState(false);
    const isPass = failure.status === true;
    const accentColor = isPass ? '#10b981' : '#ef4444';
    const bgColor = isPass ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';
    
    return (
        <div className="glass-card" style={{ 
            marginBottom: '24px', 
            borderLeft: `6px solid ${accentColor}`, 
            padding: '0' 
        }}>
            <div style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                    <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Historical Status
                            <span style={{ 
                                fontSize: '0.7rem', 
                                background: bgColor, 
                                color: accentColor, 
                                padding: '2px 8px', 
                                borderRadius: '4px', 
                                textTransform: 'uppercase',
                                fontWeight: 'bold'
                            }}>
                                {isPass ? 'PASS' : 'FAIL'}
                            </span>
                        </h4>
                        <p><strong>Timestamp:</strong> {failure.timestamp !== "Unknown" ? new Date(failure.timestamp).toLocaleString() : "Unknown"}</p>
                        <p><strong>Result:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{failure.failure_reason}</span></p>
                    </div>

                    <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Identity & Device</h4>
                        <p><strong>Username:</strong> {failure.user_name || "N/A"}</p>
                        <p><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace' }}>{failure.calling_station_id}</span></p>
                        <p><strong>Profile:</strong> <span style={{ color: 'var(--accent-primary)' }}>{failure.endpoint_profile || "Unknown"}</span></p>
                    </div>

                    <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Network Location</h4>
                        <p><strong>Device IP:</strong> {failure.nas_ip_address}</p>
                        <p><strong>Port/SSID:</strong> {failure.nas_port_id}</p>
                        <p><strong>Switch:</strong> {failure.nas_identifier}</p>
                    </div>

                    <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Matched Policy</h4>
                        <p><strong>Auth Rule:</strong> {failure.authorization_rule}</p>
                        <p><strong>Auth Policy:</strong> {failure.auth_policy}</p>
                        <p><strong>Server:</strong> {failure.acs_server}</p>
                    </div>
                </div>

                {failure.steps && failure.steps.length > 0 && (
                    <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <button 
                            onClick={() => setExpanded(!expanded)}
                            className="btn-secondary"
                            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}
                        >
                            <span>{expanded ? 'Hide' : 'Show'} Technical Details ({failure.steps.length} Steps)</span>
                            <span>{expanded ? '▲' : '▼'}</span>
                        </button>

                        {expanded && (
                            <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {failure.steps.map((step: any, sIdx: number) => (
                                        <div key={sIdx} style={{ display: 'flex', gap: '12px', fontSize: '0.85rem' }}>
                                            <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: '45px' }}>{step.id}</span>
                                            <span style={{ color: 'var(--text-secondary)' }}>{step.description}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
