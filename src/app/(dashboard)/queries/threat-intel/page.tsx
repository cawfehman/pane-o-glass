"use client";

import { useState } from "react";
import { Globe, Search, ShieldAlert, ShieldCheck, Activity, Terminal, AlertTriangle, Info, Database, Compass, CheckCircle, ExternalLink } from "lucide-react";
import { ToolHelp } from "@/components/ToolHelp";

export default function ThreatIntelPage() {
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
            const res = await fetch(`/api/threat-intel?query=${encodeURIComponent(query.trim())}`);
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to fetch threat intelligence data.");
            }

            setResult(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Helper to render severity badge
    const renderReputationBadge = (status: string) => {
        switch (status) {
            case "clean":
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                        <ShieldCheck size={14} /> BENIGN / CLEAN
                    </span>
                );
            case "suspicious":
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'rgba(234, 179, 8, 0.1)', color: '#eab308', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                        <AlertTriangle size={14} /> SUSPICIOUS
                    </span>
                );
            case "malicious":
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                        <ShieldAlert size={14} /> MALICIOUS
                    </span>
                );
            case "internal":
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                        <Database size={14} /> INTERNAL RANGE
                    </span>
                );
            default:
                return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', background: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', fontSize: '0.85rem', fontWeight: 600, border: '1px solid rgba(156, 163, 175, 0.2)' }}>
                        <Info size={14} /> UNKNOWN
                    </span>
                );
        }
    };

    return (
        <div className="internal-scroll-layout" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flexShrink: 0 }}>
                {/* Header */}
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Globe size={32} color="var(--accent-primary)" />
                        Threat Intelligence Reputation
                        <ToolHelp toolId="threat-intel" iconSize={24} />
                    </h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        Forensic indicator analysis correlating local DNS query resolution with Cisco Umbrella threat classification.
                    </p>
                </div>

                {/* Input Form */}
                <form onSubmit={handleSearch} className="glass-card" style={{ display: 'flex', gap: '16px', padding: '16px', marginBottom: '24px' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Enter domain name, public/private IP, or MD5/SHA256 signature hash..."
                            style={{
                                width: '100%',
                                padding: '14px 16px 14px 44px',
                                borderRadius: '8px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-card)',
                                color: 'var(--text-primary)',
                                fontSize: '1rem',
                                outline: 'none'
                            }}
                            disabled={loading}
                        />
                        <Search style={{ position: 'absolute', left: '16px', top: '15px', color: 'var(--text-muted)' }} size={20} />
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '0 32px', borderRadius: '8px', fontWeight: 'bold' }}>
                        {loading ? "Searching..." : "Analyze Indicator"}
                    </button>
                </form>

                {/* Error Message */}
                {error && (
                    <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', padding: '16px', marginBottom: '24px' }}>
                        <strong>Lookup Failed:</strong> {error}
                    </div>
                )}

                {/* Loading Spinner */}
                {loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
                        <div className="spinner-large" style={{ border: '3px solid var(--border-color)', borderTop: '3px solid var(--accent-primary)', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }}></div>
                        <p style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Querying global security feeds and resolving records...</p>
                    </div>
                )}

                {/* Snapshot Card (Summary & Info) */}
                {result && !loading && (
                    <div className="animate-fadeIn" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                            {/* Summary Card */}
                            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px' }}>
                                <div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Indicator Classification ({result.type.toUpperCase()})
                                    </span>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '8px 0 16px 0', wordBreak: 'break-all' }}>
                                        {result.query}
                                    </h2>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Reputation Severity</div>
                                        <div style={{ marginTop: '4px' }}>{renderReputationBadge(result.details.reputation.status)}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Malicious Threat Index</div>
                                        <div style={{ fontSize: '2rem', fontWeight: 800, color: result.details.reputation.score > 70 ? '#ef4444' : result.details.reputation.score > 30 ? '#eab308' : '#22c55e' }}>
                                            {result.details.reputation.score}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/100</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Additional Info depending on type */}
                            {result.type === "ip" && (
                                <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                            <Compass size={18} /> Network & Geolocation Metadata
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>ISP/Carrier (Base):</span>
                                                <span style={{ fontWeight: 600 }}>{result.details.geo.asn ? `ASN${result.details.geo.asn} (${result.details.geo.as_name || 'Unknown'})` : 'N/A'}</span>
                                            </div>
                                            {result.details.iplocate?.org && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Enriched Org:</span>
                                                    <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{result.details.iplocate.org}</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Location Origin:</span>
                                                <span style={{ fontWeight: 600 }}>
                                                    {result.details.iplocate?.city && result.details.iplocate?.subdivision 
                                                        ? `${result.details.iplocate.city}, ${result.details.iplocate.subdivision}, ${result.details.iplocate.country_code}`
                                                        : `${result.details.geo.country || 'N/A'} (${result.details.geo.country_code || 'N/A'})`
                                                    }
                                                </span>
                                            </div>
                                            {result.details.iplocate?.time_zone && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Local Timezone:</span>
                                                    <span style={{ fontWeight: 600 }}>{result.details.iplocate.time_zone}</span>
                                                </div>
                                            )}
                                            {result.details.iplocate?.latitude != null && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>Exact Coordinates:</span>
                                                    <span style={{ fontWeight: 600 }}>
                                                        <a 
                                                            href={`https://www.google.com/maps?q=${result.details.iplocate.latitude},${result.details.iplocate.longitude}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ color: 'var(--accent-primary)', textDecoration: 'none', borderBottom: '1px dotted var(--accent-primary)' }}
                                                        >
                                                            {result.details.iplocate.latitude.toFixed(4)}, {result.details.iplocate.longitude.toFixed(4)}
                                                        </a>
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Domain Space:</span>
                                                <span style={{ fontWeight: 600 }}>{result.details.geo.as_domain || 'N/A'}</span>
                                            </div>
                                        </div>

                                        {result.details.iplocate && (
                                            <details style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                                                <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 600, outline: 'none' }}>
                                                    Inspect Raw Geo JSON Payload
                                                </summary>
                                                <pre style={{
                                                    background: 'rgba(0, 0, 0, 0.35)',
                                                    padding: '10px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    overflowX: 'auto',
                                                    marginTop: '8px',
                                                    fontFamily: 'monospace',
                                                    color: 'var(--text-secondary)',
                                                    border: '1px solid var(--border-color)',
                                                    textAlign: 'left'
                                                }}>
                                                    {JSON.stringify(result.details.iplocate, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                    {!result.details.isPrivate && (
                                        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                                            <a 
                                                href={`https://investigate.umbrella.com/ip-view/${encodeURIComponent(result.query)}`}
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--accent-primary)', textDecoration: 'none' }}
                                            >
                                                Investigate IP in Umbrella <ExternalLink size={14} />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}

                            {result.type === "domain" && (
                                <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                            <Activity size={18} /> Cisco Umbrella Threat Intelligence
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Source Feed:</span>
                                                <span style={{ fontWeight: 600, color: result.details.reputation.source === 'live' ? '#22c55e' : '#eab308' }}>
                                                    {result.details.reputation.source === 'live' ? 'Umbrella API (Live)' : 'Heuristic Engine (Offline)'}
                                                </span>
                                            </div>
                                            {result.details.reputation.error && (
                                                <div style={{ fontSize: '0.75rem', color: '#ef4444', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '4px', border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                                    ⚠️ {result.details.reputation.error}
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Security Status:</span>
                                                <span style={{ fontWeight: 600, color: result.details.reputation.status === 'malicious' ? '#ef4444' : '#22c55e' }}>
                                                    {result.details.reputation.status === 'malicious' ? 'Flagged Malicious' : 'Clean Classification'}
                                                </span>
                                            </div>
                                            <div>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Umbrella Categories:</span>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                    {result.details.reputation.categories && result.details.reputation.categories.length > 0 ? (
                                                        result.details.reputation.categories.map((cat: string, index: number) => (
                                                            <span key={index} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', fontSize: '0.75rem', border: '1px solid var(--border-color)' }}>
                                                                {cat}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Uncategorized</span>
                                                    )}
                                                </div>
                                            </div>
                                            {result.details.reputation.securityCategories && result.details.reputation.securityCategories.length > 0 && (
                                                <div>
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Security Threat Tags:</span>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                                        {result.details.reputation.securityCategories.map((cat: string, index: number) => (
                                                            <span key={index} style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', border: '1px solid rgba(239, 68, 68, 0.2)', fontWeight: 600 }}>
                                                                {cat}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px', textAlign: 'right' }}>
                                        <a 
                                            href={`https://investigate.umbrella.com/domain-view/${encodeURIComponent(result.query)}`}
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--accent-primary)', textDecoration: 'none' }}
                                        >
                                            Investigate Domain in Umbrella <ExternalLink size={14} />
                                        </a>
                                    </div>
                                </div>
                            )}

                            {result.type === "hash" && (
                                <div className="glass-card" style={{ padding: '24px' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                                        <Database size={18} /> Malware Fingerprint Metadata
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Hash Algorithm:</span>
                                            <span style={{ fontWeight: 600 }}>{result.details.hashType}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Detected Malware:</span>
                                            <span style={{ fontWeight: 600, color: result.details.reputation.malwareFamily ? '#ef4444' : 'var(--text-primary)' }}>
                                                {result.details.reputation.malwareFamily || "No threat signature found"}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Verification Authority:</span>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{result.details.reputation.signatureDatabase}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Scrollable details below */}
            {result && !loading && (
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* Threat Analysis Factors / Log events */}
                    <div className="glass-card" style={{ padding: '24px' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                            Forensic Threat Assessment
                        </h3>
                        {result.type === "ip" && (
                            <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', margin: 0 }}>
                                {result.details.reputation.factors.map((factor: string, index: number) => (
                                    <li key={index} style={{ fontSize: '0.95rem', color: result.details.reputation.status === 'malicious' ? '#ef4444' : result.details.reputation.status === 'suspicious' ? '#eab308' : 'var(--text-primary)' }}>
                                        {factor}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {result.type === "domain" && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                                    {result.details.reputation.status === "malicious" 
                                        ? "This domain has been flagged by Cisco Umbrella Investigate as active in security threat propagation campaigns."
                                        : "Cisco Umbrella resolved the domain name without identifying active phishing, C2, or botnet associations."
                                    }
                                </p>
                            </div>
                        )}
                        {result.type === "hash" && (
                            <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', margin: 0 }}>
                                {result.details.reputation.status === "malicious"
                                    ? `Alert: The file signature matches a signature inside the known threats repository: ${result.details.reputation.malwareFamily}. Flagged as critical risk.`
                                    : "No known malware definitions in our threat signature repository map to this hash fingerprint. Recommended to scan the binary on a sandbox workstation if received from unverified sources."
                                }
                            </p>
                        )}
                    </div>

                    {/* DNS Records Tab (Domains Only) */}
                    {result.type === "domain" && result.details.dns && (
                        <div className="glass-card" style={{ padding: '24px' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Terminal size={18} /> Direct Name Server Resolution Diagnostics
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Address Records (A)</h4>
                                    {result.details.dns.A && result.details.dns.A.length > 0 ? (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {result.details.dns.A.map((ip: string, i: number) => (
                                                <code key={i} style={{ padding: '6px 12px', background: 'rgba(0,0,0,0.3)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--accent-primary)', border: '1px solid var(--border-color)' }}>{ip}</code>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No A records returned.</span>
                                    )}
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Mail Exchanger Records (MX)</h4>
                                    {result.details.dns.MX && result.details.dns.MX.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {result.details.dns.MX.map((mx: any, i: number) => (
                                                <code key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                    Priority: <b style={{ color: 'var(--accent-primary)' }}>{mx.priority}</b> &rarr; Host: <b>{mx.exchange}</b>
                                                </code>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No MX records returned.</span>
                                    )}
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Name Server Records (NS)</h4>
                                    {result.details.dns.NS && result.details.dns.NS.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {result.details.dns.NS.map((ns: string, i: number) => (
                                                <code key={i} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{ns}</code>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No NS records returned.</span>
                                    )}
                                </div>
                                <div>
                                    <h4 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Text Declarations (TXT)</h4>
                                    {result.details.dns.TXT && result.details.dns.TXT.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {result.details.dns.TXT.map((txt: string[], i: number) => (
                                                <pre key={i} style={{ margin: 0, padding: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                                                    {txt.join(' ')}
                                                </pre>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>No TXT records returned.</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Audit warning footer */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>
                        <CheckCircle size={14} color="var(--accent-primary)" />
                        <span>Verification and audit logger active. All queries logged to security log database.</span>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-out forwards;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
