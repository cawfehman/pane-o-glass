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
    Compass,
    Building2,
    Box,
    Workflow,
    Layers3,
    Cable,
    ExternalLink
} from "lucide-react";

export interface SiteMetadataLookup {
    name: string;
    address?: string;
}

interface TopologyGraphProps {
    devices: any[];
    links: any[];
    siteDirectory?: Record<string, SiteMetadataLookup>;
    selectedDevice: any | null;
    onSelectDevice: (dev: any) => void;
    activeHopDevices?: string[];
    highlightedLinks?: Array<{ from: string; to: string }>;
    onReseedDevice?: (dev: any) => void;
}

export function parseDeviceSiteAndIdf(hostname: string, devSite?: string | null, devIdf?: string | null) {
    const shortHost = (hostname || "").split(".")[0].trim();
    let site = (devSite || (shortHost.length >= 3 ? shortHost.slice(0, 3) : "UNK")).toUpperCase();
    let idf = "MDF";
    if (devIdf) {
        idf = devIdf.toUpperCase();
    } else if (shortHost.includes("-")) {
        const parts = shortHost.split("-");
        if (parts.length > 1 && parts[1]) {
            idf = parts[1].slice(0, 3).toUpperCase();
        }
    }
    return { site, idf, shortHost };
}

export function formatLastVerified(ts?: string | null): string {
    if (!ts) return "Never";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Never";
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${dateStr} ${timeStr}`;
}

export function getDeviceLayer(dev: any): { layer: "L3" | "L2"; label: string } {
    const role = (dev.role || "").toLowerCase();
    if (role.includes("router") || role === "router") {
        return { layer: "L3", label: "L3 Router" };
    }
    if (role.includes("l3") || role.includes("dist") || role.includes("core")) {
        return { layer: "L3", label: "L3 Multilayer" };
    }
    if (role.includes("l2") || role.includes("access")) {
        return { layer: "L2", label: "L2 Access" };
    }
    const routes = Array.isArray(dev.routes) ? dev.routes : [];
    if (routes.length > 2) {
        return { layer: "L3", label: "L3 Switch" };
    }
    return { layer: "L2", label: "L2 Switch" };
}

interface SiteContainerBox {
    siteCode: string;
    siteName: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
    deviceCount: number;
    idfs: IdfContainerBox[];
}

interface IdfContainerBox {
    siteCode: string;
    idfCode: string;
    x: number;
    y: number;
    width: number;
    height: number;
    deviceCount: number;
}

export default function TopologyGraph({
    devices,
    links,
    siteDirectory = {},
    selectedDevice,
    onSelectDevice,
    activeHopDevices = [],
    highlightedLinks = [],
    onReseedDevice
}: TopologyGraphProps) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [siteFilter, setSiteFilter] = useState<string>("ALL");
    const [layoutMode, setLayoutMode] = useState<"container" | "flow">("container");
    const [hoveredLink, setHoveredLink] = useState<any | null>(null);

    // Filter devices based on Site selection
    const filteredDevices = useMemo(() => {
        if (siteFilter === "ALL") return devices;
        return devices.filter(d => {
            const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            return site === siteFilter;
        });
    }, [devices, siteFilter]);

    const uniqueSites = useMemo(() => {
        const sites = new Set<string>();
        for (const d of devices) {
            const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            if (site) sites.add(site);
        }
        return Array.from(sites).sort();
    }, [devices]);

    // Group parallel links between the same pairs of devices into Link Bundles (Port Channels / LAG)
    const bundledLinks = useMemo(() => {
        const map = new Map<string, {
            id: string;
            sourceDevice: string;
            targetDevice: string;
            links: any[];
            isPortChannel: boolean;
            channelName?: string;
            status: string;
        }>();

        for (const link of links) {
            const pair = [link.sourceDevice, link.targetDevice].sort().join(" <--> ");
            const isPo = Boolean(
                link.linkType === "PORT_CHANNEL" ||
                (link.sourceInterface && link.sourceInterface.toLowerCase().startsWith("po")) ||
                (link.targetInterface && link.targetInterface.toLowerCase().startsWith("po"))
            );

            let channelName: string | undefined = undefined;
            if (link.sourceInterface?.toLowerCase().startsWith("po")) channelName = link.sourceInterface;
            else if (link.targetInterface?.toLowerCase().startsWith("po")) channelName = link.targetInterface;

            if (!map.has(pair)) {
                map.set(pair, {
                    id: pair,
                    sourceDevice: link.sourceDevice,
                    targetDevice: link.targetDevice,
                    links: [link],
                    isPortChannel: isPo,
                    channelName,
                    status: link.status || "UP"
                });
            } else {
                const item = map.get(pair)!;
                item.links.push(link);
                item.isPortChannel = true; // Multiple physical connections form a Port Channel / LAG bundle
                if (link.status === "DOWN" || item.status === "DOWN") item.status = "DOWN";
                else if (link.status === "UNVERIFIED" || item.status === "UNVERIFIED") item.status = "UNVERIFIED";
                if (!item.channelName && channelName) item.channelName = channelName;
            }
        }

        return Array.from(map.values());
    }, [links]);

    // Dynamic layout positioning: Container Hierarchy (Site -> IDF -> Devices) or Hierarchical Flow
    const { nodePositions, siteBoxes, idfBoxes, canvasSize } = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const siteContainers: SiteContainerBox[] = [];
        const idfContainers: IdfContainerBox[] = [];

        const CARD_WIDTH = 172;
        const CARD_HEIGHT = 74;
        const CARD_GAP_X = 20;
        const CARD_GAP_Y = 16;
        const IDF_PAD_X = 18;
        const IDF_PAD_TOP = 36;
        const IDF_PAD_BOTTOM = 16;
        const SITE_PAD_X = 22;
        const SITE_PAD_TOP = 46;
        const SITE_PAD_BOTTOM = 22;

        if (layoutMode === "flow") {
            // Traditional Hierarchical Flow (Routers -> L3 Switches -> L2 Switches)
            const width = 1200;
            const height = 700;
            const routers = filteredDevices.filter(d => getDeviceLayer(d).layer === "L3" && d.role === "Router");
            const l3Switches = filteredDevices.filter(d => getDeviceLayer(d).layer === "L3" && d.role !== "Router");
            const l2Switches = filteredDevices.filter(d => getDeviceLayer(d).layer === "L2");

            const placeRow = (rowDevs: any[], yPos: number) => {
                if (rowDevs.length === 0) return;
                const spacing = width / (rowDevs.length + 1);
                rowDevs.forEach((dev, idx) => {
                    positions.set(dev.hostname, {
                        x: spacing * (idx + 1),
                        y: yPos
                    });
                });
            };

            placeRow(routers, 100);
            placeRow(l3Switches, 300);
            placeRow(l2Switches, 540);

            return { 
                nodePositions: positions, 
                siteBoxes: [], 
                idfBoxes: [], 
                canvasSize: { width, height } 
            };
        }

        // --- Container Grouping Mode (Site -> IDF -> Devices) ---
        // 1. Group devices by site -> idf
        const siteGroups = new Map<string, Map<string, any[]>>();
        for (const dev of filteredDevices) {
            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
            if (!siteGroups.has(site)) {
                siteGroups.set(site, new Map());
            }
            const idfMap = siteGroups.get(site)!;
            if (!idfMap.has(idf)) {
                idfMap.set(idf, []);
            }
            idfMap.get(idf)!.push(dev);
        }

        let currentSiteX = 40;
        let maxSiteHeight = 0;
        const SITE_GAP = 40;
        const startY = 40;

        for (const [siteCode, idfMap] of siteGroups.entries()) {
            const siteLookup = siteDirectory[siteCode];
            const siteName = siteLookup?.name || null;
            let currentIdfX = currentSiteX + SITE_PAD_X;
            let maxIdfHeightInSite = 0;
            const siteIdfBoxes: IdfContainerBox[] = [];
            let totalDevsInSite = 0;

            const sortedIdfs = Array.from(idfMap.keys()).sort((a, b) => {
                if (a === "MDF") return -1;
                if (b === "MDF") return 1;
                return a.localeCompare(b);
            });

            for (const idfCode of sortedIdfs) {
                const devs = idfMap.get(idfCode)!;
                totalDevsInSite += devs.length;

                // Sort devices: L3 routers/switches first, then L2
                devs.sort((a, b) => {
                    const lA = getDeviceLayer(a).layer;
                    const lB = getDeviceLayer(b).layer;
                    if (lA === "L3" && lB === "L2") return -1;
                    if (lA === "L2" && lB === "L3") return 1;
                    return a.hostname.localeCompare(b.hostname);
                });

                // Layout within IDF: Single column if <= 3 devices, 2 columns if > 3
                const cols = devs.length > 3 ? 2 : 1;
                const rows = Math.ceil(devs.length / cols);

                const idfWidth = cols * CARD_WIDTH + (cols - 1) * CARD_GAP_X + IDF_PAD_X * 2;
                const idfHeight = rows * CARD_HEIGHT + (rows - 1) * CARD_GAP_Y + IDF_PAD_TOP + IDF_PAD_BOTTOM;

                const idfBox: IdfContainerBox = {
                    siteCode,
                    idfCode,
                    x: currentIdfX,
                    y: startY + SITE_PAD_TOP,
                    width: idfWidth,
                    height: idfHeight,
                    deviceCount: devs.length
                };
                siteIdfBoxes.push(idfBox);
                idfContainers.push(idfBox);

                // Position device nodes inside IDF
                devs.forEach((dev, idx) => {
                    const col = idx % cols;
                    const row = Math.floor(idx / cols);

                    const nodeCenterX = idfBox.x + IDF_PAD_X + col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH / 2;
                    const nodeCenterY = idfBox.y + IDF_PAD_TOP + row * (CARD_HEIGHT + CARD_GAP_Y) + CARD_HEIGHT / 2;

                    positions.set(dev.hostname, {
                        x: nodeCenterX,
                        y: nodeCenterY
                    });
                });

                currentIdfX += idfWidth + 20;
                if (idfHeight > maxIdfHeightInSite) {
                    maxIdfHeightInSite = idfHeight;
                }
            }

            const siteWidth = currentIdfX - currentSiteX - 20 + SITE_PAD_X;
            const siteHeight = maxIdfHeightInSite + SITE_PAD_TOP + SITE_PAD_BOTTOM;

            // Normalize IDF box heights within this site for visual symmetry
            for (const idf of siteIdfBoxes) {
                idf.height = maxIdfHeightInSite;
            }

            siteContainers.push({
                siteCode,
                siteName,
                x: currentSiteX,
                y: startY,
                width: Math.max(siteWidth, 240),
                height: siteHeight,
                deviceCount: totalDevsInSite,
                idfs: siteIdfBoxes
            });

            currentSiteX += Math.max(siteWidth, 240) + SITE_GAP;
            if (siteHeight > maxSiteHeight) {
                maxSiteHeight = siteHeight;
            }
        }

        const totalWidth = Math.max(currentSiteX + 40, 1200);
        const totalHeight = Math.max(maxSiteHeight + 100, 700);

        return {
            nodePositions: positions,
            siteBoxes: siteContainers,
            idfBoxes: idfContainers,
            canvasSize: { width: totalWidth, height: totalHeight }
        };
    }, [filteredDevices, layoutMode, siteDirectory]);

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
        <div className="relative w-full h-[660px] bg-slate-950/70 rounded-2xl border border-slate-800/80 overflow-hidden flex flex-col select-none shadow-xl">
            {/* Top Control Bar Overlay */}
            <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2.5 bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 shadow-2xl">
                {/* Site Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Site:</span>
                    <select
                        value={siteFilter}
                        onChange={(e) => setSiteFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1 outline-none cursor-pointer focus:border-blue-500 transition font-medium"
                    >
                        <option value="ALL">All Sites ({devices.length} devices)</option>
                        {uniqueSites.map(s => {
                            const count = devices.filter(d => parseDeviceSiteAndIdf(d.hostname, d.site, d.idf).site === s).length;
                            const siteMeta = siteDirectory[s];
                            const label = siteMeta?.name ? `Site ${s} (${siteMeta.name})` : `Site ${s}`;
                            return (
                                <option key={s} value={s}>{label} [{count}]</option>
                            );
                        })}
                    </select>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Layout Mode Toggle */}
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                    <button
                        type="button"
                        onClick={() => setLayoutMode("container")}
                        className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            layoutMode === "container"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Group switches by Site and IDF containers"
                    >
                        <Box className="w-3 h-3" />
                        Site &amp; IDF Containers
                    </button>
                    <button
                        type="button"
                        onClick={() => setLayoutMode("flow")}
                        className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            layoutMode === "flow"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Display hierarchical flow (Routers -> L3 -> L2)"
                    >
                        <Workflow className="w-3 h-3" />
                        Hierarchical
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Zoom & Reset Controls */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setZoom(z => Math.min(z + 0.15, 2.5))}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom In"
                    >
                        <ZoomIn size={14} />
                    </button>
                    <button
                        onClick={() => setZoom(z => Math.max(z - 0.15, 0.4))}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom Out"
                    >
                        <ZoomOut size={14} />
                    </button>
                    <button
                        onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Reset View"
                    >
                        <RotateCcw size={14} />
                    </button>
                </div>
            </div>

            {/* Bottom Legend Overlay */}
            <div className="absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-3.5 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-800 text-[11px] text-slate-300 shadow-xl">
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    <span className="font-semibold text-cyan-300">L3</span>
                    <span className="text-slate-400">Routed / Multilayer</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span className="font-semibold text-emerald-300">L2</span>
                    <span className="text-slate-400">Switched / Access</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <Cable className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-semibold text-blue-300">Po / LAG</span>
                    <span className="text-slate-400">Port Channel Bundle</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded border border-dashed border-amber-400 bg-amber-500/20"></span>
                    <span className="font-semibold text-amber-300">Unverified</span>
                    <span className="text-slate-400">Boundary (Hop Limit)</span>
                </div>
                {activeHopDevices.length > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                        <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-amber-400/50 animate-ping"></span>
                        <span>Traced Hop</span>
                    </div>
                )}
            </div>

            {/* Hovered Link Info Tooltip Card */}
            {hoveredLink && (
                <div className="absolute bottom-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-blue-500/40 text-xs shadow-2xl max-w-sm space-y-1.5 pointer-events-none">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                        <span className="font-bold text-white flex items-center gap-1.5">
                            <Cable className="w-3.5 h-3.5 text-blue-400" />
                            {hoveredLink.isPortChannel ? `Port-Channel Bundle (${hoveredLink.links.length} Links)` : "Inter-Switch Trunk Link"}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                            hoveredLink.status === "UNVERIFIED" ? "bg-amber-500/20 text-amber-300" : hoveredLink.status === "DOWN" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                        }`}>
                            {hoveredLink.status}
                        </span>
                    </div>
                    <div className="space-y-1 font-mono text-[11px] text-slate-300">
                        {hoveredLink.links.map((lnk: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between gap-3 bg-slate-950/60 px-2 py-1 rounded">
                                <span className="text-cyan-300">{lnk.sourceDevice}:{lnk.sourceInterface}</span>
                                <span className="text-slate-500">↔</span>
                                <span className="text-emerald-300">{lnk.targetDevice}:{lnk.targetInterface}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                    viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                    className="w-full h-full"
                >
                    <defs>
                        {/* Background Subtle Grid Pattern */}
                        <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" strokeWidth="1" />
                        </pattern>
                        {/* Glow Filter for Highlights */}
                        <filter id="glow-highlight" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {/* Canvas Background Grid */}
                    <rect width="100%" height="100%" fill="url(#grid-pattern)" />

                    <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* 1. RENDER SITE CONTAINERS */}
                        {layoutMode === "container" && siteBoxes.map((site) => (
                            <g key={`site-${site.siteCode}`} className="transition-opacity duration-300">
                                {/* Outer Site Enclosure */}
                                <rect
                                    x={site.x}
                                    y={site.y}
                                    width={site.width}
                                    height={site.height}
                                    rx={14}
                                    fill="rgba(15, 23, 42, 0.55)"
                                    stroke="rgba(71, 85, 105, 0.5)"
                                    strokeWidth={1.5}
                                    strokeDasharray="6,4"
                                />

                                {/* Site Header Bar */}
                                <g transform={`translate(${site.x + 14}, ${site.y + 16})`}>
                                    <rect x={0} y={-2} width={26} height={20} rx={6} fill="rgba(59, 130, 246, 0.2)" />
                                    <text x={13} y={12} fill="#60a5fa" fontSize={11} fontWeight="bold" textAnchor="middle">
                                        {site.siteCode}
                                    </text>

                                    <text x={34} y={12} fill="#ffffff" fontSize={12} fontWeight="bold">
                                        SITE: {site.siteCode}
                                        {site.siteName && (
                                            <tspan fill="#94a3b8" fontWeight="normal"> — {site.siteName}</tspan>
                                        )}
                                    </text>

                                    <text x={site.width - 32} y={12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                        {site.deviceCount} {site.deviceCount === 1 ? "device" : "devices"} • {site.idfs.length} {site.idfs.length === 1 ? "IDF" : "IDFs"}
                                    </text>
                                </g>

                                {/* 2. RENDER NESTED IDF CONTAINERS */}
                                {site.idfs.map((idf) => (
                                    <g key={`idf-${site.siteCode}-${idf.idfCode}`}>
                                        <rect
                                            x={idf.x}
                                            y={idf.y}
                                            width={idf.width}
                                            height={idf.height}
                                            rx={10}
                                            fill="rgba(30, 41, 59, 0.45)"
                                            stroke="rgba(100, 116, 139, 0.4)"
                                            strokeWidth={1}
                                        />

                                        {/* IDF Header */}
                                        <g transform={`translate(${idf.x + 12}, ${idf.y + 14})`}>
                                            <rect x={0} y={-2} width={18} height={16} rx={4} fill="rgba(148, 163, 184, 0.15)" />
                                            <text x={9} y={10} fill="#cbd5e1" fontSize={9} fontWeight="bold" textAnchor="middle">
                                                ■
                                            </text>
                                            <text x={24} y={10} fill="#cbd5e1" fontSize={11} fontWeight="bold" fontFamily="monospace">
                                                IDF: {idf.idfCode}
                                            </text>
                                            <text x={idf.width - 24} y={10} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                                ({idf.deviceCount})
                                            </text>
                                        </g>
                                    </g>
                                ))}
                            </g>
                        ))}

                        {/* 3. RENDER LINKS & PORT-CHANNEL BUNDLES */}
                        {bundledLinks.map((bundle) => {
                            const p1 = nodePositions.get(bundle.sourceDevice);
                            const p2 = nodePositions.get(bundle.targetDevice);
                            if (!p1 || !p2) return null;

                            const isHighlighted = highlightedLinks.some(
                                hl => (hl.from === bundle.sourceDevice && hl.to === bundle.targetDevice) ||
                                      (hl.from === bundle.targetDevice && hl.to === bundle.sourceDevice)
                            );

                            const isUnverified = bundle.status === "UNVERIFIED";
                            const isDown = bundle.status === "DOWN";

                            const strokeColor = isHighlighted 
                                ? "#f59e0b" 
                                : isUnverified 
                                ? "#f59e0b" 
                                : isDown 
                                ? "#ef4444" 
                                : bundle.isPortChannel 
                                ? "#38bdf8" 
                                : "#0284c7";

                            const strokeWidth = isHighlighted ? 4 : bundle.isPortChannel ? 3.5 : 2;
                            const strokeDash = isUnverified ? "6,4" : undefined;

                            const midX = (p1.x + p2.x) / 2;
                            const midY = (p1.y + p2.y) / 2;

                            return (
                                <g 
                                    key={bundle.id}
                                    onMouseEnter={() => setHoveredLink(bundle)}
                                    onMouseLeave={() => setHoveredLink(null)}
                                    className="cursor-pointer group"
                                >
                                    {/* Invisible wider hit area for easy hover */}
                                    <line
                                        x1={p1.x}
                                        y1={p1.y}
                                        x2={p2.x}
                                        y2={p2.y}
                                        stroke="transparent"
                                        strokeWidth={14}
                                    />

                                    {/* Link Line */}
                                    <line
                                        x1={p1.x}
                                        y1={p1.y}
                                        x2={p2.x}
                                        y2={p2.y}
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={strokeDash}
                                        opacity={isHighlighted ? 1 : isUnverified ? 0.75 : 0.7}
                                        className={isHighlighted ? "animate-pulse" : ""}
                                    />

                                    {/* Secondary line to visually represent Port-Channel multi-strand bundle */}
                                    {bundle.isPortChannel && (
                                        <line
                                            x1={p1.x}
                                            y1={p1.y}
                                            x2={p2.x}
                                            y2={p2.y}
                                            stroke="#0f172a"
                                            strokeWidth={1}
                                            strokeDasharray="3,3"
                                            opacity={0.9}
                                        />
                                    )}

                                    {/* Port-Channel / Bundle Midpoint Badge */}
                                    {bundle.isPortChannel ? (
                                        <g transform={`translate(${midX}, ${midY})`}>
                                            <rect
                                                x={-28}
                                                y={-9}
                                                width={56}
                                                height={18}
                                                rx={5}
                                                fill="#090d16"
                                                stroke={strokeColor}
                                                strokeWidth={1}
                                                filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
                                            />
                                            <text
                                                x={0}
                                                y={3.5}
                                                fill={strokeColor}
                                                fontSize={8.5}
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                                textAnchor="middle"
                                            >
                                                {bundle.channelName || `Po (${bundle.links.length}x)`}
                                            </text>
                                        </g>
                                    ) : (
                                        <circle
                                            cx={midX}
                                            cy={midY}
                                            r={isHighlighted ? 4 : 2.5}
                                            fill={strokeColor}
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* 4. RENDER DEVICE NODES */}
                        {filteredDevices.map((dev) => {
                            const pos = nodePositions.get(dev.hostname);
                            if (!pos) return null;

                            const isSelected = selectedDevice?.hostname === dev.hostname;
                            const isHop = isHopDevice(dev.hostname);
                            const isUnverified = dev.status === "UNVERIFIED";
                            const isUnreachable = dev.status !== "REACHABLE" && !isUnverified;
                            const { layer, label: layerLabel } = getDeviceLayer(dev);
                            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);

                            // Node Color scheme based on L3 vs L2 vs Unverified
                            let borderColor = isSelected ? "#38bdf8" : isHop ? "#fbbf24" : "rgba(255,255,255,0.18)";
                            let borderDash: string | undefined = undefined;
                            let cardBg = "#0f172a";

                            if (isUnverified) {
                                borderColor = "#f59e0b";
                                borderDash = "5,3";
                                cardBg = "rgba(20, 24, 39, 0.95)";
                            } else if (isUnreachable) {
                                borderColor = "#ef4444";
                                cardBg = "rgba(45, 10, 10, 0.95)";
                            } else if (layer === "L3") {
                                borderColor = isSelected ? "#ffffff" : "rgba(56, 189, 248, 0.5)";
                                cardBg = "rgba(12, 35, 64, 0.95)";
                            } else {
                                borderColor = isSelected ? "#ffffff" : "rgba(16, 185, 129, 0.4)";
                                cardBg = "rgba(6, 44, 34, 0.95)";
                            }

                            const CARD_W = 172;
                            const CARD_H = 74;

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
                                    {/* Selection or Traced Hop Highlight Ring */}
                                    {(isSelected || isHop) && (
                                        <rect
                                            x={-CARD_W / 2 - 4}
                                            y={-CARD_H / 2 - 4}
                                            width={CARD_W + 8}
                                            height={CARD_H + 8}
                                            rx={12}
                                            fill="none"
                                            stroke={isHop ? "#f59e0b" : "#38bdf8"}
                                            strokeWidth={2.5}
                                            strokeDasharray={isHop ? "4,3" : undefined}
                                            className={isHop ? "animate-pulse" : ""}
                                            opacity={0.9}
                                        />
                                    )}

                                    {/* Device Card Body */}
                                    <rect
                                        x={-CARD_W / 2}
                                        y={-CARD_H / 2}
                                        width={CARD_W}
                                        height={CARD_H}
                                        rx={8}
                                        fill={cardBg}
                                        stroke={borderColor}
                                        strokeWidth={isSelected || isHop ? 2 : 1.2}
                                        strokeDasharray={borderDash}
                                        filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                    />

                                    {/* Left Accent Strip (L3 Cyan, L2 Green, Unverified Amber, Unreachable Red) */}
                                    <path
                                        d={`M ${-CARD_W / 2} ${-CARD_H / 2 + 8} A 8 8 0 0 1 ${-CARD_W / 2 + 8} ${-CARD_H / 2} L ${-CARD_W / 2 + 4} ${-CARD_H / 2} L ${-CARD_W / 2 + 4} ${CARD_H / 2} L ${-CARD_W / 2 + 8} ${CARD_H / 2} A 8 8 0 0 1 ${-CARD_W / 2} ${CARD_H / 2 - 8} Z`}
                                        fill={isUnverified ? "#f59e0b" : isUnreachable ? "#ef4444" : layer === "L3" ? "#0284c7" : "#10b981"}
                                    />

                                    {/* L3 vs L2 Badge Chip (Top-Right) */}
                                    <g transform={`translate(${CARD_W / 2 - 28}, ${-CARD_H / 2 + 7})`}>
                                        <rect
                                            x={0}
                                            y={0}
                                            width={22}
                                            height={13}
                                            rx={3}
                                            fill={isUnverified ? "rgba(245, 158, 11, 0.2)" : layer === "L3" ? "rgba(56, 189, 248, 0.2)" : "rgba(16, 185, 129, 0.2)"}
                                            stroke={isUnverified ? "#f59e0b" : layer === "L3" ? "#38bdf8" : "#10b981"}
                                            strokeWidth={0.8}
                                        />
                                        <text
                                            x={11}
                                            y={9.5}
                                            fill={isUnverified ? "#fbbf24" : layer === "L3" ? "#7dd3fc" : "#6ee7b7"}
                                            fontSize={8}
                                            fontWeight="bold"
                                            fontFamily="monospace"
                                            textAnchor="middle"
                                        >
                                            {isUnverified ? "BND" : layer}
                                        </text>
                                    </g>

                                    {/* Device Hostname */}
                                    <text
                                        x={-CARD_W / 2 + 14}
                                        y={-CARD_H / 2 + 18}
                                        fill="#ffffff"
                                        fontSize={11.5}
                                        fontWeight="bold"
                                        fontFamily="monospace"
                                    >
                                        {dev.hostname.length > 15 ? dev.hostname.slice(0, 14) + "…" : dev.hostname}
                                    </text>

                                    {/* Device IP Address */}
                                    <text
                                        x={-CARD_W / 2 + 14}
                                        y={-CARD_H / 2 + 33}
                                        fill="#94a3b8"
                                        fontSize={9.5}
                                        fontFamily="monospace"
                                    >
                                        {dev.ipAddress || dev.ip_address || "No IP"}
                                    </text>

                                    {/* Sub-label: Site/IDF & Status Pill */}
                                    <g transform={`translate(${-CARD_W / 2 + 14}, ${-CARD_H / 2 + 42})`}>
                                        {isUnverified ? (
                                            <g>
                                                <rect x={0} y={0} width={105} height={12} rx={3} fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth={0.5} />
                                                <text x={4} y={9} fill="#f59e0b" fontSize={7.5} fontWeight="bold" fontFamily="monospace">
                                                    UNVERIFIED (HOP LIMIT)
                                                </text>
                                            </g>
                                        ) : isUnreachable ? (
                                            <g>
                                                <rect x={0} y={0} width={75} height={12} rx={3} fill="rgba(239, 68, 68, 0.2)" stroke="#ef4444" strokeWidth={0.5} />
                                                <text x={4} y={9} fill="#f87171" fontSize={7.5} fontWeight="bold" fontFamily="monospace">
                                                    FAILED SSH
                                                </text>
                                            </g>
                                        ) : (
                                            <text x={0} y={9} fill="#64748b" fontSize={8.5} fontFamily="monospace">
                                                {site} • {idf} {dev.hopDistance !== undefined ? `• H${dev.hopDistance}` : ""}
                                            </text>
                                        )}
                                    </g>

                                    {/* Last Verified Date Sub-label */}
                                    <g transform={`translate(${-CARD_W / 2 + 14}, ${-CARD_H / 2 + 63})`}>
                                        <circle 
                                            cx={3} 
                                            cy={-2.5} 
                                            r={2} 
                                            fill={dev.lastVerifiedAt ? (isUnverified ? "#f59e0b" : isUnreachable ? "#f87171" : "#10b981") : "#64748b"} 
                                        />
                                        <text 
                                            x={9} 
                                            y={0} 
                                            fill={dev.lastVerifiedAt ? "#94a3b8" : "#64748b"} 
                                            fontSize={7.5} 
                                            fontFamily="monospace"
                                        >
                                            {dev.lastVerifiedAt 
                                                ? `Verified: ${formatLastVerified(dev.lastVerifiedAt)}` 
                                                : "Never verified"}
                                        </text>
                                    </g>
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>
        </div>
    );
}
