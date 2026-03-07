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
        } catch (err: any) {
            setActionError(err.message || "An unexpected error occurred during execution.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1>Cisco Firewall Utilities</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Query or remove IP address shuns across your configured Cisco devices.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 450px) 1fr', gap: '2rem', alignItems: 'flex-start' }}>

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
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
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
    );
}
