"use client";

import { useState } from "react";

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
