"use client";

import { useState } from "react";
import {
    AlertTriangle, ChevronDown, ChevronRight, ExternalLink, History,
    ShieldCheck, ShieldAlert, Users, Activity, Info
} from "lucide-react";

type Severity = "critical" | "high" | "medium" | "info" | "mitigating";

const SEVERITY_STYLES: Record<Severity, { chip: string; dot: string; label: string }> = {
    critical: { chip: "bg-red-500/10 border-red-500/30 text-red-200", dot: "bg-red-500", label: "Critical" },
    high: { chip: "bg-orange-500/10 border-orange-500/30 text-orange-200", dot: "bg-orange-500", label: "High" },
    medium: { chip: "bg-amber-500/10 border-amber-500/30 text-amber-200", dot: "bg-amber-400", label: "Medium" },
    info: { chip: "bg-bg-card border-border-color text-text-secondary", dot: "bg-slate-400", label: "Info" },
    mitigating: { chip: "bg-emerald-500/10 border-emerald-500/30 text-emerald-200", dot: "bg-emerald-500", label: "Mitigating" }
};

const SOURCE_LABELS: Record<string, string> = {
    REPUTATION_ENGINE: "Reputation Engine",
    FIREWALL_QUEUE: "Firewall Queue",
    GUARDIAN: "Citrix Guardian",
    LEDGER: "Strike Ledger",
    BLACKLIST: "Blacklist",
    CVE: "CVE Shield",
    VPN: "VPN Telemetry"
};

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString() : "—");

