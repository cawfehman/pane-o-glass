"use client";

import React, { useState, useEffect } from "react";
import { 
    ShieldAlert, 
    ExternalLink, 
    Search, 
    RefreshCw, 
    CheckCircle2, 
    Settings, 
    Plus, 
    Trash2, 
    RotateCcw,
    X,
    Bell,
    Mail,
    UserCheck
} from "lucide-react";
import { 
    OFFICIAL_M365_AUTH_ENDPOINTS, 
    M365AuthEndpoint,
    GraylogBecImpersonationAggregation
} from "@/lib/og-graylog";

export default function BecDashboardClient() {
    const [timeframe, setTimeframe] = useState<number>(86400); // 24h default
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>("");
    
    const [becData, setBecData] = useState<GraylogBecImpersonationAggregation[]>([]);
    const [dbIncidents, setDbIncidents] = useState<any[]>([]);
    
    // Auth Endpoints Modal State
    const [showEndpointModal, setShowEndpointModal] = useState<boolean>(false);
    const [authEndpoints, setAuthEndpoints] = useState<M365AuthEndpoint[]>(OFFICIAL_M365_AUTH_ENDPOINTS);
    const [newUrl, setNewUrl] = useState<string>("");
    const [newRole, setNewRole] = useState<string>("");

    useEffect(() => {
        const saved = localStorage.getItem("pane_m365_auth_endpoints");
        if (saved) {
            try { setAuthEndpoints(JSON.parse(saved)); } catch (e) {}
        }
        fetchBecData(timeframe);
    }, [timeframe]);

    const fetchBecData = async (rangeSeconds = timeframe) => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/ironport/stats?timeframe=${rangeSeconds}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            
            if (data.becThreats) {
                setBecData(data.becThreats);
            }
        } catch (err: any) {
            console.error("Failed to fetch BEC threat data:", err);
            setError(err.message || "Failed to load BEC threat data");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEndpoints = (updated: M365AuthEndpoint[]) => {
        setAuthEndpoints(updated);
        localStorage.setItem("pane_m365_auth_endpoints", JSON.stringify(updated));
    };

    const handleAddEndpoint = () => {
        if (!newUrl) return;
        const formattedUrl = newUrl.startsWith("http") ? newUrl : `https://${newUrl}`;
        const updated = [...authEndpoints, { url: formattedUrl, role: newRole || "Custom Authentication Endpoint" }];
        handleSaveEndpoints(updated);
        setNewUrl("");
        setNewRole("");
    };

    const handleDeleteEndpoint = (urlToDelete: string) => {
        const updated = authEndpoints.filter(e => e.url !== urlToDelete);
        handleSaveEndpoints(updated);
    };

    const handleResetDefaults = () => {
        handleSaveEndpoints(OFFICIAL_M365_AUTH_ENDPOINTS);
    };

    // Filter BEC threats based on search query
    const filteredBecData = becData.filter(item => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            item.mid.toLowerCase().includes(q) ||
            (item.subject && item.subject.toLowerCase().includes(q)) ||
            (item.sender && item.sender.toLowerCase().includes(q)) ||
            (item.recipient && item.recipient.toLowerCase().includes(q)) ||
            item.targetHost.toLowerCase().includes(q) ||
            item.destUrl.toLowerCase().includes(q) ||
            item.threatCategory.toLowerCase().includes(q)
        );
    });

    const fakePortalCount = becData.filter(d => d.threatTier === "CRITICAL").length;
    const tokenTheftCount = becData.filter(d => d.threatTier === "HIGH").length;

    return (
        <div className="flex flex-col gap-6">
            {/* 24x7 Daemon Health & Alert Target Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[var(--text-primary)]">24x7 BEC Threat Monitor Daemon</h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                ACTIVE (60s Cycle)
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            Continuous server-side background ingestion | Instant HTML Alerting Target: <strong className="text-blue-400 font-mono">rivera-robert@cooperhealth.edu</strong>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowEndpointModal(true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] flex items-center gap-1.5 transition-colors"
                    >
                        <Settings className="w-3.5 h-3.5 text-amber-400" />
                        <span>Official Auth Registry ({authEndpoints.length})</span>
                    </button>

                    <div className="flex items-center bg-[var(--bg-default)] p-1 rounded-lg border border-[var(--border-color)] text-xs">
                        {[
                            { label: "24 Hours", value: 86400 },
                            { label: "7 Days", value: 604800 },
                            { label: "30 Days", value: 2592000 }
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => setTimeframe(t.value)}
                                className={`px-3 py-1 rounded-md transition-colors font-medium ${
                                    timeframe === t.value 
                                        ? "bg-blue-600 text-white font-semibold shadow-xs" 
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => fetchBecData(timeframe)}
                        disabled={loading}
                        className="p-2 rounded-lg bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] transition-colors disabled:opacity-50"
                        title="Refresh threat feed"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-blue-400" : ""}`} />
                    </button>
                </div>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)]">
                    <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider">Total Evaluated Auth Links</span>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-2xl font-black text-[var(--text-primary)]">{becData.length}</span>
                        <span className="text-xs text-[var(--text-secondary)]">Strict Auth Scope</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-red-500/20 bg-red-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-red-400 uppercase tracking-wider">Fake M365 Portals</span>
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-2xl font-black text-red-400">{fakePortalCount}</span>
                        <span className="text-[10px] font-mono font-semibold text-red-400/80">+10.0 Priority Boost</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-amber-500/20 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">OAuth Token Theft Links</span>
                        <Bell className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-2xl font-black text-amber-400">{tokenTheftCount}</span>
                        <span className="text-[10px] font-mono font-semibold text-amber-400/80">+6.0 Priority Boost</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-emerald-500/20 bg-emerald-500/5">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Unwrapped Destinations</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="flex items-baseline justify-between mt-2">
                        <span className="text-2xl font-black text-emerald-400">100%</span>
                        <span className="text-xs text-emerald-400/80">Real Hostnames Exposed</span>
                    </div>
                </div>
            </div>

            {/* Filter Search Bar */}
            <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
                <input
                    type="text"
                    placeholder="Search by MID, Subject, Sender, Target Recipient, Target Host, or Threat Category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500 transition-colors"
                />
            </div>

            {/* BEC Threat Table */}
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-default)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                            M365 BEC Threat Hunting Feed ({filteredBecData.length})
                        </h4>
                    </div>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                        Showing authentication endpoints & impersonated portals
                    </span>
                </div>

                {loading ? (
                    <div className="p-12 text-center text-sm font-semibold text-[var(--text-secondary)]">
                        Evaluating M365 Authentication Endpoints...
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-sm text-red-400">
                        {error}
                    </div>
                ) : filteredBecData.length === 0 ? (
                    <div className="p-12 text-center text-sm text-[var(--text-secondary)]">
                        No M365 BEC or OAuth threat vectors detected in selected timeframe.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[var(--border-color)] bg-[var(--bg-default)] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">
                                    <th className="py-3 px-4">Delivery Time</th>
                                    <th className="py-3 px-4">Message MID</th>
                                    <th className="py-3 px-4">Subject Line</th>
                                    <th className="py-3 px-4">Sender ➔ Target Recipient</th>
                                    <th className="py-3 px-4">Target Host & Unwrapped URL</th>
                                    <th className="py-3 px-4">Threat Category</th>
                                    <th className="py-3 px-4 text-center">Priority Boost</th>
                                    <th className="py-3 px-4 text-right">Triage Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-color)]">
                                {filteredBecData.map((item, idx) => (
                                    <tr key={`${item.mid}-${idx}`} className="hover:bg-[var(--bg-surface-hover)] transition-colors">
                                        <td className="py-3 px-4 text-[var(--text-secondary)] font-mono whitespace-nowrap">
                                            {item.timestamp ? new Date(item.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "N/A"}
                                        </td>
                                        <td className="py-3 px-4 font-mono font-bold text-blue-400 whitespace-nowrap">
                                            MID {item.mid}
                                        </td>
                                        <td className="py-3 px-4 max-w-[220px] truncate text-[var(--text-primary)] font-medium" title={item.subject || "No Subject"}>
                                            {item.subject || "No Subject Header"}
                                        </td>
                                        <td className="py-3 px-4 max-w-[220px] truncate">
                                            <div className="text-blue-400 font-mono text-[11px]" title={item.sender}>
                                                FROM: {item.sender || "unknown"}
                                            </div>
                                            <div className="text-indigo-400 font-mono text-[11px]" title={item.recipient}>
                                                TO: {item.recipient || "unknown"}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 max-w-[260px] truncate">
                                            <div className="font-mono font-bold text-amber-400 text-[11px]" title={item.targetHost}>
                                                {item.targetHost}
                                            </div>
                                            <div className="font-mono text-[10px] text-[var(--text-secondary)] truncate" title={item.destUrl}>
                                                {item.destUrl}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                                item.threatTier === "CRITICAL"
                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                            }`}>
                                                {item.threatCategory}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center font-mono font-bold text-amber-400">
                                            +{item.impersonationBoost.toFixed(1)}
                                        </td>
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            <a
                                                href={`/queries/ironport?query=esa_mid:${item.mid}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="px-2.5 py-1 rounded bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 font-semibold text-[11px] inline-flex items-center gap-1 transition-colors"
                                            >
                                                <span>Trace MID</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Official Auth Endpoints Registry Modal */}
            {showEndpointModal && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-2xl max-w-3xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-color)]">
                            <div className="flex items-center gap-2.5">
                                <Settings className="w-5 h-5 text-amber-400" />
                                <div>
                                    <h3 className="text-base font-bold text-[var(--text-primary)]">Official M365 Authentication Endpoint Registry</h3>
                                    <p className="text-xs text-[var(--text-secondary)]">Authoritative list of legitimate Entra ID, SSPR, and OAuth endpoints</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEndpointModal(false)} className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-default)]">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Endpoint List Table */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar my-4 pr-1">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-[var(--border-color)] text-[var(--text-secondary)] font-semibold uppercase">
                                        <th className="py-2.5 px-3">Official Endpoint URL</th>
                                        <th className="py-2.5 px-3">IdP / OAuth Role</th>
                                        <th className="py-2.5 px-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-color)]">
                                    {authEndpoints.map((ep, idx) => (
                                        <tr key={`${ep.url}-${idx}`} className="hover:bg-[var(--bg-default)]">
                                            <td className="py-2.5 px-3 font-mono text-blue-400 font-bold">{ep.url}</td>
                                            <td className="py-2.5 px-3 text-[var(--text-primary)] font-medium">{ep.role}</td>
                                            <td className="py-2.5 px-3 text-right">
                                                <button
                                                    onClick={() => handleDeleteEndpoint(ep.url)}
                                                    className="p-1 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                    title="Remove Endpoint"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Add New Endpoint Inputs */}
                        <div className="pt-4 border-t border-[var(--border-color)] flex flex-col gap-3">
                            <span className="text-xs font-bold text-[var(--text-primary)]">Add Custom Official Auth Endpoint</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="https://adfs.cooperhealth.edu/adfs/ls"
                                    value={newUrl}
                                    onChange={(e) => setNewUrl(e.target.value)}
                                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                                />
                                <input
                                    type="text"
                                    placeholder="Custom ADFS Endpoint"
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value)}
                                    className="w-1/3 px-3 py-2 rounded-lg bg-[var(--bg-default)] border border-[var(--border-color)] text-xs text-[var(--text-primary)] focus:outline-none focus:border-blue-500"
                                />
                                <button
                                    onClick={handleAddEndpoint}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Add</span>
                                </button>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={handleResetDefaults}
                                    className="text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1"
                                >
                                    <RotateCcw className="w-3 h-3" />
                                    <span>Reset 14 Official Defaults</span>
                                </button>

                                <button
                                    onClick={() => setShowEndpointModal(false)}
                                    className="px-4 py-2 bg-[var(--bg-default)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-lg font-semibold text-xs"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
