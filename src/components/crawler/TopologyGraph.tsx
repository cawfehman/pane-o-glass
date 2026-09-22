"use client";

import React, { useState, useMemo } from "react";
import { 
    ZoomIn, 
    ZoomOut, 
    RotateCcw, 
    Server, 
    Network, 
    Layers, 
    AlertCircle, 
    ShieldAlert, 
    CheckCircle2, 
    XCircle,
    Compass
} from "lucide-react";

interface TopologyGraphProps {
    devices: any[];
    links: any[];
    selectedDevice: any | null;
    onSelectDevice: (dev: any) => void;
    activeHopDevices?: string[];
    highlightedLinks?: Array<{ from: string; to: string }>;
}

export default function TopologyGraph({
    devices,
    links,
    selectedDevice,
    onSelectDevice,
    activeHopDevices = [],
    highlightedLinks = []
}: TopologyGraphProps) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [siteFilter, setSiteFilter] = useState<string>("ALL");

    // Filter devices
    const filteredDevices = useMemo(() => {
        if (siteFilter === "ALL") return devices;
        return devices.filter(d => d.site === siteFilter);
    }, [devices, siteFilter]);

    const filteredDeviceHostnames = useMemo(() => {
        return new Set(filteredDevices.map(d => d.hostname));
    }, [filteredDevices]);

    const uniqueSites = useMemo(() => {
        const sites = new Set<string>();
        for (const d of devices) {
            if (d.site) sites.add(d.site);
        }
        return Array.from(sites).sort();
    }, [devices]);

    // Compute layout positions for nodes
    // Hierarchical grouping: Routers (top), L3 Switches (middle), L2 Switches (bottom)
    const nodePositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const width = 1100;
        const height = 650;

        const routers = filteredDevices.filter(d => d.role === "Router");
        const l3Switches = filteredDevices.filter(d => d.role === "L3 Switch");
        const l2Switches = filteredDevices.filter(d => d.role === "L2 Switch" || (d.role !== "Router" && d.role !== "L3 Switch"));

        const placeRow = (rowDevs: any[], yPos: number) => {
            const count = rowDevs.length;
            if (count === 0) return;
            const spacing = width / (count + 1);
            rowDevs.forEach((dev, idx) => {
                positions.set(dev.hostname, {
                    x: spacing * (idx + 1),
                    y: yPos
                });
            });
        };

        placeRow(routers, 100);
        placeRow(l3Switches, 300);
        placeRow(l2Switches, 520);

        return positions;
    }, [filteredDevices]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const isHopDevice = (hostname: string) => activeHopDevices.includes(hostname);

    return (
        <div className="relative w-full h-[620px] bg-slate-950/60 rounded-xl border border-border-color overflow-hidden flex flex-col select-none">
            {/* Control Bar Overlay */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-2 rounded-lg border border-border-color shadow-lg">
                <span className="text-[0.7rem] uppercase tracking-wider text-text-muted font-bold mr-1">Site:</span>
                <select
                    value={siteFilter}
                    onChange={(e) => setSiteFilter(e.target.value)}
                    className="bg-white/10 border border-white/20 text-text-primary text-xs rounded px-2 py-1 outline-none cursor-pointer"
                >
                    <option value="ALL">All Sites ({devices.length})</option>
                    {uniqueSites.map(s => (
                        <option key={s} value={s}>Site {s} ({devices.filter(d => d.site === s).length})</option>
                    ))}
                </select>

                <div className="h-4 w-[1px] bg-border-color mx-1"></div>

                <button
                    onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}
                    className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-text-primary"
                    title="Zoom In"
                >
                    <ZoomIn size={16} />
                </button>
                <button
                    onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}
                    className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-text-primary"
                    title="Zoom Out"
                >
                    <ZoomOut size={16} />
                </button>
                <button
                    onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    className="p-1 rounded hover:bg-white/10 text-text-secondary hover:text-text-primary"
                    title="Reset View"
                >
                    <RotateCcw size={14} />
                </button>
            </div>

            {/* Legend Overlay */}
            <div className="absolute bottom-4 left-4 z-20 flex items-center gap-4 bg-black/70 backdrop-blur-md px-4 py-2 rounded-lg border border-border-color text-[0.7rem] text-text-secondary">
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
                    <span>Router</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                    <span>L3 Switch</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span>L2 Switch</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                    <span>Unreachable</span>
                </div>
                {activeHopDevices.length > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-400/50 animate-ping"></span>
                        <span>Traced Packet Hop</span>
                    </div>
                )}
            </div>

            {/* Interactive SVG Canvas */}
            <div
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 1100 650"
                    className="w-full h-full"
                >
                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* Render Links */}
                        {links.map((link, idx) => {
                            const p1 = nodePositions.get(link.sourceDevice);
                            const p2 = nodePositions.get(link.targetDevice);
                            if (!p1 || !p2) return null;

                            const isHighlighted = highlightedLinks.some(
                                hl => (hl.from === link.sourceDevice && hl.to === link.targetDevice) ||
                                      (hl.from === link.targetDevice && hl.to === link.sourceDevice)
                            );

                            const isDown = link.status === "DOWN";
                            const strokeColor = isHighlighted ? "#f59e0b" : isDown ? "#ef4444" : "#0284c7";
                            const strokeWidth = isHighlighted ? 4 : 2;
                            const strokeDash = link.linkType === "L2_TRUNK" ? "6,4" : undefined;

                            return (
                                <g key={idx}>
                                    <line
                                        x1={p1.x}
                                        y1={p1.y}
                                        x2={p2.x}
                                        y2={p2.y}
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={strokeDash}
                                        opacity={isHighlighted ? 1 : 0.6}
                                        className={isHighlighted ? "animate-pulse" : ""}
                                    />
                                    {/* Link Midpoint Hover Tooltip or Type Badge */}
                                    <circle
                                        cx={(p1.x + p2.x) / 2}
                                        cy={(p1.y + p2.y) / 2}
                                        r={isHighlighted ? 4 : 2.5}
                                        fill={strokeColor}
                                    />
                                </g>
                            );
                        })}

                        {/* Render Nodes */}
                        {filteredDevices.map((dev) => {
                            const pos = nodePositions.get(dev.hostname);
                            if (!pos) return null;

                            const isSelected = selectedDevice?.hostname === dev.hostname;
                            const isHop = isHopDevice(dev.hostname);
                            const isUnreachable = dev.status !== "REACHABLE";

                            let nodeColor = "#0284c7";
                            if (dev.role === "Router") nodeColor = "#00b4d8";
                            else if (dev.role === "L3 Switch") nodeColor = "#0369a1";
                            else if (dev.role === "L2 Switch") nodeColor = "#10b981";

                            if (isUnreachable) nodeColor = "#ef4444";

                            return (
                                <g
                                    key={dev.hostname}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectDevice(dev);
                                    }}
                                    className="cursor-pointer transition-transform hover:scale-105"
                                >
                                    {/* Outer Highlight Ring for Selected or Traced Node */}
                                    {(isSelected || isHop) && (
                                        <circle
                                            r={46}
                                            fill="none"
                                            stroke={isHop ? "#f59e0b" : "#38bdf8"}
                                            strokeWidth={3}
                                            strokeDasharray={isHop ? "4,3" : undefined}
                                            className={isHop ? "animate-spin" : ""}
                                            opacity={0.9}
                                        />
                                    )}

                                    {/* Node Box */}
                                    <rect
                                        x={-68}
                                        y={-28}
                                        width={136}
                                        height={56}
                                        rx={8}
                                        fill={nodeColor}
                                        stroke={isSelected ? "#ffffff" : isHop ? "#fbbf24" : "rgba(255,255,255,0.2)"}
                                        strokeWidth={isSelected || isHop ? 2.5 : 1}
                                        filter="drop-shadow(0 4px 8px rgba(0,0,0,0.5))"
                                    />

                                    {/* Node Icon */}
                                    <g transform="translate(-56, -14)">
                                        {dev.role === "Router" && <Server size={14} color="#ffffff" />}
                                        {dev.role === "L3 Switch" && <Layers size={14} color="#ffffff" />}
                                        {dev.role === "L2 Switch" && <Network size={14} color="#ffffff" />}
                                        {isUnreachable && <AlertCircle size={14} color="#ffffff" />}
                                    </g>

                                    {/* Device Hostname */}
                                    <text
                                        x={-36}
                                        y={-5}
                                        fill="#ffffff"
                                        fontSize={11}
                                        fontWeight="bold"
                                        fontFamily="monospace"
                                    >
                                        {dev.hostname.length > 14 ? dev.hostname.slice(0, 13) + "…" : dev.hostname}
                                    </text>

                                    {/* Device IP */}
                                    <text
                                        x={-36}
                                        y={12}
                                        fill="#e2e8f0"
                                        fontSize={10}
                                        fontFamily="monospace"
                                        opacity={0.85}
                                    >
                                        {dev.ipAddress}
                                    </text>

                                    {/* Unreachable Pill */}
                                    {isUnreachable && (
                                        <g transform="translate(0, 20)">
                                            <rect x={-45} y={-2} width={90} height={12} rx={4} fill="#7f1d1d" />
                                            <text x={0} y={7} fill="#fca5a5" fontSize={8} fontWeight="bold" textAnchor="middle">
                                                FAILED SSH
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
}
