"use client";

import { useState, useEffect } from "react";

export default function DomainSecurityPage() {
    // Domain Search State
    const [domainStr, setDomainStr] = useState("");
    const [availableDomains, setAvailableDomains] = useState<{ DomainName: string }[]>([]);
    const [domainLoading, setDomainLoading] = useState(false);
    const [domainError, setDomainError] = useState("");
    const [domainResults, setDomainResults] = useState<{ 
        hasBreaches: boolean, 
        aliases: Record<string, string[]>, 
        adEnrichment: Record<string, any> 
    } | null>(null);
    const [activeView, setActiveView] = useState<"all" | "breaches" | "summary" | null>(null);
    const [expandedAlias, setExpandedAlias] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"domain" | "breach">("domain");

    // Breaches Metadata (loaded once)
    const [allBreachesMeta, setAllBreachesMeta] = useState<Record<string, any>>({});
    const [sortConfig, setSortConfig] = useState<{ key: 'count' | 'date', desc: boolean }>({ key: 'count', desc: true });

    // Breach Search State
    const [breachSearchQuery, setBreachSearchQuery] = useState("");
    const [breachSearchView, setBreachSearchView] = useState<"details" | "impacted" | null>(null);
    const [breachSearchLoading, setBreachSearchLoading] = useState(false);
    const [breachSearchError, setBreachSearchError] = useState("");

    // Fetch available domains on load
    useEffect(() => {
        const fetchDomains = async () => {
            try {
                const res = await fetch("/api/hibp-subscribed-domains");
                if (res.ok) {
                    const data = await res.json();
                    setAvailableDomains(data);
                    if (data.length > 0) {
                        setDomainStr(data[0].DomainName);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch subscribed domains", e);
            }
        };

        const fetchBreachesMeta = async () => {
            try {
                const res = await fetch("/api/hibp-breaches");
                if (res.ok) {
                    const data = await res.json();
                    const metaMap: Record<string, any> = {};
                    data.forEach((b: any) => metaMap[b.Name] = b);
                    setAllBreachesMeta(metaMap);
                }
            } catch (e) {
                console.error("Failed to fetch breaches metadata", e);
            }
        };

        fetchDomains();
        fetchBreachesMeta();
    }, []);

    const fetchDomainData = async () => {
        setDomainLoading(true);
        setDomainError("");
        setDomainResults(null);

        try {
            const res = await fetch("/api/hibp-domain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domain: domainStr }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to query HIBP Domain API");
            }

            const data = await res.json();
            setDomainResults(data);
            return data;
        } catch (err: any) {
            setDomainError(err.message || "An unexpected error occurred");
            return null;
        } finally {
            setDomainLoading(false);
        }
    };

    const triggerView = async (viewType: "all" | "breaches" | "summary") => {
        setActiveView(viewType);
        if (!domainResults) {
            await fetchDomainData();
        }
    };

    // --- Data Aggregation Helpers for Domain Search ---

    const getBreachCounts = () => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const counts: Record<string, number> = {};
        Object.values(domainResults.aliases).forEach(breaches => {
            breaches.forEach(b => {
                counts[b] = (counts[b] || 0) + 1;
            });
        });

        const mapped = Object.entries(counts).map(([name, count]) => ({
            name,
            count,
            date: allBreachesMeta[name]?.BreachDate || "Unknown",
        }));

        return mapped.sort((a, b) => {
            if (sortConfig.key === 'count') {
                return sortConfig.desc ? b.count - a.count : a.count - b.count;
            } else {
                const fA = a.date === "Unknown" ? "" : a.date;
                const fB = b.date === "Unknown" ? "" : b.date;
                return sortConfig.desc ? fB.localeCompare(fA) : fA.localeCompare(fB);
            }
        });
    };

    const handleSort = (key: 'count' | 'date') => {
        if (sortConfig.key === key) {
            setSortConfig({ key, desc: !sortConfig.desc });
        } else {
            setSortConfig({ key, desc: true });
        }
    };

    const triggerBreachView = async (viewType: "details" | "impacted") => {
        setBreachSearchError("");
        if (!allBreachesMeta[breachSearchQuery]) {
            setBreachSearchError("Breach not found. Please ensure the exact name is selected from the dropdown.");
            setBreachSearchView(null);
            return;
        }

        setBreachSearchView(viewType);

        if (viewType === 'impacted' && !domainResults) {
            setBreachSearchLoading(true);
            await fetchDomainData();
            setBreachSearchLoading(false);
        }
    };

    const getImpactedAliasesForBreach = () => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const impacted: string[] = [];
        Object.entries(domainResults.aliases).forEach(([alias, breaches]) => {
            if (breaches.includes(breachSearchQuery)) {
                impacted.push(alias);
            }
        });
        return impacted;
    };

    const getTopAliases = (limit: number) => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const mapped = Object.entries(domainResults.aliases).map(([alias, breaches]) => ({
            alias,
            count: breaches.length
        }));
        return mapped.sort((a, b) => b.count - a.count).slice(0, limit);
    };

    const downloadCSV = (filterBreach?: string) => {
        if (!domainResults) return;
        
        const headers = ["Email", "AD Name", "AD Status", "Locked", "Title", "Department", "Description", "Password Last Set", "Breach Count", "Breaches"];
        const rows = Object.entries(domainResults.aliases)
            .filter(([_, breaches]) => !filterBreach || breaches.includes(filterBreach))
            .map(([alias, breaches]) => {
                const email = `${alias}@${domainStr}`.toLowerCase();
                const ad = domainResults.adEnrichment[email] || {};
                return [
                    email,
                    ad.displayName || "N/A",
                    ad.email ? (ad.enabled ? "Active" : "Disabled") : "Not in AD",
                    ad.email ? (ad.locked ? "Locked" : "Unlocked") : "N/A",
                    ad.title || "N/A",
                    ad.department || "N/A",
                    ad.description || "N/A",
                    ad.pwdLastSet || "N/A",
                    breaches.length,
                    breaches.join("; ")
                ];
            });

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const filename = filterBreach 
            ? `hibp_breach_${filterBreach.replace(/\s+/g, '_')}_${domainStr}_${new Date().toISOString().split('T')[0]}.csv`
            : `hibp_domain_report_${domainStr}_${new Date().toISOString().split('T')[0]}.csv`;
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const EmailRecord = ({ alias, breachList }: { alias: string, breachList: string[] }) => {
        const email = `${alias}@${domainStr}`.toLowerCase();
        const ad = domainResults?.adEnrichment[email];
        const isExpanded = expandedAlias === alias;
        
        let borderStyle = '1px solid var(--border-color)';
        let bgStyle = 'var(--bg-dark)';
        if (ad) {
            borderStyle = ad.enabled ? '1px solid rgba(234, 179, 8, 0.5)' : '1px solid rgba(239, 68, 68, 0.5)';
            bgStyle = ad.enabled ? 'rgba(234, 179, 8, 0.05)' : 'rgba(239, 68, 68, 0.05)';
        }

        return (
            <div 
                onClick={() => setExpandedAlias(isExpanded ? null : alias)}
                style={{ 
                    background: bgStyle, 
                    padding: '1rem', 
                    borderRadius: 'var(--radius-sm)', 
                    border: borderStyle,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative'
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <strong style={{ fontSize: '1.1rem', color: ad ? (ad.enabled ? '#eab308' : '#f87171') : 'var(--text-primary)' }}>
                            {alias}@{domainStr}
                            {ad && (
                                <span style={{ fontSize: '0.7rem', marginLeft: '10px', padding: '2px 8px', borderRadius: '4px', background: ad.enabled ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)', color: ad.enabled ? '#fde047' : '#fca5a5', textTransform: 'uppercase', verticalAlign: 'middle' }}>
                                    {ad.enabled ? 'Active' : 'Disabled'} {ad.locked ? '(Locked)' : ''}
                                </span>
                            )}
                        </strong>
                    </div>
                    <div style={{ color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'}</div>
                </div>

                {!isExpanded && (
                    <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '10px' }}>
                        {breachList.map((breachName: string) => (
                            <span key={breachName} style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                                {breachName}
                            </span>
                        ))}
                    </div>
                )}

                {isExpanded && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Active Directory Identity</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Name:</strong> {ad?.displayName || "N/A"}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Title:</strong> {ad?.title || "N/A"}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Dept:</strong> {ad?.department || "N/A"}</p>
                        </div>
                        <div>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Account Status</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Enabled:</strong> {ad ? (ad.enabled ? 'Yes' : 'No') : 'N/A'}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Locked:</strong> {ad ? (ad.locked ? 'Yes' : 'No') : 'N/A'}</p>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}><strong>Pwd Last Set:</strong> {ad?.pwdLastSet || "N/A"}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Description</h5>
                            <p style={{ margin: '4px 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{ad?.description || "No description provided."}</p>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <h5 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Breach History</h5>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {breachList.map((breachName: string) => (
                                    <span key={breachName} style={{ background: 'rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '12px', color: '#fca5a5', fontSize: '0.75rem' }}>
                                        {breachName}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="internal-scroll-layout">
            <div style={{ flexShrink: 0, marginBottom: '32px' }}>
                <h1>Domain Security</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Check if your verified organizational domains have been impacted by specific or global data breaches. 
                    Search results are enriched with Active Directory status:
                </p>
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308', boxShadow: '0 0 10px rgba(234, 179, 8, 0.4)' }}></span> 
                        Active Account
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f87171', boxShadow: '0 0 10px rgba(239, 68, 68, 0.4)' }}></span> 
                        Disabled Account
                    </span>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '1rem' }}>
                
                {/* Tab Switcher */}
                <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                    <button 
                        onClick={() => setActiveTab("domain")}
                        style={{ 
                            padding: '12px 24px', 
                            background: 'transparent', 
                            color: activeTab === 'domain' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            border: 'none',
                            borderBottom: activeTab === 'domain' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Domain Breach Check
                    </button>
                    <button 
                        onClick={() => setActiveTab("breach")}
                        style={{ 
                            padding: '12px 24px', 
                            background: 'transparent', 
                            color: activeTab === 'breach' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            border: 'none',
                            borderBottom: activeTab === 'breach' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            cursor: 'pointer',
                            fontWeight: 600,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Breach Name Search
                    </button>
                </div>

                {activeTab === 'domain' && (
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2rem', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>

                {/* --- DOMAIN SEARCH CARD --- */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flexShrink: 0 }}>
                        <h3 style={{ marginBottom: '16px' }}>Domain Breach Check</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                            Retrieves compromised email aliases for verified domains on your HIBP account.
                        </p>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <div className="input-group">
                                <label htmlFor="domainStr">Verified Domain</label>
                                {availableDomains.length === 0 ? (
                                    <input type="text" disabled placeholder="Fetching verified domains..." />
                                ) : (
                                    <select
                                        id="domainStr"
                                        value={domainStr}
                                        onChange={(e) => {
                                            setDomainStr(e.target.value);
                                            setDomainResults(null);
                                            setActiveView(null);
                                        }}
                                        style={{
                                            width: '100%',
                                            padding: '12px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: 'var(--radius-sm)',
                                            color: 'var(--text-primary)',
                                            fontSize: '1rem',
                                            transition: 'all 0.2s ease',
                                            outline: 'none',
                                        }}
                                    >
                                        {availableDomains.map(d => (
                                            <option key={d.DomainName} value={d.DomainName} style={{ background: 'var(--bg-dark)' }}>
                                                {d.DomainName}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '2rem' }}>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{
                                    background: activeView === 'all' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                    borderColor: activeView === 'all' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                    color: activeView === 'all' ? '#fff' : 'var(--text-secondary)',
                                    padding: '8px 4px', fontSize: '0.8rem'
                                }}
                                onClick={() => triggerView("all")}
                                disabled={domainLoading || availableDomains.length === 0}
                            >
                                {domainLoading && activeView === 'all' ? "Loading..." : "All Impacted Emails"}
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{
                                    background: activeView === 'breaches' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                    borderColor: activeView === 'breaches' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                    color: activeView === 'breaches' ? '#fff' : 'var(--text-secondary)',
                                    padding: '8px 4px', fontSize: '0.8rem'
                                }}
                                onClick={() => triggerView("breaches")}
                                disabled={domainLoading || availableDomains.length === 0}
                            >
                                {domainLoading && activeView === 'breaches' ? "Loading..." : "View Domain Breaches"}
                            </button>
                            <button
                                type="button"
                                className="btn-primary"
                                style={{
                                    background: activeView === 'summary' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                    borderColor: activeView === 'summary' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                    color: activeView === 'summary' ? '#fff' : 'var(--text-secondary)',
                                    padding: '8px 4px', fontSize: '0.8rem'
                                }}
                                onClick={() => triggerView("summary")}
                                disabled={domainLoading || availableDomains.length === 0}
                            >
                                {domainLoading && activeView === 'summary' ? "Loading..." : "Executive Summary"}
                            </button>
                        </div>
                    </div>

                    {domainError && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                            <strong>Error:</strong> {domainError}
                        </div>
                    )}

                    {domainResults && activeView && (
                        <div style={{ marginTop: '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                            {!domainResults.hasBreaches ? (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                    <strong>Clean!</strong> No known breaches found for any email addresses on {domainStr}.
                                </div>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

                                    {/* VIEW 1: All Aliases */}
                                    {activeView === 'all' && (
                                        <>
                                            <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong>{Object.keys(domainResults.aliases).length} Impacted Email Aliases Found</strong>
                                                <button onClick={() => downloadCSV()} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Export Enriched CSV</button>
                                            </div>
                                            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                {Object.entries(domainResults.aliases).map(([alias, breachList]: [string, any]) => (
                                                    <EmailRecord key={alias} alias={alias} breachList={breachList} />
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {/* VIEW 2: Unique Domain Breaches */}
                                    {activeView === 'breaches' && (
                                        <>
                                            <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8', borderRadius: 'var(--radius-md)', border: '1px solid #38bdf8', marginBottom: '1rem' }}>
                                                <strong>{getBreachCounts().length} Unique Breaches Affecting {domainStr}</strong>
                                            </div>
                                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                                    <thead className="sticky-header">
                                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface-hover)' }}>
                                                            <th style={{ padding: '12px 16px' }}>Breach Name</th>
                                                            <th
                                                                style={{ padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}
                                                                onClick={() => handleSort('date')}
                                                            >
                                                                Date {sortConfig.key === 'date' ? (sortConfig.desc ? '↓' : '↑') : ''}
                                                            </th>
                                                            <th
                                                                style={{ padding: '12px 16px', textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}
                                                                onClick={() => handleSort('count')}
                                                            >
                                                                Impacted Emails {sortConfig.key === 'count' ? (sortConfig.desc ? '↓' : '↑') : ''}
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {getBreachCounts().map((b) => (
                                                            <tr key={b.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                                <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>{b.name}</td>
                                                                <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{b.date}</td>
                                                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                    <span style={{ background: 'rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '12px', color: '#fca5a5', fontSize: '0.85rem' }}>
                                                                        {b.count}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}

                                    {/* VIEW 3: Executive Summary */}
                                    {activeView === 'summary' && (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto', paddingRight: '8px' }}>
                                            <div>
                                                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>Top 10 Worst Breaches</h4>
                                                <div style={{ display: 'grid', gap: '8px' }}>
                                                    {getBreachCounts().slice(0, 10).map((b, idx) => (
                                                        <div key={b.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>#{idx + 1}</span>
                                                                {b.name} <span style={{ fontSize: '0.8rem', marginLeft: '6px', color: 'var(--text-muted)' }}>({b.date})</span>
                                                            </span>
                                                            <span style={{ fontWeight: 600, color: '#fca5a5' }}>{b.count} org accounts</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    Top 25 Most Compromised Aliases
                                                    <button onClick={downloadCSV} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>Download Full Report</button>
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px' }}>
                                                    {getTopAliases(25).map((aliasObj, idx) => {
                                                        const email = `${aliasObj.alias}@${domainStr}`.toLowerCase();
                                                        const ad = domainResults.adEnrichment[email];
                                                        
                                                        let bg = 'var(--bg-surface-hover)';
                                                        let color = 'var(--text-primary)';
                                                        if (ad) {
                                                            bg = ad.enabled ? 'rgba(234, 179, 8, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                                                            color = ad.enabled ? '#eab308' : '#f87171';
                                                        }

                                                        return (
                                                            <div key={aliasObj.alias} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: bg, padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                                <span style={{ color: color, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {aliasObj.alias}@{domainStr}
                                                                    {ad && <span style={{ fontSize: '0.65rem', marginLeft: '8px', opacity: 0.8 }}>({ad.enabled ? 'Active' : 'Disabled'})</span>}
                                                                </span>
                                                                <span style={{ background: 'var(--bg-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#fca5a5', whiteSpace: 'nowrap' }}>
                                                                    In {aliasObj.count} breaches
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'breach' && (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2rem', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
                        {/* --- BREACH NAME SEARCH CARD --- */}
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flexShrink: 0 }}>
                                <h3 style={{ marginBottom: '16px' }}>Breach Name Search</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    Search for a specific data breach by name to see its details and find out if your domain was impacted.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div className="input-group">
                                        <label htmlFor="breachSearchQuery">Breach Name</label>
                                        <input
                                            type="text"
                                            id="breachSearchQuery"
                                            list="breachNamesList"
                                            value={breachSearchQuery}
                                            onChange={(e) => {
                                                setBreachSearchQuery(e.target.value);
                                                setBreachSearchView(null);
                                                setBreachSearchError("");
                                            }}
                                            placeholder="e.g. LinkedIn"
                                            disabled={Object.keys(allBreachesMeta).length === 0}
                                        />
                                        <datalist id="breachNamesList">
                                            {Object.keys(allBreachesMeta).map(name => (
                                                <option key={name} value={name} />
                                            ))}
                                        </datalist>
                                    </div>

                                    <div className="input-group">
                                        <label htmlFor="breachDomainStr">Target Domain (for Impacted Emails)</label>
                                        {availableDomains.length === 0 ? (
                                            <input type="text" disabled placeholder="Fetching verified domains..." />
                                        ) : (
                                            <select
                                                id="breachDomainStr"
                                                value={domainStr}
                                                onChange={(e) => {
                                                    setDomainStr(e.target.value);
                                                    setDomainResults(null);
                                                    setActiveView(null);
                                                    setBreachSearchView(null);
                                                }}
                                                style={{
                                                    width: '100%', padding: '12px', backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                    border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)',
                                                    color: 'var(--text-primary)', fontSize: '1rem', outline: 'none'
                                                }}
                                            >
                                                {availableDomains.map(d => (
                                                    <option key={d.DomainName} value={d.DomainName} style={{ background: 'var(--bg-dark)' }}>{d.DomainName}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '2rem' }}>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: breachSearchView === 'details' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: breachSearchView === 'details' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: breachSearchView === 'details' ? '#fff' : 'var(--text-secondary)'
                                        }}
                                        onClick={() => triggerBreachView("details")}
                                        disabled={!breachSearchQuery || Object.keys(allBreachesMeta).length === 0}
                                    >
                                        Breach Details
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        style={{
                                            background: breachSearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--bg-surface-hover)',
                                            borderColor: breachSearchView === 'impacted' ? 'var(--accent-secondary)' : 'var(--border-color)',
                                            color: breachSearchView === 'impacted' ? '#fff' : 'var(--text-secondary)'
                                        }}
                                        onClick={() => triggerBreachView("impacted")}
                                        disabled={!breachSearchQuery || Object.keys(allBreachesMeta).length === 0 || breachSearchLoading}
                                    >
                                        {breachSearchLoading && breachSearchView === 'impacted' ? 'Loading...' : 'Details & Impacted Emails'}
                                    </button>
                                </div>
                            </div>

                            {breachSearchError && (
                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                    <strong>Error:</strong> {breachSearchError}
                                </div>
                            )}

                            {breachSearchView && allBreachesMeta[breachSearchQuery] && (
                                <div style={{ flex: 1, marginTop: '1rem', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    <div style={{ flexShrink: 0, background: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                            <div>
                                                <h4 style={{ color: 'var(--accent-primary)', fontSize: '1.2rem', marginBottom: '4px' }}>{allBreachesMeta[breachSearchQuery].Title}</h4>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Breached: {allBreachesMeta[breachSearchQuery].BreachDate}</span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fca5a5' }}>{allBreachesMeta[breachSearchQuery].PwnCount.toLocaleString()}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Accounts Compromised</div>
                                            </div>
                                        </div>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: allBreachesMeta[breachSearchQuery].Description }}></p>

                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', marginBottom: '4px' }}><strong>Compromised Data:</strong></div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                            {allBreachesMeta[breachSearchQuery].DataClasses.map((dc: string) => (
                                                <span key={dc} style={{ background: 'var(--bg-surface-hover)', padding: '4px 10px', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{dc}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {breachSearchView === 'impacted' && (
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                            <h4 style={{ flexShrink: 0, color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                                                Impacted Emails on {domainStr}
                                            </h4>

                                            {domainError && (
                                                <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                                                    <strong>Domain Error:</strong> {domainError}
                                                </div>
                                            )}

                                            {domainResults && (
                                                getImpactedAliasesForBreach().length === 0 ? (
                                                    <div style={{ flexShrink: 0, padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                                        <strong>Clear!</strong> No emails on {domainStr} were found in this specific breach.
                                                    </div>
                                                ) : (
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                                        <div style={{ flexShrink: 0, padding: '0.75rem 1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <strong>{getImpactedAliasesForBreach().length} Affected Aliases Found</strong>
                                                            <button onClick={() => downloadCSV(breachSearchQuery)} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem' }}>Export Breach Report</button>
                                                        </div>
                                                        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', overflowY: 'auto' }}>
                                                            {getImpactedAliasesForBreach().map(alias => (
                                                                <EmailRecord key={alias} alias={alias} breachList={domainResults.aliases[alias]} />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>
    </div>

            </div>
        </div>
    );
}
