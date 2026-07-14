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
        <div className="bg-transparent border-none p-0">
            {/* Privacy Notice Box */}
            <div className="p-5 bg-green-500/5 border border-emerald-500/20 rounded-xl mb-8">
                <div className="flex items-center gap-2 text-emerald-500 mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    <strong className="text-base">Privacy & Security Notice</strong>
                </div>
                <p className="text-[0.9rem] text-text-secondary leading-relaxed m-0">
                    This check happens <strong>locally in your browser</strong>. Your actual password is never captured, stored, or sent to any server. We use advanced "k-Anonymity" technology to verify your safety against <strong>13 billion compromised records</strong> while keeping your data 100% private.
                </p>
                <div className="mt-3 flex justify-between items-center">
                    <p className="text-sm text-text-muted m-0">
                        Questions? Email <a href="mailto:infosec@cooperhealth.edu" className="text-accent-primary no-underline">infosec@cooperhealth.edu</a>
                    </p>
                    <button 
                        onClick={() => setShowInfo(!showInfo)}
                        className="bg-transparent border-none text-accent-primary cursor-pointer text-sm p-0 underline"
                    >
                        {showInfo ? 'Hide Details' : 'Technical Details'}
                    </button>
                </div>

                {showInfo && (
                    <div className="mt-6 pt-6 border-t border-emerald-500/10 text-[0.875rem] text-text-secondary">
                        <h4 className="text-text-primary mb-4">How the Password Risk Check Tool Works</h4>
                        
                        <div className="mb-5">
                            <strong className="text-text-primary block mb-1">1. Your Password Never Leaves Your Browser</strong>
                            <p className="m-0 leading-relaxed">
                                When you type a password into this tool, <strong>the actual password is never sent to our servers or anyone else.</strong>
                            </p>
                        </div>

                        <div className="mb-5">
                            <strong className="text-text-primary block mb-1">2. We Use "k-Anonymity" Technology</strong>
                            <p className="m-0 leading-relaxed">
                                Instead of sending your password, your browser creates a security "fingerprint" called a SHA-1 hash.
                            </p>
                            <ul className="pl-5 my-2">
                                <li>Your browser takes only the <strong>first 5 characters</strong> of that fingerprint and sends them to the "Have I Been Pwned" security database.</li>
                                <li>The database sends back a list of thousands of fingerprints that also start with those same 5 characters.</li>
                                <li>Your browser then checks that list locally to see if your full fingerprint is there.</li>
                            </ul>
                            <p className="m-0 leading-relaxed italic text-sm">
                                <strong>Result:</strong> The security database never knows what your password (or even your full fingerprint) is.
                            </p>
                        </div>

                        <div className="mb-5">
                            <strong className="text-text-primary block mb-1">3. Secure and Anonymous</strong>
                            <p className="m-0 leading-relaxed">
                                <strong>No Storage:</strong> We do not store, log, or track the passwords you check.
                                <br />
                                <strong>Trusted Database:</strong> We query the "Have I Been Pwned" service, which is a world-renowned security resource covering over <strong>13 billion compromised records</strong>.
                            </p>
                        </div>

                        <div className="bg-sky-400/5 p-4 rounded-lg border border-sky-400/10">
                            <strong className="text-text-primary block mb-1">Questions or Concerns?</strong>
                            <p className="m-0 text-sm">
                                Your security is our top priority. If you have any questions, please contact the <strong>Cooper Health InfoSec Team</strong> directly at:
                                <br />
                                <a href="mailto:infosec@cooperhealth.edu" className="text-accent-primary no-underline">infosec@cooperhealth.edu</a>
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <h3 className="mb-4">Password Risk Check</h3>
            <p className="text-text-muted text-sm mb-6">
                Safely verify if a password has appeared in a data breach using secure technology.
            </p>

            <form onSubmit={handlePasswordSearch} className="flex gap-4 items-end mb-6">
                <div className="input-group flex-1">
                    <label htmlFor="password">Password to Inspect</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="bg-bg-dark"
                        required
                    />
                </div>
                <button type="submit" className="btn-primary mb-0.5 bg-yellow-500" disabled={pwdLoading}>
                    {pwdLoading ? "Checking..." : "Inspect"}
                </button>
            </form>

            {pwdError && (
                <div className="p-4 bg-red-500/10 text-red-500 rounded-[var(--radius-md)] border border-red-500">
                    <strong>Error:</strong> {pwdError}
                </div>
            )}

            {pwdResult && (
                <div className="mt-4">
                    {!pwdResult.isPwned ? (
                        <div className="p-4 bg-green-500/10 text-green-500 rounded-[var(--radius-md)] border border-green-500">
                            <div className="flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                <strong>Safe!</strong>
                            </div>
                            <p className="mt-1 text-[0.9rem]">This password has not been seen in any known data breaches.</p>
                        </div>
                    ) : (
                        <div className="p-4 bg-red-500/10 text-red-500 rounded-[var(--radius-md)] border border-red-500">
                            <div className="flex items-center gap-2">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                <strong>Compromised!</strong>
                            </div>
                            <p className="mt-1 text-[0.9rem]">
                                This exact password has been seen <strong>{pwdResult.count.toLocaleString()}</strong> times in data breaches. Do not use it.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
