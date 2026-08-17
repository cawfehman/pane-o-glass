"use client";

import React, { useState } from "react";
import { 
    Shield, ShieldAlert, ShieldCheck, Lock, Eye, 
    EyeOff, ChevronDown, ChevronUp, AlertCircle, Info, Sparkles 
} from "lucide-react";

// Helper function to hash passwords for k-Anonymity using Web Crypto API
async function sha1(str: string) {
    const buffer = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
}

export default function PasswordCheckCard() {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [pwdLoading, setPwdLoading] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [pwdResult, setPwdResult] = useState<{ count: number; isPwned: boolean } | null>(null);
    const [showInfo, setShowInfo] = useState(false);

    const handlePasswordSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
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
                throw new Error("Failed to contact Pwned Passwords API. Please check your connection.");
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
                count: foundCount,
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
        <div className="flex flex-col gap-5 w-full">
            {/* Main Interactive Check Card */}
            <div className="glass-card p-6 sm:p-8 bg-bg-surface border border-border-color rounded-2xl shadow-xl">
                <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-bg-dark border border-border-color text-accent-primary">
                            <Lock size={18} />
                        </div>
                        <h2 className="text-lg font-bold text-text-primary m-0">Inspect Password Safety</h2>
                    </div>
                    <span className="text-xs text-text-muted hidden sm:inline">100% Client-Side</span>
                </div>

                <form onSubmit={handlePasswordSearch} className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                    <div className="relative flex-1">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password to test..."
                            disabled={pwdLoading}
                            className="w-full pl-4 pr-11 py-3 bg-bg-dark border border-border-color rounded-xl text-text-primary text-sm outline-none focus:border-accent-primary focus:shadow-glow transition-all"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                            tabIndex={-1}
                            title={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={pwdLoading || !password}
                        className="btn-primary py-3 px-6 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                    >
                        {pwdLoading ? (
                            <>
                                <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                                <span>Scanning...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles size={16} />
                                <span>Check Risk</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Error Banner */}
                {pwdError && (
                    <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-3 animate-in fade-in duration-200">
                        <AlertCircle size={18} className="shrink-0 mt-0.5" />
                        <div>
                            <strong className="font-semibold block">Scan Error</strong>
                            <p className="text-xs text-red-300 mt-0.5 m-0">{pwdError}</p>
                        </div>
                    </div>
                )}

                {/* Results Card */}
                {pwdResult && (
                    <div className="mt-5 animate-in slide-in-from-top-3 duration-300">
                        {!pwdResult.isPwned ? (
                            <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-start gap-3.5 shadow-lg shadow-emerald-500/5">
                                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 shrink-0">
                                    <ShieldCheck size={24} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <strong className="text-base font-bold text-emerald-400">No Breach Matches Found</strong>
                                        <span className="px-2 py-0.5 rounded text-[0.7rem] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                            Clean
                                        </span>
                                    </div>
                                    <p className="text-xs text-emerald-200/90 mt-1 leading-relaxed m-0">
                                        This exact password has not appeared in any known public data leaks across 13+ billion records. Make sure it also meets complexity and uniqueness requirements.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-start gap-3.5 shadow-lg shadow-rose-500/5">
                                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0">
                                    <ShieldAlert size={24} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <strong className="text-base font-bold text-rose-400">Compromised Password Detected!</strong>
                                        <span className="px-2 py-0.5 rounded text-[0.7rem] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                            High Risk
                                        </span>
                                    </div>
                                    <p className="text-xs text-rose-200/90 mt-1 leading-relaxed m-0">
                                        This exact password has appeared <strong>{pwdResult.count.toLocaleString()} times</strong> in confirmed data breaches.
                                    </p>
                                    <div className="mt-3 pt-3 border-t border-rose-500/20 text-xs text-rose-300/80">
                                        ⚠️ <strong>Recommendation:</strong> Do not use this password for any personal or enterprise accounts. Automated attacker wordlists and credential-stuffing bots routinely target it.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Privacy & Technical Disclosure */}
            <div className="glass-card p-5 bg-bg-surface/70 border border-border-color rounded-xl">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <Shield size={18} className="text-emerald-400 shrink-0" />
                        <div>
                            <h3 className="text-xs font-bold text-text-primary m-0 uppercase tracking-wider">Privacy & k-Anonymity Guarantee</h3>
                            <p className="text-xs text-text-muted mt-0.5 m-0">Your password never leaves your browser.</p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="flex items-center gap-1 text-xs font-semibold text-accent-primary hover:text-accent-primary-hover bg-transparent border-none cursor-pointer"
                    >
                        <span>{showInfo ? "Hide Details" : "How it works"}</span>
                        {showInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>

                {showInfo && (
                    <div className="mt-4 pt-4 border-t border-border-color text-xs text-text-secondary leading-relaxed flex flex-col gap-3 animate-in fade-in duration-200">
                        <div>
                            <strong className="text-text-primary block font-semibold mb-0.5">1. Local Cryptographic Hash</strong>
                            <p className="m-0 text-text-muted">
                                Your browser computes a 40-character SHA-1 fingerprint locally in memory using the Web Cryptography API.
                            </p>
                        </div>
                        <div>
                            <strong className="text-text-primary block font-semibold mb-0.5">2. Mathematical k-Anonymity</strong>
                            <p className="m-0 text-text-muted">
                                Only the first 5 characters (e.g. <code className="px-1 py-0.5 bg-bg-dark rounded text-accent-primary">5BAA6</code>) are sent to the database. The server returns thousands of potential matches with that same prefix, and your browser matches the rest locally.
                            </p>
                        </div>
                        <div>
                            <strong className="text-text-primary block font-semibold mb-0.5">3. Zero Logs & Zero Transmission</strong>
                            <p className="m-0 text-text-muted">
                                Neither our servers nor Have I Been Pwned ever receives your password or your complete hash fingerprint.
                            </p>
                        </div>
                        <div className="pt-2 border-t border-border-color/60 text-text-muted">
                            Questions or concerns? Contact <a href="mailto:infosec@cooperhealth.edu" className="text-accent-primary hover:underline">infosec@cooperhealth.edu</a>.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
