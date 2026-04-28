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
        access_point_name?: string;
        wlan_ssid?: string;
        rssi?: string;
        status?: boolean;
        enrichment?: {
            ad?: any;
            vectra?: any;
        };
        ad?: any;
    };
}

export default function ConnectionPath({ session }: ConnectionPathProps) {
    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    const hasVectraAlert = vectraData && (vectraData.t_score > 50 || vectraData.c_score > 50);
    const isWireless = session.wlan_ssid && session.wlan_ssid !== "N/A";

    const isMobile = session.endpoint_profile?.toLowerCase().includes('apple') || 
                     session.endpoint_profile?.toLowerCase().includes('iphone') || 
                     session.endpoint_profile?.toLowerCase().includes('android') ||
                     session.endpoint_profile?.toLowerCase().includes('mobile');

    const nodes = [
        {
            id: 'endpoint',
            label: session.endpoint_profile && session.endpoint_profile !== "Unknown" ? session.endpoint_profile : 'Endpoint',
            sub: session.calling_station_id,
            status: hasVectraAlert ? 'warning' : 'success',
            icon: isMobile ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect>
                    <line x1="12" y1="18" x2="12.01" y2="18"></line>
                </svg>
            ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
            )
        }
    ];

    if (isWireless) {
        nodes.push({
            id: 'ap',
            label: 'Access Point',
            sub: session.access_point_name || "Wireless AP",
            status: 'success',
            icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                    <line x1="12" y1="20" x2="12.01" y2="20"></line>
                </svg>
            )
        });
    }

    nodes.push(
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
    );

    const nodeWidth = 100 / nodes.length;

    return (
        <div className="connection-path-container" style={{ margin: '24px 0', padding: '24px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Authentication Path Visualizer
                </h4>
                {isWireless && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {session.rssi && session.rssi !== "N/A" && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                <span style={{ fontWeight: 'bold' }}>{session.rssi} dBm</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--accent-primary)', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
                            <span>WIRELESS ({session.wlan_ssid})</span>
                        </div>
                    </div>
                )}
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                {/* Connecting Line Segments */}
                <div style={{ position: 'absolute', top: '35%', left: `${nodeWidth/2}%`, right: `${nodeWidth/2}%`, height: '2px', zIndex: 0, display: 'flex' }}>
                    {nodes.slice(0, -1).map((_, i) => (
                        <div key={i} style={{ 
                            flex: 1, 
                            height: '2px', 
                            background: i === 0 && isWireless ? 'none' : 'var(--border-color)',
                            borderTop: i === 0 && isWireless ? '2px dashed var(--accent-primary)' : 'none',
                            opacity: i === 0 && isWireless ? 0.8 : 0.4
                        }}></div>
                    ))}
                </div>

                {nodes.map((node, idx) => {
                    const statusColor = node.status === 'success' ? '#10b981' : (node.status === 'warning' ? '#f59e0b' : (node.status === 'danger' ? '#ef4444' : 'var(--text-muted)'));
                    const statusBg = node.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : (node.status === 'warning' ? 'rgba(245, 158, 11, 0.1)' : (node.status === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)'));

                    return (
                        <div key={node.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, width: `${nodeWidth}%` }}>
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
