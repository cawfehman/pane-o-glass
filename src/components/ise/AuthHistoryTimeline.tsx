"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Stethoscope, Clock, Radio, Shield, Laptop, Layers } from "lucide-react";

interface AuthEvent {
    timestamp: string;
    timestamp_label?: string;
    user_name: string;
    calling_station_id: string;
    framed_ip_address?: string;
    status: boolean;
    failure_reason?: string;
    failure_id?: string;
    wlan_ssid?: string;
    access_point_name?: string;
    nas_identifier?: string;
    site_code?: string;
    endpoint_profile?: string;
    hardware_model?: string;
    insight?: {
        cause: string;
        suggestion: string;
    };
    steps?: Array<{ id: string; description: string }>;
}

interface AuthHistoryTimelineProps {
    events: AuthEvent[];
    onSelectMac?: (mac: string) => void;
}

export default function AuthHistoryTimeline({ events, onSelectMac }: AuthHistoryTimelineProps) {
    const [expandedRow, setExpandedRow] = useState<number | null>(null);

    if (!events || events.length === 0) {
        return (
            <div className="glass-card p-6 text-center text-text-muted text-sm">
                No recent RADIUS authentication attempts logged in the last 7 days.
            </div>
        );
    }

    const toggleRow = (idx: number) => {
        setExpandedRow(prev => (prev === idx ? null : idx));
    };

    return (
        <div className="glass-card p-0 overflow-hidden border border-border-color">
            <div className="px-6 py-4 bg-white/[0.02] border-b border-border-color flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Clock size={16} className="text-accent-primary" />
                    <h4 className="text-sm font-bold text-text-primary m-0 uppercase tracking-wider">
                        7-Day Authentication Event History ({events.length} Attempts)
                    </h4>
                </div>
                <span className="text-xs text-text-muted">
                    Click any row to inspect 802.1X / EAP handshake trace
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr className="border-b border-border-color bg-black/20 text-text-muted uppercase tracking-wider font-semibold">
                            <th className="py-3 px-4">Time</th>
                            <th className="py-3 px-4">Result</th>
                            <th className="py-3 px-4">Identity / MAC</th>
                            <th className="py-3 px-4">Location & Infrastructure</th>
                            <th className="py-3 px-4">Device Profile</th>
                            <th className="py-3 px-4">Diagnostic Verdict</th>
                            <th className="py-3 px-4 text-right">Trace</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-color">
                        {events.map((ev, idx) => {
                            const isPass = ev.status !== false;
                            const isExpanded = expandedRow === idx;
                            const hasSteps = ev.steps && ev.steps.length > 0;

                            return (
                                <React.Fragment key={idx}>
                                    <tr
                                        onClick={() => toggleRow(idx)}
                                        className={`cursor-pointer transition-colors hover:bg-white/[0.03] ${
                                            !isPass ? "bg-red-500/[0.03]" : ""
                                        }`}
                                    >
                                        {/* Timestamp */}
                                        <td className="py-3 px-4 whitespace-nowrap text-text-secondary font-mono text-[0.7rem]">
                                            {ev.timestamp && ev.timestamp !== "Unknown"
                                                ? new Date(ev.timestamp).toLocaleString(undefined, {
                                                      month: "short",
                                                      day: "numeric",
                                                      hour: "2-digit",
                                                      minute: "2-digit",
                                                      second: "2-digit"
                                                  })
                                                : "Recent"}
                                        </td>

                                        {/* Status Badge */}
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            {isPass ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    <CheckCircle2 size={10} />
                                                    Passed
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase bg-red-500/15 text-red-400 border border-red-500/30">
                                                    <XCircle size={10} />
                                                    Failed
                                                </span>
                                            )}
                                        </td>

                                        {/* Identity / MAC */}
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <div className="font-semibold text-text-primary">
                                                {ev.user_name || "Unknown"}
                                            </div>
                                            <div
                                                onClick={e => {
                                                    if (onSelectMac && ev.calling_station_id) {
                                                        e.stopPropagation();
                                                        onSelectMac(ev.calling_station_id);
                                                    }
                                                }}
                                                className="font-mono text-[0.7rem] text-accent-primary hover:underline cursor-pointer"
                                                title="Filter deep dive on this MAC"
                                            >
                                                {ev.calling_station_id}
                                            </div>
                                        </td>

                                        {/* Location & Infrastructure */}
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {ev.site_code && ev.site_code !== "N/A" && (
                                                    <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-extrabold text-[0.65rem]">
                                                        {ev.site_code}
                                                    </span>
                                                )}
                                                <span className="text-text-secondary font-medium">
                                                    {ev.wlan_ssid && ev.wlan_ssid !== "N/A"
                                                        ? ev.wlan_ssid
                                                        : ev.nas_identifier || "Switch Port"}
                                                </span>
                                            </div>
                                            <div className="text-text-muted text-[0.7rem] truncate max-w-[200px]" title={ev.access_point_name || ev.nas_identifier}>
                                                {ev.access_point_name || ev.nas_identifier || "Direct Wire"}
                                            </div>
                                        </td>

                                        {/* Device Profile */}
                                        <td className="py-3 px-4 whitespace-nowrap">
                                            <div className="text-text-primary text-[0.75rem]">
                                                {ev.hardware_model || ev.endpoint_profile || "Unknown"}
                                            </div>
                                        </td>

                                        {/* Diagnostic Verdict */}
                                        <td className="py-3 px-4 max-w-[260px]">
                                            {isPass ? (
                                                <span className="text-emerald-400 font-medium">
                                                    RADIUS Accept (Authenticated)
                                                </span>
                                            ) : (
                                                <div className="text-red-400">
                                                    <div className="font-semibold truncate" title={ev.failure_reason}>
                                                        {ev.failure_reason || "Authentication Failed"}
                                                    </div>
                                                    {ev.failure_id && (
                                                        <span className="font-mono text-[0.65rem] text-text-muted">
                                                            Code: {ev.failure_id}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>

                                        {/* Trace Expand Button */}
                                        <td className="py-3 px-4 text-right whitespace-nowrap">
                                            {hasSteps ? (
                                                <button
                                                    type="button"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        toggleRow(idx);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[0.7rem] bg-white/5 hover:bg-white/10 text-text-secondary border border-border-color"
                                                >
                                                    <span>{ev.steps!.length} steps</span>
                                                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                </button>
                                            ) : (
                                                <span className="text-text-muted text-[0.65rem] italic">1-step</span>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Expanded EAP Handshake Trace & Root Cause */}
                                    {isExpanded && (
                                        <tr className="bg-black/30">
                                            <td colSpan={7} className="p-4 border-t border-b border-border-color">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {/* Handshake Execution Steps */}
                                                    <div>
                                                        <h5 className="text-[0.7rem] uppercase tracking-wider text-text-muted font-bold mb-2 flex items-center gap-1.5">
                                                            <Layers size={13} className="text-accent-primary" />
                                                            802.1X / RADIUS Handshake Sequence
                                                        </h5>
                                                        {hasSteps ? (
                                                            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto custom-scrollbar p-2.5 rounded bg-black/40 border border-white/5 font-mono text-[0.7rem]">
                                                                {ev.steps!.map((step, sIdx) => {
                                                                    const isLast = sIdx === ev.steps!.length - 1;
                                                                    return (
                                                                        <div key={sIdx} className="flex items-start gap-2">
                                                                            <span className="text-text-muted shrink-0 text-[0.65rem]">{sIdx + 1}.</span>
                                                                            {isLast && !isPass ? (
                                                                                <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                                                                            ) : (
                                                                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                                                            )}
                                                                            <span className={isLast && !isPass ? "text-red-300 font-bold" : "text-text-secondary"}>
                                                                                {step.description || `Step ${step.id}`}
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-text-muted text-xs italic m-0">No step-by-step trace logged by ISE.</p>
                                                        )}
                                                    </div>

                                                    {/* Prescribed Insight */}
                                                    <div>
                                                        <h5 className="text-[0.7rem] uppercase tracking-wider text-text-muted font-bold mb-2 flex items-center gap-1.5">
                                                            <Stethoscope size={13} className="text-accent-primary" />
                                                            Root Cause & Prescribed Resolution
                                                        </h5>
                                                        {ev.insight ? (
                                                            <div className="flex flex-col gap-2 text-xs">
                                                                <div className="p-2.5 rounded bg-red-500/10 border border-red-500/20 text-red-200">
                                                                    <strong className="block text-[0.65rem] uppercase text-red-400 mb-0.5">Root Cause</strong>
                                                                    {ev.insight.cause}
                                                                </div>
                                                                <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-200">
                                                                    <strong className="block text-[0.65rem] uppercase text-emerald-400 mb-0.5">Prescribed Fix</strong>
                                                                    {ev.insight.suggestion}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <p className="text-text-muted text-xs italic m-0">Standard policy evaluation.</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
