"use client";

import { useState } from "react";

export default function CiscoIseFailuresPage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [failuresResult, setFailuresResult] = useState<any>(null);
    const [activeView, setActiveView] = useState<"discovery" | "failures">("discovery");
    const [error, setError] = useState("");

    const handleSearch = async (e?: React.FormEvent, macToDrilldown?: string) => {
        if (e) e.preventDefault();
        const searchTerm = macToDrilldown || query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        
        // Only clear discovery if we are doing a brand new primary search
        if (!macToDrilldown) {
            setDiscoveryResult(null);
            setFailuresResult(null);
        } else {
            setFailuresResult(null);
        }

        try {
            const res = await fetch(`/api/ise/failures?query=${encodeURIComponent(searchTerm)}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to query ISE");
            }

            if (data.searchType === "user_name") {
                setDiscoveryResult(data);
                setActiveView("discovery");
                if (!macToDrilldown) setQuery(searchTerm);
            } else {
                setFailuresResult(data);
                setActiveView("failures");
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h1 style={{ marginBottom: '8px' }}>Cisco ISE Auth Failures</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Search the monitoring logs for historic authentication failures by MAC Address or Username.</p>

            <form onSubmit={(e) => handleSearch(e)} className="glass-card" style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Enter MAC Address or Username..."
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

            {activeView === "discovery" && discoveryResult && !discoveryResult.found && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>No authentication data found for '{query}'</p>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The device might have successfully authenticated, or its history is older than the 24-hour log retention.</p>
                </div>
            )}
            
            {activeView === "failures" && failuresResult && !failuresResult.found && (
                <div className="glass-card" style={{ textAlign: 'center', padding: '32px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>No authentication failures found for this MAC Address.</p>
                    <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The device might have successfully authenticated, or its failures are older than the 24-hour log retention.</p>
                    {discoveryResult && (
                        <button onClick={() => setActiveView("discovery")} className="btn-secondary" style={{ marginTop: '16px', padding: '8px 16px' }}>&larr; Back to MAC List</button>
                    )}
                </div>
            )}

            {/* Discovery View: Multiple MACs found for a Username */}
            {activeView === "discovery" && discoveryResult && discoveryResult.found && discoveryResult.discovery && (
                <div>
                    <h3 style={{ marginBottom: '16px' }}>MAC Addresses associated with '{query}'</h3>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>Click a MAC address to view its specific authentication failure history.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
                        {discoveryResult.discovery.map((item: any, idx: number) => (
                            <div key={idx} className="glass-card" style={{ cursor: 'pointer', border: '1px solid var(--border-color)', transition: 'border-color 0.2s' }} onClick={() => handleSearch(undefined, item.mac)}>
                                <h4 style={{ color: 'var(--accent-primary)', marginBottom: '12px', fontFamily: 'monospace' }}>{item.mac}</h4>
                                <p style={{ fontSize: '0.9rem', marginBottom: '4px' }}><strong>Last Seen:</strong> {item.timestamp !== "Unknown" ? new Date(item.timestamp).toLocaleString() : "Unknown"}</p>
                                <p style={{ fontSize: '0.9rem', marginBottom: '12px' }}><strong>Last Connection:</strong> {item.nas_identifier}</p>
                                <button className="btn-secondary" style={{ width: '100%', fontSize: '0.8rem', padding: '8px' }}>View Failure Logs</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Failures View: Historical failures for a specific MAC */}
            {activeView === "failures" && failuresResult && failuresResult.found && failuresResult.failures && failuresResult.failures.length > 0 && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <h3>Found {failuresResult.failures.length} Failed Authentication{failuresResult.failures.length !== 1 ? 's' : ''}</h3>
                        {discoveryResult && (
                            <button onClick={() => setActiveView("discovery")} className="btn-secondary" style={{ padding: '8px 16px' }}>&larr; Back to MAC List</button>
                        )}
                    </div>
                    {failuresResult.failures.map((failure: any, idx: number) => (
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
