"use client";

import { useState, useEffect } from "react";
import { ToolHelp } from "@/components/ToolHelp";

export default function CiscoFirewallPage() {
    const [activeTab, setActiveTab] = useState<"manual" | "guardian" | "blacklist">("manual");
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

    const [guardianStatus, setGuardianStatus] = useState<{ isLive: boolean; lastRun: string | null; watchList: string[]; status?: string } | null>(null);

    const [guardianEvents, setGuardianEvents] = useState<any[]>([]);
    const [loadingGuardianEvents, setLoadingGuardianEvents] = useState(false);
    const [guardianSearch, setGuardianSearch] = useState("");
    const [guardianFilter, setGuardianFilter] = useState("");

    const [blacklist, setBlacklist] = useState<any[]>([]);
    const [loadingBlacklist, setLoadingBlacklist] = useState(false);

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

    const fetchGuardianEvents = async () => {
        setLoadingGuardianEvents(true);
        try {
            const params = new URLSearchParams();
            if (guardianSearch) params.append("search", guardianSearch);
            if (guardianFilter) params.append("action", guardianFilter);
            
            const res = await fetch(`/api/firewall/guardian?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setGuardianEvents(data);
            }
        } catch (e) {
            console.error("Failed to load Guardian events");
        } finally {
            setLoadingGuardianEvents(false);
        }
    };

    const fetchBlacklist = async () => {
        setLoadingBlacklist(true);
        try {
            const res = await fetch("/api/firewall/guardian/blacklist");
            if (res.ok) {
                const data = await res.json();
                setBlacklist(data);
            }
        } catch (e) {
            console.error("Failed to load Guardian blacklist");
        } finally {
            setLoadingBlacklist(false);
        }
    };

    const handleRemoveFromBlacklist = async (ip: string) => {
        if (confirm(`Are you sure you want to remove ${ip} from the do-not-unshun blacklist? This will clear the block, but will NOT automatically remove the shun from the firewalls if the shun is currently active.`)) {
            try {
                const res = await fetch(`/api/firewall/guardian/blacklist?ip=${encodeURIComponent(ip)}`, {
                    method: "DELETE"
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        fetchBlacklist();
                    } else {
                        alert(data.error || "Failed to remove IP from blacklist");
                    }
                } else {
                    alert("Failed to remove IP from blacklist");
                }
            } catch (e: any) {
                alert(e.message || "Failed to remove IP from blacklist");
            }
        }
    };

    useEffect(() => {
        if (activeTab === "guardian") {
            fetchGuardianEvents();
        } else if (activeTab === "blacklist") {
            fetchBlacklist();
        }
    }, [activeTab, guardianSearch, guardianFilter]);

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
            <div className="shrink-0 flex flex-col gap-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="flex items-center gap-3">
                            Cisco Firewall Utilities
                            <ToolHelp toolId="firewall" iconSize={24} />
                        </h1>
                        <p className="text-text-secondary">Query or remove IP address shuns across your configured Cisco devices.</p>
                    </div>

                    {guardianStatus && (
                        <div 
                            title={
                                !guardianStatus.isLive 
                                    ? `STALLED: Guardian heartbeat not detected in the last 5 minutes.\nMonitoring: ${guardianStatus.watchList.join(', ')}`
                                    : guardianStatus.status === 'INACTIVE'
                                        ? `INACTIVE: No IPs configured for monitoring.`
                                        : guardianStatus.status === 'WARNING'
                                            ? `WARNING: Guardian is running but encountered an error on its last scan.\nMonitoring: ${guardianStatus.watchList.join(', ')}`
                                            : `ACTIVE: Guardian is running successfully.\nMonitoring: ${guardianStatus.watchList.join(', ')}`
                            }
                            className="flex items-center gap-2.5 bg-white/3 px-4 py-2 rounded-[20px] border border-border-color cursor-help"
                        >
                            <div className="w-2 h-2 rounded-full" style={{ 
                                backgroundColor: !guardianStatus.isLive ? '#ef4444' : (guardianStatus.status === 'INACTIVE' ? '#9ca3af' : (guardianStatus.status === 'WARNING' ? '#f59e0b' : '#10b981')),
                                boxShadow: !guardianStatus.isLive ? 'none' : (guardianStatus.status === 'INACTIVE' ? '0 0 8px #9ca3af' : (guardianStatus.status === 'WARNING' ? '0 0 8px #f59e0b' : '0 0 8px #10b981'))
                            }}></div>
                            <span className="text-[0.8rem] font-semibold" style={{ color: !guardianStatus.isLive ? '#ef4444' : (guardianStatus.status === 'INACTIVE' ? '#9ca3af' : (guardianStatus.status === 'WARNING' ? '#f59e0b' : '#10b981')) }}>
                                GUARDIAN: {!guardianStatus.isLive ? "STALLED" : (guardianStatus.status === 'INACTIVE' ? "INACTIVE" : (guardianStatus.status === 'WARNING' ? "WARNING" : "ACTIVE"))}
                            </span>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 border-b border-border-color pb-[1px] mb-3">
                    <button
                        onClick={() => setActiveTab("manual")}
                        className="px-4 py-2 border-none font-semibold cursor-pointer"
                        style={{
                            background: activeTab === "manual" ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            borderBottom: activeTab === "manual" ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === "manual" ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                    >
                        Manual Shuns
                    </button>
                    <button
                        onClick={() => setActiveTab("guardian")}
                        className="px-4 py-2 border-none font-semibold cursor-pointer"
                        style={{
                            background: activeTab === "guardian" ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            borderBottom: activeTab === "guardian" ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === "guardian" ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                    >
                        Guardian Auto-Unshun Logs
                    </button>
                    <button
                        onClick={() => setActiveTab("blacklist")}
                        className="px-4 py-2 border-none font-semibold cursor-pointer"
                        style={{
                            background: activeTab === "blacklist" ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            borderBottom: activeTab === "blacklist" ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === "blacklist" ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                    >
                        Guardian Blacklist
                    </button>
                </div>

            </div>

            <div className="flex-1 min-h-0 flex flex-col gap-6">
            {activeTab === "manual" ? (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,450px)_1fr] gap-8 items-stretch">

                    {/* --- CONTROLS CARD --- */}
                    <div className="glass-card">
                        <h3 className="mb-4">Shun Management</h3>

                        {loadingHosts ? (
                            <p className="text-text-muted">Loading configured firewalls...</p>
                        ) : hostsError ? (
                            <div className="p-4 bg-red-500/10 text-red-500 rounded-md border border-red-500 mb-6">
                                <strong>Configuration Error:</strong> {hostsError}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-5 mb-8">
                                <div className="input-group">
                                    <label htmlFor="targetHost">Target Firewall</label>
                                    <select
                                        id="targetHost"
                                        value={targetHost}
                                        onChange={(e) => setTargetHost(e.target.value)}
                                        className="w-full p-3 bg-white/3 border border-border-color rounded-sm text-text-primary text-base outline-none"
                                    >
                                        {availableHosts.map(h => (
                                            <option key={h.id} value={h.id} className="bg-bg-dark">{h.name}</option>
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
                            <div className="flex gap-2.5">
                                <button
                                    type="button"
                                    className="btn-primary flex-1 bg-bg-surface-hover border-border-color text-text-primary"
                                    onClick={() => handleAction("show")}
                                    disabled={actionLoading || !ipAddress}
                                >
                                    {actionLoading ? "Processing..." : "Check Shun"}
                                </button>
                                <button
                                    type="button"
                                    className="btn-primary flex-1 bg-red-500 border-red-500"
                                    onClick={() => handleAction("remove")}
                                    disabled={actionLoading || !ipAddress}
                                >
                                    {actionLoading ? "Processing..." : "Remove Shun"}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* --- OUTPUT CARD --- */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '250px' }}>
                        <h3 className="mb-4">Terminal Output</h3>

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

            {/* --- RECENT HISTORY CARD --- */}
            <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ flexShrink: 0 }}>
                    <h3 className="mb-4">Recent Global Queries</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Showing the last 50 shun queries executed across all team members.
                    </p>
                </div>

                {loadingHistory ? (
                    <p className="text-text-muted">Loading history...</p>
                ) : history.length === 0 ? (
                    <p className="text-text-muted">No queries have been executed yet.</p>
                ) : (
                    <div style={{ flex: 1, overflow: 'auto' }} className="custom-scrollbar">
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead className="sticky top-0 bg-bg-surface z-10">
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
                                                            <span className="text-text-primary font-medium">{record.ipAsName}</span>
                                                            <div className="flex gap-2 items-center">
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
        </>
        ) : activeTab === "guardian" ? (
             <div className="flex-1 min-h-0 flex flex-col gap-6">
                {/* --- SEARCH & FILTER CONTROLS --- */}
                <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <input
                            type="text"
                            placeholder="Search by IP, Company Name, CIDR, ASN or details..."
                            value={guardianSearch}
                            onChange={(e) => setGuardianSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ width: '180px' }}>
                        <select
                            value={guardianFilter}
                            onChange={(e) => setGuardianFilter(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="" className="bg-bg-dark">All Actions</option>
                            <option value="AUTO_UNSHUNNED" className="bg-bg-dark">Auto-Unshunned</option>
                            <option value="SKIPPED" className="bg-bg-dark">Skipped (Retained)</option>
                            <option value="FAILED" className="bg-bg-dark">Failed</option>
                        </select>
                    </div>
                </div>

                {/* --- GUARDIAN EVENTS TABLE --- */}
                <div className="glass-card flex-1 flex flex-col min-h-0" style={{ minHeight: '400px' }}>
                    <div className="mb-4">
                        <h3>Guardian Shun Intel Log</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Search, report, and display real-time Graylog shun logs that were auto-unshunned or retained.
                        </p>
                    </div>

                    {loadingGuardianEvents ? (
                        <p className="text-text-muted">Loading Guardian events...</p>
                    ) : guardianEvents.length === 0 ? (
                        <p className="text-text-muted">No matching logs found.</p>
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead className="sticky top-0 bg-bg-surface z-10">
                                    <tr style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Timestamp</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>IP / CIDR</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Company / ASN</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Type</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Action</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>VPN History</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Trigger</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guardianEvents.map((event) => (
                                        <tr key={event.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(event.createdAt).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>{event.ip}</span>
                                                    {event.cidr && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>{event.cidr}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span className="font-medium text-text-primary">
                                                        {event.companyName || "Unknown"}
                                                    </span>
                                                    {event.asn && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{event.asn}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{ 
                                                    padding: '4px 8px', 
                                                    borderRadius: '4px', 
                                                    backgroundColor: event.companyType?.toLowerCase() === 'isp' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    color: event.companyType?.toLowerCase() === 'isp' ? '#60a5fa' : 'var(--text-muted)',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {event.companyType || "unknown"}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <span style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 'bold',
                                                    backgroundColor: event.action === 'AUTO_UNSHUNNED' ? 'rgba(34, 197, 94, 0.15)' : event.action === 'FAILED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                    color: event.action === 'AUTO_UNSHUNNED' ? '#22c55e' : event.action === 'FAILED' ? '#f87171' : 'var(--text-muted)'
                                                }}>
                                                    {event.action}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                {event.hasVpnHistory ? (
                                                    <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                                                        🟢 Yes
                                                    </span>
                                                ) : (
                                                    <span className="text-text-muted text-xs">
                                                        ⚪ No
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 8px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(event.reason || "NONE").split(',').map((r) => (
                                                        <span key={r} style={{
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 'bold',
                                                            backgroundColor: r === 'VPN_HISTORY' ? 'rgba(16, 185, 129, 0.15)' : r === 'ISP_TYPE' ? 'rgba(59, 130, 246, 0.15)' : r === 'WATCHLIST' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                                            color: r === 'VPN_HISTORY' ? '#10b981' : r === 'ISP_TYPE' ? '#3b82f6' : r === 'WATCHLIST' ? '#a855f7' : 'var(--text-muted)'
                                                        }}>
                                                            {r === 'VPN_HISTORY' ? 'VPN History' : r === 'ISP_TYPE' ? 'ISP Match' : r === 'WATCHLIST' ? 'Watchlist' : 'None'}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                                {event.details}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-6">
                <div className="glass-card flex-1 flex flex-col min-h-0" style={{ minHeight: '400px' }}>
                    <div className="mb-4">
                        <h3>Guardian Do-Not-Unshun Blacklist</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            The following IP addresses have triggered automated safety limits (e.g. repeated unshuns or suspicious brute forcing) and are barred from auto-unshunning. They must be manually cleared to allow automated handling again.
                        </p>
                    </div>

                    {loadingBlacklist ? (
                        <p className="text-text-muted">Loading blacklist...</p>
                    ) : blacklist.length === 0 ? (
                        <p className="text-text-muted">No IPs currently blacklisted.</p>
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead className="sticky top-0 bg-bg-surface z-10">
                                    <tr style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Blacklisted Date</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>IP Address</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)' }}>Reason for Blocking</th>
                                        <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {blacklist.map((item) => (
                                        <tr key={item.ip} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }}>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(item.createdAt).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                                {item.ip}
                                            </td>
                                            <td style={{ padding: '12px 8px', color: 'var(--text-primary)' }}>
                                                {item.reason}
                                            </td>
                                            <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleRemoveFromBlacklist(item.ip)}
                                                    className="mac-button"
                                                    style={{
                                                        fontSize: '0.8rem',
                                                        padding: '4px 8px',
                                                        borderColor: '#f87171',
                                                        color: '#f87171'
                                                    }}
                                                >
                                                    Clear Block
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        )}
            </div>
    </div>
    );
}
