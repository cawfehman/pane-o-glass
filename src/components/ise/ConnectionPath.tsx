"use client";

import React from "react";
import {
    Activity,
    ScanBarcode,
    Printer,
    Tablet,
    Smartphone,
    Laptop,
    Cpu,
    Wifi,
    Server,
    ShieldCheck,
    Users,
    AlertCircle,
    Radio
} from "lucide-react";

interface ConnectionPathProps {
    session: {
        calling_station_id: string;
        user_name?: string;
        endpoint_profile?: string;
        hardware_manufacturer?: string;
        hardware_model?: string;
        os_version?: string;
        device_type?: string;
        sgt_name?: string;
        nas_identifier?: string;
        nas_ip_address?: string;
        acs_server?: string;
        authorization_rule?: string;
        access_point_name?: string;
        wlan_ssid?: string;
        rssi?: string;
        status?: boolean;
        is_passive_identity?: boolean;
        session_type?: string;
        workstation_ip?: string;
        hostname?: string;
        machine_name?: string;
        enrichment?: {
            ad?: any;
            vectra?: any;
        };
        ad?: any;
        wlcTelemetry?: {
            found: boolean;
            wlcName?: string;
            wlcIp?: string;
            status?: string;
            statusRaw?: number;
            rssi?: number;
            snr?: number;
            excluded?: boolean;
            exclusionReason?: string;
        };
    };
}

