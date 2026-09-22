"use client";

import React, { useState } from "react";
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
    Radio,
    Info,
    ChevronDown,
    ChevronRight,
    MapPin,
    Shield,
    Key,
    Clock,
    Lock
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
        nas_port_id?: string;
        acs_server?: string;
        authorization_rule?: string;
        authentication_method?: string;
        authentication_protocol?: string;
        identity_group?: string;
        access_point_name?: string;
        wlan_ssid?: string;
        rssi?: string;
        vlan?: string;
        site_code?: string;
        status?: boolean;
        is_passive_identity?: boolean;
        session_type?: string;
        workstation_ip?: string;
        framed_ip_address?: string;
        hostname?: string;
        machine_name?: string;
        ad_distinguished_name?: string;
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
            latencyMs?: number;
        };
    };
    onNodeSelect?: (nodeId: string) => void;
}

export default function ConnectionPath({ session, onNodeSelect }: ConnectionPathProps) {
    const [selectedNodeId, setSelectedNodeId] = useState<string>("endpoint");

    const adData = session.enrichment?.ad || session.ad;
    const vectraData = session.enrichment?.vectra;
    const isPass = session.status !== false;
    const isPassive = Boolean(session.is_passive_identity || session.session_type === 'PASSIVE_ID');
    const hasVectraAlert = vectraData && (vectraData.t_score > 50 || vectraData.c_score > 50);
    const isWireless = !isPassive && Boolean((session.wlan_ssid && session.wlan_ssid !== "N/A") || session.wlcTelemetry?.found);
    const wlc = session.wlcTelemetry;

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
        if (isMedical) return <Activity className="w-5 h-5" />;
        if (isScanner) return <ScanBarcode className="w-5 h-5" />;
        if (isPrinter) return <Printer className="w-5 h-5" />;
        if (isTablet) return <Tablet className="w-5 h-5" />;
        if (isPhone) return <Smartphone className="w-5 h-5" />;
        if (isWorkstation) return <Laptop className="w-5 h-5" />;
        return <Cpu className="w-5 h-5" />;
    };

    // Calculate live signal value
    const liveRssi = wlc?.rssi !== undefined ? wlc.rssi : (session.rssi && session.rssi !== "N/A" ? parseInt(session.rssi) : null);
    const signalLabel = liveRssi !== null ? `${liveRssi} dBm` : null;
    const isGoodSignal = liveRssi !== null && liveRssi > -70;

    let nodes: any[] = [];

    if (isPassive) {
        // Passive Identity Path: Endpoint -> Domain Controller (Event 4624) -> Cisco ISE (PIC) -> Identity (AD)
        nodes = [
            {
                id: 'endpoint',
                label: session.machine_name || session.hardware_model || "Workstation",
                sub: session.hostname || session.workstation_ip || session.calling_station_id,
                status: hasVectraAlert ? 'warning' : 'success',
                icon: <Laptop className="w-5 h-5" />,
                details: {
                    title: "Endpoint Workstation Details",
                    items: [
                        { label: "Resolved Hostname", value: session.hostname || "N/A" },
                        { label: "Workstation IP", value: session.workstation_ip || session.framed_ip_address || "Dynamic IP" },
                        { label: "Operating System", value: session.os_version || "Windows" },
                        { label: "Device Placement OU", value: session.ad_distinguished_name || "Computers" },
                        { label: "Hardware Model", value: session.machine_name || session.hardware_model || "Domain PC" }
                    ]
                }
            },
            {
                id: 'dc',
                label: 'Domain Controller',
                sub: session.nas_identifier || 'AD Event 4624',
                status: 'success',
                icon: <Server className="w-5 h-5" />,
                details: {
                    title: "Active Directory Domain Controller Context",
                    items: [
                        { label: "Logon Source DC", value: session.nas_identifier || "Domain Controller" },
                        { label: "Logon Event", value: "Kerberos Event 4624 (Successful Logon)" },
                        { label: "Authentication Protocol", value: session.authentication_protocol || "Kerberos" },
                        { label: "Inspection Type", value: "Passive Identity Agent / Event Log Forwarder" }
                    ]
                }
            },
            {
                id: 'ise',
                label: 'Cisco ISE',
                sub: `${session.acs_server || "ise-psn01"} (PIC)`,
                status: 'success',
                icon: <ShieldCheck className="w-5 h-5" />,
                details: {
                    title: "Cisco ISE Policy & Node Inspection",
                    items: [
                        { label: "ISE PSN Node", value: session.acs_server || "Unknown Node" },
                        { label: "Policy Rule", value: session.authorization_rule || "PassiveID_Default" },
                        { label: "Session Engine", value: "Passive Identity Connector (PIC)" },
                        { label: "TrustSec SGT Tag", value: session.sgt_name || "Unassigned" }
                    ]
                }
            },
            {
                id: 'idp',
                label: 'Identity (AD)',
                sub: adData?.displayName || session.user_name || "Verified",
                status: 'success',
                icon: <Users className="w-5 h-5" />,
                details: {
                    title: "Active Directory Identity Profile",
                    items: [
                        { label: "Account Username", value: session.user_name || "N/A" },
                        { label: "Full Name", value: adData?.displayName || "N/A" },
                        { label: "Department", value: adData?.department || "N/A" },
                        { label: "Job Title", value: adData?.title || "N/A" },
                        { label: "Email Address", value: adData?.email || "N/A" }
                    ]
                }
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
                icon: renderEndpointIcon(),
                details: {
                    title: "Client Endpoint Telemetry",
                    items: [
                        { label: "MAC Address", value: session.calling_station_id },
                        { label: "IP Address", value: session.framed_ip_address || "No IP assigned" },
                        { label: "Classification", value: session.endpoint_profile || "Unknown Profile" },
                        { label: "Hardware Manufacturer", value: session.hardware_manufacturer || "Unknown" },
                        { label: "Hardware Model", value: session.hardware_model || "N/A" },
                        { label: "Operating System", value: session.os_version || "N/A" },
                        { label: "VLAN", value: session.vlan || "Default" }
                    ]
                }
            }
        ];

        if (isWireless) {
            nodes.push({
                id: 'ap',
                label: 'Access Point',
                sub: session.access_point_name || "Wireless AP",
                status: 'success',
                icon: <Wifi className="w-5 h-5" />,
                details: {
                    title: "Wireless Access Point & RF State",
                    items: [
                        { label: "Access Point Name", value: session.access_point_name || "N/A" },
                        { label: "SSID", value: session.wlan_ssid || "N/A" },
                        { label: "Facility Site Code", value: session.site_code || "N/A" },
                        { label: "Live RF Signal (RSSI)", value: signalLabel || "Telemetry unavailable" },
                        ...(wlc?.snr !== undefined ? [{ label: "Signal-to-Noise Ratio (SNR)", value: `${wlc.snr} dB` }] : [])
                    ]
                }
            });

            // WLC Controller Node (AireOS 8540)
            const wlcName = wlc?.wlcName || session.nas_identifier || "Cisco WLC";
            let wlcStatus = 'success';
            let wlcSub = wlc?.status ? `State: ${wlc.status}` : "Associated";

            if (wlc?.excluded) {
                wlcStatus = 'danger';
                wlcSub = 'EXCLUDED / BLACKLISTED';
            } else if (wlc && wlc.statusRaw !== 3 && wlc.statusRaw !== 2) {
                wlcStatus = 'warning';
            }

            nodes.push({
                id: 'wlc',
                label: 'Cisco WLC',
                sub: `${wlcName} (${wlcSub})`,
                status: wlcStatus,
                icon: <Radio className="w-5 h-5" />,
                details: {
                    title: "AireOS 8540 Wireless LAN Controller",
                    items: [
                        { label: "Controller Name", value: wlcName },
                        { label: "Controller IP", value: wlc?.wlcIp || "SNMP Monitored" },
                        { label: "802.11 Client Status", value: wlc?.status || "Associated" },
                        { label: "Exclusion / Blacklist", value: wlc?.excluded ? `YES (${wlc.exclusionReason || 'Policy Lock'})` : "None (Clear)" },
                        ...(wlc?.latencyMs ? [{ label: "SNMP Telemetry Latency", value: `${wlc.latencyMs} ms` }] : [])
                    ]
                }
            });
        } else {
            // Wired Switch Node
            nodes.push({
                id: 'nas',
                label: 'Access Switch',
                sub: session.nas_port_id
                    ? `${session.nas_identifier || "Switch"} (${session.nas_port_id})`
                    : (session.nas_identifier || session.nas_ip_address || "Network Switch"),
                status: 'success',
                icon: <Server className="w-5 h-5" />,
                details: {
                    title: "Network Access Device (Switch)",
                    items: [
                        { label: "Switch Hostname", value: session.nas_identifier || "Unknown Switch" },
                        { label: "Switch IP Address", value: session.nas_ip_address || "N/A" },
                        ...(session.nas_port_id ? [{ label: "Switch Port Interface", value: session.nas_port_id }] : []),
                        { label: "Facility Site Code", value: session.site_code || "N/A" },
                        { label: "Assigned Port VLAN", value: session.vlan || "Default" }
                    ]
                }
            });
        }

        nodes.push(
            {
                id: 'ise',
                label: 'Cisco ISE',
                sub: session.acs_server || "Policy Engine",
                status: isPass ? 'success' : 'danger',
                icon: <ShieldCheck className="w-5 h-5" />,
                details: {
                    title: "Cisco ISE RADIUS & Policy Evaluation",
                    items: [
                        { label: "ISE PSN Node", value: session.acs_server || "Unknown Node" },
                        { label: "Authorization Policy", value: session.authorization_rule || "Unknown Policy" },
                        { label: "Auth Method", value: session.authentication_method || "802.1X" },
                        { label: "Auth Protocol", value: session.authentication_protocol || "PEAP" },
                        { label: "Identity Group", value: session.identity_group || "Default" },
                        { label: "TrustSec SGT Tag", value: session.sgt_name || "Unassigned" }
                    ]
                }
            },
            {
                id: 'idp',
                label: 'Identity (AD)',
                sub: adData?.displayName || (session.status === false ? "Auth Failed" : (session.user_name || "Verified")),
                status: adData ? 'success' : (session.status === false ? 'danger' : 'neutral'),
                icon: <Users className="w-5 h-5" />,
                details: {
                    title: "Active Directory Identity & User Context",
                    items: [
                        { label: "User Principal Name", value: session.user_name || "Unknown" },
                        { label: "Display Name", value: adData?.displayName || session.user_name || "N/A" },
                        { label: "Department", value: adData?.department || "N/A" },
                        { label: "Job Title", value: adData?.title || "N/A" },
                        { label: "Directory Email", value: adData?.email || "N/A" }
                    ]
                }
            }
        );
    }

    const nodeWidth = 100 / nodes.length;
    const activeNode = nodes.find(n => n.id === selectedNodeId) || nodes[0];

    const handleNodeClick = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        if (onNodeSelect) onNodeSelect(nodeId);
    };

    return (
        <div className="connection-path-container my-6 p-6 bg-black/25 rounded-xl border border-border-color flex flex-col gap-5">
            {/* Header with Title and Mode Badges */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <h4 className="text-xs text-text-muted uppercase tracking-widest font-bold m-0">
                        Interactive Authentication Path Visualizer
                    </h4>
                    <span className="text-[0.65rem] text-text-muted bg-white/5 px-2 py-0.5 rounded border border-white/10">
                        Click any node to inspect telemetry
                    </span>
                </div>
                {isPassive ? (
                    <div className="flex items-center gap-1.5 text-[0.7rem] text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-xl border border-sky-500/20 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                        <span>PASSIVE IDENTITY (AD LOGON)</span>
                    </div>
                ) : isWireless && (
                    <div className="flex gap-2">
                        {signalLabel && (
                            <div className="flex items-center gap-1 text-[0.7rem] px-2.5 py-1 rounded-xl border font-bold" style={{
                                background: isGoodSignal ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                borderColor: isGoodSignal ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)',
                                color: isGoodSignal ? '#10b981' : '#f59e0b'
                            }}>
                                <Radio size={11} />
                                <span>{signalLabel}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[0.7rem] text-accent-primary bg-blue-500/10 px-2.5 py-1 rounded-xl border border-blue-500/20 font-semibold">
                            <Wifi className="w-3.5 h-3.5" />
                            <span>WIRELESS ({session.wlan_ssid})</span>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Diagram with Nodes, Connectors, and Embedded Telemetry Badges */}
            <div className="flex items-center justify-between relative py-2">
                {/* Connecting Line Segments with In-Line Telemetry Pill */}
                <div className="absolute top-[32%] h-[2px] z-0 flex" style={{ left: `${nodeWidth/2}%`, right: `${nodeWidth/2}%` }}>
                    {nodes.slice(0, -1).map((_, i) => {
                        // First segment in wireless is RF link between Endpoint and AP
                        const isRfLink = i === 0 && isWireless;
                        return (
                            <div key={i} className="flex-1 relative flex items-center justify-center">
                                <div 
                                    className="w-full h-[2px]" 
                                    style={{ 
                                        background: isRfLink ? 'none' : 'var(--border-color)',
                                        borderTop: isRfLink ? '2px dashed var(--accent-primary)' : 'none',
                                        opacity: isRfLink ? 0.9 : 0.4
                                    }}
                                />
                                {/* In-line RF RSSI Metric Pill between Endpoint and AP */}
                                {isRfLink && signalLabel && (
                                    <div 
                                        className="absolute px-2 py-0.5 rounded-full text-[0.65rem] font-bold z-10 shadow-md border flex items-center gap-1"
                                        style={{
                                            background: isGoodSignal ? '#064e3b' : '#78350f',
                                            borderColor: isGoodSignal ? '#10b981' : '#f59e0b',
                                            color: isGoodSignal ? '#34d399' : '#fcd34d'
                                        }}
                                        title="Live Wireless Signal Strength (RSSI)"
                                    >
                                        <Wifi size={10} />
                                        <span>{signalLabel}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Interactive Clickable Nodes */}
                {nodes.map((node) => {
                    const isSelected = node.id === activeNode.id;
                    const statusColor = node.status === 'success' ? '#10b981' : (node.status === 'warning' ? '#f59e0b' : (node.status === 'danger' ? '#ef4444' : 'var(--text-muted)'));
                    const statusBg = node.status === 'success' ? 'rgba(16, 185, 129, 0.12)' : (node.status === 'warning' ? 'rgba(245, 158, 11, 0.12)' : (node.status === 'danger' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255,255,255,0.05)'));

                    return (
                        <div 
                            key={node.id} 
                            onClick={() => handleNodeClick(node.id)}
                            className="flex flex-col items-center z-10 cursor-pointer group transition-transform hover:scale-105" 
                            style={{ width: `${nodeWidth}%` }}
                        >
                            <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center mb-2 transition-all duration-200 relative" 
                                style={{ 
                                    background: isSelected ? 'rgba(56, 189, 248, 0.2)' : statusBg, 
                                    border: isSelected ? '2px solid var(--accent-primary)' : `2px solid ${statusColor}`, 
                                    color: isSelected ? 'var(--accent-primary)' : statusColor,
                                    boxShadow: isSelected 
                                        ? '0 0 16px rgba(56, 189, 248, 0.4)' 
                                        : (node.status === 'danger' ? '0 0 15px rgba(239, 68, 68, 0.3)' : 'none')
                                }}
                            >
                                {node.icon}
                                {isSelected && (
                                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-accent-primary border-2 border-black" />
                                )}
                            </div>
                            <span className="text-[0.85rem] font-bold text-text-primary text-center group-hover:text-accent-primary transition-colors">
                                {node.label}
                            </span>
                            <span className="text-[0.7rem] text-text-muted text-center max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap mt-0.5">
                                {node.sub}
                            </span>
                        </div>
                    );
                })}
            </div>
            
            {/* Failure Break Indicator */}
            {!isPass && (
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20 flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300">
                        Authentication break detected at <strong>{nodes.find(n => n.status === 'danger')?.label || "Cisco ISE"}</strong>: {session.authorization_rule || "RADIUS Access-Reject"}
                    </span>
                </div>
            )}

            {/* Selected Node Telemetry Spotlight Drawer */}
            {activeNode && activeNode.details && (
                <div className="p-4 rounded-lg bg-black/40 border border-accent-primary/30 flex flex-col gap-2.5 transition-all">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <div className="flex items-center gap-2">
                            <Info size={14} className="text-accent-primary" />
                            <h5 className="text-xs font-bold text-text-primary m-0 uppercase tracking-wider">
                                {activeNode.details.title}
                            </h5>
                        </div>
                        <span className="text-[0.65rem] text-accent-primary font-mono font-bold uppercase">
                            Node: {activeNode.label}
                        </span>
                    </div>

                    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 text-xs">
                        {activeNode.details.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex flex-col">
                                <span className="text-[0.65rem] text-text-muted uppercase font-semibold">
                                    {item.label}
                                </span>
                                <span className="text-text-primary font-medium truncate mt-0.5" title={item.value}>
                                    {item.value || "N/A"}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
