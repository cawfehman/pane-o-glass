"use client";

import { useState, useEffect } from "react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import { Shield } from "lucide-react";
import { ShunDatabaseTab } from "@/components/firewall/ShunDatabaseTab";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PaginationControls } from "@/components/common/PaginationControls";

export default function CiscoFirewallPage() {
    const [activeTab, setActiveTab] = useState<"manual" | "guardian" | "blacklist" | "database">("manual");
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
    const [guardianTotalDb, setGuardianTotalDb] = useState(0);
    const [guardianQueryLimit, setGuardianQueryLimit] = useState("500");
    const [loadingGuardianEvents, setLoadingGuardianEvents] = useState(false);
    const [guardianSearch, setGuardianSearch] = useState("");
    const [guardianFilter, setGuardianFilter] = useState("");
    const [guardianPage, setGuardianPage] = useState(1);
    const [guardianLimit, setGuardianLimit] = useState(25);

    const [blacklistIps, setBlacklistIps] = useState<any[]>([]);
    const [blacklistAsns, setBlacklistAsns] = useState<any[]>([]);
    const [blacklistSubTab, setBlacklistSubTab] = useState<"IP" | "ASN">("IP");
    const [loadingBlacklist, setLoadingBlacklist] = useState(false);
    const [blacklistPage, setBlacklistPage] = useState(1);
    const [blacklistLimit, setBlacklistLimit] = useState(25);

    // Add Blacklist Modal State
    const [showAddBlacklistModal, setShowAddBlacklistModal] = useState(false);
    const [addType, setAddType] = useState<"IP" | "ASN">("IP");
    const [addTarget, setAddTarget] = useState("");
    const [addReason, setAddReason] = useState("");
    const [addAsnName, setAddAsnName] = useState("");
    const [addLoading, setAddLoading] = useState(false);
    const [addError, setAddError] = useState("");

    // Confirm Dialog State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        variant?: "danger" | "warning" | "info";
    }>({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: () => {},
        variant: "danger",
    });


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
            const query = new URLSearchParams();
            if (guardianSearch) query.append("search", guardianSearch);
            if (guardianFilter) query.append("action", guardianFilter);
            if (guardianQueryLimit) query.append("limit", guardianQueryLimit);
            
            const res = await fetch(`/api/firewall/guardian?${query.toString()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.events && Array.isArray(data.events)) {
                    setGuardianEvents(data.events);
                    setGuardianTotalDb(data.totalInDb || 0);
                } else if (Array.isArray(data)) {
                    setGuardianEvents(data);
                }
            }
        } catch (e) {
            console.error("Failed to load Guardian events");
        } finally {
            setLoadingGuardianEvents(false);
        }
    };

    const exportGuardianToCsv = () => {
        if (!guardianEvents || guardianEvents.length === 0) return;
        const headers = ["Timestamp", "Action", "IP Address", "Organization / Company", "Type", "CIDR", "ASN", "Reason / Details"];
        const rows = guardianEvents.map(e => [
            new Date(e.createdAt).toISOString(),
            e.action || "",
            e.ip || "",
            `"${(e.companyName || "").replace(/"/g, '""')}"`,
            e.companyType || "",
            e.cidr || "",
            e.asn || "",
            `"${(e.details || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `guardian_unshun_logs_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fetchBlacklist = async () => {
        setLoadingBlacklist(true);
        try {
            const res = await fetch("/api/firewall/guardian/blacklist");
            if (res.ok) {
                const data = await res.json();
                if (data.ips && data.asns) {
                    setBlacklistIps(data.ips);
                    setBlacklistAsns(data.asns);
                } else if (Array.isArray(data)) {
                    setBlacklistIps(data);
                    setBlacklistAsns([]);
                }
            }
        } catch (e) {
            console.error("Failed to load Guardian blacklist");
        } finally {
            setLoadingBlacklist(false);
        }
    };

    const handleRemoveFromBlacklist = (ip: string) => {
        setConfirmModal({
            isOpen: true,
            title: `Remove ${ip} from Blacklist?`,
            message: `Are you sure you want to remove IP ${ip} from the do-not-unshun blacklist? This will clear the block, but will NOT automatically remove the shun from the firewalls if the shun is currently active.`,
            variant: "warning",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/firewall/guardian/blacklist?ip=${encodeURIComponent(ip)}`, {
                        method: "DELETE"
                    });
                    if (res.ok) {
                        fetchBlacklist();
                    } else {
                        setActionError("Failed to remove IP from blacklist");
                    }
                } catch (e: any) {
                    setActionError(e.message || "Failed to remove IP from blacklist");
                } finally {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const handleRemoveAsnFromBlacklist = (asn: string) => {
        setConfirmModal({
            isOpen: true,
            title: `Remove ASN ${asn} from Blacklist?`,
            message: `Are you sure you want to remove ASN ${asn} from the Guardian blacklist? Shuns for IPs under this ASN will no longer be automatically retained by ASN rule.`,
            variant: "warning",
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/firewall/guardian/blacklist?asn=${encodeURIComponent(asn)}`, {
                        method: "DELETE"
                    });
                    if (res.ok) {
                        fetchBlacklist();
                    } else {
                        setActionError("Failed to remove ASN from blacklist");
                    }
                } catch (e: any) {
                    setActionError(e.message || "Failed to remove ASN from blacklist");
                } finally {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
            }
        });
    };

    const handleAddBlacklistSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addTarget || !addReason) {
            setAddError("Target (IP/ASN) and reason are required.");
            return;
        }
        setAddLoading(true);
        setAddError("");
        try {
            const res = await fetch("/api/firewall/guardian/blacklist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: addType,
                    target: addTarget,
                    reason: addReason,
                    asnName: addAsnName
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setShowAddBlacklistModal(false);
                setAddTarget("");
                setAddReason("");
                setAddAsnName("");
                fetchBlacklist();
            } else {
                setAddError(data.error || "Failed to add item to blacklist.");
            }
        } catch (err: any) {
            setAddError(err.message || "An unexpected error occurred.");
        } finally {
            setAddLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === "guardian") {
            fetchGuardianEvents();
        } else if (activeTab === "blacklist") {
            fetchBlacklist();
        }
    }, [activeTab, guardianSearch, guardianFilter, guardianQueryLimit]);

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
                <QueryHeader
                    title="Cisco Firewall Utilities"
                    description="Query or remove IP address shuns across your configured Cisco devices."
                    toolId="firewall"
                    icon={<Shield />}
                    actions={
                        guardianStatus && (
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
                        )
                    }
                />

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
                    <button
                        onClick={() => setActiveTab("database")}
                        className="px-4 py-2 border-none font-semibold cursor-pointer"
                        style={{
                            background: activeTab === "database" ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                            borderBottom: activeTab === "database" ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === "database" ? 'var(--text-primary)' : 'var(--text-secondary)',
                        }}
                    >
                        Shun Database
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
             <div className="flex-1 min-h-0 flex flex-col gap-4">
                {/* --- SEARCH & FILTER CONTROLS --- */}
                <div className="glass-card" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '250px' }}>
                        <input
                            type="text"
                            placeholder="Search by IP, Company Name, CIDR, ASN or details..."
                            value={guardianSearch}
                            onChange={(e) => {
                                setGuardianSearch(e.target.value);
                                setGuardianPage(1);
                            }}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                backgroundColor: 'var(--bg-dark)',
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
                            onChange={(e) => {
                                setGuardianFilter(e.target.value);
                                setGuardianPage(1);
                            }}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                backgroundColor: 'var(--bg-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="" className="bg-bg-dark text-text-primary">All Actions</option>
                            <option value="AUTO_UNSHUNNED" className="bg-bg-dark text-text-primary">Auto-Unshunned</option>
                            <option value="SKIPPED" className="bg-bg-dark text-text-primary">Skipped (Retained)</option>
                            <option value="FAILED" className="bg-bg-dark text-text-primary">Failed</option>
                        </select>
                    </div>

                    {/* Database Query Fetch Limit */}
                    <div style={{ width: '180px' }}>
                        <select
                            value={guardianQueryLimit}
                            onChange={(e) => {
                                setGuardianQueryLimit(e.target.value);
                                setGuardianPage(1);
                            }}
                            title="Database Fetch Range (defaults to top 500, or load all 30 days)"
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                backgroundColor: 'var(--bg-dark)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px',
                                color: 'var(--text-primary)',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="100" className="bg-bg-dark text-text-primary">Fetch Top 100</option>
                            <option value="250" className="bg-bg-dark text-text-primary">Fetch Top 250</option>
                            <option value="500" className="bg-bg-dark text-text-primary">Fetch Top 500</option>
                            <option value="1000" className="bg-bg-dark text-text-primary">Fetch Top 1,000</option>
                            <option value="all" className="bg-bg-dark text-text-primary">Fetch All 30 Days</option>
                        </select>
                    </div>

                    {guardianEvents.length > 0 && (
                        <button
                            onClick={exportGuardianToCsv}
                            className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs ml-auto"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Export CSV ({guardianEvents.length})</span>
                        </button>
                    )}
                </div>

                {/* --- GUARDIAN EVENTS TABLE --- */}
                <div className="glass-card flex-1 flex flex-col min-h-0 border border-border-color rounded-xl overflow-hidden shadow-sm" style={{ minHeight: '400px', padding: 0 }}>
                    <div className="p-4 border-b border-border-color bg-bg-surface/60 shrink-0">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="m-0 text-base font-bold text-text-primary">
                                Guardian Shun Intel Log ({guardianEvents.length} loaded {guardianTotalDb > 0 && `of ${guardianTotalDb.toLocaleString()} total 30-day logs`})
                            </h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                            Search, report, and display real-time Graylog shun logs that were auto-unshunned or retained in your 30-day PostgreSQL history database.
                        </p>
                        
                        {/* Top Pinned Pagination */}
                        <div className="pt-3 mt-3 border-t border-border-color/60">
                            <PaginationControls
                                totalRecords={guardianEvents.length}
                                page={guardianPage}
                                limit={guardianLimit}
                                limitOptions={[25, 50, 100, 200]}
                                onPageChange={setGuardianPage}
                                onLimitChange={(l) => {
                                    setGuardianLimit(l);
                                    setGuardianPage(1);
                                }}
                                showLimitSelector={true}
                            />
                        </div>
                    </div>

                    {loadingGuardianEvents ? (
                        <div className="p-8 text-center text-text-muted">Loading Guardian events...</div>
                    ) : guardianEvents.length === 0 ? (
                        <div className="p-8 text-center text-text-muted">No matching logs found.</div>
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead className="sticky top-0 bg-bg-surface z-10">
                                    <tr style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Timestamp</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>IP / CIDR</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Company / ASN</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Type</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Action</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>VPN History</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Trigger</th>
                                        <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {guardianEvents
                                        .slice((guardianPage - 1) * guardianLimit, guardianPage * guardianLimit)
                                        .map((event) => (
                                        <tr key={event.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }} className="table-row-hover">
                                            <td style={{ padding: '12px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(event.createdAt).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>{event.ip}</span>
                                                    {event.cidr && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>{event.cidr}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span className="font-medium text-text-primary">
                                                        {event.companyName || "Unknown"}
                                                    </span>
                                                    {event.asn && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{event.asn}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
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
                                            <td style={{ padding: '12px 14px' }}>
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
                                            <td style={{ padding: '12px 14px' }}>
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
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {(event.reason || "NONE").split(',').map((r: string) => (
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
                                            <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                                {event.details}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Bottom Pinned Pagination */}
                    <div className="p-3 border-t border-border-color bg-bg-surface/80 backdrop-blur-md shrink-0">
                        <PaginationControls
                            totalRecords={guardianEvents.length}
                            page={guardianPage}
                            limit={guardianLimit}
                            onPageChange={setGuardianPage}
                            showLimitSelector={false}
                        />
                    </div>
                </div>
            </div>
        ) : activeTab === "blacklist" ? (
            <div className="flex-1 min-h-0 flex flex-col gap-6">
                <div className="glass-card flex-1 flex flex-col min-h-0 border border-border-color rounded-xl overflow-hidden shadow-sm" style={{ minHeight: '400px', padding: 0 }}>
                    <div className="p-4 border-b border-border-color bg-bg-surface/60 shrink-0">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                            <div>
                                <h3 className="m-0 text-base font-bold text-text-primary">Guardian Do-Not-Unshun Blacklist</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
                                    IP addresses and ASNs (Autonomous System Numbers) barred from automated unshunning or safety exceptions.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setAddType("IP");
                                    setAddTarget("");
                                    setAddReason("");
                                    setAddAsnName("");
                                    setAddError("");
                                    setShowAddBlacklistModal(true);
                                }}
                                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                            >
                                <span className="text-lg leading-none">+</span> Add to Blacklist
                            </button>
                        </div>

                        {/* IP vs ASN Subtabs */}
                        <div className="flex items-center gap-3 pt-4 border-t border-border-color/60 mt-3">
                            <button
                                onClick={() => { setBlacklistSubTab("IP"); setBlacklistPage(1); }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${blacklistSubTab === "IP" ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30" : "text-text-secondary hover:text-text-primary bg-bg-dark/40"}`}
                            >
                                Blacklisted IPs ({blacklistIps.length})
                            </button>
                            <button
                                onClick={() => { setBlacklistSubTab("ASN"); setBlacklistPage(1); }}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${blacklistSubTab === "ASN" ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30" : "text-text-secondary hover:text-text-primary bg-bg-dark/40"}`}
                            >
                                Blacklisted ASNs ({blacklistAsns.length})
                            </button>
                        </div>

                        {/* Top Pinned Pagination */}
                        <div className="pt-3 mt-3 border-t border-border-color/60">
                            <PaginationControls
                                totalRecords={blacklistSubTab === "IP" ? blacklistIps.length : blacklistAsns.length}
                                page={blacklistPage}
                                limit={blacklistLimit}
                                limitOptions={[25, 50, 100, 200]}
                                onPageChange={setBlacklistPage}
                                onLimitChange={(l) => {
                                    setBlacklistLimit(l);
                                    setBlacklistPage(1);
                                }}
                                showLimitSelector={true}
                            />
                        </div>
                    </div>

                    {loadingBlacklist ? (
                        <div className="p-8 text-center text-text-muted">Loading blacklist...</div>
                    ) : blacklistSubTab === "IP" ? (
                        blacklistIps.length === 0 ? (
                            <div className="p-8 text-center text-text-muted">No individual IPs currently blacklisted.</div>
                        ) : (
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead className="sticky top-0 bg-bg-surface z-10">
                                        <tr style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Blacklisted Date</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>IP Address</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Reason for Blocking</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {blacklistIps
                                            .slice((blacklistPage - 1) * blacklistLimit, blacklistPage * blacklistLimit)
                                            .map((item) => (
                                            <tr key={item.ip} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }} className="table-row-hover">
                                                <td style={{ padding: '12px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(item.createdAt).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                                    {item.ip}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                                                    {item.reason}
                                                </td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleRemoveFromBlacklist(item.ip)}
                                                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    >
                                                        Clear Block
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        blacklistAsns.length === 0 ? (
                            <div className="p-8 text-center text-text-muted">No ASNs currently blacklisted.</div>
                        ) : (
                            <div className="flex-1 overflow-auto custom-scrollbar">
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead className="sticky top-0 bg-bg-surface z-10">
                                        <tr style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Blacklisted Date</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>ASN</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Organization / ISP Name</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Reason for Blocking</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)' }}>Added By</th>
                                            <th style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-color)', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {blacklistAsns
                                            .slice((blacklistPage - 1) * blacklistLimit, blacklistPage * blacklistLimit)
                                            .map((item) => (
                                            <tr key={item.asn} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.875rem' }} className="table-row-hover">
                                                <td style={{ padding: '12px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                                    {new Date(item.createdAt).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-primary)' }}>
                                                    {item.asn}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                                                    {item.asnName || "Unknown Org"}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--text-primary)' }}>
                                                    {item.reason}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    {item.createdBy || "System"}
                                                </td>
                                                <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                                                    <button
                                                        onClick={() => handleRemoveAsnFromBlacklist(item.asn)}
                                                        className="px-3 py-1 text-xs font-semibold rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                                                    >
                                                        Clear ASN Block
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}

                    {/* Bottom Pinned Pagination */}
                    <div className="p-3 border-t border-border-color bg-bg-surface/80 backdrop-blur-md shrink-0">
                        <PaginationControls
                            totalRecords={blacklistSubTab === "IP" ? blacklistIps.length : blacklistAsns.length}
                            page={blacklistPage}
                            limit={blacklistLimit}
                            onPageChange={setBlacklistPage}
                            showLimitSelector={false}
                        />
                    </div>
                </div>
            </div>
        ) : activeTab === "database" ? (
            <ShunDatabaseTab />
        ) : null}
            </div>

            {/* Add to Blacklist Modal */}
            {showAddBlacklistModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl max-w-lg w-full p-6 shadow-2xl relative">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-color)]">
                            <h3 className="text-lg font-bold text-[var(--text-primary)]">Add to Guardian Blacklist</h3>
                            <button
                                onClick={() => setShowAddBlacklistModal(false)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xl font-bold cursor-pointer"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleAddBlacklistSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                                    Entry Type
                                </label>
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[var(--text-primary)]">
                                        <input
                                            type="radio"
                                            name="addType"
                                            value="IP"
                                            checked={addType === "IP"}
                                            onChange={() => setAddType("IP")}
                                            className="accent-[var(--accent-primary)]"
                                        />
                                        IP Address (e.g. 198.51.100.45)
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[var(--text-primary)]">
                                        <input
                                            type="radio"
                                            name="addType"
                                            value="ASN"
                                            checked={addType === "ASN"}
                                            onChange={() => setAddType("ASN")}
                                            className="accent-[var(--accent-primary)]"
                                        />
                                        ASN (e.g. AS16509 / 16509)
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                                    {addType === "IP" ? "IP Address" : "ASN Number (or ASXXXXX)"}
                                </label>
                                <input
                                    type="text"
                                    placeholder={addType === "IP" ? "e.g. 198.51.100.45" : "e.g. AS16509 or 16509"}
                                    value={addTarget}
                                    onChange={(e) => setAddTarget(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] font-mono outline-none focus:border-[var(--accent-primary)]"
                                />
                            </div>

                            {addType === "ASN" && (
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                                        Organization / Provider Name (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. AMAZON-02 - Amazon.com, Inc."
                                        value={addAsnName}
                                        onChange={(e) => setAddAsnName(e.target.value)}
                                        className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-1">
                                    Reason for Blacklisting
                                </label>
                                <textarea
                                    placeholder="e.g. Manual security block, repeated malicious probes, or untrusted cloud hosting provider."
                                    value={addReason}
                                    onChange={(e) => setAddReason(e.target.value)}
                                    required
                                    rows={3}
                                    className="w-full px-3 py-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
                                />
                            </div>

                            {addError && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
                                    {addError}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-color)]">
                                <button
                                    type="button"
                                    onClick={() => setShowAddBlacklistModal(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addLoading}
                                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    {addLoading ? "Adding..." : "Add to Blacklist"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reusable Confirm Dialog */}
            <ConfirmDialog
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                variant={confirmModal.variant}
                onConfirm={confirmModal.onConfirm}
                onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
}
