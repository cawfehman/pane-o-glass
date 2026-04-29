"use client";

import { useState, useEffect } from "react";

export default function CiscoFirewallPage() {
    const [ipAddress, setIpAddress] = useState("");
    const [availableHosts, setAvailableHosts] = useState<{ id: string, name: string }[]>([]);
    const [targetHost, setTargetHost] = useState("");
    const [loadingHosts, setLoadingHosts] = useState(true);
    const [hostsError, setHostsError] = useState("");

    const [actionLoading, setActionLoading] = useState(false);
    const [actionError, setActionError] = useState("");
    const [actionResult, setActionResult] = useState<{ stdout: string; stderr: string; command: string; target: string } | null>(null);

    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    const [guardianStatus, setGuardianStatus] = useState<{ isLive: boolean; lastRun: string | null; watchList: string[] } | null>(null);

    const fetchHistory = async () => {
        try {
            const res = await fetch("/api/firewall/history", { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
            }
        } catch (e) {
            console.error("Failed to load history");
        } finally {
            setLoadingHistory(false);
        }
    };

    const fetchGuardianStatus = async () => {
        try {
            const res = await fetch("/api/health/guardian");
            if (res.ok) {
                const data = await res.json();
                setGuardianStatus(data);
            }
        } catch (e) {}
    };

    // Fetch configured firewalls on load
    useEffect(() => {
        const fetchHosts = async () => {
            try {
                const res = await fetch("/api/firewall/hosts");
                if (res.ok) {
                    const data = await res.json();
                    setAvailableHosts(data.hosts || []);
                    if (data.hosts && data.hosts.length > 0) {
                        setTargetHost(data.hosts[0].id);
                    }
                } else {
                    const err = await res.json();
                    setHostsError(err.error || "Failed to fetch firewall configurations.");
                }
            } catch (e: any) {
                setHostsError("Failed to fetch configured firewalls.");
            } finally {
                setLoadingHosts(false);
            }
        };

        fetchHosts();
        fetchHistory();
        fetchGuardianStatus();
        
        // Refresh guardian status every minute
        const interval = setInterval(fetchGuardianStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    const handleAction = async (action: "show" | "remove") => {
        setActionError("");
        setActionResult(null);

        if (!ipAddress) {
            setActionError("Please enter a valid IP address.");
            return;
        }

        if (action === "remove") {
            const hostName = availableHosts.find(h => h.id === targetHost)?.name || targetHost;
            const confirmed = window.confirm(`Are you sure you want to remove the shun for ${ipAddress} on ${hostName}?`);
            if (!confirmed) return;
        }

        setActionLoading(true);
        try {
            const res = await fetch("/api/firewall/shun", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ipAddress, action, targetHost })
            });

            if (!res.ok) {
                const text = await res.text();
                // Check if JSON
                try {
                    const json = JSON.parse(text);
                    throw new Error(json.error || "Execution failed");
                } catch (e) {
                    throw new Error(text || "Execution failed");
                }
            }

            const data = await res.json();
            setActionResult(data);
            fetchHistory(); // Refresh history
        } catch (err: any) {
            setActionError(err.message || "An unexpected error occurred during execution.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1>Cisco Firewall Utilities</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Query or remove IP address shuns across your configured Cisco devices.</p>
                    </div>

                    {guardianStatus && (
                        <div 
                            title={`Guardian is monitoring: ${guardianStatus.watchList.join(', ')}`}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                backgroundColor: 'rgba(255,255,255,0.03)', 
                                padding: '8px 16px', 
                                borderRadius: '20px', 
                                border: '1px solid var(--border-color)',
                                cursor: 'help'
                            }}
                        >
                            <div style={{ 
                                width: '8px', 
                                height: '8px', 
                                borderRadius: '50%', 
                                backgroundColor: guardianStatus.isLive ? '#10b981' : '#ef4444',
                                boxShadow: guardianStatus.isLive ? '0 0 8px #10b981' : 'none'
                            }}></div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: guardianStatus.isLive ? '#10b981' : '#ef4444' }}>
                                GUARDIAN: {guardianStatus.isLive ? "ACTIVE" : "STALLED"}
                            </span>
                        </div>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 450px) 1fr', gap: '2rem', alignItems: 'stretch' }}>

                    {/* --- CONTROLS CARD --- */}
                    <div className="glass-card">
                        <h3 style={{ marginBottom: '16px' }}>Shun Management</h3>

                        {loadingHosts ? (
                            <p style={{ color: 'var(--text-muted)' }}>Loading configured firewalls...</p>
                        ) : hostsError ? (
                            <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1.5rem' }}>
                                <strong>Configuration Error:</strong> {hostsError}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                                <div className="input-group">
                                    <label htmlFor="targetHost">Target Firewall</label>
                                    <select
                                        id="targetHost"
                                        value={targetHost}
                                        onChange={(e) => setTargetHost(e.target.value)}
                                        style={{
                                            width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                                        }}
                                    >
                                        {availableHosts.map(h => (
                                            <option key={h.id} value={h.id} style={{ background: 'var(--bg-dark)' }}>{h.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="input-group">
                                    <label htmlFor="ipAddress">IPv4 Address to Query/Manage</label>
                                    <input
                                        type="text"
                                        id="ipAddress"
                                        value={ipAddress}
                                        onChange={(e) => setIpAddress(e.target.value)}
                                        placeholder="e.g. 192.168.1.50"
                                    />
                                </div>
                            </div>
                        )}

                        {!loadingHosts && !hostsError && (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => handleAction("show")}
                                    disabled={actionLoading || !ipAddress}
                                    style={{ flex: 1, background: 'var(--bg-surface-hover)', borderColor: 'var(--border-color)', color: 'var(--text-primary)' }}
                                >
                                    {actionLoading ? "Processing..." : "Check Shun"}
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => handleAction("remove")}
                                    disabled={actionLoading || !ipAddress}
                                    style={{ flex: 1, background: '#ef4444', borderColor: '#ef4444' }}
                                >
                                    {actionLoading ? "Processing..." : "Remove Shun"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* --- OUTPUT CARD --- */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '250px' }}>
                        <h3 style={{ marginBottom: '16px' }}>Terminal Output</h3>

                        {actionError && (
                            <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                <strong>Execution Error:</strong> {actionError}
                            </div>
                        )}

                        <div style={{
                            flex: 1,
                            background: '#0a0a0a',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-color)',
                            padding: '1rem',
                            fontFamily: 'monospace',
                            color: '#d4d4d4',
                            overflowY: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                        }}>
                            {!actionResult && !actionLoading && !actionError && (
                                <div style={{ color: '#555', fontStyle: 'italic', paddingTop: '1rem', textAlign: 'center' }}>
                                    Awaiting command execution...
                                </div>
                            )}

                            {actionLoading && (
                                <div style={{ color: '#3b82f6', animation: 'pulse 2s infinite' }}>
                                    Executing SSH command on {availableHosts.find(h => h.id === targetHost)?.name || targetHost}...
                                </div>
                            )}

                            {actionResult && (
                                <>
                                    <div style={{ color: '#38bdf8', marginBottom: '0.5rem' }}>
                                        $ ssh user@{actionResult.target} -c "{actionResult.command}"
                                    </div>
                                    {actionResult.stdout && (
                                        <div style={{ color: '#a3be8c', marginBottom: '1rem' }}>{actionResult.stdout}</div>
                                    )}
                                    {actionResult.stderr && (
                                        <div style={{ color: '#bf616a' }}>{actionResult.stderr}</div>
                                    )}
                                    {!actionResult.stdout && !actionResult.stderr && (
                                        <div style={{ color: '#888', fontStyle: 'italic' }}>(Command returned cleanly with no text output)</div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- RECENT HISTORY CARD --- */}
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0 }}>
                    <h3 style={{ marginBottom: '16px' }}>Recent Global Queries</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Showing the last 50 shun queries executed across all team members.
                    </p>
                </div>

                {loadingHistory ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading history...</p>
                ) : history.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No queries have been executed yet.</p>
                ) : (
                    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)', zIndex: 10 }}>
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                            <th style={{ padding: '12px 8px' }}>Timestamp</th>
                                            <th style={{ padding: '12px 8px' }}>User</th>
                                            <th style={{ padding: '12px 8px' }}>Action</th>
                                            <th style={{ padding: '12px 8px' }}>Target IP</th>
                                            <th style={{ padding: '12px 8px' }}>Network Info</th>
                                            <th style={{ padding: '12px 8px' }}>Firewall</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map((record) => (
                                            <tr key={record.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                                    {new Date(record.createdAt).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                                    {record.user?.username || "Unknown"}
                                                </td>
                                                <td style={{ padding: '12px 8px' }}>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.75rem',
                                                        backgroundColor: record.command === "Check Shun" ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                                        color: record.command === "Check Shun" ? '#60a5fa' : '#f87171'
                                                    }}>
                                                        {record.command}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>
                                                    <a 
                                                        href={`https://ipinfo.io/${record.targetIp}?lookup_source=search-bar`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ color: 'inherit', textDecoration: 'none' }}
                                                        onMouseOver={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                                        onMouseOut={(e) => e.currentTarget.style.textDecoration = 'none'}
                                                    >
                                                        {record.targetIp}
                                                    </a>
                                                </td>
                                                <td style={{ padding: '12px 8px', fontSize: '0.875rem' }}>
                                                    {record.ipAsName ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{record.ipAsName}</span>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{record.ipAsn}</span>
                                                                {record.ipCountryCode && (
                                                                    <span style={{ 
                                                                        padding: '2px 6px', 
                                                                        borderRadius: '4px', 
                                                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                                                        fontSize: '0.7rem',
                                                                        color: 'var(--text-secondary)'
                                                                    }} title={record.ipCountry}>
                                                                        {record.ipCountryCode}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No metadata</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                                    {record.targetName}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
