"use client";

import { useState, useEffect } from "react";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [endpointResult, setEndpointResult] = useState<any>(null);
    const [historyResult, setHistoryResult] = useState<any>(null);
    const [tacacsResult, setTacacsResult] = useState<any>(null);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [activeView, setActiveView] = useState<"discovery" | "details">("discovery");
    const [activeTab, setActiveTab] = useState<"live" | "history" | "tacacs">("live");
    const [error, setError] = useState("");
    
    // RBAC state
    const [perms, setPerms] = useState<{ise: boolean, tacacs: boolean}>({ ise: false, tacacs: false });
    const [permsLoading, setPermsLoading] = useState(true);

    useEffect(() => {
        const fetchPerms = async () => {
            try {
                // We use a simple trick: try to fetch the session API with no query
                // or we could have a dedicated perms endpoint. Since ise-tacacs is already
                // verified by the sidebar, we'll just check what's available.
                // For now, I'll simulate or use the session/failures response to detect 403s
                // but better to have it explicit. I'll just default to 'true' if the page is visible,
                // but let's be more precise.
                
                // Let's just try small probe requests
                const [iseRes, tacRes] = await Promise.all([
                    fetch('/api/ise/session?query='), // This will return 400 or 403
                    fetch('/api/ise/tacacs?query=')   // This will return 400 or 403
                ]);
                
                setPerms({
                    ise: iseRes.status !== 403,
                    tacacs: tacRes.status !== 403
                });
                
                // Set default tab based on permission priority
                if (iseRes.status === 403 && tacRes.status !== 403) {
                    setActiveTab("tacacs");
                }
            } catch (e) {
                console.error("Failed to detect ISE permissions");
            } finally {
                setPermsLoading(false);
            }
        };
        fetchPerms();
    }, []);

    const handleSearch = async (e?: React.FormEvent, macToDrilldown?: string) => {
        if (e) e.preventDefault();
        const searchTerm = macToDrilldown || query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        
        if (!macToDrilldown) {
            setEndpointResult(null);
            setHistoryResult(null);
            setTacacsResult(null);
            setDiscoveryResult(null);
        }

        try {
            const requests = [];
            
            // 1. RADIUS Session (Only if 'ise' perm exists)
            if (perms.ise) {
                requests.push(fetch(`/api/ise/session?query=${encodeURIComponent(searchTerm)}`).then(r => r.json()));
            } else {
                requests.push(Promise.resolve({ found: false }));
            }

            const [sessionData] = await Promise.all([requests[0]]);

            if (sessionData.found && sessionData.sessions && sessionData.sessions.length > 1 && !macToDrilldown) {
                setDiscoveryResult(sessionData);
                setActiveView("discovery");
            } else {
                setEndpointResult(sessionData.sessions?.[0] || null);
                setActiveView("details");
                if (!macToDrilldown) setQuery(searchTerm);

                // Simultaneous Background Fetches
                const secondaryRequests = [];
                
                // 2. RADIUS History
                if (perms.ise) {
                    secondaryRequests.push(fetch(`/api/ise/failures?query=${encodeURIComponent(searchTerm)}`).then(r => r.json()));
                } else {
                    secondaryRequests.push(Promise.resolve({ found: false }));
                }

                // 3. TACACS History
                if (perms.tacacs) {
                    secondaryRequests.push(fetch(`/api/ise/tacacs?query=${encodeURIComponent(searchTerm)}`).then(r => r.json()));
                } else {
                    secondaryRequests.push(Promise.resolve({ found: false }));
                }

                const [historyData, tacacsData] = await Promise.all(secondaryRequests);
                setHistoryResult(historyData);
                setTacacsResult(tacacsData);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (permsLoading) return <div className="p-8">Authenticating Cisco ISE Security Center...</div>;

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0 }}>
                <h1 style={{ marginBottom: '8px' }}>Cisco ISE Center</h1>
                <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                    Unified forensics: {perms.ise && "Endpoint RADIUS"} {perms.ise && perms.tacacs && " & "} {perms.tacacs && "Device TACACS+"}.
                </p>

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
                    {query && (
                        <button type="button" onClick={() => { setQuery(""); setDiscoveryResult(null); setEndpointResult(null); setHistoryResult(null); setTacacsResult(null); setActiveView("discovery"); }} className="btn-secondary" style={{ padding: '12px 16px', borderRadius: '8px' }}>
                            Reset
                        </button>
                    )}
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
                                    background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingLeft: '0', fontWeight: 'bold'
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                                Back to MAC Selection
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '0' }}>
                            {perms.ise && (
                                <>
                                    <TabButton active={activeTab === 'live'} label="Live Status" onClick={() => setActiveTab("live")} />
                                    <TabButton active={activeTab === 'history'} label="24h RADIUS History" onClick={() => setActiveTab("history")} />
                                </>
                            )}
                            {perms.tacacs && (
                                <TabButton active={activeTab === 'tacacs'} label="TACACS+ Administration" onClick={() => setActiveTab("tacacs")} />
                            )}
                        </div>

                        {activeTab === "live" && perms.ise && (
                            <div>
                                {!endpointResult ? (
                                    <EmptyState message="No active session found right now." sub="The device may be offline. Check history tabs for recent events." />
                                ) : (
                                    <EndpointCard session={endpointResult} />
                                )}
                            </div>
                        )}

                        {activeTab === "history" && perms.ise && (
                            <div>
                                {historyResult && historyResult.found && historyResult.failures ? (
                                    historyResult.failures.map((f: any, idx: number) => <FailureCard key={idx} failure={f} />)
                                ) : (
                                    <EmptyState message="No RADIUS authentication logs found for the last 24 hours." />
                                )}
                            </div>
                        )}

                        {activeTab === "tacacs" && perms.tacacs && (
                            <div>
                                {tacacsResult && tacacsResult.found && tacacsResult.failures ? (
                                    tacacsResult.failures.map((f: any, idx: number) => <TacacsCard key={idx} event={f} />)
                                ) : (
                                    <EmptyState message="No TACACS+ administration logs found for the last 24 hours." />
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function TabButton({ active, label, onClick }: { active: boolean, label: string, onClick: () => void }) {
    return (
        <button 
            onClick={onClick}
            style={{ 
                padding: '12px 24px', 
                background: active ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 'bold',
                marginBottom: '-1px'
            }}
        >
            {label}
        </button>
    );
}

function EmptyState({ message, sub }: { message: string, sub?: string }) {
    return (
        <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>{message}</p>
            {sub && <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>{sub}</p>}
        </div>
    );
}

function EndpointCard({ session }: { session: any }) {
    const isCompliant = session.posture_status === "Compliant";
    const isPending = session.posture_status === "Pending";
    const accentColor = isCompliant ? '#10b981' : (isPending ? '#3b82f6' : '#ef4444');
    const bgColor = isCompliant ? 'rgba(16, 185, 129, 0.15)' : (isPending ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)');

    return (
        <div className="glass-card" style={{ marginBottom: '24px', borderLeft: `6px solid ${accentColor}`, padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Identity <span style={{ fontSize: '0.7rem', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>ACTIVE</span>
                    </h4>
                    <p title="The authenticated username or machine name for this session"><strong>Username:</strong> {session.user_name || "N/A"}</p>
                    <p title="The hardware MAC address of the connecting endpoint (calling_station_id)"><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace' }}>{session.calling_station_id}</span></p>
                    <p title="The IP address assigned to the endpoint (framed_ip_address)"><strong>IP Address:</strong> <span style={{ fontFamily: 'monospace' }}>{session.framed_ip_address || "N/A"}</span></p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Network Location</h4>
                    <p title="The IP address of the switch, WLC, or firewall the endpoint connects through (nas_ip_address)"><strong>Device IP:</strong> {session.nas_ip_address}</p>
                    <p title="The physical port or wireless SSID the endpoint is connected to (nas_port_id)"><strong>Port/SSID:</strong> {session.nas_port_id}</p>
                    <p title="The hostname or identifier of the network access device (nas_identifier)"><strong>Switch:</strong> {session.nas_identifier}</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Posture State</h4>
                    <p title="The physical device type that ISE profiled this endpoint as (e.g., Apple-iPhone, Microsoft-Workstation)"><strong>Profile:</strong> <span style={{ color: 'var(--accent-primary)' }}>{session.endpoint_profile || "Unknown"}</span></p>
                    <p title="The AnyConnect/Secure Client compliance posture status of the endpoint"><strong>Posture:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{session.posture_status || "Unknown"}</span></p>
                    <span title="The AnyConnect/Secure Client compliance posture status of the endpoint" style={{ fontSize: '0.75rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                        {session.posture_status || "UNKNOWN"}
                    </span>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>MDM & Compliance</h4>
                    <p title="Whether the ISE policy node can successfully reach the MDM server to query compliance"><strong>MDM Reachable:</strong> {session.mdm_reachable || "N/A"}</p>
                    <p title="Whether the MDM server actively reports this device as compliant with corporate policy"><strong>MDM Compliant:</strong> {session.mdm_compliant || "N/A"}</p>
                    <p title="The unique, hex-encoded Audit Session ID generated by the network access device."><strong>Audit ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{session.audit_session_id?.substring(0, 16)}...</span></p>
                </div>
            </div>
            <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', fontSize: '0.9rem' }}>
                <p title="The exact ISE Authorization Policy Rule that granted this endpoint access"><strong>AuthZ Rule:</strong> {session.authorization_rule || "Unknown"}</p>
                <p title="The authentication method used, such as dot1x (802.1X), mab (MAC Authentication Bypass), or WebAuth"><strong>Auth Method:</strong> {session.authentication_method || "Unknown"}</p>
                <p title="The inner EAP protocol used for the secure tunnel (e.g., EAP-TLS, PEAP)"><strong>Auth Protocol:</strong> {session.authentication_protocol || "Unknown"}</p>
                <p title="The specific Cisco ISE Policy Service Node (PSN) that processed this authentication"><strong>ACS Server:</strong> {session.acs_server || "Unknown"}</p>
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
        <div className="glass-card" style={{ marginBottom: '24px', borderLeft: `6px solid ${accentColor}`, padding: '0' }}>
            <div style={{ padding: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                    <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            Historical Status <span style={{ fontSize: '0.7rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                        </h4>
                        <p title="The exact date and time this authentication event was logged (acs_timestamp)"><strong>Timestamp:</strong> {failure.timestamp !== "Unknown" ? new Date(failure.timestamp).toLocaleString() : "Unknown"}</p>
                        <p title="The final result or reason code returned by the ISE authorization engine"><strong>Result:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{failure.failure_reason}</span></p>
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
                        <button onClick={() => setExpanded(!expanded)} className="btn-secondary" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                            <span title="Click to view the step-by-step diagnostic sequence from the ISE MnT log">{expanded ? 'Hide' : 'Show'} Technical Details ({failure.steps.length} Steps)</span>
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

function TacacsCard({ event }: { event: any }) {
    const isPass = event.status === true;
    const accentColor = isPass ? '#10b981' : '#ef4444';
    const bgColor = isPass ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    return (
        <div className="glass-card" style={{ marginBottom: '24px', borderLeft: `6px solid ${accentColor}`, padding: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        TACACS+ Status <span style={{ fontSize: '0.7rem', background: bgColor, color: accentColor, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                    </h4>
                    <p title="The exact time of the TACACS+ authentication or authorization event"><strong>Timestamp:</strong> {event.timestamp !== "Unknown" ? new Date(event.timestamp).toLocaleString() : "Unknown"}</p>
                    <p title="The final result returned by the TACACS+ engine"><strong>Result:</strong> <span style={{ color: accentColor, fontWeight: 'bold' }}>{event.failure_reason}</span></p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Administrator Identity</h4>
                    <p title="The system administrator username that initiated this TACACS+ event"><strong>Username:</strong> {event.user_name || "N/A"}</p>
                    <p title="The source MAC address or identifier of the administrative connection"><strong>Client ID:</strong> <span style={{ fontFamily: 'monospace' }}>{event.calling_station_id}</span></p>
                    <p title="The Identity Store used to validate the credentials (e.g., Active Directory)"><strong>Identity Store:</strong> {event.identity_store || "Unknown"}</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Target Device</h4>
                    <p title="The IP address of the switch, router, or firewall being managed"><strong>Device IP:</strong> {event.nas_ip_address}</p>
                    <p title="The actual physical or logical port on the target device"><strong>Access Port:</strong> {event.nas_port_id}</p>
                    <p title="The friendly name assigned to the target device in ISE network resources"><strong>Device Name:</strong> {event.nas_identifier}</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Action & Privilege</h4>
                    <p title="The privilege level assigned to the session (typically 1-15)"><strong>Privilege Level:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>Level {event.privilege_level}</span></p>
                    <p title="The specific command set or profile applied to this session"><strong>Command Set:</strong> {event.command_set}</p>
                    <p title="The ISE Authorization Rule matched for this administrative session"><strong>Matched Rule:</strong> {event.authorization_rule}</p>
                </div>
            </div>
            <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <strong>Processing Node:</strong> {event.acs_server} | <strong>Status ID:</strong> {event.failure_id}
            </div>
        </div>
    );
}