export default function ConnectionPath({ session }: ConnectionPathProps) {
    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    const isPassive = Boolean(session.is_passive_identity || session.session_type === 'PASSIVE_ID');
    const hasVectraAlert = vectraData && (vectraData.t_score > 50 || vectraData.c_score > 50);
    const isWireless = !isPassive && Boolean((session.wlan_ssid && session.wlan_ssid !== "N/A") || session.wlcTelemetry?.found);

    // Deep classification using Cloud MFC and profile strings
    const fullProfile = `${session.endpoint_profile || ""} ${session.hardware_manufacturer || ""} ${session.hardware_model || ""} ${session.device_type || ""}`.toLowerCase();
    
    const isMedical = fullProfile.includes('medical') || fullProfile.includes('infusion') || fullProfile.includes('alaris') || 
                      fullProfile.includes('baxter') || fullProfile.includes('ge health') || fullProfile.includes('philips') || 
                      fullProfile.includes('mindray') || fullProfile.includes('welch') || fullProfile.includes('telemetry') || fullProfile.includes('patient');

    const isScanner = fullProfile.includes('zebra') || fullProfile.includes('honeywell') || fullProfile.includes('symbol') || 
                      fullProfile.includes('datalogic') || fullProfile.includes('scanner') || fullProfile.includes('tc52') || fullProfile.includes('tc57');

    const isPrinter = fullProfile.includes('printer') || fullProfile.includes('print') || fullProfile.includes('xerox') || 
                      fullProfile.includes('brother') || fullProfile.includes('lexmark') || fullProfile.includes('laserjet');

    const isTablet = fullProfile.includes('ipad') || fullProfile.includes('tablet') || fullProfile.includes('galaxy tab');

    const isPhone = !isTablet && (fullProfile.includes('iphone') || fullProfile.includes('pixel') || fullProfile.includes('galaxy') || 
                                  fullProfile.includes('smartphone') || fullProfile.includes('mobile') || fullProfile.includes('android'));

    const isWorkstation = isPassive || fullProfile.includes('windows') || fullProfile.includes('workstation') || fullProfile.includes('laptop') || 
                          fullProfile.includes('desktop') || fullProfile.includes('dell') || fullProfile.includes('lenovo') || fullProfile.includes('macbook');

    const renderEndpointIcon = () => {
        if (isMedical) return <Activity className="w-6 h-6" />;
        if (isScanner) return <ScanBarcode className="w-6 h-6" />;
        if (isPrinter) return <Printer className="w-6 h-6" />;
        if (isTablet) return <Tablet className="w-6 h-6" />;
        if (isPhone) return <Smartphone className="w-6 h-6" />;
        if (isWorkstation) return <Laptop className="w-6 h-6" />;
        return <Cpu className="w-6 h-6" />;
    };

    let nodes: any[] = [];

    if (isPassive) {
        // Passive Identity Path: Endpoint -> Domain Controller (Event 4624) -> Cisco ISE (PIC) -> Identity (AD)
        nodes = [
            {
                id: 'endpoint',
                label: session.machine_name || session.hardware_model || "Workstation",
                sub: session.workstation_ip || session.calling_station_id,
                status: hasVectraAlert ? 'warning' : 'success',
                icon: <Laptop className="w-6 h-6" />
            },
            {
                id: 'dc',
                label: 'Domain Controller',
                sub: 'Event 4624 / Kerberos',
                status: 'success',
                icon: <Server className="w-6 h-6" />
            },
            {
                id: 'ise',
                label: 'Cisco ISE',
                sub: `${session.acs_server || "ise-psn01"} (PIC Engine)`,
                status: 'success',
                icon: <ShieldCheck className="w-6 h-6" />
            },
            {
                id: 'idp',
                label: 'Identity (AD)',
                sub: adData ? adData.displayName : (session.user_name || "Verified"),
                status: 'success',
                icon: <Users className="w-6 h-6" />
            }
        ];
    } else {
        const endpointLabel = session.hardware_model || 
                              (session.endpoint_profile && session.endpoint_profile !== "Unknown" ? session.endpoint_profile : 'Endpoint');

        const endpointSub = session.hardware_manufacturer ? 
                            `${session.hardware_manufacturer} · ${session.calling_station_id}` : 
                            session.calling_station_id;

        nodes = [
            {
                id: 'endpoint',
                label: endpointLabel,
                sub: endpointSub,
                status: hasVectraAlert ? 'warning' : 'success',
                icon: renderEndpointIcon()
            }
        ];

        if (isWireless) {
            nodes.push({
                id: 'ap',
                label: 'Access Point',
                sub: session.access_point_name || "Wireless AP",
                status: 'success',
                icon: <Wifi className="w-6 h-6" />
            });

            // WLC Controller Node (AireOS 8540)
            const wlcInfo = session.wlcTelemetry;
            const wlcName = wlcInfo?.wlcName || session.nas_identifier || "Cisco WLC";
            let wlcStatus = 'success';
            let wlcSub = wlcInfo?.status ? `State: ${wlcInfo.status}` : "Associated";

            if (wlcInfo?.excluded) {
                wlcStatus = 'danger';
                wlcSub = 'EXCLUDED / BLACKLISTED';
            } else if (wlcInfo && wlcInfo.statusRaw !== 3 && wlcInfo.statusRaw !== 2) {
                wlcStatus = 'warning';
            }

            nodes.push({
                id: 'wlc',
                label: 'Cisco WLC',
                sub: `${wlcName} (${wlcSub})`,
                status: wlcStatus,
                icon: <Radio className="w-6 h-6" />
            });
        } else {
            // Wired Switch Node
            nodes.push({
                id: 'nas',
                label: 'Access Switch',
                sub: session.nas_identifier || session.nas_ip_address || "Network Switch",
                status: 'success',
                icon: <Server className="w-6 h-6" />
            });
        }

        nodes.push(
            {
                id: 'ise',
                label: 'Cisco ISE',
                sub: session.acs_server || "Policy Engine",
                status: isPass ? 'success' : 'danger',
                icon: <ShieldCheck className="w-6 h-6" />
            },
            {
                id: 'idp',
                label: 'Identity (AD)',
                sub: adData ? adData.displayName : (session.status === false ? "Auth Failed" : "Verified"),
                status: adData ? 'success' : (session.status === false ? 'danger' : 'neutral'),
                icon: <Users className="w-6 h-6" />
            }
        );
    }

    const nodeWidth = 100 / nodes.length;

    return (
        <div className="connection-path-container my-6 p-6 bg-black/20 rounded-xl border border-border-color">
            <div className="flex justify-between items-center mb-6">
                <h4 className="text-[0.8rem] text-text-muted uppercase tracking-widest">
                    Authentication Path Visualizer
                </h4>
                {isPassive ? (
                    <div className="flex items-center gap-1.5 text-[0.7rem] text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-xl border border-sky-500/20">
                        <ShieldCheck className="w-3 h-3 text-sky-400" />
                        <span>PASSIVE IDENTITY (AD LOGON)</span>
                    </div>
                ) : isWireless && (
                    <div className="flex gap-2">
                        {session.rssi && session.rssi !== "N/A" && (
                            <div className="flex items-center gap-1.5 text-[0.7rem] text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-xl border border-emerald-500/20">
                                <span className="font-bold">{session.rssi} dBm</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[0.7rem] text-accent-primary bg-blue-500/10 px-2.5 py-1 rounded-xl border border-blue-500/20">
                            <Wifi className="w-3 h-3" />
                            <span>WIRELESS ({session.wlan_ssid})</span>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="flex items-center justify-between relative">
                {/* Connecting Line Segments */}
                <div className="absolute top-[35%] h-[2px] z-0 flex" style={{ left: `${nodeWidth/2}%`, right: `${nodeWidth/2}%` }}>
                    {nodes.slice(0, -1).map((_, i) => (
                        <div key={i} className="flex-1 h-[2px]" style={{ 
                            background: i === 0 && isWireless ? 'none' : 'var(--border-color)',
                            borderTop: i === 0 && isWireless ? '2px dashed var(--accent-primary)' : 'none',
                            opacity: i === 0 && isWireless ? 0.8 : 0.4
                        }}></div>
                    ))}
                </div>

                {nodes.map((node) => {
                    const statusColor = node.status === 'success' ? '#10b981' : (node.status === 'warning' ? '#f59e0b' : (node.status === 'danger' ? '#ef4444' : 'var(--text-muted)'));
                    const statusBg = node.status === 'success' ? 'rgba(16, 185, 129, 0.1)' : (node.status === 'warning' ? 'rgba(245, 158, 11, 0.1)' : (node.status === 'danger' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)'));

                    return (
                        <div key={node.id} className="flex flex-col items-center z-10" style={{ width: `${nodeWidth}%` }}>
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 ease-in-out" style={{ 
                                background: statusBg, border: `2px solid ${statusColor}`, color: statusColor,
                                boxShadow: node.status === 'danger' ? '0 0 15px rgba(239, 68, 68, 0.2)' : 'none'
                            }}>
                                {node.icon}
                            </div>
                            <span className="text-[0.9rem] font-bold text-text-primary">{node.label}</span>
                            <span className="text-xs text-text-muted text-center max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
                                {node.sub}
                            </span>
                        </div>
                    );
                })}
            </div>
            
            {!isPass && (
                <div className="mt-6 p-3 bg-red-500/10 rounded-lg border border-red-500/20 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <span className="text-[0.875rem] text-red-500">
                        Break detected at <strong>{nodes[2]?.label || "ISE"}</strong>: {session.authorization_rule || "Unknown Policy Failure"}
                    </span>
                </div>
            )}
        </div>
    );
}

