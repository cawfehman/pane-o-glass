"use client";

import { useState } from "react";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState("");

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError("");
        setResult(null);

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

            {result && result.found && result.session && (
                <div className="glass-card">
                    <h3 style={{ marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>Active Session Details</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>

                        <div>
                            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Identity</h4>
                            <p><strong>Username:</strong> {result.session.user_name || "N/A"}</p>
                            <p><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{result.session.calling_station_id}</span></p>
                            <p><strong>IP Address:</strong> <span style={{ fontFamily: 'monospace' }}>{result.session.framed_ip_address || "N/A"}</span></p>
                        </div>

                        <div>
                            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Location</h4>
                            <p><strong>Network Device IP:</strong> {result.session.nas_ip_address}</p>
                            <p><strong>Connection Port/SSID:</strong> {result.session.nas_port_id}</p>
                            <p><strong>Switch Identifier:</strong> {result.session.nas_identifier}</p>
                        </div>

                        <div>
                            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Posture & Authentication</h4>
                            <p><strong>Endpoint Profile:</strong> {result.session.endpoint_profile || "Unknown"}</p>
                            <p><strong>Identity Group:</strong> {result.session.identity_group || "Unknown"}</p>
                            <p><strong>Posture Status:</strong> <span style={{
                                color: result.session.posture_status === 'Compliant' ? 'var(--accent-tertiary)' :
                                    result.session.posture_status === 'Pending' ? 'var(--accent-primary)' : 'var(--accent-secondary)'
                            }}>{result.session.posture_status || "Unknown"}</span></p>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
}
