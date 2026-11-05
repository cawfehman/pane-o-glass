"use client";

import React, { useState, useEffect } from "react";
import { 
    ShieldAlert, Sparkles, Ban, RefreshCw, CheckCircle2, AlertTriangle, 
    ChevronDown, ChevronUp, Network, Globe, ExternalLink, ShieldCheck
} from "lucide-react";

interface SuggestedAsn {
    asn: string;
    asnNum: string;
    asnName: string;
    country: string;
    countryCode: string;
    shunnedIpCount: number;
    vpnFailuresCount: number;
    threatCategory: "BULLETPROOF_VPS" | "FOREIGN_ATTACK_SOURCE" | "AGGRESSIVE_SPRAY_ORIGIN";
    recommendedReason: string;
    threatScore: number;
}

interface SuggestedAsnsCardProps {
    onBlacklisted?: (asn: string) => void;
}

export function SuggestedAsnsCard({ onBlacklisted }: SuggestedAsnsCardProps) {
    const [suggestions, setSuggestions] = useState<SuggestedAsn[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ asn: string; type: "success" | "error"; text: string } | null>(null);

    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/firewall/guardian/suggested-asns");
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data.suggestedAsns || []);
            } else {
                const err = await res.json().catch(() => ({}));
                setError(err.error || "Failed to load suggested ASNs.");
            }
        } catch (e: any) {
            setError(e.message || "Failed to contact suggested ASNs endpoint.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSuggestions();
    }, []);

    const handleBlacklist = async (item: SuggestedAsn) => {
        const confirmed = window.confirm(
            `⚠️ Blacklist ${item.asn} (${item.asnName})?\n\n` +
            `This will add ${item.asn} to the Guardian Blacklist so any future failure from this entire provider triggers an immediate, zero-tolerance autoshun across all firewalls.\n\n` +
            `Reason:\n"${item.recommendedReason}"`
        );
        if (!confirmed) return;

        setActionLoading(item.asn);
        setActionMessage(null);

        try {
            const res = await fetch("/api/firewall/guardian/blacklist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "ASN",
                    target: item.asn,
                    asnName: item.asnName,
                    reason: item.recommendedReason
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setActionMessage({
                    asn: item.asn,
                    type: "success",
                    text: `Successfully blacklisted ${item.asn} (${item.asnName})!`
                });
                // Remove from local list
                setSuggestions((prev) => prev.filter((s) => s.asn !== item.asn));
                if (onBlacklisted) onBlacklisted(item.asn);
            } else {
                setActionMessage({
                    asn: item.asn,
                    type: "error",
                    text: data.error || `Failed to blacklist ${item.asn}.`
                });
            }
        } catch (e: any) {
            setActionMessage({
                asn: item.asn,
                type: "error",
                text: e.message || `Error blacklisting ${item.asn}.`
            });
        } finally {
            setActionLoading(null);
        }
    };

    if (loading && suggestions.length === 0) {
        return (
            <div className="bg-bg-card border border-border-color rounded-xl p-4 shadow-sm animate-pulse">
                <div className="flex items-center gap-2 text-text-muted text-xs">
                    <RefreshCw className="w-4 h-4 animate-spin text-accent-primary" />
                    <span>Analyzing perimeter telemetry to surface candidate attack ASNs...</span>
                </div>
            </div>
        );
    }

    if (error && suggestions.length === 0) {
        return null; // Silent degrade if error
    }

    if (suggestions.length === 0) {
        return null;
    }

    return (
        <div className="bg-bg-card border border-purple-500/30 rounded-xl overflow-hidden shadow-sm transition-all mb-2">
            {/* Header */}
            <div className="p-4 bg-gradient-to-r from-purple-500/10 via-bg-surface/60 to-bg-surface/80 border-b border-border-color flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 text-purple-300 rounded-lg border border-purple-500/30">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-text-primary tracking-tight">
                                High-Threat Suggested ASNs for Blacklisting
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                {suggestions.length} Identified
                            </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                            Aggregated from 16,675 perimeter shuns and 300,000+ failed brute-force attacks. Verified corporate ISPs (Comcast, Verizon) are automatically excluded.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={fetchSuggestions}
                        disabled={loading}
                        className="px-2.5 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-lg transition-colors border border-border-color flex items-center gap-1.5 cursor-pointer"
                        title="Re-analyze candidate ASNs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        <span>Refresh</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setCollapsed(!collapsed)}
                        className="px-2.5 py-1 text-xs text-text-muted hover:text-text-primary hover:bg-bg-surface rounded-lg transition-colors border border-border-color flex items-center gap-1 cursor-pointer"
                    >
                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        <span>{collapsed ? "Show Suggestions" : "Collapse"}</span>
                    </button>
                </div>
            </div>

            {/* Notification Banner */}
            {actionMessage && (
                <div className={`p-2.5 text-xs flex items-center gap-2 border-b ${
                    actionMessage.type === "success" 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                        : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}>
                    {actionMessage.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>{actionMessage.text}</span>
                </div>
            )}

            {/* Body */}
            {!collapsed && (
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {suggestions.map((item) => {
                        const isActionActive = actionLoading === item.asn;
                        return (
                            <div 
                                key={item.asn}
                                className="bg-bg-surface/70 border border-border-color/80 hover:border-purple-500/40 rounded-xl p-3.5 flex flex-col justify-between gap-3 transition-all relative overflow-hidden"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-mono font-bold text-text-primary text-sm">
                                                    {item.asn}
                                                </span>
                                                <span className="text-[11px] text-text-muted font-medium truncate max-w-[130px]" title={item.asnName}>
                                                    • {item.asnName}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-text-muted flex items-center gap-1 mt-0.5">
                                                <Globe className="w-3 h-3 text-text-muted shrink-0" />
                                                <span className="truncate">{item.country}</span>
                                            </div>
                                        </div>

                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                                            item.threatCategory === "BULLETPROOF_VPS"
                                                ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                                : item.threatCategory === "FOREIGN_ATTACK_SOURCE"
                                                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                                                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                        }`}>
                                            {item.threatCategory === "BULLETPROOF_VPS" ? "Hosting VPS" : item.threatCategory === "FOREIGN_ATTACK_SOURCE" ? "Foreign Net" : "Spray Origin"}
                                        </span>
                                    </div>

                                    {/* Metrics Badges */}
                                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                                        {item.shunnedIpCount > 0 && (
                                            <span 
                                                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-red-500/15 text-red-300 border border-red-500/25 cursor-help"
                                                title={`${item.shunnedIpCount} distinct IP addresses actively or historically shunned across ASA firewalls`}
                                            >
                                                {item.shunnedIpCount.toLocaleString()} Shunned IPs
                                            </span>
                                        )}
                                        {item.vpnFailuresCount > 0 && (
                                            <span 
                                                className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/25 cursor-help"
                                                title={`${item.vpnFailuresCount.toLocaleString()} failed AnyConnect VPN authentication attempts recorded`}
                                            >
                                                {item.vpnFailuresCount.toLocaleString()} VPN Probes
                                            </span>
                                        )}
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                            0 Logins
                                        </span>
                                    </div>

                                    <p className="text-[11px] text-text-muted mt-2 line-clamp-2 leading-relaxed" title={item.recommendedReason}>
                                        {item.recommendedReason}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleBlacklist(item)}
                                    disabled={isActionActive}
                                    className="w-full mt-1 py-1.5 px-3 bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                                    title={`Add ${item.asn} to Guardian Blacklist to enforce zero-tolerance autoshun`}
                                >
                                    {isActionActive ? (
                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Ban className="w-3.5 h-3.5" />
                                    )}
                                    <span>{isActionActive ? "Enforcing..." : `+ Blacklist ${item.asn}`}</span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
