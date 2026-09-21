"use client";

import { useState, useEffect, useMemo } from "react";
import { 
    AlertCircle, RefreshCw, Server, Activity, Shield, Users, Wifi, Cpu, Layers, 
    ExternalLink, ChevronDown, ChevronRight, Search, CheckCircle2, MapPin, Tag, 
    HardDrive, Laptop, Radio, Lock, Stethoscope, AlertTriangle, Key, BookOpen, Clock, Filter, ArrowRight
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import ConnectionPath from "@/components/ise/ConnectionPath";
import EnrichedEndpointCard from "@/components/ise/EnrichedEndpointCard";
import AuthHistoryTimeline from "@/components/ise/AuthHistoryTimeline";
import { isBooleanQuery, matchIseItemWithQuery } from "@/lib/booleanQueryParser";

export default function CiscoIsePage() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [endpointResult, setEndpointResult] = useState<any>(null);
    const [historyResult, setHistoryResult] = useState<any>(null);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<"dashboard" | "triage" | "sites" | "references">("dashboard");
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
    const [infraSearch, setInfraSearch] = useState("");
    const [referenceSubTab, setReferenceSubTab] = useState<"groups" | "sgt" | "failures">("groups");
    const [groupSearch, setGroupSearch] = useState("");
    const [failureSearch, setFailureSearch] = useState("");
    const [sgtSearch, setSgtSearch] = useState("");
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

    const handleSearch = async (e?: React.FormEvent, directTerm?: string) => {
        if (e) e.preventDefault();
        const searchTerm = directTerm || query;
        if (!searchTerm.trim()) return;

        setLoading(true);
        setError("");
        
        if (!directTerm) {
            setEndpointResult(null);
            setHistoryResult(null);
            setDiscoveryResult(null);
        }

        try {
            const strippedHex = searchTerm.trim().replace(/[:.\-\s]/g, '');
            const isMac = strippedHex.length === 12 && /^[0-9A-Fa-f]{12}$/.test(strippedHex);
            const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(searchTerm.trim());
            const isBoolean = isBooleanQuery(searchTerm);

            // Fetch Live Session
            const sessionRes = await fetch(`/api/ise/session?query=${encodeURIComponent(searchTerm)}`);
            const sessionData = await sessionRes.json();

            // Fetch 7-Day History & Failure Intelligence
            const searchVal = directTerm || sessionData.sessions?.[0]?.calling_station_id || searchTerm;
            const historyRes = await fetch(`/api/ise/failures?query=${encodeURIComponent(searchVal)}`);
            const historyData = await historyRes.json();
            setHistoryResult(historyData);

            // If boolean search or multiple devices correlated:
            if (!isMac && !isIp && historyData.searchType === "user_name" && historyData.sessions && historyData.sessions.length > 0 && !directTerm) {
                // Apply boolean filter to discovery sessions if boolean expression used
                let correlatedSessions = historyData.sessions;
                if (isBoolean) {
                    correlatedSessions = correlatedSessions.filter((s: any) => matchIseItemWithQuery(s, searchTerm));
                }

                setDiscoveryResult({
                    found: correlatedSessions.length > 0,
                    isUserLockoutSummary: true,
                    potentialCulprits: correlatedSessions.filter((s: any) => s.is_lockout_culprit).length,
                    totalMacs: correlatedSessions.length,
                    sessions: correlatedSessions
                });
                setActiveTab("triage");
                setEndpointResult(null);
            } else if (sessionData.found && sessionData.sessions && sessionData.sessions.length > 1 && !directTerm) {
                // Multi-session fallback
                let correlatedSessions = sessionData.sessions;
                if (isBoolean) {
                    correlatedSessions = correlatedSessions.filter((s: any) => matchIseItemWithQuery(s, searchTerm));
                }

                setDiscoveryResult({
                    ...sessionData,
                    sessions: correlatedSessions
                });
                setActiveTab("triage");
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
                setActiveTab("triage");
                if (directTerm) setDiscoveryResult(null);
                if (!directTerm) setQuery(searchTerm);
            }
        } catch (err: any) {
            setError(err.message || "Forensic lookup failed");
        } finally {
            setLoading(false);
        }
    };

    // Filtered Telemetry Data for Infrastructure & Sites
    const filteredSites = useMemo(() => {
        const sites = triageData?.infrastructure?.sites || [];
        if (!infraSearch.trim()) return sites;
        return sites.filter((s: any) => matchIseItemWithQuery(s, infraSearch));
    }, [triageData, infraSearch]);

    const filteredGroups = useMemo(() => {
        const groups = triageData?.deviceIdentity?.groups || [];
        if (!groupSearch.trim()) return groups;
        return groups.filter((g: any) => matchIseItemWithQuery(g, groupSearch));
    }, [triageData, groupSearch]);

    const filteredSgtTags = useMemo(() => {
        const tags = triageData?.trustSec?.tags || [];
        if (!sgtSearch.trim()) return tags;
        return tags.filter((t: any) => matchIseItemWithQuery(t, sgtSearch));
    }, [triageData, sgtSearch]);

    const filteredFailures = useMemo(() => {
        const catalog = triageData?.failureIntelligence?.catalog || [];
        if (!failureSearch.trim()) return catalog;
        return catalog.filter((f: any) => matchIseItemWithQuery(f, failureSearch));
    }, [triageData, failureSearch]);

    if (permsLoading) return <div className="p-8">Verifying Cisco ISE access...</div>;
    if (!hasIsePerm) return <div className="p-8 glass-card m-8 border-l-4 border-red-500 text-red-400">Access Denied: You do not have permission to view RADIUS endpoint forensics.</div>;

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 flex flex-col gap-4">
                {/* Header Section */}
                <div>
                    <QueryHeader
                        title="Cisco ISE Operations Center"
                        description="Unified identity and network forensics. Correlated results from Cisco ISE, Active Directory, AireOS WLCs, and Vectra AI."
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

                    {/* Primary Unified Smart Search Bar (Boolean & Site Code Capable) */}
                    <form onSubmit={(e) => handleSearch(e)} className="glass-card flex flex-col gap-2 p-4">
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <input
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search Username, IP, MAC, Site Code (e.g. 3CP, CUH), or Boolean (e.g. 3CP AND failure)..."
                                    style={{ 
                                        width: '100%', padding: '14px 16px 14px 44px', borderRadius: '12px', 
                                        border: '1px solid var(--border-color)', background: 'var(--bg-card)', 
                                        color: 'var(--text-primary)', fontSize: '1rem', outline: 'none', transition: 'border-color 0.2s' 
                                    }}
                                    disabled={loading}
                                />
                                <Search style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} size={20} />
                            </div>
                            <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 32px', borderRadius: '12px', fontWeight: 'bold', minWidth: '150px' }}>
                                {loading ? 'Querying...' : 'Triage Search'}
                            </button>
                            {query && (
                                <button 
                                    type="button" 
                                    onClick={() => { 
                                        setQuery(""); 
                                        setDiscoveryResult(null); 
                                        setEndpointResult(null); 
                                        setHistoryResult(null); 
                                        setActiveTab("dashboard"); 
                                    }} 
                                    className="btn-secondary" 
                                    style={{ padding: '0 20px', borderRadius: '12px' }}
                                >
                                    Reset
                                </button>
                            )}
                        </div>

                        {/* Search Syntax & Capability Hints */}
                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                            <span><strong>Supported:</strong> Username · IP · MAC · Facility Code (e.g. <span className="text-sky-400 font-mono">3CP</span>, <span className="text-sky-400 font-mono">CUH</span>)</span>
                            <span>•</span>
                            <span><strong>Boolean Operators:</strong> <span className="font-mono text-text-secondary">AND</span>, <span className="font-mono text-text-secondary">OR</span>, <span className="font-mono text-text-secondary">NOT</span>, <span className="font-mono text-text-secondary">()</span></span>
                            <span>•</span>
                            <span><strong>Examples:</strong> <span className="font-mono text-emerald-400">smith-jane</span> · <span className="font-mono text-emerald-400">10.20.30.40</span> · <span className="font-mono text-emerald-400">00:11:22:33:44:55</span> · <span className="font-mono text-emerald-400">3CP AND failure</span></span>
                        </div>
                    </form>

                    {error && (
                        <div style={{ marginTop: '16px', padding: '16px', borderRadius: '8px', borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                            <strong>Forensic lookup failed:</strong> {error}
                        </div>
                    )}
                </div>

                {/* Primary Navigation Tabs */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)' }}>
                    {([
                        { id: 'dashboard', label: 'Operations Center' },
                        { id: 'triage', label: endpointResult || discoveryResult ? 'Endpoint Triage (Active)' : 'Endpoint Triage' },
                        { id: 'sites', label: 'Site Directory' },
                        { id: 'references', label: 'Reference & Dictionaries' }
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
                
                {/* 1. OPERATIONS CENTER DASHBOARD TAB */}
                {activeTab === "dashboard" && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        
                        {/* Loading State */}
                        {triageLoading && !triageData && (
                            <div className="glass-card" style={{ padding: '60px', textAlign: 'center' }}>
                                <div className="spinner-small" style={{ margin: '0 auto 16px auto', width: '28px', height: '28px' }}></div>
                                <p style={{ color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                                    {triageStatus || "Connecting to Cisco ISE 3.5 API Gateway..."}
                                </p>
                                <p className="text-xs text-text-muted">Aggregating live session telemetry, 198 network switches, and facility device counts over Port 443.</p>
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
                                {/* Live Pulse Executive Bar */}
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
                                            <div style={{ fontSize: '0.7rem', color: '#10b981' }}>Live RADIUS & AD Logons</div>
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
                                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', fontWeight: 700 }}>Cisco ISE Cluster</div>
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
                                                Sync Now
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                                            <span style={{ color: '#10b981', fontWeight: 600 }}>API Gateway Active</span>
                                            <span>•</span>
                                            <span>Primary PAN Failover Ready</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Operations Grid: Facility Switches Directory + Live Endpoints Stream */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
                                    
                                    {/* Left: Facility & Switch Directory (Searchable by site code or switch) */}
                                    <div className="glass-card p-5 flex flex-col gap-4">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <h4 className="m-0 text-base font-bold text-text-primary">Facilities & Managed Switches</h4>
                                                <p className="m-0 text-xs text-text-muted">
                                                    Switches and WLCs grouped by site code prefix. Click any site code to filter triage.
                                                </p>
                                            </div>
                                            <span className="text-xs font-semibold px-2 py-1 rounded bg-white/5 border border-white/10 text-text-secondary">
                                                {filteredSites.length} Facilities
                                            </span>
                                        </div>

                                        {/* Filter Bar */}
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                                            <input
                                                type="text"
                                                placeholder="Filter facilities by site code, name, or switch (e.g. 3CP, CUH, SWI-1)..."
                                                value={infraSearch}
                                                onChange={(e) => setInfraSearch(e.target.value)}
                                                className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-color bg-white/[0.03] text-xs text-text-primary outline-none"
                                            />
                                        </div>

                                        {/* Facility List */}
                                        <div className="flex flex-col gap-3 max-h-[560px] overflow-y-auto custom-scrollbar">
                                            {filteredSites.map((site: any) => {
                                                const isExpanded = !!expandedSites[site.siteCode];
                                                return (
                                                    <div 
                                                        key={site.siteCode}
                                                        className="p-3.5 rounded-lg border border-border-color bg-white/[0.02]"
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setQuery(site.siteCode);
                                                                            handleSearch(undefined, site.siteCode);
                                                                        }}
                                                                        className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 font-extrabold text-xs hover:bg-sky-500/25 transition-colors cursor-pointer border border-sky-500/30"
                                                                        title="Search endpoints and sessions for this site code"
                                                                    >
                                                                        {site.siteCode}
                                                                    </button>
                                                                    <span className="font-semibold text-sm text-text-primary">
                                                                        {site.siteName}
                                                                    </span>
                                                                </div>
                                                                {site.siteAddress && site.siteAddress !== "Address telemetry unavailable" && (
                                                                    <div className="text-[0.7rem] text-text-muted mt-1 flex items-center gap-1">
                                                                        <MapPin size={10} />
                                                                        <span>{site.siteAddress}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                                {site.deviceCount} {site.deviceCount === 1 ? 'Device' : 'Devices'}
                                                            </span>
                                                        </div>

                                                        {/* Collapsible Switch List */}
                                                        <button
                                                            onClick={() => toggleSiteExpand(site.siteCode)}
                                                            className="w-full mt-2 py-1.5 px-2.5 rounded bg-white/[0.03] hover:bg-white/[0.06] border border-border-color text-text-secondary text-[0.75rem] cursor-pointer flex justify-between items-center transition-colors"
                                                        >
                                                            <span>{isExpanded ? 'Hide Switches' : `View ${site.deviceCount} Switches & Controllers`}</span>
                                                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="mt-2 flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                                {site.devices.map((d: any) => (
                                                                    <div 
                                                                        key={d.id}
                                                                        onClick={() => {
                                                                            setQuery(d.name);
                                                                            handleSearch(undefined, d.name);
                                                                        }}
                                                                        className="text-xs px-2.5 py-1.5 rounded bg-black/30 hover:bg-white/5 border border-white/5 flex justify-between items-center cursor-pointer transition-colors"
                                                                        title="Search telemetry on this switch"
                                                                    >
                                                                        <span className="font-mono text-text-primary font-semibold">{d.name}</span>
                                                                        <span className="text-[0.65rem] text-text-muted">{d.type}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Right: Live Endpoints & Active Forensic Stream */}
                                    <div className="glass-card p-5 flex flex-col gap-4">
                                        <div>
                                            <h4 className="m-0 text-base font-bold text-text-primary">Live Endpoints Stream</h4>
                                            <p className="m-0 text-xs text-text-muted">
                                                Devices queried from Cisco ISE. Click any MAC to execute an instant single-page deep dive.
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-2.5 max-h-[560px] overflow-y-auto custom-scrollbar">
                                            {triageData.deviceIdentity?.recentEndpoints?.map((ep: any) => (
                                                <div 
                                                    key={ep.id}
                                                    onClick={() => {
                                                        setQuery(ep.mac);
                                                        handleSearch(undefined, ep.mac);
                                                    }}
                                                    className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-border-color flex justify-between items-center cursor-pointer transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                                                            <Laptop size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="font-mono font-bold text-sm text-text-primary">
                                                                {ep.mac}
                                                            </div>
                                                            <div className="text-[0.7rem] text-text-muted">
                                                                IP: {ep.ipAddress}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[0.7rem] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                                                            {ep.identityGroup}
                                                        </span>
                                                        <ChevronRight size={14} className="text-text-muted" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                </div>
                            </>
                        )}
                    </div>
                )}

                {/* 2. ENDPOINT TRIAGE TAB (UNIFIED SINGLE-PAGE STORY) */}
                {activeTab === "triage" && (
                    <div className="flex flex-col gap-6">
                        {discoveryResult ? (
                            <div>
                                {discoveryResult.isUserLockoutSummary ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="glass-card p-5 border-l-4 border-red-500 bg-red-500/[0.05]">
                                            <div className="flex justify-between items-center">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                                                        <Lock size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 className="m-0 text-base font-bold text-text-primary">
                                                            Lockout Hunter: Correlated Devices for '{query}'
                                                        </h3>
                                                        <p className="m-0 text-xs text-text-secondary">
                                                            Scanned 7-day authentication history across {discoveryResult.totalMacs} device(s). Devices sending bad passwords are prioritized below.
                                                        </p>
                                                    </div>
                                                </div>
                                                {discoveryResult.potentialCulprits > 0 && (
                                                    <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 font-bold text-xs">
                                                        {discoveryResult.potentialCulprits} Likely Lockout Culprit{discoveryResult.potentialCulprits > 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4">
                                            {discoveryResult.sessions.map((item: any, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    onClick={() => handleSearch(undefined, item.calling_station_id)}
                                                    className="glass-card p-5 cursor-pointer hover:border-accent-primary transition-colors"
                                                    style={{ 
                                                        borderLeft: item.is_lockout_culprit ? '4px solid #ef4444' : '1px solid var(--border-color)',
                                                        background: item.is_lockout_culprit ? 'rgba(239, 68, 68, 0.04)' : undefined
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <div>
                                                            <div className="font-mono font-bold text-sm" style={{ color: item.is_lockout_culprit ? '#ef4444' : 'var(--accent-primary)' }}>
                                                                {item.calling_station_id}
                                                            </div>
                                                            <div className="text-xs text-text-muted">
                                                                {item.framed_ip_address !== 'N/A' ? item.framed_ip_address : 'No Active IP'}
                                                            </div>
                                                        </div>

                                                        {item.is_lockout_culprit && (
                                                            <span className="text-[0.65rem] font-extrabold uppercase px-2 py-0.5 rounded bg-red-500 text-white">
                                                                CULPRIT
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex flex-col gap-1 text-xs mb-3">
                                                        <div><strong>Device:</strong> <span className="text-text-primary">{item.endpoint_profile || "Unknown"}</span></div>
                                                        <div><strong>SSID / AP:</strong> <span className="text-accent-secondary">{item.wlan_ssid || "N/A"} ({item.access_point_name || "N/A"})</span></div>
                                                        <div><strong>Switch / NAD:</strong> <span className="text-text-muted">{item.nas_identifier || "N/A"}</span></div>
                                                        
                                                        {item.bad_password_count > 0 && (
                                                            <div className="text-red-400 font-semibold bg-red-500/10 p-1.5 rounded mt-1">
                                                                ⚠️ {item.bad_password_count} Bad Password Attempt{item.bad_password_count > 1 ? 's' : ''} (Last: {item.last_failure_reason || "Auth Failed"})
                                                            </div>
                                                        )}

                                                        {item.wlcTelemetry?.found && (
                                                            <div className="text-emerald-400 text-xs flex items-center gap-1 mt-1">
                                                                <Radio size={12} />
                                                                <span>Live on {item.wlcTelemetry.wlcName} ({item.wlcTelemetry.status})</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <button className="btn-secondary w-full text-xs flex items-center justify-center gap-1 py-1.5">
                                                        <span>Deep Dive MAC & EAP Trace</span>
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="mb-4 text-base font-bold">Multiple Endpoints Found for '{query}'</h3>
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                                            {discoveryResult.sessions.map((item: any, idx: number) => (
                                                <div 
                                                    key={idx} 
                                                    className="glass-card p-5 cursor-pointer hover:border-accent-primary transition-colors" 
                                                    onClick={() => handleSearch(undefined, item.calling_station_id)}
                                                >
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-mono font-bold text-accent-primary">{item.calling_station_id}</span>
                                                        <span className="text-xs text-text-muted">{item.framed_ip_address}</span>
                                                    </div>
                                                    <p className="text-xs text-text-secondary mb-3"><strong>Profile:</strong> {item.endpoint_profile || "Unknown"}</p>
                                                    <button className="btn-secondary w-full text-xs py-1.5">Enrich & Expand &rarr;</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : endpointResult ? (
                            <div className="flex flex-col gap-6">
                                {/* Tier 1: Current Live Session Card */}
                                <EnrichedEndpointCard session={endpointResult} />

                                {/* Tier 2 & 3: 7-Day Authentication History Timeline */}
                                <AuthHistoryTimeline 
                                    events={historyResult?.failures || []} 
                                    onSelectMac={(mac) => handleSearch(undefined, mac)}
                                />
                            </div>
                        ) : (
                            <div className="glass-card p-12 text-center">
                                <p className="text-base font-semibold text-text-secondary">No Active Network Session Found</p>
                                <p className="text-xs text-text-muted mt-2">
                                    The endpoint may be offline or connected via an unmonitored segment.
                                </p>
                                {historyResult?.found && historyResult.failures?.length > 0 && (
                                    <div className="mt-6">
                                        <AuthHistoryTimeline 
                                            events={historyResult.failures} 
                                            onSelectMac={(mac) => handleSearch(undefined, mac)}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* 3. SITE DIRECTORY TAB */}
                {activeTab === "sites" && (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div className="glass-card mb-6 p-5 border-t-4 border-accent-primary text-center">
                            <h3 className="m-0 mb-2 font-bold text-base">Cooper Health Facilities & Site Codes</h3>
                            <p className="m-0 text-xs text-text-muted">
                                Master facility directory. Click any address to open Google Maps for physical location triage.
                            </p>
                        </div>

                        {/* Search Filter Controls Bar */}
                        <div className="flex justify-between items-center mb-4">
                            <div className="relative w-72">
                                <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                                <input 
                                    type="text"
                                    placeholder="Filter sites by code, name, address..."
                                    value={siteDirFilter}
                                    onChange={(e) => setSiteDirFilter(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-border-color bg-card text-xs text-text-primary outline-none"
                                />
                            </div>
                            <span className="text-xs text-text-muted">
                                Showing {processedSitesList.length} of {sitesList.length} mapped sites
                            </span>
                        </div>

                        {sitesLoading ? (
                            <div className="glass-card p-12 text-center">
                                <div className="spinner-small mx-auto mb-4"></div>
                                <p className="text-text-secondary text-xs">Loading configured site definitions...</p>
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
                                                        <span 
                                                            onClick={() => {
                                                                setQuery(site.code);
                                                                handleSearch(undefined, site.code);
                                                            }}
                                                            style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)', cursor: 'pointer' }} 
                                                            className="uppercase tracking-wider hover:underline"
                                                            title="Filter triage on this site code"
                                                        >
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
                                                                <ExternalLink size={12} />
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
                                                    No site mappings match your filter criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* 4. REFERENCE & DICTIONARIES TAB */}
                {activeTab === "references" && (
                    <div className="flex flex-col gap-5">
                        {/* Sub-navigation switcher for references */}
                        <div className="flex gap-2 p-1 bg-white/[0.03] rounded-lg border border-border-color w-fit">
                            <button
                                onClick={() => setReferenceSubTab("groups")}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${
                                    referenceSubTab === "groups" ? "bg-accent-primary text-black" : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                <Tag size={13} className="inline mr-1.5" />
                                Endpoint Identity Groups ({triageData?.deviceIdentity?.groups?.length || 0})
                            </button>
                            <button
                                onClick={() => setReferenceSubTab("sgt")}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${
                                    referenceSubTab === "sgt" ? "bg-accent-primary text-black" : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                <Shield size={13} className="inline mr-1.5" />
                                TrustSec SGT Tags ({triageData?.trustSec?.tags?.length || 0})
                            </button>
                            <button
                                onClick={() => setReferenceSubTab("failures")}
                                className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${
                                    referenceSubTab === "failures" ? "bg-accent-primary text-black" : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                <Stethoscope size={13} className="inline mr-1.5" />
                                Failure Reasons Knowledgebase ({triageData?.failureIntelligence?.totalCatalogued || 0})
                            </button>
                        </div>

                        {/* Reference Sub-View 1: Identity Groups */}
                        {referenceSubTab === "groups" && (
                            <div className="glass-card p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="m-0 text-base font-bold text-text-primary">Configured Identity Groups</h4>
                                        <p className="m-0 text-xs text-text-muted">
                                            Dynamically synchronized from Cisco ISE ERS API. Automatically updates when new groups are added in ISE.
                                        </p>
                                    </div>
                                    <div className="relative w-72">
                                        <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                                        <input
                                            type="text"
                                            placeholder="Search groups (e.g. Medical, Android, BYOD)..."
                                            value={groupSearch}
                                            onChange={(e) => setGroupSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 rounded-md border border-border-color bg-white/[0.03] text-xs text-text-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {filteredGroups.map((g: any) => (
                                        <div 
                                            key={g.id}
                                            onClick={() => {
                                                setQuery(g.name);
                                                handleSearch(undefined, g.name);
                                            }}
                                            className="p-3 rounded-lg border border-border-color bg-white/[0.02] hover:border-accent-primary cursor-pointer transition-colors"
                                            title="Search endpoints in this group"
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-bold text-sm text-text-primary">{g.name}</span>
                                                <Tag size={12} className="text-accent-primary" />
                                            </div>
                                            {g.description && (
                                                <p className="m-0 text-xs text-text-muted leading-relaxed">{g.description}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reference Sub-View 2: TrustSec SGT Tags */}
                        {referenceSubTab === "sgt" && (
                            <div className="glass-card p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="m-0 text-base font-bold text-text-primary">TrustSec Security Group Tags (SGT)</h4>
                                        <p className="m-0 text-xs text-text-muted">
                                            Dynamically queried from Cisco ISE OpenAPI. Maps hardware tags to role-based policy names.
                                        </p>
                                    </div>
                                    <div className="relative w-72">
                                        <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                                        <input
                                            type="text"
                                            placeholder="Search SGT by name, tag, or description..."
                                            value={sgtSearch}
                                            onChange={(e) => setSgtSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 rounded-md border border-border-color bg-white/[0.03] text-xs text-text-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {filteredSgtTags.map((s: any) => (
                                        <div 
                                            key={s.tag}
                                            onClick={() => {
                                                setQuery(s.name);
                                                handleSearch(undefined, s.name);
                                            }}
                                            className="p-3 rounded-lg border border-border-color bg-white/[0.02] hover:border-accent-primary cursor-pointer transition-colors flex justify-between items-center"
                                            title="Search sessions carrying this SGT"
                                        >
                                            <div>
                                                <div className="font-bold text-sm text-text-primary">{s.name}</div>
                                                <div className="text-xs text-text-muted">{s.description || 'Enterprise Policy'}</div>
                                            </div>
                                            <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                                TAG {s.tag}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Reference Sub-View 3: Failure Reasons Catalog */}
                        {referenceSubTab === "failures" && (
                            <div className="glass-card p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h4 className="m-0 text-base font-bold text-text-primary">ISE Failure Intelligence Catalog</h4>
                                        <p className="m-0 text-xs text-text-muted">
                                            Synchronized from Cisco ISE MnT API. Root causes and remediation guidelines for 802.1X / RADIUS codes.
                                        </p>
                                    </div>
                                    <div className="relative w-80">
                                        <Search size={14} className="absolute left-3 top-2.5 text-text-muted" />
                                        <input
                                            type="text"
                                            placeholder="Search error code (e.g. 5400, 24408) or reason..."
                                            value={failureSearch}
                                            onChange={(e) => setFailureSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 rounded-md border border-border-color bg-white/[0.03] text-xs text-text-primary outline-none"
                                        />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2.5 max-h-[600px] overflow-y-auto custom-scrollbar">
                                    {filteredFailures.map((f: any) => (
                                        <div 
                                            key={f.id}
                                            className="p-3.5 rounded-lg border border-red-500/20 bg-red-500/[0.03] flex flex-col gap-1.5"
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-sm text-red-400">{f.code}</span>
                                                <span className="font-mono text-xs text-text-muted">Code ID: {f.id}</span>
                                            </div>
                                            {f.cause && (
                                                <div className="text-xs text-text-secondary">
                                                    <strong className="text-text-primary">Cause:</strong> {f.cause}
                                                </div>
                                            )}
                                            {f.resolution && (
                                                <div className="text-xs text-emerald-400">
                                                    <strong>Resolution:</strong> {f.resolution}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