export function StrikeEvidencePanel({ evidence }: { evidence: any }) {
    const [showTimeline, setShowTimeline] = useState(true);
    const [showAllTimeline, setShowAllTimeline] = useState(false);

    if (!evidence) return null;

    const { narrative, ledger, drivers = [], attemptedUsers = [], vpnFailureReasons = [], failureStats, timeline = [] } = evidence;
    const hasAnything = ledger || drivers.length > 0 || timeline.length > 0 || vpnFailureReasons.length > 0;
    const causalCount = drivers.filter((d: any) => d.severity !== "mitigating" && d.severity !== "info").length;
    const visibleTimeline = showAllTimeline ? timeline : timeline.slice(0, 8);

    return (
        <div className="bg-bg-card border border-border-color rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />
                    Strike Root Cause &amp; Evidence
                </span>
                {ledger && (
                    <span className="text-[10px] text-text-muted font-mono">
                        First seen {fmt(ledger.firstSeen)} • Last seen {fmt(ledger.lastSeen)} • Expires {fmt(ledger.expiresAt)}
                    </span>
                )}
            </div>

            {/* Narrative summary */}
            <div className={`p-2.5 rounded-md border text-xs ${causalCount > 0 ? "bg-orange-500/5 border-orange-500/25 text-text-primary" : "bg-bg-surface border-border-color text-text-secondary"}`}>
                {narrative}
            </div>

            {!hasAnything && (
                <div className="text-text-muted text-xs flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> No strike evidence recorded for this IP.
                </div>
            )}

            {/* Drivers */}
            {drivers.length > 0 && (
                <div>
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1.5">
                        Why it was struck ({drivers.length} signal{drivers.length === 1 ? "" : "s"})
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {drivers.map((d: any) => {
                            const s = SEVERITY_STYLES[d.severity as Severity] || SEVERITY_STYLES.info;
                            return (
                                <div key={d.code} className={`p-2 rounded-md border ${s.chip}`}>
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-xs flex items-center gap-1.5">
                                            {d.severity === "mitigating"
                                                ? <ShieldCheck className="w-3.5 h-3.5" />
                                                : <AlertTriangle className="w-3.5 h-3.5" />}
                                            {d.label}
                                        </span>
                                        <span className="text-[9px] uppercase font-bold opacity-80 shrink-0">{s.label}</span>
                                    </div>
                                    <p className="text-[11px] mt-1 opacity-90 break-words">{d.detail}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Attempted accounts & failure reasons */}
            {(attemptedUsers.length > 0 || vpnFailureReasons.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {attemptedUsers.length > 0 && (
                        <div className="lg:col-span-2">
                            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <Users className="w-3 h-3" /> Accounts attempted from this IP ({attemptedUsers.length})
                            </span>
                            <div className="overflow-x-auto rounded border border-border-color">
                                <table className="w-full text-[11px] text-left">
                                    <thead className="bg-bg-surface text-text-muted border-b border-border-color">
                                        <tr>
                                            <th className="py-1.5 px-2">Username</th>
                                            <th className="py-1.5 px-2">AD Identity</th>
                                            <th className="py-1.5 px-2 text-right">Fails</th>
                                            <th className="py-1.5 px-2 text-right">OK</th>
                                            <th className="py-1.5 px-2">Flags</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color">
                                        {attemptedUsers.slice(0, 15).map((u: any) => (
                                            <tr key={u.username} className="hover:bg-bg-surface/50 align-top">
                                                <td className="py-1 px-2 font-mono">
                                                    <a
                                                        href={`/queries/account-lockout?user=${encodeURIComponent(u.username)}`}
                                                        className="text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1"
                                                        title="Investigate user account in Account Lockout Investigator"
                                                    >
                                                        {u.username}
                                                        <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                                                    </a>
                                                </td>
                                                <td className="py-1 px-2 text-text-muted">
                                                    {u.adStatus ? (
                                                        <span>
                                                            <span className={`font-bold ${u.adStatus === "ACTIVE" || u.adStatus === "ENABLED" ? "text-emerald-400" : u.adStatus === "NOT_FOUND" ? "text-red-400" : "text-amber-400"}`}>
                                                                {u.adStatus}
                                                            </span>
                                                            {u.adDisplayName && <span className="block text-text-secondary">{u.adDisplayName}{u.adDepartment ? ` • ${u.adDepartment}` : ""}</span>}
                                                        </span>
                                                    ) : "—"}
                                                </td>
                                                <td className="py-1 px-2 text-right font-mono text-red-400" title={u.lastFailureAt ? `Last failure ${fmt(u.lastFailureAt)}` : undefined}>{u.vpnFailures}</td>
                                                <td className="py-1 px-2 text-right font-mono text-emerald-400" title={u.lastSuccessAt ? `Last success ${fmt(u.lastSuccessAt)}` : undefined}>{u.vpnSuccesses}</td>
                                                <td className="py-1 px-2">
                                                    <div className="flex flex-wrap gap-1">
                                                        {u.flags.length === 0 && <span className="text-text-muted">—</span>}
                                                        {u.flags.map((f: string) => (
                                                            <span
                                                                key={f}
                                                                className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${f === "Has successful logins" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-orange-500/10 border-orange-500/30 text-orange-300"}`}
                                                            >
                                                                {f}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {attemptedUsers.length > 15 && (
                                <span className="text-[10px] text-text-muted">+{attemptedUsers.length - 15} more account(s)</span>
                            )}
                        </div>
                    )}

                    <div className={attemptedUsers.length > 0 ? "" : "lg:col-span-3"}>
                        <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Activity className="w-3 h-3" /> VPN failure reasons
                        </span>
                        {vpnFailureReasons.length > 0 ? (
                            <div className="space-y-1.5">
                                {vpnFailureReasons.slice(0, 8).map((r: any) => {
                                    const pct = failureStats?.totalVpnFailures ? Math.round((r.count / failureStats.totalVpnFailures) * 100) : 0;
                                    return (
                                        <div key={r.reason} className="text-[11px]" title={r.lastAt ? `Last seen ${fmt(r.lastAt)}` : undefined}>
                                            <div className="flex justify-between gap-2">
                                                <span className="text-text-secondary truncate">{r.reason}</span>
                                                <span className="font-mono text-red-400 shrink-0">{r.count}</span>
                                            </div>
                                            <div className="h-1 rounded bg-bg-surface overflow-hidden mt-0.5">
                                                <div className="h-full bg-red-500/60" style={{ width: `${Math.max(pct, 3)}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <span className="text-[11px] text-text-muted">No VPN failures on record (strike may originate from Citrix).</span>
                        )}
                        {failureStats && (
                            <div className="mt-2 text-[10px] text-text-muted space-y-0.5 border-t border-border-color pt-1.5">
                                <div>Total: <span className="text-red-400 font-mono">{failureStats.totalVpnFailures}</span> fails / <span className="text-emerald-400 font-mono">{failureStats.totalVpnSuccesses}</span> ok</div>
                                <div>Peak burst: <span className="font-mono text-text-primary">{failureStats.maxFailuresIn10m}</span> fails / 10 min</div>
                                {failureStats.firstFailureAt && <div>Window: {fmt(failureStats.firstFailureAt)} → {fmt(failureStats.lastFailureAt)}</div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
                <div>
                    <button
                        type="button"
                        onClick={() => setShowTimeline(v => !v)}
                        className="text-[10px] font-bold text-text-muted uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:text-text-primary"
                    >
                        {showTimeline ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <History className="w-3 h-3" /> Strike &amp; enforcement timeline ({timeline.length})
                    </button>
                    {showTimeline && (
                        <ol className="mt-2 relative border-l border-border-color ml-1.5 space-y-2">
                            {visibleTimeline.map((e: any, idx: number) => {
                                const s = SEVERITY_STYLES[e.severity as Severity] || SEVERITY_STYLES.info;
                                return (
                                    <li key={`${e.at}-${idx}`} className="ml-3 relative">
                                        <span className={`absolute -left-[17.5px] top-1 w-2.5 h-2.5 rounded-full ${s.dot}`} />
                                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                            <span className="font-mono text-text-muted">{fmt(e.at)}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-bg-surface border border-border-color text-[9px] uppercase font-bold text-text-muted">
                                                {SOURCE_LABELS[e.source] || e.source}
                                            </span>
                                            <span className="font-semibold text-text-primary">{e.title}</span>
                                        </div>
                                        {e.detail && <p className="text-[11px] text-text-secondary mt-0.5 break-words">{e.detail}</p>}
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                    {showTimeline && timeline.length > 8 && (
                        <button
                            type="button"
                            onClick={() => setShowAllTimeline(v => !v)}
                            className="mt-1.5 text-[11px] text-accent-primary hover:underline cursor-pointer"
                        >
                            {showAllTimeline ? "Show fewer" : `Show all ${timeline.length} events`}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
