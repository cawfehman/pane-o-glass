"use client";

import React, { useState } from "react";
import { 
    Shield, ShieldAlert, ShieldCheck, Lock, Eye, 
    EyeOff, AlertCircle, Sparkles, CheckCircle2, 
    HelpCircle, Mail, Globe, ServerOff 
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

    const handlePasswordSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        setPwdLoading(true);
        setPwdError("");
        setPwdResult(null);

        try {
            // Compute cryptographic hash locally on the user's computer
            const fullHash = await sha1(password);
            const prefix = fullHash.substring(0, 5);
            const suffix = fullHash.substring(5);

            // Fetch matching hash prefixes from HIBP directly (no plaintext password sent)
            const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
            if (!res.ok) {
                throw new Error("Failed to contact the password safety database. Please check your internet connection.");
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
            setPwdError(err.message || "An unexpected error occurred. Please try again.");
        } finally {
            setPwdLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-8 w-full">
            {/* Main Interactive Check Card */}
            <div className="glass-card p-6 sm:p-10 bg-bg-surface border border-border-color rounded-2xl shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-bg-dark border border-border-color text-accent-primary">
                        <Lock size={22} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-text-primary m-0">Test a Password</h2>
                        <p className="text-sm text-text-muted mt-0.5 m-0">Type or paste any password to check its exposure history.</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordSearch} className="flex flex-col sm:flex-row gap-3.5 items-stretch">
                    <div className="relative flex-1">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password to check..."
                            disabled={pwdLoading}
                            className="w-full pl-5 pr-12 py-4 bg-bg-dark border border-border-color rounded-xl text-text-primary text-base sm:text-lg outline-none focus:border-accent-primary focus:shadow-glow transition-all"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 text-text-muted hover:text-text-primary transition-colors bg-transparent border-none cursor-pointer"
                            tabIndex={-1}
                            title={showPassword ? "Hide password" : "Show password"}
                        >
                            {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={pwdLoading || !password}
                        className="btn-primary py-4 px-8 rounded-xl text-base font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-accent-primary/25 hover:shadow-accent-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
                    >
                        {pwdLoading ? (
                            <>
                                <span className="animate-spin inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full" />
                                <span>Checking...</span>
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                <span>Check Safety</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Error Banner */}
                {pwdError && (
                    <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-base flex items-start gap-3 animate-in fade-in duration-200">
                        <AlertCircle size={22} className="shrink-0 mt-0.5" />
                        <div>
                            <strong className="font-semibold block text-base">Check Failed</strong>
                            <p className="text-sm text-red-300 mt-1 m-0">{pwdError}</p>
                        </div>
                    </div>
                )}

                {/* Results Card */}
                {pwdResult && (
                    <div className="mt-6 animate-in slide-in-from-top-3 duration-300">
                        {!pwdResult.isPwned ? (
                            <div className="p-6 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/40 text-emerald-400 flex flex-col sm:flex-row items-start gap-4 shadow-xl shadow-emerald-500/10">
                                <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-300 shrink-0">
                                    <ShieldCheck size={32} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <strong className="text-xl font-bold text-emerald-300">Good News — No Breaches Found</strong>
                                        <span className="px-2.5 py-0.5 rounded-md text-xs font-black uppercase bg-emerald-500/25 text-emerald-200 border border-emerald-500/40">
                                            Safe
                                        </span>
                                    </div>
                                    <p className="text-base text-emerald-100/90 leading-relaxed m-0 mt-2">
                                        This exact password has <strong>not</strong> appeared in any known public data leaks across 13+ billion records.
                                    </p>
                                    <p className="text-sm text-emerald-200/80 leading-relaxed m-0 mt-2">
                                        Remember to use a unique password for each account and enable multi-factor authentication (MFA) whenever possible.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-6 rounded-2xl bg-rose-500/10 border-2 border-rose-500/40 text-rose-400 flex flex-col sm:flex-row items-start gap-4 shadow-xl shadow-rose-500/10">
                                <div className="p-3 rounded-2xl bg-rose-500/20 text-rose-300 shrink-0">
                                    <ShieldAlert size={32} />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <strong className="text-xl font-bold text-rose-300">Warning — This Password Was Found in a Breach!</strong>
                                        <span className="px-2.5 py-0.5 rounded-md text-xs font-black uppercase bg-rose-500/25 text-rose-200 border border-rose-500/40">
                                            Compromised
                                        </span>
                                    </div>
                                    <p className="text-base text-rose-100/90 leading-relaxed m-0 mt-2">
                                        This password has appeared <strong className="text-white underline decoration-rose-400 underline-offset-2">{pwdResult.count.toLocaleString()} times</strong> in confirmed public data leaks.
                                    </p>
                                    <div className="mt-4 p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-sm text-rose-200 leading-relaxed">
                                        ⚠️ <strong>What should you do?</strong> Do not use this password for your work, email, banking, or personal accounts. Because it is public, hackers and automated bots routinely try it to break into accounts.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* How Your Privacy Is Protected (Always Open & Visible) */}
            <div className="glass-card p-6 sm:p-8 bg-bg-surface border border-border-color rounded-2xl shadow-md">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Shield size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg sm:text-xl font-bold text-text-primary m-0">How Your Privacy Is Protected</h2>
                        <p className="text-sm text-text-secondary mt-0.5 m-0">We designed this tool so you can check passwords with 100% peace of mind.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Step 1 */}
                    <div className="p-5 rounded-xl bg-bg-dark border border-border-color flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-accent-primary font-bold text-base">
                            <ServerOff size={20} />
                            <span>1. Kept on Your Device</span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed m-0">
                            Your password is <strong>never sent across the internet</strong>. The check is performed right here on your computer or phone.
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="p-5 rounded-xl bg-bg-dark border border-border-color flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                            <Globe size={20} />
                            <span>2. Anonymous Lookup</span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed m-0">
                            Your device creates an anonymous mathematical code and checks only a small piece of it against billions of known breach records.
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="p-5 rounded-xl bg-bg-dark border border-border-color flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-accent-tertiary font-bold text-base">
                            <EyeOff size={20} />
                            <span>3. Zero Stored Data</span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed m-0">
                            We do not record, track, save, or log anything you type. Once you leave this page, all entered text is permanently gone.
                        </p>
                    </div>
                </div>

                {/* Contact Help Footer */}
                <div className="mt-6 pt-5 border-t border-border-color flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-sm text-text-muted">
                    <span className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        Powered by Have I Been Pwned & Cooper Information Security
                    </span>
                    <span className="flex items-center gap-1.5 text-text-secondary">
                        <Mail size={15} />
                        Questions? <a href="mailto:infosec@cooperhealth.edu" className="text-accent-primary hover:underline font-semibold">infosec@cooperhealth.edu</a>
                    </span>
                </div>
            </div>
        </div>
    );
}
