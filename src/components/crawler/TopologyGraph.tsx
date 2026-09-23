"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
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
    ExternalLink,
    Eye,
    EyeOff,
    SlidersHorizontal,
    Maximize2,
    Minimize2,
    PanelLeft,
    PanelLeftClose,
    ChevronRight,
    ChevronDown,
    CheckSquare,
    Square,
    Search,
    Building,
    Filter,
    Layers2,
    X
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
    className?: string;
}

export function getCanonicalHostname(hostname: string): string {
    if (!hostname) return "UNKNOWN";
    let clean = (hostname || "").split(".")[0].trim();
    clean = clean.split("(")[0].trim();
    return clean;
}

export function parseDeviceSiteAndIdf(hostname: string, devSite?: string | null, devIdf?: string | null) {
    const shortHost = getCanonicalHostname(hostname);
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

export function parseFloorFromIdf(idfCode: string): { floorNum: number; floorLabel: string } {
    const clean = (idfCode || "").trim().toUpperCase();
    if (clean === "MDF" || clean === "DC" || clean === "SERVER") {
        return { floorNum: 1, floorLabel: "Ground / MDF" };
    }
    if (clean === "LL" || clean === "BSMT" || clean === "SUB") {
        return { floorNum: -1, floorLabel: "Basement / LL" };
    }
    const match = clean.match(/(\d+)/);
    if (match) {
        const num = parseInt(match[1], 10);
        return { floorNum: num, floorLabel: `Floor ${num}` };
    }
    return { floorNum: 1, floorLabel: clean };
}

export function formatLastVerified(ts?: string | null): string {
    if (!ts) return "Never";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return "Never";
    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${dateStr} ${timeStr}`;
}

export function detectSwitchStack(dev: any): { isStack: boolean; stackSize: number; portCount: number; members: string[] } {
    const rawInterfaces = dev.interfaces || {};
    const intfList: any[] = Array.isArray(rawInterfaces)
        ? rawInterfaces
        : Object.entries(rawInterfaces).map(([name, val]: [string, any]) => ({
            name,
            ...(typeof val === "object" ? val : {})
        }));

    const stackMembers = new Set<string>();
    let ethPorts = 0;

    for (const intf of intfList) {
        const name = intf.name || "";
        // Match Cisco stack interface patterns e.g. GigabitEthernet1/0/1, Gi2/0/24, Te3/0/1, Fo4/0/1
        const m = name.match(/^[A-Za-z]+(\d+)\/\d+\/\d+/);
        if (m) {
            stackMembers.add(m[1]);
            ethPorts++;
        }
    }

    const members = Array.from(stackMembers).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    if (stackMembers.size > 1) {
        return { isStack: true, stackSize: stackMembers.size, portCount: ethPorts, members };
    }
    return { isStack: false, stackSize: 1, portCount: ethPorts, members: ["1"] };
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
    l3Count: number;
    l2Count: number;
    isCollapsed: boolean;
    idfs: IdfContainerBox[];
}

interface IdfContainerBox {
    siteCode: string;
    idfCode: string;
    floorNum: number;
    floorLabel: string;
    x: number;
    y: number;
    width: number;
    height: number;
    deviceCount: number;
    isCollapsed: boolean;
}

export default function TopologyGraph({
    devices,
    links,
    siteDirectory = {},
    selectedDevice,
    onSelectDevice,
    activeHopDevices = [],
    highlightedLinks = [],
    onReseedDevice,
    className
}: TopologyGraphProps) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [siteFilter, setSiteFilter] = useState<string>("ALL");
    const [layoutMode, setLayoutMode] = useState<"container" | "flow">("container");
    const [stackingMode, setStackingMode] = useState<"building" | "horizontal">("building");
    const [isSiteManagerOpen, setIsSiteManagerOpen] = useState(false);
    const [deselectedSwitches, setDeselectedSwitches] = useState<Set<string>>(new Set());
    const [managerSearch, setManagerSearch] = useState("");
    const [collapsedManagerNodes, setCollapsedManagerNodes] = useState<Set<string>>(new Set());
    const [hoveredLink, setHoveredLink] = useState<any | null>(null);
    const [collapsedSites, setCollapsedSites] = useState<Set<string>>(new Set());
    const [collapsedIdfs, setCollapsedIdfs] = useState<Set<string>>(new Set());
    const [idfSpacing, setIdfSpacing] = useState<"compact" | "normal" | "spacious">("normal");
    const [fadedNodes, setFadedNodes] = useState<Set<string>>(new Set());
    const [clickMode, setClickMode] = useState<"inspect" | "fade">("inspect");
    const [isFullscreen, setIsFullscreen] = useState(false);
    const svgContainerRef = useRef<HTMLDivElement>(null);

    // Escape key listener to exit fullscreen
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isFullscreen) {
                setIsFullscreen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreen]);

    // Smooth cursor-centric mouse wheel zooming
    useEffect(() => {
        const el = svgContainerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Zoom sensitivity factor
            const zoomDelta = e.deltaY < 0 ? 1.14 : 0.88;

            setZoom(prevZoom => {
                const nextZoom = Math.min(Math.max(prevZoom * zoomDelta, 0.15), 5.0);
                const ratio = nextZoom / prevZoom;

                setPan(prevPan => ({
                    x: mouseX - (mouseX - prevPan.x) * ratio,
                    y: mouseY - (mouseY - prevPan.y) * ratio
                }));

                return nextZoom;
            });
        };

        el.addEventListener("wheel", handleWheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", handleWheel);
        };
    }, []);

    // 1. Unify devices: Deduplicate by canonical hostname & merge alias IPs
    const unifiedDevices = useMemo(() => {
        const map = new Map<string, any>();
        for (const dev of devices) {
            const canon = getCanonicalHostname(dev.hostname);
            const devIp = dev.ipAddress || dev.ip_address;
            const aliasIps: string[] = Array.isArray(dev.alias_ips) ? dev.alias_ips : [];

            if (!map.has(canon)) {
                const allIps = new Set<string>();
                if (devIp) allIps.add(devIp);
                aliasIps.forEach(ip => allIps.add(ip));

                map.set(canon, {
                    ...dev,
                    canonicalHostname: canon,
                    allIps: Array.from(allIps),
                });
            } else {
                const existing = map.get(canon)!;
                const allIps = new Set<string>(existing.allIps || []);
                if (devIp) allIps.add(devIp);
                aliasIps.forEach(ip => allIps.add(ip));
                existing.allIps = Array.from(allIps);

                // Prefer reachable status and more complete device info
                if (dev.status === "REACHABLE" && existing.status !== "REACHABLE") {
                    existing.status = dev.status;
                    existing.interfaces = dev.interfaces || existing.interfaces;
                    existing.role = dev.role || existing.role;
                    existing.site = dev.site || existing.site;
                    existing.idf = dev.idf || existing.idf;
                    existing.hostname = dev.hostname;
                }
                if (dev.interfaces && typeof dev.interfaces === "object") {
                    existing.interfaces = { ...(existing.interfaces || {}), ...dev.interfaces };
                }
                if (dev.lastVerifiedAt && (!existing.lastVerifiedAt || new Date(dev.lastVerifiedAt) > new Date(existing.lastVerifiedAt))) {
                    existing.lastVerifiedAt = dev.lastVerifiedAt;
                }
            }
        }
        return Array.from(map.values());
    }, [devices]);

    // 2. Unify links: Map source & target to canonical hostnames & remove self-loops
    const unifiedLinks = useMemo(() => {
        return links
            .map(lnk => {
                const s = getCanonicalHostname(lnk.sourceDevice);
                const t = getCanonicalHostname(lnk.targetDevice);
                return {
                    ...lnk,
                    sourceDevice: s,
                    targetDevice: t,
                    rawSource: lnk.sourceDevice,
                    rawTarget: lnk.targetDevice
                };
            })
            .filter(lnk => lnk.sourceDevice !== lnk.targetDevice);
    }, [links]);

    // 3. Filter devices based on Site selection and Manager Checkboxes
    const filteredDevices = useMemo(() => {
        let result = unifiedDevices;
        if (siteFilter !== "ALL") {
            result = result.filter(d => {
                const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
                return site === siteFilter;
            });
        }
        if (deselectedSwitches.size > 0) {
            result = result.filter(d => !deselectedSwitches.has(d.canonicalHostname || d.hostname));
        }
        return result;
    }, [unifiedDevices, siteFilter, deselectedSwitches]);

    const uniqueSites = useMemo(() => {
        const sites = new Set<string>();
        for (const d of unifiedDevices) {
            const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            if (site) sites.add(site);
        }
        return Array.from(sites).sort();
    }, [unifiedDevices]);

    // 4. Hierarchical tree data for Site & Floor Manager Sidebar
    const managerTree = useMemo(() => {
        const tree: Array<{
            siteCode: string;
            siteName: string | null;
            switches: any[];
            floors: Array<{
                idfCode: string;
                floorNum: number;
                floorLabel: string;
                switches: any[];
            }>;
        }> = [];

        const siteMap = new Map<string, Map<string, any[]>>();
        for (const dev of unifiedDevices) {
            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
            if (!siteMap.has(site)) siteMap.set(site, new Map());
            const idfMap = siteMap.get(site)!;
            if (!idfMap.has(idf)) idfMap.set(idf, []);
            idfMap.get(idf)!.push(dev);
        }

        const sortedSites = Array.from(siteMap.keys()).sort();
        for (const sCode of sortedSites) {
            const idfMap = siteMap.get(sCode)!;
            const siteLookup = siteDirectory[sCode];
            const siteName = siteLookup?.name || null;
            const allSiteSwitches: any[] = [];

            const floors: Array<{ idfCode: string; floorNum: number; floorLabel: string; switches: any[] }> = [];

            for (const [idfCode, devs] of idfMap.entries()) {
                const { floorNum, floorLabel } = parseFloorFromIdf(idfCode);
                allSiteSwitches.push(...devs);
                floors.push({
                    idfCode,
                    floorNum,
                    floorLabel,
                    switches: devs.sort((a, b) => a.hostname.localeCompare(b.hostname))
                });
            }

            // Sort floors descending (top floor first, ground / MDF at bottom)
            floors.sort((a, b) => {
                if (b.floorNum !== a.floorNum) return b.floorNum - a.floorNum;
                return a.idfCode.localeCompare(b.idfCode);
            });

            tree.push({
                siteCode: sCode,
                siteName,
                switches: allSiteSwitches,
                floors
            });
        }

        return tree;
    }, [unifiedDevices, siteDirectory]);

    // Selection helpers for Site Manager
    const toggleSwitchVisibility = (canonicalHost: string) => {
        setDeselectedSwitches(prev => {
            const next = new Set(prev);
            if (next.has(canonicalHost)) next.delete(canonicalHost);
            else next.add(canonicalHost);
            return next;
        });
    };

    const toggleSiteVisibility = (siteSwitches: any[]) => {
        const hosts = siteSwitches.map(s => s.canonicalHostname || s.hostname);
        const anySelected = hosts.some(h => !deselectedSwitches.has(h));
        setDeselectedSwitches(prev => {
            const next = new Set(prev);
            if (anySelected) {
                hosts.forEach(h => next.add(h));
            } else {
                hosts.forEach(h => next.delete(h));
            }
            return next;
        });
    };

    const isolateSite = (siteSwitches: any[]) => {
        const keepHosts = new Set(siteSwitches.map(s => s.canonicalHostname || s.hostname));
        const next = new Set<string>();
        for (const d of unifiedDevices) {
            const h = d.canonicalHostname || d.hostname;
            if (!keepHosts.has(h)) next.add(h);
        }
        setDeselectedSwitches(next);
    };

    const toggleFloorVisibility = (floorSwitches: any[]) => {
        const hosts = floorSwitches.map(s => s.canonicalHostname || s.hostname);
        const anySelected = hosts.some(h => !deselectedSwitches.has(h));
        setDeselectedSwitches(prev => {
            const next = new Set(prev);
            if (anySelected) {
                hosts.forEach(h => next.add(h));
            } else {
                hosts.forEach(h => next.delete(h));
            }
            return next;
        });
    };

    const isolateFloor = (floorSwitches: any[]) => {
        const keepHosts = new Set(floorSwitches.map(s => s.canonicalHostname || s.hostname));
        const next = new Set<string>();
        for (const d of unifiedDevices) {
            const h = d.canonicalHostname || d.hostname;
            if (!keepHosts.has(h)) next.add(h);
        }
        setDeselectedSwitches(next);
    };

    const selectAllSwitches = () => setDeselectedSwitches(new Set());
    const deselectAllSwitches = () => {
        const all = new Set(unifiedDevices.map(d => d.canonicalHostname || d.hostname));
        setDeselectedSwitches(all);
    };

    const toggleManagerNodeCollapse = (nodeKey: string) => {
        setCollapsedManagerNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeKey)) next.delete(nodeKey);
            else next.add(nodeKey);
            return next;
        });
    };

    const panToSwitch = (hostname: string) => {
        const canon = getCanonicalHostname(hostname);
        const pos = nodePositions.get(canon) || nodePositions.get(hostname);
        if (!pos || !svgContainerRef.current) return;
        const rect = svgContainerRef.current.getBoundingClientRect();
        const targetX = rect.width / 2 - pos.x * zoom;
        const targetY = rect.height / 2 - pos.y * zoom;
        setPan({ x: targetX, y: targetY });

        const dev = unifiedDevices.find(d => (d.canonicalHostname || d.hostname) === canon);
        if (dev) onSelectDevice(dev);
    };

    const toggleFadeNode = (hostname: string) => {
        const canon = getCanonicalHostname(hostname);
        setFadedNodes(prev => {
            const next = new Set(prev);
            if (next.has(canon) || next.has(hostname)) {
                next.delete(canon);
                next.delete(hostname);
            } else {
                next.add(canon);
            }
            return next;
        });
    };

    const handleNodeClick = (e: React.MouseEvent, dev: any) => {
        e.stopPropagation();
        const canon = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
        if (e.shiftKey || e.altKey || clickMode === "fade") {
            toggleFadeNode(canon);
        } else {
            onSelectDevice(dev);
        }
    };

    const handleFadeOthers = () => {
        if (!selectedDevice) return;
        const selectedCanon = getCanonicalHostname(selectedDevice.hostname);
        const keepSet = new Set<string>([selectedCanon]);
        for (const l of unifiedLinks) {
            if (l.sourceDevice === selectedCanon) keepSet.add(l.targetDevice);
            if (l.targetDevice === selectedCanon) keepSet.add(l.sourceDevice);
        }
        const toFade = new Set<string>();
        for (const d of filteredDevices) {
            const c = d.canonicalHostname || getCanonicalHostname(d.hostname);
            if (!keepSet.has(c)) {
                toFade.add(c);
            }
        }
        setFadedNodes(toFade);
    };

    const toggleCollapseSite = (siteCode: string) => {
        setCollapsedSites(prev => {
            const next = new Set(prev);
            if (next.has(siteCode)) next.delete(siteCode);
            else next.add(siteCode);
            return next;
        });
    };

    const collapseAllSites = () => {
        setCollapsedSites(new Set(uniqueSites));
    };

    const expandAllSites = () => {
        setCollapsedSites(new Set());
    };

    const toggleCollapseIdf = (siteCode: string, idfCode: string) => {
        const key = `${siteCode}::${idfCode}`;
        setCollapsedIdfs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const collapseAllIdfs = () => {
        const all = new Set<string>();
        for (const d of filteredDevices) {
            const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            all.add(`${site}::${idf}`);
        }
        setCollapsedIdfs(all);
    };

    const expandAllIdfs = () => {
        setCollapsedIdfs(new Set());
    };

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

        for (const link of unifiedLinks) {
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
    }, [unifiedLinks]);

    // Dynamic layout positioning: Container Hierarchy (Site -> Floor/IDF -> Devices) or Hierarchical Flow
    const { nodePositions, siteBoxes, idfBoxes, canvasSize } = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const siteContainers: SiteContainerBox[] = [];
        const idfContainers: IdfContainerBox[] = [];

        const spacingConfig = {
            compact: {
                cardGapX: 32,
                cardGapY: 42,
                idfPadX: 20,
                idfPadTop: 44,
                idfPadBottom: 22,
            },
            normal: {
                cardGapX: 56,
                cardGapY: 66,
                idfPadX: 28,
                idfPadTop: 48,
                idfPadBottom: 28,
            },
            spacious: {
                cardGapX: 84,
                cardGapY: 96,
                idfPadX: 36,
                idfPadTop: 56,
                idfPadBottom: 36,
            }
        }[idfSpacing];

        const CARD_WIDTH = 172;
        const CARD_HEIGHT = 74;
        const CARD_GAP_X = spacingConfig.cardGapX;
        const CARD_GAP_Y = spacingConfig.cardGapY;
        const IDF_PAD_X = spacingConfig.idfPadX;
        const IDF_PAD_TOP = spacingConfig.idfPadTop;
        const IDF_PAD_BOTTOM = spacingConfig.idfPadBottom;
        const SITE_PAD_X = 24;
        const SITE_PAD_TOP = 50;
        const SITE_PAD_BOTTOM = 24;

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
                    positions.set(dev.canonicalHostname || dev.hostname, {
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

        const MAX_ROW_WIDTH = 2500;
        const SITE_GAP = 48;
        const ROW_GAP = 54;
        let currentSiteX = 40;
        let currentSiteY = 40;
        let maxRowHeight = 0;
        let maxCanvasWidth = 0;

        for (const [siteCode, idfMap] of siteGroups.entries()) {
            const siteLookup = siteDirectory[siteCode];
            const siteName = siteLookup?.name || null;
            const isCollapsed = collapsedSites.has(siteCode);

            // Tally devices, L3 vs L2 counts
            let totalDevsInSite = 0;
            let l3Count = 0;
            let l2Count = 0;
            const allSiteDevs: any[] = [];
            for (const devs of idfMap.values()) {
                totalDevsInSite += devs.length;
                allSiteDevs.push(...devs);
                for (const d of devs) {
                    if (getDeviceLayer(d).layer === "L3") l3Count++;
                    else l2Count++;
                }
            }

            if (isCollapsed) {
                const siteWidth = 280;
                const siteHeight = 86;

                // Wrap to next row if needed
                if (currentSiteX > 40 && (currentSiteX + siteWidth > MAX_ROW_WIDTH)) {
                    currentSiteX = 40;
                    currentSiteY += maxRowHeight + ROW_GAP;
                    maxRowHeight = 0;
                }

                // Map all devices inside this collapsed site to its center
                const centerX = currentSiteX + siteWidth / 2;
                const centerY = currentSiteY + siteHeight / 2;
                for (const d of allSiteDevs) {
                    positions.set(d.canonicalHostname || d.hostname, { x: centerX, y: centerY });
                }

                siteContainers.push({
                    siteCode,
                    siteName,
                    x: currentSiteX,
                    y: currentSiteY,
                    width: siteWidth,
                    height: siteHeight,
                    deviceCount: totalDevsInSite,
                    l3Count,
                    l2Count,
                    isCollapsed: true,
                    idfs: []
                });

                if (siteHeight > maxRowHeight) maxRowHeight = siteHeight;
                currentSiteX += siteWidth + SITE_GAP;
                if (currentSiteX > maxCanvasWidth) maxCanvasWidth = currentSiteX;
                continue;
            }

            // Expanded site layout
            if (stackingMode === "building") {
                // --- VERTICAL BUILDING FLOOR STACKING (Building Cross-Section View) ---
                // Sort IDFs by floor descending (Floor 3 -> Floor 2 -> Ground / MDF -> Basement)
                const sortedFloors = Array.from(idfMap.keys()).map(idfCode => {
                    const { floorNum, floorLabel } = parseFloorFromIdf(idfCode);
                    const devs = idfMap.get(idfCode)!;
                    return { idfCode, floorNum, floorLabel, devs };
                }).sort((a, b) => {
                    if (b.floorNum !== a.floorNum) return b.floorNum - a.floorNum;
                    return a.idfCode.localeCompare(b.idfCode);
                });

                // Determine required building width based on the widest floor
                let maxFloorDevs = 1;
                for (const f of sortedFloors) {
                    if (f.devs.length > maxFloorDevs) maxFloorDevs = f.devs.length;
                }
                const buildingInnerCols = Math.min(Math.max(maxFloorDevs, 1), 4);
                const buildingInnerWidth = buildingInnerCols * CARD_WIDTH + (buildingInnerCols - 1) * CARD_GAP_X + IDF_PAD_X * 2;
                const siteWidth = Math.max(buildingInnerWidth + SITE_PAD_X * 2, 360);
                const floorSlabWidth = siteWidth - SITE_PAD_X * 2;

                // Wrap to next row if needed
                if (currentSiteX > 40 && (currentSiteX + siteWidth > MAX_ROW_WIDTH)) {
                    currentSiteX = 40;
                    currentSiteY += maxRowHeight + ROW_GAP;
                    maxRowHeight = 0;
                }

                const FLOOR_GAP = 18;
                let currentFloorY = currentSiteY + SITE_PAD_TOP;
                const siteIdfBoxes: IdfContainerBox[] = [];

                for (const { idfCode, floorNum, floorLabel, devs } of sortedFloors) {
                    const isIdfCollapsed = collapsedIdfs.has(`${siteCode}::${idfCode}`);

                    // Sort devices: L3 routers/switches first, then L2 access
                    devs.sort((a, b) => {
                        const lA = getDeviceLayer(a).layer;
                        const lB = getDeviceLayer(b).layer;
                        if (lA === "L3" && lB === "L2") return -1;
                        if (lA === "L2" && lB === "L3") return 1;
                        return a.hostname.localeCompare(b.hostname);
                    });

                    const floorCols = buildingInnerCols;
                    const floorRows = Math.ceil(devs.length / floorCols);
                    const floorHeight = isIdfCollapsed 
                        ? 44 
                        : floorRows * CARD_HEIGHT + (floorRows - 1) * CARD_GAP_Y + IDF_PAD_TOP + IDF_PAD_BOTTOM;

                    const idfBox: IdfContainerBox = {
                        siteCode,
                        idfCode,
                        floorNum,
                        floorLabel,
                        x: currentSiteX + SITE_PAD_X,
                        y: currentFloorY,
                        width: floorSlabWidth,
                        height: floorHeight,
                        deviceCount: devs.length,
                        isCollapsed: isIdfCollapsed
                    };
                    siteIdfBoxes.push(idfBox);
                    idfContainers.push(idfBox);

                    if (isIdfCollapsed) {
                        const centerX = idfBox.x + idfBox.width / 2;
                        const centerY = idfBox.y + idfBox.height / 2;
                        for (const dev of devs) {
                            positions.set(dev.canonicalHostname || dev.hostname, {
                                x: centerX,
                                y: centerY
                            });
                        }
                    } else {
                        devs.forEach((dev, idx) => {
                            const col = idx % floorCols;
                            const row = Math.floor(idx / floorCols);

                            const nodeCenterX = idfBox.x + IDF_PAD_X + col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH / 2;
                            const nodeCenterY = idfBox.y + IDF_PAD_TOP + row * (CARD_HEIGHT + CARD_GAP_Y) + CARD_HEIGHT / 2;

                            positions.set(dev.canonicalHostname || dev.hostname, {
                                x: nodeCenterX,
                                y: nodeCenterY
                            });
                        });
                    }

                    currentFloorY += floorHeight + FLOOR_GAP;
                }

                const siteHeight = currentFloorY - currentSiteY - FLOOR_GAP + SITE_PAD_BOTTOM;

                siteContainers.push({
                    siteCode,
                    siteName,
                    x: currentSiteX,
                    y: currentSiteY,
                    width: siteWidth,
                    height: siteHeight,
                    deviceCount: totalDevsInSite,
                    l3Count,
                    l2Count,
                    isCollapsed: false,
                    idfs: siteIdfBoxes
                });

                if (siteHeight > maxRowHeight) maxRowHeight = siteHeight;
                currentSiteX += siteWidth + SITE_GAP;
                if (currentSiteX > maxCanvasWidth) maxCanvasWidth = currentSiteX;

            } else {
                // --- HORIZONTAL CLOSETS VIEW ---
                const sortedIdfs = Array.from(idfMap.keys()).sort((a, b) => {
                    if (a === "MDF") return -1;
                    if (b === "MDF") return 1;
                    return a.localeCompare(b);
                });

                let preliminarySiteWidth = SITE_PAD_X;
                let maxIdfHeightInSite = 0;
                const computedIdfDims: Array<{ idfCode: string; floorNum: number; floorLabel: string; devs: any[]; width: number; height: number; cols: number; rows: number; isCollapsed: boolean }> = [];

                for (const idfCode of sortedIdfs) {
                    const devs = idfMap.get(idfCode)!;
                    const { floorNum, floorLabel } = parseFloorFromIdf(idfCode);
                    const isIdfCollapsed = collapsedIdfs.has(`${siteCode}::${idfCode}`);

                    devs.sort((a, b) => {
                        const lA = getDeviceLayer(a).layer;
                        const lB = getDeviceLayer(b).layer;
                        if (lA === "L3" && lB === "L2") return -1;
                        if (lA === "L2" && lB === "L3") return 1;
                        return a.hostname.localeCompare(b.hostname);
                    });

                    let idfWidth: number;
                    let idfHeight: number;
                    let cols = 1;
                    let rows = 1;

                    if (isIdfCollapsed) {
                        idfWidth = 200;
                        idfHeight = 52;
                    } else {
                        cols = devs.length > 3 ? 2 : 1;
                        rows = Math.ceil(devs.length / cols);
                        idfWidth = cols * CARD_WIDTH + (cols - 1) * CARD_GAP_X + IDF_PAD_X * 2;
                        idfHeight = rows * CARD_HEIGHT + (rows - 1) * CARD_GAP_Y + IDF_PAD_TOP + IDF_PAD_BOTTOM;
                    }

                    computedIdfDims.push({ idfCode, floorNum, floorLabel, devs, width: idfWidth, height: idfHeight, cols, rows, isCollapsed: isIdfCollapsed });
                    preliminarySiteWidth += idfWidth + 24;
                    if (idfHeight > maxIdfHeightInSite) {
                        maxIdfHeightInSite = idfHeight;
                    }
                }

                const siteWidth = Math.max(preliminarySiteWidth - 24 + SITE_PAD_X, 260);
                const siteHeight = maxIdfHeightInSite + SITE_PAD_TOP + SITE_PAD_BOTTOM;

                // Wrap to next row if needed
                if (currentSiteX > 40 && (currentSiteX + siteWidth > MAX_ROW_WIDTH)) {
                    currentSiteX = 40;
                    currentSiteY += maxRowHeight + ROW_GAP;
                    maxRowHeight = 0;
                }

                let currentIdfX = currentSiteX + SITE_PAD_X;
                const siteIdfBoxes: IdfContainerBox[] = [];

                for (const { idfCode, floorNum, floorLabel, devs, width: idfWidth, cols, isCollapsed: isIdfCollapsed } of computedIdfDims) {
                    const idfBox: IdfContainerBox = {
                        siteCode,
                        idfCode,
                        floorNum,
                        floorLabel,
                        x: currentIdfX,
                        y: currentSiteY + SITE_PAD_TOP,
                        width: idfWidth,
                        height: isIdfCollapsed ? 52 : maxIdfHeightInSite,
                        deviceCount: devs.length,
                        isCollapsed: isIdfCollapsed
                    };
                    siteIdfBoxes.push(idfBox);
                    idfContainers.push(idfBox);

                    if (isIdfCollapsed) {
                        const centerX = idfBox.x + idfBox.width / 2;
                        const centerY = idfBox.y + idfBox.height / 2;
                        for (const dev of devs) {
                            positions.set(dev.canonicalHostname || dev.hostname, {
                                x: centerX,
                                y: centerY
                            });
                        }
                    } else {
                        devs.forEach((dev, idx) => {
                            const col = idx % cols;
                            const row = Math.floor(idx / cols);

                            const nodeCenterX = idfBox.x + IDF_PAD_X + col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH / 2;
                            const nodeCenterY = idfBox.y + IDF_PAD_TOP + row * (CARD_HEIGHT + CARD_GAP_Y) + CARD_HEIGHT / 2;

                            positions.set(dev.canonicalHostname || dev.hostname, {
                                x: nodeCenterX,
                                y: nodeCenterY
                            });
                        });
                    }

                    currentIdfX += idfWidth + 24;
                }

                siteContainers.push({
                    siteCode,
                    siteName,
                    x: currentSiteX,
                    y: currentSiteY,
                    width: siteWidth,
                    height: siteHeight,
                    deviceCount: totalDevsInSite,
                    l3Count,
                    l2Count,
                    isCollapsed: false,
                    idfs: siteIdfBoxes
                });

                if (siteHeight > maxRowHeight) maxRowHeight = siteHeight;
                currentSiteX += siteWidth + SITE_GAP;
                if (currentSiteX > maxCanvasWidth) maxCanvasWidth = currentSiteX;
            }
        }

        const totalWidth = Math.max(maxCanvasWidth + 60, 1400);
        const totalHeight = Math.max(currentSiteY + maxRowHeight + 100, 750);

        return {
            nodePositions: positions,
            siteBoxes: siteContainers,
            idfBoxes: idfContainers,
            canvasSize: { width: totalWidth, height: totalHeight }
        };
    }, [filteredDevices, layoutMode, stackingMode, siteDirectory, collapsedSites, collapsedIdfs, idfSpacing]);

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
        <div 
            className={`select-none overflow-hidden flex flex-col transition-all duration-150 ${
                isFullscreen 
                    ? "fixed inset-0 z-40 w-screen h-screen bg-slate-950 rounded-none border-0 shadow-none m-0 p-0" 
                    : `${className || "relative w-full flex-1 h-full min-h-[660px]"} bg-slate-950/70 rounded-2xl border border-slate-800/80 shadow-xl`
            }`}
        >
            {/* Top Control Bar Overlay */}
            <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-xl border border-slate-800 shadow-2xl max-w-[calc(100%-2rem)]">
                {/* Site & Floor Manager Sidebar Toggle */}
                <button
                    type="button"
                    onClick={() => setIsSiteManagerOpen(prev => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isSiteManagerOpen
                            ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                            : "bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                    }`}
                    title="Open Site & Floor Manager Sidebar (Tree hierarchy, checkboxes, floor selection)"
                >
                    {isSiteManagerOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeft className="w-3.5 h-3.5 text-blue-400" />}
                    <span>Site Manager</span>
                    {deselectedSwitches.size > 0 && (
                        <span className="bg-amber-500/20 text-amber-300 text-[10px] font-mono px-1.5 py-0.2 rounded-full border border-amber-500/40">
                            {unifiedDevices.length - deselectedSwitches.size}/{unifiedDevices.length}
                        </span>
                    )}
                </button>

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Site Filter */}
                <div className="flex items-center gap-1.5 text-xs">
                    <Building2 className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Site:</span>
                    <select
                        value={siteFilter}
                        onChange={(e) => setSiteFilter(e.target.value)}
                        className="bg-slate-950 border border-slate-700 text-white text-xs rounded-lg px-2.5 py-1 outline-none cursor-pointer focus:border-blue-500 transition font-medium"
                    >
                        <option value="ALL">All Sites ({unifiedDevices.length} devices)</option>
                        {uniqueSites.map(s => {
                            const count = unifiedDevices.filter(d => parseDeviceSiteAndIdf(d.hostname, d.site, d.idf).site === s).length;
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
                        className={`px-2 py-1 rounded-md font-medium transition flex items-center gap-1 cursor-pointer ${
                            layoutMode === "container"
                                ? "bg-blue-600 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Group switches by Site and IDF containers"
                    >
                        <Box className="w-3 h-3" />
                        Containers
                    </button>
                    <button
                        type="button"
                        onClick={() => setLayoutMode("flow")}
                        className={`px-2 py-1 rounded-md font-medium transition flex items-center gap-1 cursor-pointer ${
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

                {layoutMode === "container" && (
                    <>
                        {/* Stacking Mode: Vertical Building Floors vs Horizontal Closets */}
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                            <button
                                type="button"
                                onClick={() => setStackingMode("building")}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    stackingMode === "building"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Vertical Building Floor Stacking (Top floor down to Ground/MDF)"
                            >
                                <Layers2 className="w-3 h-3" />
                                Building Stack
                            </button>
                            <button
                                type="button"
                                onClick={() => setStackingMode("horizontal")}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    stackingMode === "horizontal"
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Horizontal Closets (Side-by-side IDFs)"
                            >
                                <Box className="w-3 h-3" />
                                Closets
                            </button>
                        </div>

                        {/* IDF Spacing Density Selector */}
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                            <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 flex items-center gap-1">
                                <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
                                IDF Size:
                            </span>
                            <button
                                type="button"
                                onClick={() => setIdfSpacing("compact")}
                                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                    idfSpacing === "compact" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Compact IDF closets"
                            >
                                Compact
                            </button>
                            <button
                                type="button"
                                onClick={() => setIdfSpacing("normal")}
                                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                    idfSpacing === "normal" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Standard spacious IDF closets"
                            >
                                Normal
                            </button>
                            <button
                                type="button"
                                onClick={() => setIdfSpacing("spacious")}
                                className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                    idfSpacing === "spacious" ? "bg-cyan-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Extra spacious IDF closets with maximum clearance for links"
                            >
                                Spacious
                            </button>
                        </div>

                        {/* Site & IDF Collapse Macro Controls */}
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                            <span className="text-[10px] uppercase font-bold text-slate-400 px-1.5 flex items-center gap-1">
                                <Layers className="w-3 h-3 text-purple-400" />
                                Collapse:
                            </span>
                            <button
                                type="button"
                                onClick={collapsedSites.size === uniqueSites.length && uniqueSites.length > 0 ? expandAllSites : collapseAllSites}
                                className="px-2 py-0.5 rounded font-medium hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                                title={collapsedSites.size === uniqueSites.length && uniqueSites.length > 0 ? "Expand all site containers" : "Collapse all sites to summary cards"}
                            >
                                {collapsedSites.size === uniqueSites.length && uniqueSites.length > 0 ? "Expand Sites" : "All Sites"}
                            </button>
                            <button
                                type="button"
                                onClick={collapsedIdfs.size > 0 ? expandAllIdfs : collapseAllIdfs}
                                className="px-2 py-0.5 rounded font-medium hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                                title={collapsedIdfs.size > 0 ? "Expand all IDF closets" : "Collapse all IDF closets to compact cards"}
                            >
                                {collapsedIdfs.size > 0 ? "Expand IDFs" : "All IDFs"}
                            </button>
                        </div>
                    </>
                )}

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Click / Dim Mode Controls */}
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                    <button
                        type="button"
                        onClick={() => setClickMode("inspect")}
                        className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                            clickMode === "inspect" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Clicking a switch opens the Device Inspector Drawer"
                    >
                        Inspect
                    </button>
                    <button
                        type="button"
                        onClick={() => setClickMode("fade")}
                        className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                            clickMode === "fade" ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Clicking a switch dims/fades it (or Shift+Click in any mode)"
                    >
                        <EyeOff className="w-3 h-3" />
                        Dim Mode
                    </button>
                </div>

                {fadedNodes.size > 0 && (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-[11px] text-amber-300">
                        <span>Dimmed: <strong>{fadedNodes.size}</strong></span>
                        <button
                            type="button"
                            onClick={() => setFadedNodes(new Set())}
                            className="text-[10px] text-amber-400 hover:text-white underline cursor-pointer ml-1"
                            title="Restore all dimmed nodes"
                        >
                            Reset
                        </button>
                    </div>
                )}

                {selectedDevice && (
                    <button
                        type="button"
                        onClick={handleFadeOthers}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition text-[11px] font-medium flex items-center gap-1 cursor-pointer shadow-sm"
                        title="Dim all switches except the selected switch and its neighbors"
                    >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        Dim Others
                    </button>
                )}

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Zoom & Reset Controls */}
                <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800">
                    <button
                        onClick={() => setZoom(z => Math.max(z - 0.25, 0.15))}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom Out (Mouse Wheel Scroll Down)"
                    >
                        <ZoomOut size={13} />
                    </button>
                    <span className="text-[11px] font-mono text-slate-300 min-w-[38px] text-center font-bold">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        onClick={() => setZoom(z => Math.min(z + 0.25, 5.0))}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom In (Mouse Wheel Scroll Up)"
                    >
                        <ZoomIn size={13} />
                    </button>
                    <button
                        onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer ml-0.5"
                        title="Reset View"
                    >
                        <RotateCcw size={13} />
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Fullscreen / Expand Canvas Toggle */}
                <button
                    type="button"
                    onClick={() => setIsFullscreen(prev => !prev)}
                    className={`px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isFullscreen
                            ? "bg-amber-600 hover:bg-amber-500 text-white ring-1 ring-amber-400"
                            : "bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                    }`}
                    title={isFullscreen ? "Exit Fullscreen View (Esc)" : "Expand Canvas to Fullscreen (Esc to exit)"}
                >
                    {isFullscreen ? <Minimize2 size={13} className="text-amber-200" /> : <Maximize2 size={13} className="text-blue-400" />}
                    <span className="text-[11px] font-medium">
                        {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    </span>
                </button>
            </div>

            {/* Floating Top-Right Exit Fullscreen Pill */}
            {isFullscreen && (
                <div className="absolute top-4 right-4 z-30 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsFullscreen(false)}
                        className="flex items-center gap-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white px-3 py-1.5 rounded-xl border border-slate-700 text-xs shadow-2xl transition cursor-pointer backdrop-blur-md"
                        title="Exit Fullscreen (Esc)"
                    >
                        <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-semibold text-xs">Exit Fullscreen</span>
                        <kbd className="ml-1 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">ESC</kbd>
                    </button>
                </div>
            )}

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
                {fadedNodes.size > 0 && (
                    <div className="flex items-center gap-1.5 text-amber-300">
                        <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-semibold">{fadedNodes.size} Dimmed</span>
                        <span className="text-slate-400 text-[10px]">(Shift+Click to toggle)</span>
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

            {/* Site & Floor Manager Left Sidebar Drawer */}
            {isSiteManagerOpen && (
                <div className="absolute top-16 left-4 bottom-14 z-30 w-80 bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-left-4 duration-200">
                    {/* Drawer Header */}
                    <div className="p-3.5 border-b border-slate-800/80 bg-slate-950/70 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <PanelLeft className="w-4 h-4 text-blue-400" />
                            <span className="font-bold text-xs text-white tracking-tight">Site & Floor Manager</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsSiteManagerOpen(false)}
                            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                            title="Close Site Manager"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Search & Actions Bar */}
                    <div className="p-3 border-b border-slate-800/60 bg-slate-950/40 space-y-2">
                        {/* Search Input */}
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                                type="text"
                                value={managerSearch}
                                onChange={(e) => setManagerSearch(e.target.value)}
                                placeholder="Filter sites, floors, switches..."
                                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                            />
                            {managerSearch && (
                                <button
                                    onClick={() => setManagerSearch("")}
                                    className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        {/* Quick Macro Toggles */}
                        <div className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={selectAllSwitches}
                                    className="px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 font-semibold transition cursor-pointer"
                                >
                                    Select All
                                </button>
                                <button
                                    type="button"
                                    onClick={deselectAllSwitches}
                                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition cursor-pointer"
                                >
                                    Deselect All
                                </button>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400">
                                {filteredDevices.length} / {unifiedDevices.length} shown
                            </span>
                        </div>
                    </div>

                    {/* Scrollable Hierarchy Tree */}
                    <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
                        {managerTree.map(site => {
                            const siteKey = `site-${site.siteCode}`;
                            const isSiteCollapsed = collapsedManagerNodes.has(siteKey);
                            const siteSwitches = site.switches;
                            const siteHostnames = siteSwitches.map(s => s.canonicalHostname || s.hostname);
                            const selectedInSiteCount = siteHostnames.filter(h => !deselectedSwitches.has(h)).length;
                            const isAllSiteSelected = selectedInSiteCount === siteHostnames.length;
                            const isNoneSiteSelected = selectedInSiteCount === 0;

                            // Filter search
                            const searchLower = managerSearch.toLowerCase().trim();
                            const siteMatchesSearch = !searchLower || 
                                site.siteCode.toLowerCase().includes(searchLower) ||
                                (site.siteName && site.siteName.toLowerCase().includes(searchLower));

                            return (
                                <div key={site.siteCode} className="rounded-xl border border-slate-800/60 bg-slate-950/30 overflow-hidden">
                                    {/* Site Header Row */}
                                    <div className="flex items-center justify-between p-2 hover:bg-slate-800/40 transition">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <button
                                                type="button"
                                                onClick={() => toggleManagerNodeCollapse(siteKey)}
                                                className="p-0.5 text-slate-400 hover:text-white cursor-pointer"
                                            >
                                                {isSiteCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => toggleSiteVisibility(siteSwitches)}
                                                className="text-slate-300 hover:text-blue-400 transition cursor-pointer"
                                            >
                                                {isAllSiteSelected ? (
                                                    <CheckSquare className="w-4 h-4 text-blue-400" />
                                                ) : isNoneSiteSelected ? (
                                                    <Square className="w-4 h-4 text-slate-600" />
                                                ) : (
                                                    <div className="w-4 h-4 rounded border border-blue-400 bg-blue-500/30 flex items-center justify-center">
                                                        <div className="w-2 h-0.5 bg-blue-300"></div>
                                                    </div>
                                                )}
                                            </button>
                                            <span className="font-bold text-white font-mono text-[11px] truncate">
                                                {site.siteCode} {site.siteName ? `• ${site.siteName}` : ""}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-1">
                                            <span className="text-[10px] font-mono text-slate-400">
                                                [{selectedInSiteCount}/{siteSwitches.length}]
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => isolateSite(siteSwitches)}
                                                className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-800 hover:bg-blue-600/30 text-slate-400 hover:text-blue-300 transition cursor-pointer"
                                                title="Isolate this site only"
                                            >
                                                Only
                                            </button>
                                        </div>
                                    </div>

                                    {/* Floors / IDFs inside Site */}
                                    {!isSiteCollapsed && (
                                        <div className="pl-4 pr-1 pb-1.5 space-y-1">
                                            {site.floors.map(floor => {
                                                const floorKey = `floor-${site.siteCode}-${floor.idfCode}`;
                                                const isFloorCollapsed = collapsedManagerNodes.has(floorKey);
                                                const floorHostnames = floor.switches.map(s => s.canonicalHostname || s.hostname);
                                                const selectedInFloorCount = floorHostnames.filter(h => !deselectedSwitches.has(h)).length;
                                                const isAllFloorSelected = selectedInFloorCount === floorHostnames.length;
                                                const isNoneFloorSelected = selectedInFloorCount === 0;

                                                const floorMatchesSearch = !searchLower ||
                                                    floor.idfCode.toLowerCase().includes(searchLower) ||
                                                    floor.floorLabel.toLowerCase().includes(searchLower) ||
                                                    floor.switches.some(s => 
                                                        s.hostname.toLowerCase().includes(searchLower) || 
                                                        (s.canonicalHostname && s.canonicalHostname.toLowerCase().includes(searchLower)) ||
                                                        (s.ipAddress && s.ipAddress.toLowerCase().includes(searchLower))
                                                    );

                                                if (!siteMatchesSearch && !floorMatchesSearch) return null;

                                                return (
                                                    <div key={floor.idfCode} className="border-l-2 border-slate-800 pl-2 space-y-1 my-1">
                                                        {/* Floor Header */}
                                                        <div className="flex items-center justify-between py-1 px-1 rounded hover:bg-slate-800/30">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleManagerNodeCollapse(floorKey)}
                                                                    className="p-0.5 text-slate-500 hover:text-white cursor-pointer"
                                                                >
                                                                    {isFloorCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleFloorVisibility(floor.switches)}
                                                                    className="text-slate-400 hover:text-blue-400 transition cursor-pointer"
                                                                >
                                                                    {isAllFloorSelected ? (
                                                                        <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                                                                    ) : isNoneFloorSelected ? (
                                                                        <Square className="w-3.5 h-3.5 text-slate-600" />
                                                                    ) : (
                                                                        <div className="w-3.5 h-3.5 rounded border border-blue-400 bg-blue-500/30 flex items-center justify-center">
                                                                            <div className="w-1.5 h-0.5 bg-blue-300"></div>
                                                                        </div>
                                                                    )}
                                                                </button>
                                                                <span className="font-semibold text-slate-300 text-[11px] truncate">
                                                                    {floor.floorLabel} <span className="text-slate-500 font-mono">({floor.idfCode})</span>
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <span className="text-[10px] font-mono text-slate-500">
                                                                    ({selectedInFloorCount}/{floor.switches.length})
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => isolateFloor(floor.switches)}
                                                                    className="px-1 py-0.2 rounded text-[9px] font-semibold bg-slate-800/80 hover:bg-blue-600/30 text-slate-400 hover:text-blue-300 transition cursor-pointer"
                                                                    title="Isolate this floor only"
                                                                >
                                                                    Only
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Switch items within Floor */}
                                                        {!isFloorCollapsed && (
                                                            <div className="pl-5 space-y-0.5">
                                                                {floor.switches.map(sw => {
                                                                    const canon = sw.canonicalHostname || sw.hostname;
                                                                    const isVisible = !deselectedSwitches.has(canon);
                                                                    const stInfo = detectSwitchStack(sw);
                                                                    const devLayer = getDeviceLayer(sw).layer;

                                                                    const swMatches = !searchLower ||
                                                                        sw.hostname.toLowerCase().includes(searchLower) ||
                                                                        canon.toLowerCase().includes(searchLower) ||
                                                                        (sw.ipAddress && sw.ipAddress.toLowerCase().includes(searchLower));

                                                                    if (!siteMatchesSearch && !swMatches) return null;

                                                                    return (
                                                                        <div
                                                                            key={canon}
                                                                            className={`flex items-center justify-between py-1 px-1.5 rounded transition ${
                                                                                selectedDevice?.hostname === sw.hostname
                                                                                    ? "bg-blue-600/20 border border-blue-500/30"
                                                                                    : "hover:bg-slate-800/40"
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => toggleSwitchVisibility(canon)}
                                                                                    className="text-slate-400 hover:text-blue-400 transition cursor-pointer"
                                                                                >
                                                                                    {isVisible ? (
                                                                                        <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                                                                                    ) : (
                                                                                        <Square className="w-3.5 h-3.5 text-slate-600" />
                                                                                    )}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => panToSwitch(sw.hostname)}
                                                                                    className="text-left font-mono text-[11px] text-slate-300 hover:text-blue-300 truncate cursor-pointer"
                                                                                    title={`Click to focus and inspect ${sw.hostname}`}
                                                                                >
                                                                                    {canon}
                                                                                </button>
                                                                            </div>
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                {stInfo.isStack && (
                                                                                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                                                        {stInfo.stackSize}x
                                                                                    </span>
                                                                                )}
                                                                                <span className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                                                                                    devLayer === "L3" ? "bg-cyan-500/20 text-cyan-300" : "bg-emerald-500/20 text-emerald-300"
                                                                                }`}>
                                                                                    {devLayer}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Interactive SVG Canvas */}
            <div
                ref={svgContainerRef}
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
                        {layoutMode === "container" && siteBoxes.map((site) => {
                            if (site.isCollapsed) {
                                return (
                                    <g
                                        key={`site-${site.siteCode}`}
                                        onClick={() => toggleCollapseSite(site.siteCode)}
                                        className="cursor-pointer group"
                                    >
                                        <rect
                                            x={site.x}
                                            y={site.y}
                                            width={site.width}
                                            height={site.height}
                                            rx={10}
                                            fill="rgba(15, 23, 42, 0.95)"
                                            stroke="#3b82f6"
                                            strokeWidth={1.5}
                                            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
                                            className="group-hover:stroke-blue-400 group-hover:scale-[1.02] transition"
                                        />
                                        {/* Accent Strip */}
                                        <path
                                            d={`M ${site.x} ${site.y + 8} A 8 8 0 0 1 ${site.x + 8} ${site.y} L ${site.x + 4} ${site.y} L ${site.x + 4} ${site.y + site.height} L ${site.x + 8} ${site.y + site.height} A 8 8 0 0 1 ${site.x} ${site.y + site.height - 8} Z`}
                                            fill="#3b82f6"
                                        />
                                        <text x={site.x + 14} y={site.y + 22} fill="#ffffff" fontSize={11.5} fontWeight="bold" fontFamily="monospace">
                                            SITE: {site.siteCode} {site.siteName ? `• ${site.siteName}` : ""}
                                        </text>
                                        <text x={site.x + 14} y={site.y + 42} fill="#94a3b8" fontSize={9.5} fontFamily="monospace">
                                            {site.deviceCount} Switches ({site.l3Count} L3 • {site.l2Count} L2)
                                        </text>
                                        <g transform={`translate(${site.x + 14}, ${site.y + 54})`}>
                                            <rect x={0} y={0} width={138} height={18} rx={4} fill="rgba(59, 130, 246, 0.15)" stroke="#3b82f6" strokeWidth={0.5} />
                                            <text x={69} y={12} fill="#60a5fa" fontSize={8.5} fontWeight="bold" textAnchor="middle">
                                                CLICK TO EXPAND SITE ▾
                                            </text>
                                        </g>
                                    </g>
                                );
                            }

                            return (
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

                                        <text x={site.width - 56} y={12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                            {site.deviceCount} {site.deviceCount === 1 ? "device" : "devices"} • {site.idfs.length} {site.idfs.length === 1 ? "IDF" : "IDFs"}
                                        </text>

                                        {/* Collapse Site Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCollapseSite(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition"
                                            transform={`translate(${site.width - 46}, -3)`}
                                        >
                                            <rect x={0} y={0} width={20} height={20} rx={5} fill="rgba(148, 163, 184, 0.12)" stroke="rgba(148, 163, 184, 0.3)" strokeWidth={0.8} />
                                            <text x={10} y={13.5} fill="#94a3b8" fontSize={13} fontWeight="bold" textAnchor="middle">
                                                −
                                            </text>
                                        </g>
                                    </g>

                                    {/* 2. RENDER NESTED IDF CONTAINERS */}
                                    {site.idfs.map((idf) => {
                                        if (idf.isCollapsed) {
                                            return (
                                                <g
                                                    key={`idf-${site.siteCode}-${idf.idfCode}`}
                                                    onClick={() => toggleCollapseIdf(site.siteCode, idf.idfCode)}
                                                    className="cursor-pointer group"
                                                >
                                                    <rect
                                                        x={idf.x}
                                                        y={idf.y}
                                                        width={idf.width}
                                                        height={idf.height}
                                                        rx={8}
                                                        fill="rgba(30, 41, 59, 0.9)"
                                                        stroke="#38bdf8"
                                                        strokeWidth={1.2}
                                                        strokeDasharray="4,2"
                                                        className="group-hover:stroke-blue-400 group-hover:fill-slate-800/90 transition"
                                                    />
                                                    <text x={idf.x + 12} y={idf.y + 20} fill="#e2e8f0" fontSize={11} fontWeight="bold" fontFamily="monospace">
                                                        {idf.floorLabel ? `${idf.floorLabel} • ` : ""}IDF: {idf.idfCode} ({idf.deviceCount} Switches)
                                                    </text>
                                                    <text x={idf.x + 12} y={idf.y + 36} fill="#38bdf8" fontSize={9} fontWeight="bold">
                                                        CLICK TO EXPAND ▾
                                                    </text>
                                                </g>
                                            );
                                        }

                                        return (
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
                                                        {idf.floorLabel ? `${idf.floorLabel} • ` : ""}IDF: {idf.idfCode}
                                                    </text>
                                                    <text x={idf.width - 50} y={10} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                                        ({idf.deviceCount})
                                                    </text>

                                                    {/* Collapse IDF Button */}
                                                    <g
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleCollapseIdf(site.siteCode, idf.idfCode);
                                                        }}
                                                        className="cursor-pointer hover:opacity-80 transition"
                                                        transform={`translate(${idf.width - 44}, -3)`}
                                                        title={`Collapse IDF ${idf.idfCode}`}
                                                    >
                                                        <rect x={0} y={0} width={18} height={16} rx={4} fill="rgba(148, 163, 184, 0.12)" stroke="rgba(148, 163, 184, 0.3)" strokeWidth={0.8} />
                                                        <text x={9} y={11} fill="#94a3b8" fontSize={11} fontWeight="bold" textAnchor="middle">
                                                            −
                                                        </text>
                                                    </g>
                                                </g>
                                            </g>
                                        );
                                    })}
                                </g>
                            );
                        })}

                        {/* 3. RENDER LINKS & PORT-CHANNEL BUNDLES */}
                        {bundledLinks.map((bundle) => {
                            const p1 = nodePositions.get(bundle.sourceDevice);
                            const p2 = nodePositions.get(bundle.targetDevice);
                            if (!p1 || !p2 || (p1.x === p2.x && p1.y === p2.y)) return null;

                            const isHighlighted = highlightedLinks.some(
                                hl => (hl.from === bundle.sourceDevice && hl.to === bundle.targetDevice) ||
                                      (hl.from === bundle.targetDevice && hl.to === bundle.sourceDevice)
                            );

                            const isUnverified = bundle.status === "UNVERIFIED";
                            const isDown = bundle.status === "DOWN";

                            const isSourceFaded = fadedNodes.has(bundle.sourceDevice);
                            const isTargetFaded = fadedNodes.has(bundle.targetDevice);
                            const isLinkFaded = isSourceFaded || isTargetFaded;
                            const bothFaded = isSourceFaded && isTargetFaded;

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

                            // Calculate smooth curved paths to eliminate straight-line overlap
                            const isVertical = Math.abs(p1.x - p2.x) < 14;
                            const isHorizontal = Math.abs(p1.y - p2.y) < 14;
                            let pathD: string;
                            let midX = (p1.x + p2.x) / 2;
                            let midY = (p1.y + p2.y) / 2;

                            if (isVertical) {
                                // Stacked vertically in the same closet column: curve gently to the side
                                const hash = (bundle.sourceDevice.length + bundle.targetDevice.length) % 2 === 0 ? 1 : -1;
                                const curveOffset = hash * 32;
                                const ctrlX = midX + curveOffset;
                                const ctrlY = midY;
                                pathD = `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`;
                                midX = midX + curveOffset * 0.5;
                            } else if (isHorizontal) {
                                // Side-by-side horizontally: curve slightly downward or upward
                                const curveOffset = (bundle.id.length % 2 === 0 ? 1 : -1) * 24;
                                const ctrlX = midX;
                                const ctrlY = midY + curveOffset;
                                pathD = `M ${p1.x} ${p1.y} Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`;
                                midY = midY + curveOffset * 0.5;
                            } else {
                                // Diagonal or cross-site trunks: gentle bezier curve
                                const deltaX = Math.abs(p1.x - p2.x);
                                const deltaY = Math.abs(p1.y - p2.y);
                                if (deltaX > 200 || deltaY > 150) {
                                    pathD = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
                                } else {
                                    pathD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
                                }
                            }

                            const linkOpacity = bothFaded 
                                ? 0.06 
                                : isLinkFaded 
                                ? 0.16 
                                : isHighlighted 
                                ? 1 
                                : isUnverified 
                                ? 0.75 
                                : 0.7;

                            return (
                                <g 
                                    key={bundle.id}
                                    onMouseEnter={() => setHoveredLink(bundle)}
                                    onMouseLeave={() => setHoveredLink(null)}
                                    className="cursor-pointer group"
                                    opacity={bothFaded ? 0.15 : isLinkFaded ? 0.4 : 1}
                                >
                                    {/* Invisible wider hit area for easy hover */}
                                    <path
                                        d={pathD}
                                        fill="none"
                                        stroke="transparent"
                                        strokeWidth={16}
                                    />

                                    {/* Link Line */}
                                    <path
                                        d={pathD}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={strokeWidth}
                                        strokeDasharray={strokeDash}
                                        opacity={linkOpacity}
                                        className={isHighlighted ? "animate-pulse" : ""}
                                    />

                                    {/* Secondary line to visually represent Port-Channel multi-strand bundle */}
                                    {bundle.isPortChannel && (
                                        <path
                                            d={pathD}
                                            fill="none"
                                            stroke="#0f172a"
                                            strokeWidth={1}
                                            strokeDasharray="3,3"
                                            opacity={bothFaded ? 0.08 : 0.9}
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
                                            opacity={linkOpacity}
                                        />
                                    )}
                                </g>
                            );
                        })}

                        {/* 4. RENDER DEVICE NODES */}
                        {filteredDevices.map((dev) => {
                            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
                            // Do not render individual nodes if their site container or IDF is collapsed
                            if (layoutMode === "container" && (collapsedSites.has(site) || collapsedIdfs.has(`${site}::${idf}`))) {
                                return null;
                            }

                            const canonHost = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
                            const pos = nodePositions.get(canonHost) || nodePositions.get(dev.hostname);
                            if (!pos) return null;

                            const isSelected = selectedDevice && (getCanonicalHostname(selectedDevice.hostname) === canonHost);
                            const isHop = isHopDevice(dev.hostname) || isHopDevice(canonHost);
                            const isUnverified = dev.status === "UNVERIFIED";
                            const isUnreachable = dev.status !== "REACHABLE" && !isUnverified;
                            const { layer, label: layerLabel } = getDeviceLayer(dev);
                            const stackInfo = detectSwitchStack(dev);

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

                            const isFaded = fadedNodes.has(canonHost) || fadedNodes.has(dev.hostname);
                            const CARD_W = 172;
                            const CARD_H = 74;

                            return (
                                <g
                                    key={canonHost}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onClick={(e) => handleNodeClick(e, dev)}
                                    opacity={isFaded ? 0.22 : 1}
                                    className={isFaded 
                                        ? "cursor-pointer hover:opacity-75 transition-opacity" 
                                        : "cursor-pointer transition-transform hover:scale-105"
                                    }
                                >
                                    {/* 3D Stack Chassis Under-Layers (StackWise Visualization) */}
                                    {stackInfo.isStack && (
                                        <g opacity={isFaded ? 0.3 : 0.85}>
                                            <rect
                                                x={-CARD_W / 2 + 4}
                                                y={-CARD_H / 2 - 4}
                                                width={CARD_W - 8}
                                                height={CARD_H}
                                                rx={7}
                                                fill="#091426"
                                                stroke="rgba(168, 85, 247, 0.45)"
                                                strokeWidth={1}
                                            />
                                            {stackInfo.stackSize > 2 && (
                                                <rect
                                                    x={-CARD_W / 2 + 8}
                                                    y={-CARD_H / 2 - 8}
                                                    width={CARD_W - 16}
                                                    height={CARD_H}
                                                    rx={6}
                                                    fill="#050b14"
                                                    stroke="rgba(168, 85, 247, 0.3)"
                                                    strokeWidth={0.8}
                                                />
                                            )}
                                        </g>
                                    )}

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

                                    {/* L3 vs L2 & Switch Stack Badge Chips (Top-Right) */}
                                    <g transform={`translate(${CARD_W / 2 - (stackInfo.isStack ? 58 : 28)}, ${-CARD_H / 2 + 7})`}>
                                        {stackInfo.isStack && (
                                            <g transform="translate(0, 0)">
                                                <rect
                                                    x={0}
                                                    y={0}
                                                    width={28}
                                                    height={13}
                                                    rx={3}
                                                    fill="rgba(168, 85, 247, 0.2)"
                                                    stroke="#a855f7"
                                                    strokeWidth={0.8}
                                                />
                                                <text
                                                    x={14}
                                                    y={9.5}
                                                    fill="#d8b4fe"
                                                    fontSize={7.5}
                                                    fontWeight="bold"
                                                    fontFamily="monospace"
                                                    textAnchor="middle"
                                                >
                                                    {`${stackInfo.stackSize}x STK`}
                                                </text>
                                            </g>
                                        )}
                                        <g transform={`translate(${stackInfo.isStack ? 30 : 0}, 0)`}>
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
                                        {canonHost.length > 15 ? canonHost.slice(0, 14) + "…" : canonHost}
                                    </text>

                                    {/* Device IP Address & Multi-IP Indicator */}
                                    <text
                                        x={-CARD_W / 2 + 14}
                                        y={-CARD_H / 2 + 33}
                                        fill="#94a3b8"
                                        fontSize={9.5}
                                        fontFamily="monospace"
                                    >
                                        {dev.ipAddress || dev.ip_address || "No IP"}
                                        {dev.allIps && dev.allIps.length > 1 ? ` (+${dev.allIps.length - 1} IPs)` : ""}
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
                                                {site} • {idf} {stackInfo.isStack ? `• ${stackInfo.portCount}p` : dev.hopDistance !== undefined ? `• H${dev.hopDistance}` : ""}
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

                                    {/* Quick Dim / Fade toggle button on card */}
                                    <g
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFadeNode(dev.hostname);
                                        }}
                                        className="cursor-pointer hover:opacity-100 transition opacity-50 hover:scale-110"
                                        transform={`translate(${CARD_W / 2 - 20}, ${CARD_H / 2 - 20})`}
                                    >
                                        <rect x={0} y={0} width={15} height={15} rx={3.5} fill="rgba(15, 23, 42, 0.9)" stroke={isFaded ? "#f59e0b" : "rgba(148, 163, 184, 0.4)"} strokeWidth={0.8} />
                                        {isFaded ? (
                                            <g transform="translate(2, 2)">
                                                <path d="M1 1l9 9M4.5 4.5a2 2 0 0 0 2.8 2.8M1 5.5a5.5 5.5 0 0 1 9.5-2.8M10.5 5.5a5.5 5.5 0 0 1-9.5 2.8" stroke="#f59e0b" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                            </g>
                                        ) : (
                                            <g transform="translate(2, 2)">
                                                <path d="M1 5.5s2-3.5 4.5-3.5 4.5 3.5 4.5 3.5-2 3.5-4.5 3.5-4.5-3.5-4.5-3.5z" stroke="#94a3b8" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                                <circle cx="5.5" cy="5.5" r="1.3" stroke="#94a3b8" strokeWidth="1" fill="none" />
                                            </g>
                                        )}
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
