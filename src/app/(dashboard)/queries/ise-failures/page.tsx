"use client";

import { useState } from "react";

export default function CiscoIseFailuresPage() {
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
            const res = await fetch(`/api/ise/failures?query=${encodeURIComponent(query)}`);
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
            <h1 style={{ marginBottom: '8px' }}>Cisco ISE Auth Failures</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Search the monitoring logs for historic authentication failures by MAC Address.</p>

            <form onSubmit={handleSearch} className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter MAC Address (e.g., AA:BB:CC:DD:EE:FF)..."
                    style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '1rem' }}
                    disabled={loading}
                />
                <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '12px 32px', borderRadius: '8px', fontWeight: 'bold' }}>
                    {loading ? "Querying ISE..." : "Search Logs"}
                </button>
            </form>

            {error && (
                <div style={{ padding: '16px', borderLeft: '4px solid var(--accent-secondary)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-secondary)', marginBottom: '24px' }}>
                    <strong>Search Failed:</strong> {error}
                </div>
            )}

            {result && !result.found && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>No authentication failures found for '{query}'</p>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The device might have successfully authenticated, or its failures are older than the 24-hour log retention.</p>
                </div>
            )}

            {result && result.found && result.failures && result.failures.length > 0 && (
                <div>
                    <h3 style={{ marginBottom: '16px' }}>Found {result.failures.length} Failed Authentication{result.failures.length !== 1 ? 's' : ''}</h3>
                    {result.failures.map((failure: any, idx: number) => (
                        <div key={idx} className="glass-card" style={{ marginBottom: '24px', borderLeft: '4px solid var(--accent-secondary)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>

                                <div>
                                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Log Detail</h4>
                                    <p title="The exact date and time the failure occurred"><strong>Timestamp:</strong> {failure.timestamp !== "Unknown" ? new Date(failure.timestamp).toLocaleString() : "Unknown"}</p>
                                    <p title="The translated ISE failure reason indicating why the connection was rejected"><strong>Failure Reason:</strong> <span style={{ color: 'var(--accent-secondary)', fontWeight: 'bold' }}>{failure.failure_reason}</span></p>
                                </div>

                                <div>
                                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Identity</h4>
                                    <p title="The username or machine identity attempted"><strong>Username:</strong> {failure.user_name || "N/A"}</p>
                                    <p title="The hardware MAC address of the endpoint"><strong>MAC Address:</strong> <span style={{ fontFamily: 'monospace' }}>{failure.calling_station_id}</span></p>
                                </div>

                                <div>
                                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Network Location</h4>
                                    <p title="The IP address of the switch, WLC, or firewall"><strong>Device IP:</strong> {failure.nas_ip_address}</p>
                                    <p title="The SSID or physical port"><strong>Port/SSID:</strong> {failure.nas_port_id}</p>
                                    <p title="The hostname of the network device"><strong>Switch Name:</strong> {failure.nas_identifier}</p>
                                </div>

                                <div>
                                    <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '8px' }}>Auth Protocols</h4>
                                    <p><strong>Method:</strong> {failure.authentication_method}</p>
                                    <p><strong>Protocol:</strong> {failure.authentication_protocol}</p>
                                    <p title="The Policy Service Node that processed the failure"><strong>ACS Server:</strong> {failure.acs_server}</p>
                                </div>

                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
