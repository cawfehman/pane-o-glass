"use client";

import React from "react";
import ConnectionPath from "./ConnectionPath";

interface EnrichedEndpointCardProps {
    session: any;
    isHistory?: boolean;
}

export default function EnrichedEndpointCard({ session, isHistory = false }: EnrichedEndpointCardProps) {
    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    
    const statusColor = isPass ? '#10b981' : '#ef4444';
    const statusBg = isPass ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

    return (
        <div className="glass-card mb-8 p-0 overflow-hidden" style={{ borderLeft: `6px solid ${statusColor}` }}>
            <div className="p-6">
                {/* Header with Title and Status */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl mb-1 text-text-primary">
                            {adData?.displayName || session.user_name || "Unknown Identity"}
                        </h3>
                        <p className="text-text-secondary text-sm">
                            {session.calling_station_id} · {session.framed_ip_address || "No IP assigned"}
                        </p>
                    </div>
                    <div className="px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest" style={{ background: statusBg, color: statusColor }}>
                        {isPass ? 'Authenticated' : 'Access Denied'}
                    </div>
                </div>

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
                <ConnectionPath session={session} />

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
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg border border-border-color">
                        <h4 className="text-[0.7rem] text-text-muted uppercase mb-3">Telemetry</h4>
                        <p title="Profiling classification from ISE" className="mb-1">
                            <strong>Device:</strong> <span className="text-accent-primary font-bold">{session.endpoint_profile || "Unknown"}</span>
                        </p>
                        <p title="Wireless Signal Strength" className="mb-1">
                            <strong>Signal:</strong> {session.rssi && session.rssi !== "N/A" ? (
                                <span className="font-bold" style={{ color: parseInt(session.rssi) > -70 ? '#10b981' : '#f59e0b' }}>
                                    {session.rssi} dBm
                                </span>
                            ) : "N/A"}
                        </p>
                        <p title="Browser/OS Profile" className="mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                            <strong>Profile:</strong> <span className="text-text-secondary">{session.user_agent || "N/A"}</span>
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
