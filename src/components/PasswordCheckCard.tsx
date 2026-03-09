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
    const [showInfo, setShowInfo] = useState(false);

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
        <div style={{ background: 'transparent', border: 'none', padding: 0 }}>
            {/* Privacy Notice Box */}
            <div style={{ 
                padding: '1.25rem', 
                background: 'rgba(34, 197, 94, 0.05)', 
                border: '1px solid rgba(16, 185, 129, 0.2)', 
                borderRadius: '12px', 
                marginBottom: '2rem' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '8px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <strong style={{ fontSize: '1rem' }}>Privacy & Security Notice</strong>
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                    This check happens <strong>locally in your browser</strong>. Your actual password is never captured, stored, or sent to any server. We use advanced "k-Anonymity" technology to verify your safety against <strong>13 billion compromised records</strong> while keeping your data 100% private.
                </p>
                <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                        Questions? Email <a href="mailto:infosec@cooperhealth.edu" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>infosec@cooperhealth.edu</a>
                    </p>
                    <button 
                        onClick={() => setShowInfo(!showInfo)}
                        style={{ 
                            background: 'none', 
                            border: 'none', 
                            color: 'var(--accent-primary)', 
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            padding: 0,
                            textDecoration: 'underline'
                        }}
                    >
                        {showInfo ? 'Hide Details' : 'Technical Details'}
                    </button>
                </div>

                {showInfo && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(16, 185, 129, 0.1)', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                        <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>How the Password Risk Check Tool Works</h4>
                        
                        <div style={{ marginBottom: '1.25rem' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>1. Your Password Never Leaves Your Browser</strong>
                            <p style={{ margin: 0, lineHeight: '1.5' }}>
                                When you type a password into this tool, <strong>the actual password is never sent to our servers or anyone else.</strong>
                            </p>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>2. We Use "k-Anonymity" Technology</strong>
                            <p style={{ margin: 0, lineHeight: '1.5' }}>
                                Instead of sending your password, your browser creates a security "fingerprint" called a SHA-1 hash.
                            </p>
                            <ul style={{ paddingLeft: '1.2rem', marginTop: '8px', marginBottom: '8px' }}>
                                <li>Your browser takes only the <strong>first 5 characters</strong> of that fingerprint and sends them to the "Have I Been Pwned" security database.</li>
                                <li>The database sends back a list of thousands of fingerprints that also start with those same 5 characters.</li>
                                <li>Your browser then checks that list locally to see if your full fingerprint is there.</li>
                            </ul>
                            <p style={{ margin: 0, lineHeight: '1.5', fontStyle: 'italic', fontSize: '0.8rem' }}>
                                <strong>Result:</strong> The security database never knows what your password (or even your full fingerprint) is.
                            </p>
                        </div>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>3. Secure and Anonymous</strong>
                            <p style={{ margin: 0, lineHeight: '1.5' }}>
                                <strong>No Storage:</strong> We do not store, log, or track the passwords you check.
                                <br />
                                <strong>Trusted Database:</strong> We query the "Have I Been Pwned" service, which is a world-renowned security resource covering over <strong>13 billion compromised records</strong>.
                            </p>
                        </div>

                        <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.1)' }}>
                            <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>Questions or Concerns?</strong>
                            <p style={{ margin: 0, fontSize: '0.8rem' }}>
                                Your security is our top priority. If you have any questions, please contact the <strong>Cooper Health InfoSec Team</strong> directly at:
                                <br />
                                <a href="mailto:infosec@cooperhealth.edu" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>infosec@cooperhealth.edu</a>
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <h3 style={{ marginBottom: '16px' }}>Password Risk Check</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Safely verify if a password has appeared in a data breach using secure technology.
            </p>

            <form onSubmit={handlePasswordSearch} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
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
