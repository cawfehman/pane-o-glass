"use client";

import React, { useState } from "react";
import ConnectionPath from "./ConnectionPath";
import { CheckCircle2, XCircle, AlertTriangle, Radio, Copy, Check, ChevronDown, ChevronRight, Stethoscope } from "lucide-react";

interface EnrichedEndpointCardProps {
    session: any;
    isHistory?: boolean;
}

export default function EnrichedEndpointCard({ session, isHistory = false }: EnrichedEndpointCardProps) {
    const [copied, setCopied] = useState(false);
    const [showSteps, setShowSteps] = useState(false);

    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    const wlc = session.wlcTelemetry;
    
    const statusColor = isPass ? '#10b981' : '#ef4444';
    const statusBg = isPass ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    const copyTicketSummary = () => {
        const lines = [
            `--- CISCO ISE / WIRELESS TRIAGE SUMMARY ---`,
            `User/Identity: ${adData?.displayName || session.user_name || "Unknown"} (${session.user_name || "N/A"})`,
            `MAC Address:   ${session.calling_station_id}`,
            `IP Address:    ${session.framed_ip_address || "None"}`,
            `Auth Result:   ${isPass ? 'PASSED / AUTHENTICATED' : 'FAILED / ACCESS DENIED'}`,
            `Event Time:    ${session.timestamp || "Unknown"}`,
            `Failure Code:  ${session.failure_id || "N/A"} - ${session.failure_reason || "None"}`,
            `Root Cause:    ${session.insight?.cause || "Standard Radius Policy"}`,
            `Resolution:    ${session.insight?.suggestion || "Verify supplicant and credentials"}`,
            `SSID / AP:     ${session.wlan_ssid || "N/A"} / ${session.access_point_name || "N/A"}`,
            `NAD (Switch):  ${session.nas_identifier || "N/A"} (${session.nas_ip_address || "N/A"})`,
            `Device Model:  ${session.endpoint_profile || "Unknown"} ${session.hardware_model || ""}`.trim(),
            wlc?.found ? `WLC State:     ${wlc.wlcName} (State: ${wlc.status}${wlc.rssi ? `, RSSI: ${wlc.rssi} dBm` : ''}${wlc.excluded ? ' - BLACKLISTED' : ''})` : `WLC State:     No direct SNMP active session`,
            `Audit Session: ${session.audit_session_id || "N/A"}`
        ];
        navigator.clipboard.writeText(lines.join('\n'));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="glass-card mb-8 p-0 overflow-hidden" style={{ borderLeft: `6px solid ${statusColor}` }}>
            <div className="p-6">
                {/* Header with Title, Status and Quick Copy Ticket Note */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl text-text-primary m-0">
                                {adData?.displayName || session.user_name || "Unknown Identity"}
                            </h3>
                            {session.is_lockout_culprit && (
                                <span className="px-2.5 py-0.5 rounded text-[0.7rem] font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/40">
                                    Lockout Culprit
                                </span>
                            )}
                        </div>
                        <p className="text-text-secondary text-sm m-0">
                            {session.calling_station_id} · {session.framed_ip_address || "No IP assigned"}
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={copyTicketSummary}
                            className="btn-secondary text-xs flex items-center gap-1.5"
                            style={{ padding: '6px 12px', borderRadius: '6px' }}
                            title="Copy formatted markdown summary for ServiceNow / Remedy ticket"
                        >
                            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                            <span>{copied ? 'Copied Ticket Note!' : 'Copy Ticket Note'}</span>
                        </button>

                        <div className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: statusBg, color: statusColor }}>
                            {isPass ? 'Authenticated' : 'Access Denied'}
                        </div>
                    </div>
                </div>

                {/* Real-Time WLC 8540 Live Telemetry Banner (If Available) */}
                {wlc && wlc.found && (
                    <div className="mb-6 p-3.5 rounded-xl border flex items-center justify-between" style={{
                        background: wlc.excluded ? 'rgba(239, 68, 68, 0.1)' : 'rgba(56, 189, 248, 0.08)',
                        borderColor: wlc.excluded ? 'rgba(239, 68, 68, 0.3)' : 'rgba(56, 189, 248, 0.25)'
                    }}>
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                                background: wlc.excluded ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                color: wlc.excluded ? '#ef4444' : 'var(--accent-primary)'
                            }}>
                                <Radio size={18} />
                            </div>
                            <div>
                                <div className="text-xs font-bold text-text-primary flex items-center gap-2">
                                    <span>Live WLC Telemetry: {wlc.wlcName}</span>
                                    <span className="font-mono text-[0.7rem] text-text-muted">({wlc.wlcIp})</span>
                                </div>
                                <div className="text-[0.75rem] text-text-secondary">
                                    802.11 State: <strong style={{ color: wlc.excluded ? '#ef4444' : '#10b981' }}>{wlc.status}</strong>
                                    {wlc.exclusionReason && <span className="text-red-400 font-bold ml-2">[{wlc.exclusionReason}]</span>}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs font-mono">
                            {wlc.rssi !== undefined && (
                                <div className="text-right">
                                    <span className="text-text-muted text-[0.65rem] block">SIGNAL (RSSI)</span>
                                    <span className="font-bold" style={{ color: wlc.rssi > -70 ? '#10b981' : '#f59e0b' }}>
                                        {wlc.rssi} dBm
                                    </span>
                                </div>
                            )}
                            {wlc.snr !== undefined && (
                                <div className="text-right">
                                    <span className="text-text-muted text-[0.65rem] block">SNR</span>
                                    <span className="font-bold text-text-primary">{wlc.snr} dB</span>
                                </div>
                            )}
                            <div className="text-[0.65rem] text-text-muted px-2 py-1 rounded bg-black/20">
                                {wlc.latencyMs}ms SNMP
                            </div>
                        </div>
                    </div>
                )}

                {/* Enrichment Overlay (AD & Vectra) */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4 mb-6">
                    {/* AD Entity Data */}
                    {adData && adData.displayName && (
                        <div className="bg-white/5 p-4 rounded-lg border border-border-color">
                            <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Active Directory Context</h4>
                            <p className="text-[0.9rem]"><strong>Department:</strong> {adData.department || "N/A"}</p>
                            <p className="text-[0.9rem]"><strong>Title:</strong> {adData.title || "N/A"}</p>
                            {adData.email && <p className="text-[0.9rem]"><strong>Email:</strong> {adData.email}</p>}
                        </div>
                    )}

                    {/* Vectra Security Score */}
                    {vectraData && (
                        <div className="bg-white/5 p-4 rounded-lg border border-border-color">
                            <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Vectra Threat Level</h4>
                            <div className="flex gap-6">
                                <div className="text-center">
                                    <span className="block text-[0.65rem] text-text-muted font-bold">THREAT</span>
                                    <span className="text-2xl font-extrabold" style={{ color: vectraData.t_score > 50 ? '#ef4444' : 'var(--accent-primary)' }}>{vectraData.t_score}</span>
                                </div>
                                <div className="text-center">
                                    <span className="block text-[0.65rem] text-text-muted font-bold">CERTAINTY</span>
                                    <span className="text-2xl font-extrabold text-text-primary">{vectraData.c_score}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Connection Path Visualizer */}
                <ConnectionPath session={{ ...session, wlcTelemetry: wlc }} />

                {/* Wireless EAP Diagnostics & Root Cause Box (If Failure Occurred) */}
                {!isPass && (
                    <div className="my-6 p-4 rounded-xl border border-red-500/30 bg-red-500/5">
                        <div className="flex items-center gap-2 mb-2">
                            <Stethoscope size={18} className="text-red-400" />
                            <h4 className="text-sm font-bold text-red-400 m-0 uppercase tracking-wider">
                                Wireless EAP Doctor: {session.failure_reason || "Authentication Failed"}
                            </h4>
                            {session.failure_id && (
                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300">
                                    Code {session.failure_id}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-xs">
                            <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                                <span className="font-bold text-text-secondary uppercase block mb-1 text-[0.7rem]">Root Cause Analysis</span>
                                <p className="text-text-primary m-0 leading-relaxed">
                                    {session.insight?.cause || "The supplicant could not complete 802.1X handshake."}
                                </p>
                            </div>

                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                <span className="font-bold text-emerald-400 uppercase block mb-1 text-[0.7rem]">Prescribed Resolution</span>
                                <p className="text-emerald-300 m-0 leading-relaxed">
                                    {session.insight?.suggestion || "Inspect user credentials and device certificate."}
                                </p>
                            </div>
                        </div>

                        {/* Collapsible EAP Execution Steps */}
                        {session.steps && session.steps.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-white/10">
                                <button
                                    onClick={() => setShowSteps(!showSteps)}
                                    className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 hover:text-text-primary bg-transparent border-none p-0 cursor-pointer"
                                >
                                    {showSteps ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    <span>{showSteps ? 'Hide 802.1X / EAP Execution Trace' : `View ${session.steps.length} EAP Protocol Steps`}</span>
                                </button>

                                {showSteps && (
                                    <div className="mt-3 flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scrollbar p-2 rounded bg-black/30 border border-white/5 font-mono text-[0.75rem]">
                                        {session.steps.map((step: any, idx: number) => {
                                            const isLastStep = idx === session.steps.length - 1;
                                            return (
                                                <div key={idx} className="flex items-start gap-2 text-text-muted">
                                                    <span className="text-[0.65rem] text-text-secondary">{idx + 1}.</span>
                                                    {isLastStep ? (
                                                        <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />
                                                    ) : (
                                                        <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                                                    )}
                                                    <span className={isLastStep ? "text-red-300 font-bold" : "text-text-secondary"}>
                                                        {step.description || `Step ${step.id}`}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Grid of technical details */}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5 mt-6 text-[0.85rem]">
                    <div className="p-4 bg-white/5 rounded-lg border border-border-color">
                        <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Infrastructure</h4>
                        <p title="The WLC or Switch" className="mb-1"><strong>NAD:</strong> {session.nas_identifier || "Unknown"}</p>
                        <p title="The SSID" className="mb-1"><strong>SSID:</strong> {session.wlan_ssid || "N/A"}</p>
                        <p title="The Access Point" className="mb-1"><strong>AP:</strong> {session.access_point_name || "N/A"}</p>
                        <p title="Site Code" className="mb-1"><strong>Site:</strong> <span className="text-accent-secondary">{session.site_code || "N/A"}</span></p>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg border border-border-color">
                        <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Policy & Node</h4>
                        <p title="The specific ISE PSN" className="mb-1"><strong>Node:</strong> {session.acs_server || "Unknown"}</p>
                        <p title="Authorization Rule" className="mb-1"><strong>Rule:</strong> {session.authorization_rule || "Unknown"}</p>
                        <p title="Auth Method" className="mb-1"><strong>Method:</strong> {session.authentication_method || "Unknown"}</p>
                        <p title="Identity Group" className="mb-1"><strong>ID Group:</strong> {session.identity_group || "Unknown"}</p>
                        <p title="Cisco TrustSec Security Group Tag" className="mb-1">
                            <strong>TrustSec SGT:</strong> <span className="text-sky-400 font-bold">{session.sgt_name && session.sgt_name !== "Unknown" ? session.sgt_name : (session.security_group || "Unknown")}</span>
                        </p>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg border border-border-color">
                        <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Telemetry & Profiling</h4>
                        <p title="Profiling classification from ISE" className="mb-1">
                            <strong>Device:</strong> <span className="text-accent-primary font-bold">{session.endpoint_profile || "Unknown"}</span>
                        </p>
                        {session.hardware_model && (
                            <p title="Cloud MFC Hardware Model" className="mb-1">
                                <strong>Model:</strong> <span className="text-emerald-400 font-semibold">{session.hardware_model}</span>
                            </p>
                        )}
                        {session.os_version && (
                            <p title="Detected Operating System" className="mb-1">
                                <strong>OS:</strong> <span className="text-text-primary font-medium">{session.os_version}</span>
                            </p>
                        )}
                        <p title="Wireless Signal Strength" className="mb-1">
                            <strong>Signal:</strong> {wlc?.rssi ? (
                                <span className="font-bold" style={{ color: wlc.rssi > -70 ? '#10b981' : '#f59e0b' }}>
                                    {wlc.rssi} dBm (Live WLC)
                                </span>
                            ) : session.rssi && session.rssi !== "N/A" ? (
                                <span className="font-bold" style={{ color: parseInt(session.rssi) > -70 ? '#10b981' : '#f59e0b' }}>
                                    {session.rssi} dBm
                                </span>
                            ) : "N/A"}
                        </p>
                        <p title="VLAN" className="mb-1"><strong>VLAN:</strong> {session.vlan || "Unknown"}</p>
                    </div>
                </div>
            </div>
            
            <div className="bg-black/15 px-6 py-3 text-[0.7rem] text-text-muted flex justify-between border-t border-border-color tracking-wide">
                <span title="Full Cisco Audit Session ID for syslog correlation">AUDIT ID: {session.audit_session_id || "N/A"}</span>
                <span>{session.timestamp_label || "EVENT TIME"}: {session.timestamp && session.timestamp !== "Unknown" ? new Date(session.timestamp).toLocaleString() : "UNKNOWN"}</span>
            </div>
        </div>
    );
}
