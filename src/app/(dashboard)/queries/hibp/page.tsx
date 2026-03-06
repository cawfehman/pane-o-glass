"use client";

import { useState, useEffect } from "react";

// Helper function to hash passwords for k-Anonymity using Web Crypto API
async function sha1(str: string) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

export default function HIBPQueryPage() {
    // Email Search State
    const [account, setAccount] = useState("");
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState("");
    const [emailResults, setEmailResults] = useState<{ hasBreaches: boolean, breaches: any[] } | null>(null);

    // Password Search State
    const [password, setPassword] = useState("");
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [pwdResult, setPwdResult] = useState<{ count: number, isPwned: boolean } | null>(null);

    // Domain Search State
    const [domainStr, setDomainStr] = useState("");
    const [availableDomains, setAvailableDomains] = useState<{ DomainName: string }[]>([]);
    const [domainLoading, setDomainLoading] = useState(false);
    const [domainError, setDomainError] = useState("");
    const [domainResults, setDomainResults] = useState<{ hasBreaches: boolean, aliases: Record<string, string[]> } | null>(null);
    const [activeView, setActiveView] = useState<"all" | "breaches" | "summary" | null>(null);

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
        fetchDomains();
    }, []);

    const handleEmailSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailLoading(true);
        setEmailError("");
        setEmailResults(null);

        try {
            const res = await fetch("/api/hibp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to query HIBP");
            }

            const data = await res.json();
            setEmailResults(data);
        } catch (err: any) {
            setEmailError(err.message || "An unexpected error occurred");
        } finally {
            setEmailLoading(false);
        }
    };

    const handlePasswordSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwdLoading(true);
        setPwdError("");
        setPwdResult(null);

        try {
            // k-Anonymity logic
            const fullHash = await sha1(password);
            const prefix = fullHash.substring(0, 5);
            const suffix = fullHash.substring(5);

            // Fetch list of matching suffixes from HIBP directly (no API key needed)
            const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
            if (!res.ok) {
                throw new Error("Failed to contact Pwned Passwords API");
            }

            const text = await res.text();
            const lines = text.split("\n");

            let foundCount = 0;
            for (const line of lines) {
                const [hashSuffix, count] = line.split(":");
                if (hashSuffix.trim() === suffix) {
                    foundCount = parseInt(count.trim(), 10) || 0;
                    break;
                }
            }

            setPwdResult({
                isPwned: foundCount > 0,
                count: foundCount
            });
            // Clear the password field for security
            setPassword("");

        } catch (err: any) {
            setPwdError(err.message || "An unexpected error occurred");
        } finally {
            setPwdLoading(false);
        }
    };

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
        // Only fetch if we don't already have results for this specific domain
        // (In a real app, you might want a way to force refresh, but for now we cache locally)
        if (!domainResults) {
            await fetchDomainData();
        }
    };

    // --- Data Aggregation Helpers for Domain Search ---

    // 1. Get unique breaches and how many aliases were impacted by each
    const getBreachCounts = () => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const counts: Record<string, number> = {};
        Object.values(domainResults.aliases).forEach(breaches => {
            breaches.forEach(b => {
                counts[b] = (counts[b] || 0) + 1;
            });
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]); // Sort by count descending
    };

    // 2. Get top N impacted aliases
    const getTopAliases = (limit: number) => {
        if (!domainResults || !domainResults.hasBreaches) return [];
        const mapped = Object.entries(domainResults.aliases).map(([alias, breaches]) => ({
            alias,
            count: breaches.length
        }));
        return mapped.sort((a, b) => b.count - a.count).slice(0, limit);
    };

    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1>Have I Been Pwned?</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Check if your email or passwords have been compromised in data breaches.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

                {/* --- EMAIL SEARCH CARD --- */}
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px' }}>Email & Account Check</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Queries the HIBP database to see if this email was involved in a known breach.
                    </p>

                    <form onSubmit={handleEmailSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '2rem' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label htmlFor="account">Email Address or Username</label>
                            <input
                                type="text"
                                id="account"
                                value={account}
                                onChange={(e) => setAccount(e.target.value)}
                                placeholder="name@example.com"
                                required
                            />
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginBottom: '2px' }} disabled={emailLoading}>
                            {emailLoading ? "Checking..." : "Search"}
                        </button>
                    </form>

                    {emailError && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                            <strong>Error:</strong> {emailError}
                        </div>
                    )}

                    {emailResults && (
                        <div style={{ marginTop: '1rem' }}>
                            {!emailResults.hasBreaches ? (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                    <strong>Good news!</strong> No pwnage found for this account.
                                </div>
                            ) : (
                                <div>
                                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                        <strong>Oh no...</strong> Pwned in {emailResults.breaches.length} data breaches.
                                    </div>
                                    <div style={{ display: 'grid', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        {emailResults.breaches.map((breach: any) => (
                                            <div key={breach.Name} style={{ background: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <strong style={{ fontSize: '1.1rem', color: 'var(--accent-primary)' }}>{breach.Title}</strong>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{breach.BreachDate}</span>
                                                </div>
                                                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }} dangerouslySetInnerHTML={{ __html: breach.Description }}></p>
                                                <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    {breach.DataClasses.map((dc: string) => (
                                                        <span key={dc} style={{ background: 'var(--bg-surface-hover)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-muted)' }}>{dc}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* --- DOMAIN SEARCH CARD --- */}
                <div className="glass-card">
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
                                        setDomainResults(null); // clear results when domain changes
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '2rem' }}>
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

                    {domainError && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                            <strong>Error:</strong> {domainError}
                        </div>
                    )}

                    {domainResults && activeView && (
                        <div style={{ marginTop: '1rem' }}>
                            {!domainResults.hasBreaches ? (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                    <strong>Clean!</strong> No known breaches found for any email addresses on {domainStr}.
                                </div>
                            ) : (
                                <div>

                                    {/* VIEW 1: All Aliases */}
                                    {activeView === 'all' && (
                                        <>
                                            <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444', marginBottom: '1rem' }}>
                                                <strong>{Object.keys(domainResults.aliases).length} Impacted Email Aliases Found</strong>
                                            </div>
                                            <div style={{ display: 'grid', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                {Object.entries(domainResults.aliases).map(([alias, breachList]: [string, any]) => (
                                                    <div key={alias} style={{ background: 'var(--bg-dark)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                            <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>{alias}@{domainStr}</strong>
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {breachList.map((breachName: string) => (
                                                                <span key={breachName} style={{ background: 'rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '12px', color: '#fca5a5' }}>
                                                                    {breachName}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}

                                    {/* VIEW 2: Unique Domain Breaches */}
                                    {activeView === 'breaches' && (
                                        <>
                                            <div style={{ padding: '1rem', backgroundColor: 'rgba(56,189,248,0.1)', color: '#38bdf8', borderRadius: 'var(--radius-md)', border: '1px solid #38bdf8', marginBottom: '1rem' }}>
                                                <strong>{getBreachCounts().length} Unique Breaches Affecting {domainStr}</strong>
                                            </div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'var(--bg-dark)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-surface-hover)' }}>
                                                        <th style={{ padding: '12px 16px' }}>Breach Name</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Impacted Emails</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {getBreachCounts().map(([breachName, count]) => (
                                                        <tr key={breachName} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ padding: '12px 16px', fontWeight: 500, color: 'var(--accent-primary)' }}>{breachName}</td>
                                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                                <span style={{ background: 'rgba(239,68,68,0.2)', padding: '4px 10px', borderRadius: '12px', color: '#fca5a5', fontSize: '0.85rem' }}>
                                                                    {count}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </>
                                    )}

                                    {/* VIEW 3: Executive Summary */}
                                    {activeView === 'summary' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                            <div>
                                                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>Top 10 Worst Breaches</h4>
                                                <div style={{ display: 'grid', gap: '8px' }}>
                                                    {getBreachCounts().slice(0, 10).map(([breachName, count], idx) => (
                                                        <div key={breachName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-dark)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                            <span style={{ color: 'var(--text-secondary)' }}>
                                                                <span style={{ color: 'var(--text-muted)', marginRight: '8px' }}>#{idx + 1}</span>
                                                                {breachName}
                                                            </span>
                                                            <span style={{ fontWeight: 600, color: '#fca5a5' }}>{count} org accounts</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <h4 style={{ color: 'var(--text-primary)', marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>Top 25 Most Compromised Aliases</h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                                                    {getTopAliases(25).map((aliasObj, idx) => (
                                                        <div key={aliasObj.alias} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-hover)', padding: '8px 16px', borderRadius: 'var(--radius-sm)' }}>
                                                            <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {aliasObj.alias}@{domainStr}
                                                            </span>
                                                            <span style={{ background: 'var(--bg-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', color: '#fca5a5', whiteSpace: 'nowrap' }}>
                                                                In {aliasObj.count} breaches
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* --- PASSWORD SEARCH CARD --- */}
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px' }}>Password Risk Check</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                        Safely checks if a password has been compromised. Uses k-Anonymity (only the first 5 chars of the SHA-1 hash are sent to the API).
                    </p>

                    <form onSubmit={handlePasswordSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '2rem' }}>
                        <div className="input-group" style={{ flex: 1 }}>
                            <label htmlFor="password">Password</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••••••"
                                required
                            />
                        </div>
                        <button type="submit" className="btn-primary" style={{ marginBottom: '2px', background: '#eab308' }} disabled={pwdLoading}>
                            {pwdLoading ? "Checking..." : "Inspect"}
                        </button>
                    </form>

                    {pwdError && (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                            <strong>Error:</strong> {pwdError}
                        </div>
                    )}

                    {pwdResult && (
                        <div style={{ marginTop: '1rem' }}>
                            {!pwdResult.isPwned ? (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                                    <strong>Safe!</strong> This password has not been seen in any known data breaches.
                                </div>
                            ) : (
                                <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                                    <strong>Compromised!</strong> This exact password has been seen <strong>{pwdResult.count.toLocaleString()}</strong> times in data breaches. Do not use it.
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
