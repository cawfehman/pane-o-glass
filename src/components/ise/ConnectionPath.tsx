"use client";

import React from "react";

interface ConnectionPathProps {
    session: {
        calling_station_id: string;
        endpoint_profile?: string;
        nas_identifier?: string;
        nas_ip_address?: string;
        acs_server?: string;
        authorization_rule?: string;
        status?: boolean;
        enrichment?: {
            ad?: any;
            vectra?: any;
        };
        ad?: any; // For failures where it might be top-level
    };
}

export default function ConnectionPath({ session }: ConnectionPathProps) {
    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    const hasVectraAlert = vectraData && (vectraData.t_score > 50 || vectraData.c_score > 50);

    const nodes = [
        {
            id: 'endpoint',
            label: 'Endpoint',
            sub: session.calling_station_id,
            status: hasVectraAlert ? 'warning' : 'success',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            )
        },
        {
            id: 'nas',
            label: 'Network Access',
            sub: session.nas_identifier || session.nas_ip_address || "Unknown",
            status: 'success',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6" y2="6.01"></line>
                    <line x1="6" y1="18" x2="6" y2="18.01"></line>
                </svg>
            )
        },
        {
            id: 'ise',
            label: 'Cisco ISE',
            sub: session.acs_server || "Policy Engine",
            status: isPass ? 'success' : 'danger',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
            )
        },
        {
            id: 'idp',
            label: 'Identity (AD)',
            sub: adData ? adData.displayName : (session.status === false ? "Auth Failed" : "Verified"),
            status: adData ? 'success' : (session.status === false ? 'danger' : 'neutral'),
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
            )
        }
    ];

    return (
        <div className="connection-path-container" style={{ margin: '24px 0', padding: '24px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '24px' }}>
                Authentication Path Visualizer
            </h4>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Connecting Lines */}
                <div style={{ position: 'absolute', top: '35%', left: '10%', right: '10%', height: '2px', background: 'var(--border-color)', zIndex: 0 }}></div>

                {nodes.map((node, idx) => {
                    const statusColor = node.status === 'success' ? '#10b981' : (node.status === 'warning' ? '#f59e0b' : (node.status === 'danger' ? '#ef4444' : 'var(--text-muted)'));
                    const statusBg = node.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : (node.status === 'warning' ? 'rgba(245, 158, 11, 0.1)' : (node.status === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)'));

                    return (
                        <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: '25%' }}>
                            <div style={{ 
                                width: '48px', height: '48px', borderRadius: '12px', background: statusBg, border: `2px solid ${statusColor}`, color: statusColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px', transition: 'all 0.3s ease',
                                boxShadow: node.status === 'danger' ? '0 0 15px rgba(239, 68, 68, 0.2)' : 'none'
                            }}>
                                {node.icon}
                            </div>
                            <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{node.label}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {node.sub}
                            </span>
                        </div>
                    );
                })}
            </div>
            
            {!isPass && (
                <div style={{ marginTop: '24px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>
                        Break detected at <strong>{nodes[2].label}</strong>: {session.authorization_rule || "Unknown Policy Failure"}
                    </span>
                </div>
            )}
        </div>
    );
}
