"use client";

import { useState, useEffect, useMemo } from "react";
import { AlertCircle, RefreshCw, History, Server, Activity, Shield, Users, Wifi, Cpu, Layers, ExternalLink, ChevronDown, ChevronRight, Search, CheckCircle2, MapPin, Tag, HelpCircle, HardDrive, Laptop, Radio, Lock, Stethoscope, AlertTriangle, Key } from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import ConnectionPath from "@/components/ise/ConnectionPath";
import EnrichedEndpointCard from "@/components/ise/EnrichedEndpointCard";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [triageMode, setTriageMode] = useState<"general" | "lockout" | "eap">("general");
    const [endpointResult, setEndpointResult] = useState<any>(null);
    const [historyResult, setHistoryResult] = useState<any>(null);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<"dashboard" | "live" | "history" | "sites">("dashboard");
    const [error, setError] = useState("");
    
    // RBAC state
    const [hasIsePerm, setHasIsePerm] = useState(false);
    const [permsLoading, setPermsLoading] = useState(true);

    useEffect(() => {
        const fetchPerms = async () => {
            try {
                const res = await fetch('/api/ise/session?query=');
                setHasIsePerm(res.status !== 403);
            } catch (e) {
                console.error("Failed to detect ISE permissions");
            } finally {
                setPermsLoading(false);
            }
        };
        fetchPerms();
    }, []);

    // Configured sites state tracker
    const [sitesList, setSitesList] = useState<any[]>([]);
    const [sitesLoading, setSitesLoading] = useState(false);
    const [siteDirSortDir, setSiteDirSortDir] = useState<"asc" | "desc">("asc");
    const [siteDirFilter, setSiteDirFilter] = useState("");
    const processedSitesList = useMemo(() => {
        let list = sitesList;
        if (siteDirFilter.trim()) {
            const q = siteDirFilter.toLowerCase();
            list = list.filter(s => 
                (s.code && s.code.toLowerCase().includes(q)) || 
                (s.name && s.name.toLowerCase().includes(q)) || 
                (s.address && s.address.toLowerCase().includes(q)) || 
                (s.notes && s.notes.toLowerCase().includes(q))
            );
        }
        return [...list].sort((a, b) => {
            const comp = (a.code || "").localeCompare(b.code || "");
            return siteDirSortDir === "asc" ? comp : -comp;
        });
    }, [sitesList, siteDirFilter, siteDirSortDir]);

    useEffect(() => {
        if (hasIsePerm) {
            const fetchSites = async () => {
                setSitesLoading(true);
                try {
                    const res = await fetch('/api/settings/sites');
                    const data = await res.json();
                    if (data?.versions?.[0]?.content) {
                        const content = data.versions[0].content;
                        const lines = content.split(/\r?\n/).filter((l: string) => l.trim() !== "");
                        if (lines.length > 1) {
                            const splitRow = (row: string) => {
                                const result = [];
                                let curr = '';
                                let inQ = false;
                                for (let i = 0; i < row.length; i++) {
                                    if (row[i] === '"') inQ = !inQ;
                                    else if (row[i] === ',' && !inQ) {
                                        result.push(curr.trim().replace(/^"|"$/g, ''));
                                        curr = '';
                                    } else curr += row[i];
                                }
                                result.push(curr.trim().replace(/^"|"$/g, ''));
                                return result;
                            };
                            const headers = splitRow(lines[0]).map((h: string) => h.toLowerCase());
                            const cIdx = headers.indexOf('code');
                            const nIdx = headers.indexOf('name');
                            const aIdx = headers.indexOf('address');
                            const sIdx = headers.indexOf('status');
                            const ntIdx = headers.indexOf('notes');

                            const parsed = [];
                            for (let i = 1; i < lines.length; i++) {
                                const pts = splitRow(lines[i]);
                                if (pts.length > 0 && pts[cIdx]) {
                                    const code = pts[cIdx]?.toUpperCase() || "";
                                    if (code) {
                                        parsed.push({
                                            code,
                                            name: nIdx !== -1 ? pts[nIdx] || code : code,
                                            address: aIdx !== -1 ? pts[aIdx] || "" : "",
                                            status: sIdx !== -1 ? pts[sIdx] || "Active" : "Active",
                                            notes: ntIdx !== -1 ? pts[ntIdx] || "" : ""
                                        });
                                    }
                                }
                            }
                            setSitesList(parsed);
                        }
                    }
                } catch (e) {
                    console.error("Failed to load site list directory", e);
                } finally {
                    setSitesLoading(false);
                }
            };
            fetchSites();
        }
    }, [hasIsePerm]);

    const [triageData, setTriageData] = useState<any>(null);
    const [triageLoading, setTriageLoading] = useState(false);
    const [triageStatus, setTriageStatus] = useState("");
    const [triageSubView, setTriageSubView] = useState<"infrastructure" | "identity" | "trustsec">("infrastructure");
    const [infraSearch, setInfraSearch] = useState("");
    const [groupSearch, setGroupSearch] = useState("");
    const [failureSearch, setFailureSearch] = useState("");
    const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

    const toggleSiteExpand = (code: string) => {
        setExpandedSites(prev => ({ ...prev, [code]: !prev[code] }));
    };

    const loadTriage = async (siteCode?: string, forceRefresh?: boolean) => {
        setTriageLoading(true);
        setTriageStatus(siteCode ? `Focusing forensics on site: ${siteCode}...` : "Synchronizing Cisco ISE 3.5 telemetry...");
        
        try {
            let url = '/api/ise/triage';
            const params = new URLSearchParams();
            if (siteCode) params.set('site', siteCode);
            if (forceRefresh) params.set('refresh', 'true');
            if (params.toString()) url += `?${params.toString()}`;

            const res = await fetch(url, { cache: 'no-store' });
            const data = await res.json();
            
            if (data.error) {
                setTriageData({ error: data.error });
            } else {
                setTriageData(data);
            }
        } catch (err: any) {
            console.error("Failed to load triage data", err);
            setTriageData({ error: "ISE Connection Error" });
        } finally {
            setTriageLoading(false);
            setTriageStatus("");
        }
    };

    // Initial Triage Load
    useEffect(() => {
        if (hasIsePerm) {
            loadTriage();
        }
    }, [hasIsePerm]);

    const handleSearch = async (e?: React.FormEvent, macToDrilldown?: string) => {
        if (e) e.preventDefault();
        const searchTerm = macToDrilldown || query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        
        if (!macToDrilldown) {
            setEndpointResult(null);
            setHistoryResult(null);
            setDiscoveryResult(null);
        }

        try {
            const isMac = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(searchTerm) || /^[0-9A-Fa-f]{12}$/.test(searchTerm);

            // Fetch Live Session
            const sessionRes = await fetch(`/api/ise/session?query=${encodeURIComponent(searchTerm)}`);
            const sessionData = await sessionRes.json();

            // Fetch 7-Day History & Failure Intelligence
            const searchVal = macToDrilldown || sessionData.sessions?.[0]?.calling_station_id || searchTerm;
            const historyRes = await fetch(`/api/ise/failures?query=${encodeURIComponent(searchVal)}`);
            const historyData = await historyRes.json();
            setHistoryResult(historyData);

            // If username search and we have multi-device history, prioritize Lockout Hunter correlation
            if (!isMac && historyData.searchType === "user_name" && historyData.sessions && historyData.sessions.length > 0 && !macToDrilldown) {
                setDiscoveryResult({
                    found: true,
                    isUserLockoutSummary: true,
                    potentialCulprits: historyData.potentialCulprits,
                    totalMacs: historyData.totalMacs,
                    sessions: historyData.sessions
                });
                setActiveTab("live");
                setEndpointResult(null);
            } else if (sessionData.found && sessionData.sessions && sessionData.sessions.length > 1 && !macToDrilldown) {
                // Multi-session fallback
                setDiscoveryResult(sessionData);
                setActiveTab("live");
                setEndpointResult(null);
            } else {
                let primarySession = sessionData.sessions?.[0] || null;

                // If no active live session exists (device dropped/offline), use the latest forensic history event
                if (!primarySession && historyData.found && historyData.failures && historyData.failures.length > 0) {
                    primarySession = historyData.failures[0];
                }

                // Merge WLC telemetry from history if session didn't have it
                const enrichedSession = primarySession ? {
                    ...primarySession,
                    wlcTelemetry: primarySession.wlcTelemetry || historyData.wlcTelemetry
                } : null;

                setEndpointResult(enrichedSession);
                setActiveTab("live");
                if (macToDrilldown) setDiscoveryResult(null);
                if (!macToDrilldown) setQuery(searchTerm);
            }
        } catch (err: any) {
            setError(err.message || "Forensic lookup failed");

        } finally {
            setLoading(false);
        }
    };

    const getMacStyle = (obj: any) => {
        const prof = obj.profile?.toLowerCase() || "";
        let profileColor = 'rgba(255,255,255,0.05)';
        let borderCol = 'var(--border-color)';
        
        if (obj.status === 'failure') {
            profileColor = 'rgba(239, 68, 68, 0.2)';
            borderCol = '#ef4444';
        } else if (prof.includes('apple') || prof.includes('iphone') || prof.includes('ipad')) {
            profileColor = 'rgba(56, 189, 248, 0.15)';
            borderCol = '#0ea5e9';
        } else if (prof.includes('workstation') || prof.includes('windows')) {
            profileColor = 'rgba(16, 185, 129, 0.15)';
            borderCol = '#10b981';
        } else if (prof.includes('android')) {
            profileColor = 'rgba(168, 85, 247, 0.15)';
            borderCol = '#a855f7';
        }

        return { 
            background: profileColor, 
            borderColor: borderCol, 
            color: obj.status === 'failure' ? '#ef4444' : 'var(--text-primary)',
            fontSize: '0.7rem'
        };
    };

    const DistributionBar = ({ label, count, total, color = 'var(--accent-primary)' }: { label: string, count: number, total: number, color?: string }) => {
        const percent = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
            <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-secondary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
                    <span className="text-text-muted">{count} ({percent}%)</span>
                </div>
                <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: color, borderRadius: '2px', transition: 'width 0.5s ease-out' }} />
                </div>
            </div>
        );
    };

    // Filtered Telemetry Data for Sub-Views
    const filteredSites = useMemo(() => {
        const sites = triageData?.infrastructure?.sites || [];
        if (!infraSearch.trim()) return sites;
        const q = infraSearch.toLowerCase();
        return sites.filter((s: any) => 
            (s.siteCode && s.siteCode.toLowerCase().includes(q)) || 
            (s.siteName && s.siteName.toLowerCase().includes(q)) || 
            (s.siteAddress && s.siteAddress.toLowerCase().includes(q)) ||
            s.devices?.some((d: any) => d.name.toLowerCase().includes(q))
        );
    }, [triageData, infraSearch]);

    const filteredGroups = useMemo(() => {
        const groups = triageData?.deviceIdentity?.groups || [];
        if (!groupSearch.trim()) return groups;
        const q = groupSearch.toLowerCase();
        return groups.filter((g: any) => 
            (g.name && g.name.toLowerCase().includes(q)) || 
            (g.description && g.description.toLowerCase().includes(q))
        );
    }, [triageData, groupSearch]);

    const filteredFailures = useMemo(() => {
        const catalog = triageData?.failureIntelligence?.catalog || [];
        if (!failureSearch.trim()) return catalog;
        const q = failureSearch.toLowerCase();
        return catalog.filter((f: any) => 
            (f.id && f.id.toLowerCase().includes(q)) || 
            (f.code && f.code.toLowerCase().includes(q)) || 
            (f.cause && f.cause.toLowerCase().includes(q)) ||
            (f.resolution && f.resolution.toLowerCase().includes(q))
        );
    }, [triageData, failureSearch]);

    if (permsLoading) return <div className="p-8">Verifying Cisco ISE access...</div>;
    if (!hasIsePerm) return <div className="p-8 glass-card m-8 border-l-4 border-red-500 text-red-400">Access Denied: You do not have permission to view RADIUS endpoint forensics.</div>;

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
            {/* Header Section */}
            <div>
                <QueryHeader
                    title="Cisco ISE Center"
                    description="Unified identity and network forensics. Correlated results from ISE, AD, and Vectra AI."
                    toolId="ise"
                    icon={<Server />}
                    actions={
                        (loading || triageLoading) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--accent-primary)', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                <div className="spinner-small"></div>
                                Synchronizing Global Telemetry...
                            </div>
                        )
                    }
                />

                {/* Quick Triage Mode Selector */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button
                        type="button"
                        onClick={() => setTriageMode("general")}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: triageMode === "general" ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
                            background: triageMode === "general" ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255,255,255,0.02)',
                            color: triageMode === "general" ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            fontWeight: triageMode === "general" ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Search size={14} />
                        Forensic Lookup
                    </button>

                    <button
                        type="button"
                        onClick={() => setTriageMode("lockout")}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: triageMode === "lockout" ? '1px solid #ef4444' : '1px solid var(--border-color)',
                            background: triageMode === "lockout" ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.02)',
                            color: triageMode === "lockout" ? '#ef4444' : 'var(--text-secondary)',
                            fontWeight: triageMode === "lockout" ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Lock size={14} />
                        Lockout Hunter (Ghost Device)
                    </button>

                    <button
                        type="button"
                        onClick={() => setTriageMode("eap")}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: triageMode === "eap" ? '1px solid #10b981' : '1px solid var(--border-color)',
                            background: triageMode === "eap" ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                            color: triageMode === "eap" ? '#10b981' : 'var(--text-secondary)',
                            fontWeight: triageMode === "eap" ? 700 : 500,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Stethoscope size={14} />
                        Wireless EAP Doctor
                    </button>
                </div>

                {/* Primary Search Bar */}
                <form onSubmit={(e) => handleSearch(e)} className="glass-card flex gap-4 p-4">
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={
                                triageMode === "lockout" 
                                    ? "Enter AD username or service account to correlate ghost devices hammering auth..."
                                    : triageMode === "eap"
                                    ? "Enter wireless MAC address or username to diagnose 802.1X/EAP handshake..."
                                    : "Enter MAC, IP, or Username for deep dive..."
                            }
                            style={{ 
                                width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', 
                                border: '1px solid var(--border-color)', background: 'var(--bg-card)', 
                                color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' 
                            }}
                            disabled={loading}
                        />
                        <svg style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 32px', borderRadius: '12px', fontWeight: 'bold', minWidth: '140px' }}>
                        {triageMode === "lockout" ? 'Hunt Lockout' : triageMode === "eap" ? 'Diagnose EAP' : 'Forensic Search'}
                    </button>
                    {query && (
                        <button type="button" onClick={() => { setQuery(""); setDiscoveryResult(null); setEndpointResult(null); setHistoryResult(null); setActiveTab("dashboard"); }} className="btn-secondary" style={{ padding: '0 20px', borderRadius: '12px' }}>
                            Reset
                        </button>
                    )}
                </form>

                {error && (
                    <div style={{ marginTop: '16px', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                        <strong>Forensic lookup failed:</strong> {error}
                    </div>
                )}
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
                {([
                    { id: 'dashboard', label: 'Operations Center' },
                    { id: 'live', label: 'Live Session' },
                    { id: 'history', label: 'Failure History' },
                    { id: 'sites', label: 'Site Directory' }
                ] as const).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            padding: '12px 24px',
                            background: activeTab === tab.id ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            cursor: 'pointer',
                            fontSize: '0.95rem',
                            transition: 'all 0.2s ease',
                            marginBottom: '-1px'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            </div>

            {/* Body Content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2 pb-6">
                
                {/* Operations Center Tab */}
                {activeTab === "dashboard" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* Loading State */}
                        {triageLoading && !triageData && (
                            <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
                                <div className="spinner-small" style={{ margin: '0 auto 16px auto', width: '28px', height: '28px' }}></div>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                                    {triageStatus || "Connecting to Cisco ISE 3.5 API Gateway..."}
                                </p>
                                <p className="text-xs text-text-muted">Aggregating live session telemetry, 198 network switches, and device groups over Port 443.</p>
                            </div>
                        )}

                        {/* Error State */}
                        {!triageLoading && triageData?.error && (
                            <div className="glass-card" style={{ padding: '40px', textAlign: 'center', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                <AlertCircle size={32} color="#ef4444" style={{ margin: '0 auto 12px auto' }} />
                                <p style={{ color: '#ef4444', marginBottom: '16px', fontWeight: 600 }}>
                                    Cisco ISE Telemetry Sync Failed: {triageData.error}
                                </p>
                                <button onClick={() => loadTriage(undefined, true)} className="btn-secondary text-xs" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                    <RefreshCw size={14} /> Retry Telemetry Sync
                                </button>
                            </div>
                        )}

                        {/* Operations Center Content */}
                        {!triageLoading && triageData && !triageData.error && (
                            <>
                                {/* 1. Live Pulse Executive Bar */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                    {/* Active Sessions */}
                                    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #10b981' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                            <Activity size={24} />
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></div>
                                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>Active Sessions</span>
                                            </div>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                                                {(triageData.pulse?.activeSessions || 0).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#10b981' }}>Live Authenticated RADIUS</div>
                                        </div>
                                    </div>

                                    {/* Profiled Endpoints */}
                                    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #38bdf8' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                                            <Cpu size={24} />
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>Profiled Endpoints</span>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                                                {(triageData.pulse?.profiledEndpoints || 0).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#38bdf8' }}>Cloud MFC & Fingerprinted</div>
                                        </div>
                                    </div>

                                    {/* Managed Network Devices */}
                                    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', borderLeft: '4px solid #a855f7' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
                                            <Server size={24} />
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>Managed Devices</span>
                                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                                                {(triageData.pulse?.totalManagedDevices || 0).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#a855f7' }}>Core Switches, WLCs & NAS</div>
                                        </div>
                                    </div>

                                    {/* Cluster Status & Refresh */}
                                    <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderLeft: '4px solid #f59e0b' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>ISE 3.5 Gateway</div>
                                                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px' }}>
                                                    v{triageData.pulse?.version || '3.5.0'}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => loadTriage(undefined, true)}
                                                disabled={triageLoading}
                                                className="btn-secondary" 
                                                style={{ padding: '6px 12px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                title="Re-query live ISE telemetry"
                                            >
                                                <RefreshCw size={12} className={triageLoading ? "animate-spin" : ""} />
                                                Refresh
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                            <span style={{ color: '#10b981', fontWeight: 600 }}>Port 443 API Gateway</span>
                                            <span>•</span>
                                            <span>Primary PAN Failover Ready</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Sub-View Navigation Switcher */}
                                <div style={{ display: 'flex', gap: '12px', padding: '6px', background: 'rgba(255,255,255,0.02)', borderRadius: '10px', border: '1px solid var(--border-color)', width: 'fit-content' }}>
                                    <button
                                        onClick={() => setTriageSubView("infrastructure")}
                                        style={{
                                            padding: '8px 18px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: triageSubView === "infrastructure" ? 'var(--accent-primary)' : 'transparent',
                                            color: triageSubView === "infrastructure" ? '#fff' : 'var(--text-secondary)',
                                            fontWeight: triageSubView === "infrastructure" ? 700 : 500,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <HardDrive size={16} />
                                        Infrastructure & Sites (Option A)
                                    </button>

                                    <button
                                        onClick={() => setTriageSubView("identity")}
                                        style={{
                                            padding: '8px 18px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: triageSubView === "identity" ? 'var(--accent-primary)' : 'transparent',
                                            color: triageSubView === "identity" ? '#fff' : 'var(--text-secondary)',
                                            fontWeight: triageSubView === "identity" ? 700 : 500,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <Tag size={16} />
                                        Device Identity & NAC (Option B)
                                    </button>

                                    <button
                                        onClick={() => setTriageSubView("trustsec")}
                                        style={{
                                            padding: '8px 18px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: triageSubView === "trustsec" ? 'var(--accent-primary)' : 'transparent',
                                            color: triageSubView === "trustsec" ? '#fff' : 'var(--text-secondary)',
                                            fontWeight: triageSubView === "trustsec" ? 700 : 500,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <Shield size={16} />
                                        TrustSec & Failure Intelligence (Option C)
                                    </button>
                                </div>

                                {/* 3. SUB-VIEW 1: Infrastructure & Sites (Option A) */}
                                {triageSubView === "infrastructure" && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {/* Filter Bar */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ position: 'relative', width: '380px' }}>
                                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Filter sites or switches (e.g. 3CP, CUH, SWI-1)..."
                                                    value={infraSearch}
                                                    onChange={(e) => setInfraSearch(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 12px 8px 36px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.85rem',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                Showing <strong>{filteredSites.length}</strong> Facilities / <strong>{triageData.pulse?.totalManagedDevices}</strong> Switches & WLCs
                                            </div>
                                        </div>

                                        {/* Sites Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                                            {filteredSites.map((site: any) => {
                                                const isExpanded = !!expandedSites[site.siteCode];
                                                return (
                                                    <div 
                                                        key={site.siteCode} 
                                                        className="glass-card" 
                                                        style={{ 
                                                            padding: '20px', 
                                                            borderLeft: `4px solid ${site.isUnknownSite ? '#f59e0b' : 'var(--accent-primary)'}`,
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'space-between'
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span style={{ 
                                                                        fontSize: '0.85rem', 
                                                                        fontWeight: 800, 
                                                                        padding: '2px 8px', 
                                                                        borderRadius: '4px', 
                                                                        background: 'rgba(56, 189, 248, 0.15)', 
                                                                        color: 'var(--accent-primary)' 
                                                                    }}>
                                                                        {site.siteCode}
                                                                    </span>
                                                                    <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                                        {site.siteName}
                                                                    </h4>
                                                                </div>
                                                                <span style={{ 
                                                                    fontSize: '0.75rem', 
                                                                    fontWeight: 700, 
                                                                    padding: '2px 8px', 
                                                                    borderRadius: '12px', 
                                                                    background: 'rgba(168, 85, 247, 0.1)', 
                                                                    color: '#a855f7',
                                                                    border: '1px solid rgba(168, 85, 247, 0.2)'
                                                                }}>
                                                                    {site.deviceCount} {site.deviceCount === 1 ? 'Device' : 'Devices'}
                                                                </span>
                                                            </div>

                                                            {/* Physical Address with Maps Link */}
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <MapPin size={12} style={{ flexShrink: 0 }} />
                                                                {site.siteAddress && site.siteAddress !== "Address telemetry unavailable" ? (
                                                                    <a 
                                                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.siteAddress)}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                                                    >
                                                                        {site.siteAddress}
                                                                        <ExternalLink size={10} />
                                                                    </a>
                                                                ) : (
                                                                    <span>Physical address unmapped</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Collapsible Switch List */}
                                                        <div>
                                                            <button
                                                                onClick={() => toggleSiteExpand(site.siteCode)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '6px 10px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(255,255,255,0.03)',
                                                                    border: '1px solid var(--border-color)',
                                                                    color: 'var(--text-secondary)',
                                                                    fontSize: '0.75rem',
                                                                    cursor: 'pointer',
                                                                    display: 'flex',
                                                                    justifyContent: 'space-between',
                                                                    alignItems: 'center'
                                                                }}
                                                            >
                                                                <span>{isExpanded ? 'Hide Managed Switches' : `View ${site.deviceCount} Managed Switches`}</span>
                                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                            </button>

                                                            {isExpanded && (
                                                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }} className="custom-scrollbar">
                                                                    {site.devices.map((d: any) => (
                                                                        <div 
                                                                            key={d.id} 
                                                                            style={{ 
                                                                                fontSize: '0.75rem', 
                                                                                padding: '6px 10px', 
                                                                                borderRadius: '4px', 
                                                                                background: 'rgba(0,0,0,0.2)', 
                                                                                border: '1px solid rgba(255,255,255,0.04)',
                                                                                display: 'flex',
                                                                                justifyContent: 'space-between',
                                                                                alignItems: 'center'
                                                                            }}
                                                                        >
                                                                            <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</span>
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{d.type}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* 4. SUB-VIEW 2: Device Identity & NAC Groups (Option B) */}
                                {triageSubView === "identity" && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px' }}>
                                        {/* Left Column: 35 Endpoint Groups */}
                                        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Identity Groups</h4>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>35 Configured NAC Identity Classes</p>
                                                </div>
                                            </div>

                                            <div style={{ position: 'relative' }}>
                                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Filter groups (e.g. Medical, Android)..."
                                                    value={groupSearch}
                                                    onChange={(e) => setGroupSearch(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 10px 6px 32px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.8rem',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }} className="custom-scrollbar">
                                                {filteredGroups.map((g: any) => (
                                                    <div 
                                                        key={g.id} 
                                                        style={{ 
                                                            padding: '10px 12px', 
                                                            borderRadius: '6px', 
                                                            background: 'rgba(255,255,255,0.02)', 
                                                            border: '1px solid var(--border-color)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{g.name}</span>
                                                            <Tag size={12} color="var(--accent-primary)" />
                                                        </div>
                                                        {g.description && (
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{g.description}</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right Column: Live Endpoints Telemetry Stream */}
                                        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Live Endpoints Stream</h4>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    Recent devices queried from Cisco ISE 3.5 OpenAPI. Click any MAC to execute an instant deep dive.
                                                </p>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }} className="custom-scrollbar">
                                                {triageData.deviceIdentity?.recentEndpoints?.map((ep: any) => (
                                                    <div 
                                                        key={ep.id}
                                                        onClick={() => {
                                                            setQuery(ep.mac);
                                                            handleSearch(undefined, ep.mac);
                                                        }}
                                                        style={{
                                                            padding: '12px 16px',
                                                            borderRadius: '8px',
                                                            background: 'rgba(255,255,255,0.02)',
                                                            border: '1px solid var(--border-color)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        className="hover-bright"
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-primary)' }}>
                                                                <Laptop size={18} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                                                    {ep.mac}
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                    IP: {ep.ipAddress}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ 
                                                                fontSize: '0.75rem', 
                                                                fontWeight: 600, 
                                                                padding: '3px 10px', 
                                                                borderRadius: '12px', 
                                                                background: 'rgba(16, 185, 129, 0.15)', 
                                                                color: '#10b981',
                                                                border: '1px solid rgba(16, 185, 129, 0.2)'
                                                            }}>
                                                                {ep.identityGroup}
                                                            </span>
                                                            <ChevronRight size={14} color="var(--text-muted)" />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* 5. SUB-VIEW 3: TrustSec & Failure Intelligence (Option C) */}
                                {triageSubView === "trustsec" && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px' }}>
                                        {/* Left Column: TrustSec SGT Dictionary */}
                                        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>TrustSec Security Groups</h4>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>18 Live Enterprise SGT Tags</p>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '560px', overflowY: 'auto' }} className="custom-scrollbar">
                                                {triageData.trustSec?.tags?.map((s: any) => (
                                                    <div 
                                                        key={s.tag}
                                                        style={{
                                                            padding: '10px 12px',
                                                            borderRadius: '6px',
                                                            background: 'rgba(255,255,255,0.02)',
                                                            border: '1px solid var(--border-color)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <div>
                                                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s.name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{s.description || 'Enterprise Policy'}</div>
                                                        </div>
                                                        <span style={{ 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 800, 
                                                            fontFamily: 'monospace',
                                                            padding: '2px 8px', 
                                                            borderRadius: '4px', 
                                                            background: 'rgba(56, 189, 248, 0.15)', 
                                                            color: 'var(--accent-primary)' 
                                                        }}>
                                                            TAG {s.tag}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Right Column: Failure Intelligence Knowledgebase */}
                                        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>ISE Failure Intelligence</h4>
                                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        Search root causes and recommended resolutions directly from Cisco ISE MnT.
                                                    </p>
                                                </div>
                                            </div>

                                            <div style={{ position: 'relative' }}>
                                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Search error code (e.g. 100001, 5400) or reason..."
                                                    value={failureSearch}
                                                    onChange={(e) => setFailureSearch(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 10px 6px 32px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'rgba(255,255,255,0.03)',
                                                        color: 'var(--text-primary)',
                                                        fontSize: '0.8rem',
                                                        outline: 'none'
                                                    }}
                                                />
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }} className="custom-scrollbar">
                                                {filteredFailures.map((f: any) => (
                                                    <div 
                                                        key={f.id}
                                                        style={{
                                                            padding: '12px 16px',
                                                            borderRadius: '8px',
                                                            background: 'rgba(239, 68, 68, 0.03)',
                                                            border: '1px solid rgba(239, 68, 68, 0.15)',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ef4444' }}>{f.code}</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>ID: {f.id}</span>
                                                        </div>
                                                        {f.cause && (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                                <strong>Cause:</strong> {f.cause}
                                                            </div>
                                                        )}
                                                        {f.resolution && (
                                                            <div style={{ fontSize: '0.75rem', color: '#10b981' }}>
                                                                <strong>Resolution:</strong> {f.resolution}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Forensic Result Tabs */}
                {activeTab !== 'dashboard' && (endpointResult || historyResult || discoveryResult) && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
                        <button 
                            onClick={() => setActiveTab('live')}
                            style={{ 
                                padding: '8px 20px', 
                                borderRadius: '6px', 
                                fontSize: '0.85rem', 
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: activeTab === 'live' ? 'var(--accent-primary)' : 'transparent',
                                color: activeTab === 'live' ? 'black' : 'var(--text-secondary)'
                            }}
                        >
                            Session
                        </button>
                        <button 
                            onClick={() => setActiveTab('history')}
                            style={{ 
                                padding: '8px 20px', 
                                borderRadius: '6px', 
                                fontSize: '0.85rem', 
                                fontWeight: '600',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                background: activeTab === 'history' ? 'var(--accent-primary)' : 'transparent',
                                color: activeTab === 'history' ? 'black' : 'var(--text-secondary)'
                            }}
                        >
                            History
                        </button>
                    </div>
                )}

                {/* Live Session Tab */}
                {activeTab === "live" && (
                    <div>
                        {discoveryResult ? (
                            <div>
                                {discoveryResult.isUserLockoutSummary ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div className="glass-card" style={{ padding: '20px', borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                                                        <Lock size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                                                            Account Lockout Hunter: Correlated Devices for '{query}'
                                                        </h3>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                            Scanned 7-day authentication history across {discoveryResult.totalMacs} device(s). Devices sending bad passwords are prioritized below.
                                                        </p>
                                                    </div>
                                                </div>
                                                {discoveryResult.potentialCulprits > 0 && (
                                                    <span style={{ padding: '4px 12px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 700, fontSize: '0.75rem' }}>
                                                        {discoveryResult.potentialCulprits} Likely Lockout Culprit{discoveryResult.potentialCulprits > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
                                            {discoveryResult.sessions.map((item: any, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    className="glass-card hover-glow" 
                                                    style={{ 
                                                        cursor: 'pointer', 
                                                        transition: 'all 0.2s',
                                                        borderLeft: item.is_lockout_culprit ? '4px solid #ef4444' : '1px solid var(--border-color)',
                                                        background: item.is_lockout_culprit ? 'rgba(239, 68, 68, 0.04)' : undefined,
                                                        padding: '20px'
                                                    }} 
                                                    onClick={() => handleSearch(undefined, item.calling_station_id)}
                                                >
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                                        <div>
                                                            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1rem', color: item.is_lockout_culprit ? '#ef4444' : 'var(--accent-primary)' }}>
                                                                {item.calling_station_id}
                                                            </div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {item.framed_ip_address !== 'N/A' ? item.framed_ip_address : 'No Active IP'}
                                                            </div>
                                                        </div>

                                                        {item.is_lockout_culprit && (
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: '4px', background: '#ef4444', color: '#fff' }}>
                                                                CULPRIT
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.8rem', marginBottom: '14px' }}>
                                                        <div><strong>Device:</strong> <span style={{ color: 'var(--text-primary)' }}>{item.endpoint_profile || "Unknown"}</span></div>
                                                        <div><strong>SSID / AP:</strong> <span style={{ color: 'var(--accent-secondary)' }}>{item.wlan_ssid || "N/A"} ({item.access_point_name || "N/A"})</span></div>
                                                        <div><strong>Switch / NAD:</strong> <span style={{ color: 'var(--text-muted)' }}>{item.nas_identifier || "N/A"}</span></div>
                                                        
                                                        {item.bad_password_count > 0 && (
                                                            <div style={{ color: '#ef4444', fontWeight: 600, background: 'rgba(239, 68, 68, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                                                                ⚠️ {item.bad_password_count} Bad Password Attempt{item.bad_password_count > 1 ? 's' : ''} (Last: {item.last_failure_reason || "Auth Failed"})
                                                            </div>
                                                        )}

                                                        {item.wlcTelemetry?.found && (
                                                            <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <Radio size={12} />
                                                                <span>Live on {item.wlcTelemetry.wlcName} ({item.wlcTelemetry.status})</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button className="btn-secondary w-full text-xs flex items-center justify-center gap-1">
                                                        <span>Deep Dive MAC & EAP Trace</span>
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="mb-4">Identity Conflict Detected: Multiple Devices for '{query}'</h3>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
                                            {discoveryResult.sessions.map((item: any, idx: number) => (
                                                <div key={idx} className="glass-card hover-glow" style={{ cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => handleSearch(undefined, item.calling_station_id)}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--accent-primary)' }}>{item.calling_station_id}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.framed_ip_address}</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.9rem', marginBottom: '16px' }}><strong>Profile:</strong> {item.endpoint_profile || "Unknown"}</p>
                                                    <button className="btn-secondary w-full text-xs">Enrich & Expand &rarr;</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : endpointResult ? (
                            <EnrichedEndpointCard session={endpointResult} />
                        ) : (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>No Active Network Session Found</p>
                                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>The endpoint may be offline or connected via a non-monitored segment.</p>
                                {historyResult?.found && (
                                    <button onClick={() => setActiveTab("history")} className="btn-secondary" style={{ marginTop: '24px' }}>View Recent Diagnostic Logs</button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Diagnostic History Tab */}
                {activeTab === "history" && (
                    <div>
                        {historyResult && historyResult.found && historyResult.failures ? (
                            historyResult.failures.map((f: any, idx: number) => (
                                <EnrichedEndpointCard key={idx} session={f} isHistory={true} />
                            ))
                        ) : (
                            <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>No Forensic History Available</p>
                                <p style={{ color: 'var(--text-muted)', marginTop: '8px' }}>ISE hasn't logged any RADIUS events for this target in the last 7 days.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Read-Only Site Directory Tab */}
                {activeTab === "sites" && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div className="glass-card mb-6" style={{ padding: '20px', borderTop: '4px solid var(--accent-primary)', textAlign: 'center', flexShrink: 0 }}>
                            <h3 style={{ margin: 0, marginBottom: '8px' }}>Site Codes and Locations</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                Click any address to open Google Maps in a new tab for rapid physical location triage.
                            </p>
                        </div>

                        {/* Search Filter Controls Bar */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
                            <div style={{ position: 'relative', width: '300px' }}>
                                <input 
                                    type="text"
                                    placeholder="Filter sites by code, name, address..."
                                    value={siteDirFilter}
                                    onChange={(e) => setSiteDirFilter(e.target.value)}
                                    style={{ 
                                        width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px', 
                                        border: '1px solid var(--border-color)', background: 'var(--bg-card)', 
                                        color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none'
                                    }}
                                />
                                <svg style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                Showing {processedSitesList.length} of {sitesList.length} mapped sites
                            </span>
                        </div>

                        {sitesLoading ? (
                            <div className="glass-card" style={{ padding: '60px', textAlign: 'center', flexShrink: 0 }}>
                                <div className="spinner-small" style={{ margin: '0 auto 16px' }}></div>
                                <p className="text-text-secondary">Loading configured site definitions...</p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                                    <thead>
                                        <tr>
                                            <th 
                                                onClick={() => setSiteDirSortDir(prev => prev === "asc" ? "desc" : "asc")}
                                                style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                                                title="Click to sort by Site Code"
                                            >
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    Site Code
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>
                                                        {siteDirSortDir === "asc" ? "▲" : "▼"}
                                                    </span>
                                                </div>
                                            </th>
                                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Site Name / Description</th>
                                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Status</th>
                                            <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface)', textAlign: 'left', padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border-color)' }}>Physical Address Mapping</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {processedSitesList.map((site, index) => {
                                            let statusColor = '#4ade80';
                                            if (site.status === 'Retired') statusColor = '#f87171';
                                            else if (site.status === 'Future') statusColor = '#facc15';

                                            return (
                                                <tr key={index} style={{ background: 'rgba(255, 255, 255, 0.01)', transition: 'background 0.2s' }}>
                                                    <td style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                                        <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)' }} className="uppercase tracking-wider">
                                                            {site.code}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                                                            {site.name}
                                                        </div>
                                                        {site.notes && (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                {site.notes}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                                        <span style={{ 
                                                            display: 'inline-flex', 
                                                            alignItems: 'center', 
                                                            gap: '6px', 
                                                            padding: '4px 10px', 
                                                            borderRadius: '12px', 
                                                            fontSize: '0.75rem', 
                                                            fontWeight: 'bold',
                                                            background: 'rgba(255,255,255,0.03)',
                                                            border: '1px solid var(--border-color)',
                                                            color: statusColor 
                                                        }}>
                                                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColor }} />
                                                            {site.status}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                                                        {site.address ? (
                                                            <a 
                                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                style={{ color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                                                onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                                                onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                                            >
                                                                {site.address}
                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                                            </a>
                                                        ) : (
                                                            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                                                No physical coordinates populated
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {processedSitesList.length === 0 && !sitesLoading && (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                                    No site mappings match your filter discovery criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
