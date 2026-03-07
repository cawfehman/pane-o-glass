"use client";

import { useState } from "react";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");
    const [expandedSession, setExpandedSession] = useState<number | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);
        setExpandedSession(null); // Reset expansions on new search

        try {
            const res = await fetch(`/api/ise/session?query=${encodeURIComponent(query)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to query ISE");
            }

            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (idx: number) => {
        if (expandedSession === idx) setExpandedSession(null);
        else setExpandedSession(idx);
    };

    return (
        <div>
            <h1 style={{ marginBottom: '8px' }}>Cisco ISE Endpoint Lookup</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Search for active, live sessions on the network by MAC, IP, or Username.</p>

            <form onSubmit={handleSearch} className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter MAC Address, IP Address, or Username..."
                    style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem' }}
                    disabled={loading}
                />
                <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 'bold' }}>
                    {loading ? "Querying ISE..." : "Search"}
                </button>
            </form>

            {error && (
                <div style={{ padding: '16px', borderLeft: '4px solid var(--accent-secondary)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-secondary)', marginBottom: '24px' }}>
                    <strong>Search Failed:</strong> {error}
                </div>
            )}

            {result && !result.found && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>No active sessions found for '{query}'</p>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The device might be offline, sleeping, or not connected to a dot1x ported switch / SSID.</p>
                </div>
            )}

            {result && result.found && result.sessions && result.sessions.length > 0 && (
                <div>
                    <h3 style={{ marginBottom: '16px' }}>Found {result.sessions.length} Active Session{result.sessions.length !== 1 ? 's' : ''}</h3>
                    {result.sessions.map((session: any, idx: number) => {
                        const isExpanded = expandedSession === idx;
                        return (
                            <div
                                key={idx}
                                className="glass-card"
                                style={{ marginBottom: '24px', cursor: 'pointer', transition: 'all 0.2s', border: isExpanded ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)' }}
                                onClick={() => toggleExpand(idx)}
                            >
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>

                                    <div>
                                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Identity</h4>
                                        <p title="The authenticated username or machine name for this session"><strong>Username:</strong> {session.user_name || "N/A"}</p>
                                        <p title="The hardware MAC address of the connecting endpoint (calling_station_id)"><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{session.calling_station_id}</span></p>
                                        <p title="The IP address assigned to the endpoint (framed_ip_address)"><strong>IP Address:</strong> <span style={{ fontFamily: 'monospace' }}>{session.framed_ip_address || "N/A"}</span></p>
                                        <p title="The exact date and time this authentication session began (acs_timestamp)"><strong>Auth Start:</strong> {session.start_time && session.start_time !== "Unknown" ? new Date(session.start_time).toLocaleString() : "Unknown"}</p>
                                    </div>

                                    <div>
                                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Location</h4>
                                        <p title="The IP address of the switch, WLC, or firewall the endpoint connects through (nas_ip_address)"><strong>Network Device IP:</strong> {session.nas_ip_address}</p>
                                        <p title="The physical port or wireless SSID the endpoint is connected to (nas_port_id)"><strong>Connection Port/SSID:</strong> {session.nas_port_id}</p>
                                        <p title="The hostname or identifier of the network access device (nas_identifier)"><strong>Switch Identifier:</strong> {session.nas_identifier}</p>
                                        {isExpanded && <p title="The specific Cisco ISE Policy Service Node (PSN) that processed this authentication"><strong>ACS Server (PSN):</strong> {session.acs_server || "Unknown"}</p>}
                                    </div>

                                    <div>
                                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Posture & Authentication</h4>
                                        <p title="The physical device type that ISE profiled this endpoint as (e.g., Apple-iPhone, Microsoft-Workstation)"><strong>Endpoint Profile:</strong> {session.endpoint_profile || "Unknown"}</p>
                                        <p title="The internal ISE Endpoint Identity Group this device belongs to"><strong>Identity Group:</strong> {session.identity_group || "Unknown"}</p>
                                        <p title="The AnyConnect/Secure Client compliance posture status of the endpoint"><strong>Posture Status:</strong> <span style={{
                                            color: session.posture_status === 'Compliant' ? 'var(--accent-tertiary)' :
                                                session.posture_status === 'Pending' ? 'var(--accent-primary)' : 'var(--accent-secondary)'
                                        }}>{session.posture_status || "Unknown"}</span></p>
                                    </div>

                                </div>

                                {isExpanded && (
                                    <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                                        <div>
                                            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Deep Forensics</h4>
                                            <p title="The exact ISE Authorization Policy Rule that granted this endpoint access"><strong>AuthZ Rule:</strong> {session.authorization_rule || "Unknown"}</p>
                                            <p title="The authentication method used, such as dot1x (802.1X), mab (MAC Authentication Bypass), or WebAuth"><strong>Auth Method:</strong> {session.authentication_method || "Unknown"}</p>
                                            <p title="The inner EAP protocol used for the secure tunnel (e.g., EAP-TLS, PEAP)"><strong>Auth Protocol:</strong> {session.authentication_protocol || "Unknown"}</p>
                                            <p title="The Cisco TrustSec Security Group Tag (SGT) currently enforced on this session"><strong>TrustSec SGT:</strong> {session.security_group || "Unknown"}</p>
                                        </div>
                                        <div>
                                            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>MDM & Audit</h4>
                                            <p title="The Mobile Device Management server overseeing this endpoint (e.g., Intune, Jamf)"><strong>MDM Server:</strong> {session.mdm_server_name || "N/A"}</p>
                                            <p title="Whether the ISE policy node can successfully reach the MDM server to query compliance"><strong>MDM Reachable:</strong> {session.mdm_reachable || "Unknown"}</p>
                                            <p title="Whether the MDM server actively reports this device as compliant with corporate policy"><strong>MDM Compliant:</strong> {session.mdm_compliant || "Unknown"}</p>
                                            <p title="The unique, hex-encoded Audit Session ID generated by the network access device. Critical for syslog firewall tracking."><strong>Audit Session ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>{session.audit_session_id || "Unknown"}</span></p>
                                        </div>
                                    </div>
                                )}

                                <div style={{ textAlign: 'center', marginTop: isExpanded ? '16px' : '0px', paddingTop: isExpanded ? '16px' : '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {isExpanded ? '▲ Click anywhere on card to collapse' : '▼ Click card to expand deep forensic details'}
                                </div>

                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
