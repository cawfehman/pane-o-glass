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
        <div className="glass-card" style={{ marginBottom: '32px', borderLeft: `6px solid ${statusColor}`, padding: '0', overflow: 'hidden' }}>
            <div style={{ padding: '24px' }}>
                {/* Header with Title and Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                            {adData?.displayName || session.user_name || "Unknown Identity"}
                        </h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            {session.calling_station_id} · {session.framed_ip_address || "No IP assigned"}
                        </p>
                    </div>
                    <div style={{ padding: '6px 16px', borderRadius: '20px', background: statusBg, color: statusColor, fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {isPass ? 'Authenticated' : 'Access Denied'}
                    </div>
                </div>

                {/* Enrichment Overlay (AD & Vectra) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {/* AD Entity Data */}
                    {adData && adData.displayName && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Active Directory Context</h4>
                            <p style={{ fontSize: '0.9rem' }}><strong>Department:</strong> {adData.department || "N/A"}</p>
                            <p style={{ fontSize: '0.9rem' }}><strong>Title:</strong> {adData.title || "N/A"}</p>
                            {adData.email && <p style={{ fontSize: '0.9rem' }}><strong>Email:</strong> {adData.email}</p>}
                        </div>
                    )}

                    {/* Vectra Security Score */}
                    {vectraData && (
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px' }}>Vectra Threat Level</h4>
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>THREAT</span>
                                    <span style={{ fontSize: '1.5rem', fontWeight: '800', color: vectraData.t_score > 50 ? '#ef4444' : 'var(--accent-primary)' }}>{vectraData.t_score}</span>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>CERTAINTY</span>
                                    <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--text-primary)' }}>{vectraData.c_score}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Connection Path Visualizer */}
                <ConnectionPath session={session} />

                {/* Grid of technical details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginTop: '24px', fontSize: '0.9rem' }}>
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Infrastructure Integration</h4>
                        <p title="The switch, WLC, or firewall handling this session" style={{ marginBottom: '4px' }}><strong>NAD:</strong> {session.nas_identifier || "Unknown"}</p>
                        <p title="The IP assigned to the access device" style={{ marginBottom: '4px' }}><strong>NAD IP:</strong> {session.nas_ip_address || "Unknown"}</p>
                        <p title="The SSID for wireless connections" style={{ marginBottom: '4px' }}><strong>SSID:</strong> <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{session.wlan_ssid || "N/A"}</span></p>
                        <p title="The specific Access Point Name" style={{ marginBottom: '4px' }}><strong>AP Name:</strong> {session.access_point_name || "N/A"}</p>
                    </div>
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <h4 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Cisco Policy Engine</h4>
                        <p title="The specific ISE PSN that authenticated the session" style={{ marginBottom: '4px' }}><strong>Auth Node:</strong> {session.acs_server || "Unknown"}</p>
                        <p title="The protocol (DOT1X, MAB, etc)" style={{ marginBottom: '4px' }}><strong>Method:</strong> {session.authentication_method || "Unknown"}</p>
                        <p title="Internal authentication policy set" style={{ marginBottom: '4px' }}><strong>Policy:</strong> {session.authorization_rule || "Unknown"}</p>
                    </div>
                </div>
            </div>
            
            <div style={{ background: 'rgba(0,0,0,0.15)', padding: '12px 24px', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', letterSpacing: '0.025em' }}>
                <span title="Full Cisco Audit Session ID for syslog correlation">AUDIT ID: {session.audit_session_id || "N/A"}</span>
                <span>EVENT TIME: {session.timestamp && session.timestamp !== "Unknown" ? new Date(session.timestamp).toLocaleString() : "UNKNOWN"}</span>
            </div>
        </div>
    );
}
