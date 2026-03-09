"use client";

import React, { useState } from "react";

// Helper function to hash passwords for k-Anonymity using Web Crypto API
async function sha1(str: string) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

export default function PasswordCheckCard() {
    const [password, setPassword] = useState("");
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [pwdResult, setPwdResult] = useState<{ count: number, isPwned: boolean } | null>(null);

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
        <div className="glass-card" style={{ background: 'var(--bg-surface)' }}>
            <h3 style={{ marginBottom: '16px' }}>Password Risk Check</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Safely checks if a password has been compromised. Uses k-Anonymity 
                (only the first 5 chars of the SHA-1 hash are sent to the HIBP API).
            </p>

            <form onSubmit={handlePasswordSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '1rem' }}>
                <div className="input-group" style={{ flex: 1 }}>
                    <label htmlFor="password">Password to Inspect</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        style={{ background: 'var(--bg-dark)' }}
                        required
                    />
                </div>
                <button type="submit" className="btn-primary" style={{ marginBottom: '2px', background: '#eab308' }} disabled={pwdLoading}>
                    {pwdLoading ? "Checking..." : "Inspect"}
                </button>
            </form>

            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                <strong>Privacy Note:</strong> Your password never leaves this browser. Only the first 5 characters of the hash are shared with the security database.
            </p>

            {pwdError && (
                <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                    <strong>Error:</strong> {pwdError}
                </div>
            )}

            {pwdResult && (
                <div style={{ marginTop: '1rem' }}>
                    {!pwdResult.isPwned ? (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: 'var(--radius-md)', border: '1px solid #22c55e' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <strong>Safe!</strong>
                            </div>
                            <p style={{ marginTop: '4px', fontSize: '0.9rem' }}>This password has not been seen in any known data breaches.</p>
                        </div>
                    ) : (
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                <strong>Compromised!</strong>
                            </div>
                            <p style={{ marginTop: '4px', fontSize: '0.9rem' }}>
                                This exact password has been seen <strong>{pwdResult.count.toLocaleString()}</strong> times in data breaches. Do not use it.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
