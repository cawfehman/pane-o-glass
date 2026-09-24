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
    Zap,
    GitMerge,
    X,
    Edit3,
    LayoutGrid
} from "lucide-react";
import { CrawlIcon } from "./CrawlIcon";

export function getBasePhysicalInterface(intf?: string | null): string {
    if (!intf) return "unknown";
    const clean = intf.trim();
    // Strip subinterface dot notation (e.g. GigabitEthernet0/0/1.100 -> GigabitEthernet0/0/1)
    const base = clean.split(".")[0];
    return base.toLowerCase();
}

export interface SiteMetadataLookup {
    name: string;
    address?: string;
    status?: string;
    notes?: string;
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
    onRefreshSnapshot?: () => void;
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
    siteAddress?: string | null;
    siteStatus?: string | null;
    siteNotes?: string | null;
    isUncrawled?: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
    deviceCount: number;
    l3Count: number;
    l2Count: number;
    isCollapsed: boolean;
    idfs: IdfContainerBox[];
    connectedSites?: string[];
    clusterId?: string;
    isClusterHub?: boolean;
}

export interface SiteClusterGroup {
    id: string;
    label: string;
    hubSiteCode: string;
    siteCodes: string[];
    x: number;
    y: number;
    width: number;
    height: number;
    titleWidth: number;
    isSingle?: boolean;
}

export interface InterSiteBridge {
    id: string;
    sourceSite: string;
    targetSite: string;
    path: string;
    midX: number;
    midY: number;
    linkCount: number;
    isRouted: boolean;
    label: string;
    status: string;
    speed?: string;
    links: any[];
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
    onRefreshSnapshot,
    className
}: TopologyGraphProps) {
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [panSpeed, setPanSpeed] = useState<number>(1.5);
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
    const [showAllLinks, setShowAllLinks] = useState(false); // Clean up links: OFF by default
    const [visibleUplinkSites, setVisibleUplinkSites] = useState<Set<string>>(new Set());
    const [visibleUplinkIdfs, setVisibleUplinkIdfs] = useState<Set<string>>(new Set());
    const [convergeTrunks, setConvergeTrunks] = useState(true); // Converge multi-neighbor trunks and MPLS into single physical links
    const [showVendorManaged, setShowVendorManaged] = useState(false); // Vendor Managed devices excluded from topology by default
    const [showUncrawledSites, setShowUncrawledSites] = useState(false); // Uncrawled Directory sites hidden by default
    const [siteClusterMode, setSiteClusterMode] = useState<"topological" | "grid">("topological"); // Topological Connected Clusters vs Linear Grid

    // Bulk Node Governance Overrides
    const [isBulkEditModalOpen, setIsBulkEditModalOpen] = useState(false);
    const [bulkTargetHostnames, setBulkTargetHostnames] = useState<string[]>([]);
    const [bulkSiteOverride, setBulkSiteOverride] = useState("");
    const [bulkIdfOverride, setBulkIdfOverride] = useState("");
    const [bulkRoleOverride, setBulkRoleOverride] = useState("");
    const [bulkReason, setBulkReason] = useState("");
    const [bulkCleanupEmptySite, setBulkCleanupEmptySite] = useState(true);
    const [savingBulkOverrides, setSavingBulkOverrides] = useState(false);
    const [bulkOverrideSuccess, setBulkOverrideSuccess] = useState<string | null>(null);
    const [bulkOverrideError, setBulkOverrideError] = useState<string | null>(null);

    const svgContainerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<SVGGElement>(null);
    const currentPanRef = useRef({ x: 0, y: 0 });
    const lastPointerRef = useRef({ x: 0, y: 0 });
    const startPointerRef = useRef({ x: 0, y: 0 });
    const isDraggingRef = useRef(false);
    const hasDraggedRef = useRef(false);
    const rafIdRef = useRef<number | null>(null);
    const canvasSizeRef = useRef({ width: 1400, height: 750 });

    // Sync direct transform and pan reference when pan or zoom state updates
    useEffect(() => {
        currentPanRef.current = pan;
        if (viewportRef.current) {
            viewportRef.current.setAttribute("transform", `translate(${pan.x}, ${pan.y}) scale(${zoom})`);
        }
    }, [pan, zoom]);

    // Keyboard navigation (Escape for fullscreen, Arrow keys for fast panning)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && isFullscreen) {
                setIsFullscreen(false);
            }
            if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
                if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
                e.preventDefault();
                const step = 90 * panSpeed;
                const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
                const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
                setPan(p => ({ x: p.x + dx, y: p.y + dy }));
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreen, panSpeed]);

    // Mathematically exact cursor-centric mouse wheel zoom via inverse SVG Screen CTM
    useEffect(() => {
        const el = svgContainerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const svg = el.querySelector("svg");
            if (!svg) return;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;

            // True subpixel SVG viewBox coordinate directly under the mouse cursor
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(ctm.inverse());

            const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87;

            setZoom(prevZoom => {
                const nextZoom = Math.min(Math.max(prevZoom * zoomDelta, 0.05), 6.0);
                const ratio = nextZoom / prevZoom;

                setPan(prevPan => {
                    const newPan = {
                        x: svgP.x - (svgP.x - prevPan.x) * ratio,
                        y: svgP.y - (svgP.y - prevPan.y) * ratio
                    };
                    currentPanRef.current = newPan;
                    if (viewportRef.current) {
                        viewportRef.current.setAttribute("transform", `translate(${newPan.x}, ${newPan.y}) scale(${nextZoom})`);
                    }
                    return newPan;
                });

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
                if (dev.platform && !existing.platform) {
                    existing.platform = dev.platform;
                }
                if (dev.isMultiCloset) existing.isMultiCloset = true;
                if (dev.flaggedForInvestigation) existing.flaggedForInvestigation = true;
                if (dev.investigationReason && !existing.investigationReason) existing.investigationReason = dev.investigationReason;
                if (Array.isArray(dev.discoveredClosets)) {
                    const cMap = new Map<string, any>();
                    for (const c of (existing.discoveredClosets || [])) cMap.set(`${c.site}::${c.idf}`, c);
                    for (const c of dev.discoveredClosets) cMap.set(`${c.site}::${c.idf}`, c);
                    existing.discoveredClosets = Array.from(cMap.values());
                }
                if (dev.isVendorManaged || dev.excludeFromTopology) {
                    existing.isVendorManaged = true;
                    existing.excludeFromTopology = true;
                    existing.tag = dev.tag || existing.tag;
                }
                if (dev.overrideReason && !existing.overrideReason) {
                    existing.overrideReason = dev.overrideReason;
                }
            }
        }
        return Array.from(map.values());
    }, [devices]);

    // Count vendor managed devices
    const vendorManagedCount = useMemo(() => {
        return unifiedDevices.filter(d => d.isVendorManaged || d.excludeFromTopology).length;
    }, [unifiedDevices]);

    // Fast lookup for device -> { site, idf }
    const deviceLocationMap = useMemo(() => {
        const map = new Map<string, { site: string; idf: string }>();
        for (const dev of unifiedDevices) {
            const canon = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
            map.set(canon, { site, idf });
            map.set(dev.hostname, { site, idf });
        }
        return map;
    }, [unifiedDevices]);

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

    // 3. Filter devices based on Site selection, Manager Checkboxes, and Vendor Managed Toggle
    const filteredDevices = useMemo(() => {
        let result = unifiedDevices;
        if (!showVendorManaged) {
            result = result.filter(d => !d.isVendorManaged && !d.excludeFromTopology);
        }
        if (siteFilter !== "ALL") {
            result = result.filter(d => {
                const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
                if (site === siteFilter) return true;
                if (d.isMultiCloset && Array.isArray(d.discoveredClosets)) {
                    return d.discoveredClosets.some((c: any) => c.site === siteFilter);
                }
                return false;
            });
        }
        if (deselectedSwitches.size > 0) {
            result = result.filter(d => !deselectedSwitches.has(d.canonicalHostname || d.hostname));
        }
        return result;
    }, [unifiedDevices, showVendorManaged, siteFilter, deselectedSwitches]);

    const uniqueSites = useMemo(() => {
        const sites = new Set<string>();
        for (const d of unifiedDevices) {
            const { site } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            if (site) sites.add(site);
            if (d.isMultiCloset && Array.isArray(d.discoveredClosets)) {
                for (const c of d.discoveredClosets) {
                    if (c.site) sites.add(c.site);
                }
            }
        }
        return Array.from(sites).sort();
    }, [unifiedDevices]);

    // Sites present in the authoritative Site Directory but with 0 crawled devices
    const uncrawledSiteCodes = useMemo(() => {
        if (!siteDirectory) return [];
        const crawledSet = new Set(uniqueSites.map(s => s.toUpperCase()));
        return Object.keys(siteDirectory)
            .map(c => c.toUpperCase())
            .filter(code => !crawledSet.has(code) && code !== "UNKNOWN" && code !== "UNK" && code !== "NONE")
            .sort();
    }, [siteDirectory, uniqueSites]);

    const [hasInitializedSiteMap, setHasInitializedSiteMap] = useState(false);

    // Default to Site Map View: all sites start collapsed so the user gets an executive site overview
    useEffect(() => {
        if (!hasInitializedSiteMap && uniqueSites.length > 0) {
            setCollapsedSites(new Set(uniqueSites));
            setHasInitializedSiteMap(true);
        }
    }, [uniqueSites, hasInitializedSiteMap]);

    // If user selects a specific site from the dropdown, automatically expand that site
    useEffect(() => {
        if (siteFilter !== "ALL") {
            setCollapsedSites(prev => {
                const next = new Set(prev);
                next.delete(siteFilter);
                return next;
            });
        }
    }, [siteFilter]);

    // 4. Hierarchical tree data for Site & Floor Manager Sidebar
    const managerTree = useMemo(() => {
        const tree: Array<{
            siteCode: string;
            siteName: string | null;
            isUncrawled?: boolean;
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
            if (dev.isMultiCloset && Array.isArray(dev.discoveredClosets) && dev.discoveredClosets.length > 1) {
                for (const closet of dev.discoveredClosets) {
                    const site = (closet.site || "UNK").toUpperCase();
                    const idf = (closet.idf || "MDF").toUpperCase();
                    if (!siteMap.has(site)) siteMap.set(site, new Map());
                    const idfMap = siteMap.get(site)!;
                    if (!idfMap.has(idf)) idfMap.set(idf, []);
                    idfMap.get(idf)!.push(dev);
                }
            } else {
                const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
                if (!siteMap.has(site)) siteMap.set(site, new Map());
                const idfMap = siteMap.get(site)!;
                if (!idfMap.has(idf)) idfMap.set(idf, []);
                idfMap.get(idf)!.push(dev);
            }
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

        if (showUncrawledSites) {
            for (const uCode of uncrawledSiteCodes) {
                const siteLookup = siteDirectory[uCode];
                tree.push({
                    siteCode: uCode,
                    siteName: siteLookup?.name || null,
                    isUncrawled: true,
                    switches: [],
                    floors: []
                });
            }
        }

        return tree;
    }, [unifiedDevices, siteDirectory, showUncrawledSites, uncrawledSiteCodes]);

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

    const handleOpenBulkEdit = () => {
        const hostnames = filteredDevices.map(d => getCanonicalHostname(d.hostname));
        setBulkTargetHostnames(hostnames);
        setBulkSiteOverride("");
        setBulkIdfOverride("");
        setBulkRoleOverride("");
        setBulkReason("");
        setBulkCleanupEmptySite(true);
        setBulkOverrideError(null);
        setBulkOverrideSuccess(null);
        setIsBulkEditModalOpen(true);
    };

    const handleSaveBulkOverrides = async () => {
        if (bulkTargetHostnames.length === 0) {
            setBulkOverrideError("Please select at least one switch to edit.");
            return;
        }
        if (!bulkSiteOverride.trim() && !bulkIdfOverride.trim() && !bulkRoleOverride.trim()) {
            setBulkOverrideError("Please specify at least a Site, IDF, or Role to override.");
            return;
        }
        setSavingBulkOverrides(true);
        setBulkOverrideError(null);
        setBulkOverrideSuccess(null);
        try {
            const payload: any = {
                hostnames: bulkTargetHostnames,
                reason: bulkReason.trim() || `Bulk node governance override for ${bulkTargetHostnames.length} devices`,
                cleanupEmptySite: bulkCleanupEmptySite
            };
            if (bulkSiteOverride.trim()) payload.siteOverride = bulkSiteOverride.trim().toUpperCase();
            if (bulkIdfOverride.trim()) payload.idfOverride = bulkIdfOverride.trim().toUpperCase();
            if (bulkRoleOverride.trim()) payload.roleOverride = bulkRoleOverride.trim();

            const res = await fetch("/api/crawler/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save bulk overrides.");
            setBulkOverrideSuccess(`Successfully updated ${bulkTargetHostnames.length} switches! Refreshing...`);
            if (onRefreshSnapshot) onRefreshSnapshot();
            setTimeout(() => {
                setIsBulkEditModalOpen(false);
                setBulkOverrideSuccess(null);
            }, 1200);
        } catch (e: any) {
            setBulkOverrideError(e.message || "Failed to save bulk overrides.");
        } finally {
            setSavingBulkOverrides(false);
        }
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
        const dev = unifiedDevices.find(d => (d.canonicalHostname || d.hostname) === canon);
        if (dev) {
            const { site } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
            if (site && collapsedSites.has(site)) {
                setCollapsedSites(prev => {
                    const next = new Set(prev);
                    next.delete(site);
                    return next;
                });
            }
            onSelectDevice(dev);
        }

        const pos = nodePositions.get(canon) || nodePositions.get(hostname);
        if (!pos) return;

        const targetX = canvasSizeRef.current.width / 2 - pos.x * zoom;
        const targetY = canvasSizeRef.current.height / 2 - pos.y * zoom;
        const newPan = { x: targetX, y: targetY };
        currentPanRef.current = newPan;
        setPan(newPan);
        if (viewportRef.current) {
            viewportRef.current.setAttribute("transform", `translate(${targetX}, ${targetY}) scale(${zoom})`);
        }
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
        if (hasDraggedRef.current) return;
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

    const toggleSiteUplinks = (siteCode: string) => {
        setVisibleUplinkSites(prev => {
            const next = new Set(prev);
            if (next.has(siteCode)) next.delete(siteCode);
            else next.add(siteCode);
            return next;
        });
    };

    const toggleIdfUplinks = (siteCode: string, idfCode: string) => {
        const key = `${siteCode}::${idfCode}`;
        setVisibleUplinkIdfs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // Group parallel links between the same pairs of devices (or between collapsed sites) into Link Bundles
    const bundledLinks = useMemo(() => {
        const map = new Map<string, {
            id: string;
            sourceDevice: string;
            targetDevice: string;
            links: any[];
            isPortChannel: boolean;
            isSiteTrunk?: boolean;
            channelName?: string;
            status: string;
        }>();

        for (const link of unifiedLinks) {
            const srcLoc = deviceLocationMap.get(link.sourceDevice);
            const tgtLoc = deviceLocationMap.get(link.targetDevice);
            const bothSitesCollapsed = Boolean(
                convergeTrunks &&
                srcLoc && tgtLoc &&
                srcLoc.site && tgtLoc.site &&
                srcLoc.site !== tgtLoc.site &&
                collapsedSites.has(srcLoc.site) &&
                collapsedSites.has(tgtLoc.site)
            );

            const pair = bothSitesCollapsed
                ? `SITE::${[srcLoc!.site, tgtLoc!.site].sort().join(" <--> ")}`
                : [link.sourceDevice, link.targetDevice].sort().join(" <--> ");

            const isPo = Boolean(
                link.linkType === "PORT_CHANNEL" ||
                (link.sourceInterface && link.sourceInterface.toLowerCase().startsWith("po")) ||
                (link.targetInterface && link.targetInterface.toLowerCase().startsWith("po"))
            );

            let channelName: string | undefined = undefined;
            if (bothSitesCollapsed) {
                channelName = `Site Trunk (${srcLoc!.site} ↔ ${tgtLoc!.site})`;
            } else if (link.sourceInterface?.toLowerCase().startsWith("po")) {
                channelName = link.sourceInterface;
            } else if (link.targetInterface?.toLowerCase().startsWith("po")) {
                channelName = link.targetInterface;
            }

            if (!map.has(pair)) {
                map.set(pair, {
                    id: pair,
                    sourceDevice: link.sourceDevice,
                    targetDevice: link.targetDevice,
                    links: [link],
                    isPortChannel: isPo || bothSitesCollapsed,
                    isSiteTrunk: bothSitesCollapsed,
                    channelName,
                    status: link.status || "UP"
                });
            } else {
                const item = map.get(pair)!;
                item.links.push(link);
                item.isPortChannel = true; // Multiple physical connections form a Port Channel / LAG bundle
                if (bothSitesCollapsed) {
                    item.isSiteTrunk = true;
                    item.channelName = `Site Trunk (${item.links.length} links)`;
                } else if (!item.channelName && channelName) {
                    item.channelName = channelName;
                }
                if (link.status === "DOWN" || item.status === "DOWN") item.status = "DOWN";
                else if (link.status === "UNVERIFIED" || item.status === "UNVERIFIED") item.status = "UNVERIFIED";
            }
        }

        return Array.from(map.values());
    }, [unifiedLinks, deviceLocationMap, collapsedSites, convergeTrunks]);

    // Dynamic layout positioning: Container Hierarchy (Site -> Floor/IDF -> Devices) or Hierarchical Flow
    const { nodePositions, siteBoxes, idfBoxes, siteClusters, interSiteBridges, canvasSize, layoutDevices } = useMemo(() => {
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

        const layoutDevs: any[] = [];

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
                siteClusters: [],
                interSiteBridges: [],
                canvasSize: { width, height },
                layoutDevices: filteredDevices
            };
        }

        // --- Container Grouping Mode (Site -> IDF -> Devices) ---
        // 1. Group devices by site -> idf (cloning multi-closet boundary devices into each discovered closet)
        const siteGroups = new Map<string, Map<string, any[]>>();
        for (const dev of filteredDevices) {
            if (dev.isMultiCloset && Array.isArray(dev.discoveredClosets) && dev.discoveredClosets.length > 1) {
                const canon = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
                for (const closet of dev.discoveredClosets) {
                    const s = (closet.site || "UNK").toUpperCase();
                    const i = (closet.idf || "MDF").toUpperCase();
                    if (siteFilter !== "ALL" && s !== siteFilter) continue;

                    if (!siteGroups.has(s)) siteGroups.set(s, new Map());
                    const idfMap = siteGroups.get(s)!;
                    if (!idfMap.has(i)) idfMap.set(i, []);
                    idfMap.get(i)!.push({
                        ...dev,
                        site: s,
                        idf: i,
                        _instanceClosetKey: `${s}::${i}`,
                        _instanceNodeKey: `${canon}__closet__${s}_${i}`,
                        _isMultiClosetClone: true
                    });
                }
            } else {
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
        }

        // 2. Pre-measure each Site's internal geometry and relative device coordinates
        interface SiteTemplate {
            siteCode: string;
            siteName: string | null;
            isCollapsed: boolean;
            width: number;
            height: number;
            totalDevsInSite: number;
            l3Count: number;
            l2Count: number;
            hasRouter: boolean;
            isSeedSite: boolean;
            idfs: Array<{
                siteCode: string;
                idfCode: string;
                floorNum: number;
                floorLabel: string;
                relX: number;
                relY: number;
                width: number;
                height: number;
                deviceCount: number;
                isCollapsed: boolean;
            }>;
            devOffsets: Array<{
                dev: any;
                nodeKey: string;
                relX: number;
                relY: number;
            }>;
        }

        const siteTemplates = new Map<string, SiteTemplate>();

        for (const [siteCode, idfMap] of siteGroups.entries()) {
            const siteLookup = siteDirectory[siteCode];
            const siteName = siteLookup?.name || null;
            const isCollapsed = collapsedSites.has(siteCode);

            let totalDevsInSite = 0;
            let l3Count = 0;
            let l2Count = 0;
            let hasRouter = false;
            let isSeedSite = false;
            const allSiteDevs: any[] = [];

            for (const devs of idfMap.values()) {
                totalDevsInSite += devs.length;
                allSiteDevs.push(...devs);
                for (const d of devs) {
                    if (getDeviceLayer(d).layer === "L3") l3Count++;
                    else l2Count++;
                    if (d.role === "Router" || (d.role || "").toLowerCase().includes("router")) hasRouter = true;
                    if (d.hopDistance === 0 || d.hop_distance === 0) isSeedSite = true;
                }
            }

            if (isCollapsed) {
                const siteWidth = 300;
                const siteHeight = 74;
                const devOffsets = allSiteDevs.map(d => ({
                    dev: d,
                    nodeKey: d._instanceNodeKey || d.canonicalHostname || d.hostname,
                    relX: siteWidth / 2,
                    relY: siteHeight / 2
                }));

                siteTemplates.set(siteCode, {
                    siteCode,
                    siteName,
                    isCollapsed: true,
                    width: siteWidth,
                    height: siteHeight,
                    totalDevsInSite,
                    l3Count,
                    l2Count,
                    hasRouter,
                    isSeedSite,
                    idfs: [],
                    devOffsets
                });
                continue;
            }

            // Expanded site layout calculation
            if (stackingMode === "building") {
                const sortedFloors = Array.from(idfMap.keys()).map(idfCode => {
                    const { floorNum, floorLabel } = parseFloorFromIdf(idfCode);
                    const devs = idfMap.get(idfCode)!;
                    return { idfCode, floorNum, floorLabel, devs };
                }).sort((a, b) => {
                    if (b.floorNum !== a.floorNum) return b.floorNum - a.floorNum;
                    return a.idfCode.localeCompare(b.idfCode);
                });

                let maxFloorDevs = 1;
                for (const f of sortedFloors) {
                    if (f.devs.length > maxFloorDevs) maxFloorDevs = f.devs.length;
                }
                const buildingInnerCols = Math.min(Math.max(maxFloorDevs, 1), 4);
                const buildingInnerWidth = buildingInnerCols * CARD_WIDTH + (buildingInnerCols - 1) * CARD_GAP_X + IDF_PAD_X * 2;
                const siteWidth = Math.max(buildingInnerWidth + SITE_PAD_X * 2, 360);
                const floorSlabWidth = siteWidth - SITE_PAD_X * 2;

                const FLOOR_GAP = 18;
                let currentFloorRelY = SITE_PAD_TOP;
                const siteIdfBoxes: any[] = [];
                const devOffsets: any[] = [];

                for (const { idfCode, floorNum, floorLabel, devs } of sortedFloors) {
                    const isIdfCollapsed = collapsedIdfs.has(`${siteCode}::${idfCode}`);
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

                    const idfBox = {
                        siteCode,
                        idfCode,
                        floorNum,
                        floorLabel,
                        relX: SITE_PAD_X,
                        relY: currentFloorRelY,
                        width: floorSlabWidth,
                        height: floorHeight,
                        deviceCount: devs.length,
                        isCollapsed: isIdfCollapsed
                    };
                    siteIdfBoxes.push(idfBox);

                    if (isIdfCollapsed) {
                        const centerX = idfBox.relX + idfBox.width / 2;
                        const centerY = idfBox.relY + idfBox.height / 2;
                        for (const dev of devs) {
                            devOffsets.push({
                                dev,
                                nodeKey: dev._instanceNodeKey || dev.canonicalHostname || dev.hostname,
                                relX: centerX,
                                relY: centerY
                            });
                        }
                    } else {
                        devs.forEach((dev, idx) => {
                            const col = idx % floorCols;
                            const row = Math.floor(idx / floorCols);
                            const nodeCenterX = idfBox.relX + IDF_PAD_X + col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH / 2;
                            const nodeCenterY = idfBox.relY + IDF_PAD_TOP + row * (CARD_HEIGHT + CARD_GAP_Y) + CARD_HEIGHT / 2;
                            devOffsets.push({
                                dev,
                                nodeKey: dev._instanceNodeKey || dev.canonicalHostname || dev.hostname,
                                relX: nodeCenterX,
                                relY: nodeCenterY
                            });
                        });
                    }

                    currentFloorRelY += floorHeight + FLOOR_GAP;
                }

                const siteHeight = currentFloorRelY - FLOOR_GAP + SITE_PAD_BOTTOM;
                siteTemplates.set(siteCode, {
                    siteCode,
                    siteName,
                    isCollapsed: false,
                    width: siteWidth,
                    height: siteHeight,
                    totalDevsInSite,
                    l3Count,
                    l2Count,
                    hasRouter,
                    isSeedSite,
                    idfs: siteIdfBoxes,
                    devOffsets
                });
            } else {
                // Horizontal Closets
                const sortedIdfs = Array.from(idfMap.keys()).sort((a, b) => {
                    if (a === "MDF") return -1;
                    if (b === "MDF") return 1;
                    return a.localeCompare(b);
                });

                let preliminarySiteWidth = SITE_PAD_X;
                let maxIdfHeightInSite = 0;
                const computedIdfDims: any[] = [];

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
                let currentIdfRelX = SITE_PAD_X;
                const siteIdfBoxes: any[] = [];
                const devOffsets: any[] = [];

                for (const { idfCode, floorNum, floorLabel, devs, width: idfWidth, cols, isCollapsed: isIdfCollapsed } of computedIdfDims) {
                    const idfBox = {
                        siteCode,
                        idfCode,
                        floorNum,
                        floorLabel,
                        relX: currentIdfRelX,
                        relY: SITE_PAD_TOP,
                        width: idfWidth,
                        height: isIdfCollapsed ? 52 : maxIdfHeightInSite,
                        deviceCount: devs.length,
                        isCollapsed: isIdfCollapsed
                    };
                    siteIdfBoxes.push(idfBox);

                    if (isIdfCollapsed) {
                        const centerX = idfBox.relX + idfBox.width / 2;
                        const centerY = idfBox.relY + idfBox.height / 2;
                        for (const dev of devs) {
                            devOffsets.push({
                                dev,
                                nodeKey: dev._instanceNodeKey || dev.canonicalHostname || dev.hostname,
                                relX: centerX,
                                relY: centerY
                            });
                        }
                    } else {
                        devs.forEach((dev, idx) => {
                            const col = idx % cols;
                            const row = Math.floor(idx / cols);
                            const nodeCenterX = idfBox.relX + IDF_PAD_X + col * (CARD_WIDTH + CARD_GAP_X) + CARD_WIDTH / 2;
                            const nodeCenterY = idfBox.relY + IDF_PAD_TOP + row * (CARD_HEIGHT + CARD_GAP_Y) + CARD_HEIGHT / 2;
                            devOffsets.push({
                                dev,
                                nodeKey: dev._instanceNodeKey || dev.canonicalHostname || dev.hostname,
                                relX: nodeCenterX,
                                relY: nodeCenterY
                            });
                        });
                    }

                    currentIdfRelX += idfWidth + 24;
                }

                siteTemplates.set(siteCode, {
                    siteCode,
                    siteName,
                    isCollapsed: false,
                    width: siteWidth,
                    height: siteHeight,
                    totalDevsInSite,
                    l3Count,
                    l2Count,
                    hasRouter,
                    isSeedSite,
                    idfs: siteIdfBoxes,
                    devOffsets
                });
            }
        }

        // 3. Build Inter-Site Connectivity Adjacency & Edges
        const interSiteAdj = new Map<string, Set<string>>();
        const interSiteEdges = new Map<string, {
            id: string;
            siteA: string;
            siteB: string;
            links: any[];
            isRouted: boolean;
            speed?: string;
            status: string;
        }>();

        for (const link of unifiedLinks) {
            const srcLoc = deviceLocationMap.get(link.sourceDevice);
            const tgtLoc = deviceLocationMap.get(link.targetDevice);
            if (
                srcLoc && tgtLoc &&
                srcLoc.site && tgtLoc.site &&
                srcLoc.site !== tgtLoc.site &&
                siteTemplates.has(srcLoc.site) &&
                siteTemplates.has(tgtLoc.site)
            ) {
                const sA = srcLoc.site;
                const sB = tgtLoc.site;
                if (!interSiteAdj.has(sA)) interSiteAdj.set(sA, new Set());
                if (!interSiteAdj.has(sB)) interSiteAdj.set(sB, new Set());
                interSiteAdj.get(sA)!.add(sB);
                interSiteAdj.get(sB)!.add(sA);

                const edgeKey = [sA, sB].sort().join(" <--> ");
                const isRouted = link.linkType === "L3_ROUTED" || Boolean(link.isRouted);
                if (!interSiteEdges.has(edgeKey)) {
                    interSiteEdges.set(edgeKey, {
                        id: `inter-site-${edgeKey}`,
                        siteA: sA,
                        siteB: sB,
                        links: [link],
                        isRouted,
                        speed: link.speed,
                        status: link.status || "UP"
                    });
                } else {
                    const ed = interSiteEdges.get(edgeKey)!;
                    ed.links.push(link);
                    if (isRouted) ed.isRouted = true;
                    if (link.status === "DOWN") ed.status = "DOWN";
                    else if (link.status === "UNVERIFIED" && ed.status !== "DOWN") ed.status = "UNVERIFIED";
                }
            }
        }

        // 4. Cluster Formation & Canvas Placement
        const clusters: SiteClusterGroup[] = [];
        let maxCanvasWidth = 0;
        let maxCanvasHeight = 0;

        if (siteClusterMode === "topological") {
            // Topological Site Clustering: Form distinct clusters for connected campuses
            const visited = new Set<string>();
            const sitePlacementsInCluster = new Map<string, { x: number; y: number }>();

            // Prioritize starting from Core / Seed Hub sites
            const siteCodesSorted = Array.from(siteTemplates.keys()).sort((a, b) => {
                const tA = siteTemplates.get(a)!;
                const tB = siteTemplates.get(b)!;
                const degA = interSiteAdj.get(a)?.size || 0;
                const degB = interSiteAdj.get(b)?.size || 0;
                const scoreA = degA * 20 + (tA.isSeedSite ? 50 : 0) + (tA.hasRouter ? 20 : 0) + tA.totalDevsInSite;
                const scoreB = degB * 20 + (tB.isSeedSite ? 50 : 0) + (tB.hasRouter ? 20 : 0) + tB.totalDevsInSite;
                return scoreB - scoreA;
            });

            for (const sCode of siteCodesSorted) {
                if (visited.has(sCode)) continue;
                const component: string[] = [];
                const queue = [sCode];
                visited.add(sCode);

                while (queue.length > 0) {
                    const curr = queue.shift()!;
                    component.push(curr);
                    const neighbors = interSiteAdj.get(curr);
                    if (neighbors) {
                        for (const n of neighbors) {
                            if (!visited.has(n)) {
                                visited.add(n);
                                queue.push(n);
                            }
                        }
                    }
                }

                // Identify the most authoritative Hub of this component
                let bestHub = component[0];
                let bestScore = -1;
                for (const c of component) {
                    const t = siteTemplates.get(c)!;
                    const deg = interSiteAdj.get(c)?.size || 0;
                    const score = deg * 20 + (t.isSeedSite ? 50 : 0) + (t.hasRouter ? 20 : 0) + t.totalDevsInSite;
                    if (score > bestScore) {
                        bestScore = score;
                        bestHub = c;
                    }
                }

                const isSingle = component.length === 1;
                const hubTemplate = siteTemplates.get(bestHub)!;
                const hubName = hubTemplate.siteName || bestHub;
                const label = isSingle
                    ? `${bestHub} (${hubName})`
                    : `Campus Cluster: ${bestHub} (${component.length} Connected Sites)`;
                const titleWidth = Math.min(Math.max(label.length * 8 + 36, 170), 400);

                if (isSingle) {
                    sitePlacementsInCluster.set(bestHub, { x: 0, y: 0 });
                    clusters.push({
                        id: `cluster-${bestHub}`,
                        label,
                        hubSiteCode: bestHub,
                        siteCodes: component,
                        x: 0,
                        y: 0,
                        width: hubTemplate.width,
                        height: hubTemplate.height,
                        titleWidth,
                        isSingle: true
                    });
                } else if (component.length === 2) {
                    // 2-site pair (Hub <-> Satellite)
                    const otherSite = component.find(c => c !== bestHub)!;
                    const otherT = siteTemplates.get(otherSite)!;
                    const CORRIDOR_X = 140;
                    const maxH = Math.max(hubTemplate.height, otherT.height);

                    sitePlacementsInCluster.set(bestHub, {
                        x: 0,
                        y: (maxH - hubTemplate.height) / 2
                    });
                    sitePlacementsInCluster.set(otherSite, {
                        x: hubTemplate.width + CORRIDOR_X,
                        y: (maxH - otherT.height) / 2
                    });

                    clusters.push({
                        id: `cluster-${bestHub}`,
                        label,
                        hubSiteCode: bestHub,
                        siteCodes: component,
                        x: 0,
                        y: 0,
                        width: hubTemplate.width + CORRIDOR_X + otherT.width,
                        height: maxH,
                        titleWidth,
                        isSingle: false
                    });
                } else {
                    // 3+ sites: Hub sits prominently at top center; satellites branch gracefully in tier below
                    const hubChildren = component.filter(c => c !== bestHub);
                    hubChildren.sort((a, b) => {
                        const aDirect = interSiteAdj.get(bestHub)?.has(a) ? 1 : 0;
                        const bDirect = interSiteAdj.get(bestHub)?.has(b) ? 1 : 0;
                        return bDirect - aDirect;
                    });

                    const SPOKE_GAP_X = 56;
                    const CORRIDOR_Y = 130;

                    let totalSpokesWidth = 0;
                    let maxSpokeHeight = 0;
                    for (let i = 0; i < hubChildren.length; i++) {
                        const spT = siteTemplates.get(hubChildren[i])!;
                        totalSpokesWidth += spT.width;
                        if (i < hubChildren.length - 1) totalSpokesWidth += SPOKE_GAP_X;
                        if (spT.height > maxSpokeHeight) maxSpokeHeight = spT.height;
                    }

                    const clusterW = Math.max(hubTemplate.width, totalSpokesWidth);
                    const hubX = (clusterW - hubTemplate.width) / 2;
                    sitePlacementsInCluster.set(bestHub, { x: hubX, y: 0 });

                    let curSpokeX = (clusterW - totalSpokesWidth) / 2;
                    const spokeY = hubTemplate.height + CORRIDOR_Y;

                    for (const spCode of hubChildren) {
                        const spT = siteTemplates.get(spCode)!;
                        sitePlacementsInCluster.set(spCode, { x: curSpokeX, y: spokeY });
                        curSpokeX += spT.width + SPOKE_GAP_X;
                    }

                    clusters.push({
                        id: `cluster-${bestHub}`,
                        label,
                        hubSiteCode: bestHub,
                        siteCodes: component,
                        x: 0,
                        y: 0,
                        width: clusterW,
                        height: hubTemplate.height + CORRIDOR_Y + maxSpokeHeight,
                        titleWidth,
                        isSingle: false
                    });
                }
            }

            // Canvas placement: arrange multi-site clusters first, then standalone / isolated sites
            const MAX_CANVAS_WIDTH = 3400;
            const CLUSTER_GAP_X = 90;
            const CLUSTER_GAP_Y = 110;

            const multiClusters = clusters.filter(c => !c.isSingle);
            const singleClusters = clusters.filter(c => c.isSingle);

            let curClustX = 60;
            let curClustY = 60;
            let maxRowH = 0;

            for (const cl of multiClusters) {
                if (curClustX > 60 && curClustX + cl.width > MAX_CANVAS_WIDTH) {
                    curClustX = 60;
                    curClustY += maxRowH + CLUSTER_GAP_Y;
                    maxRowH = 0;
                }

                cl.x = curClustX;
                cl.y = curClustY;

                for (const sCode of cl.siteCodes) {
                    const p = sitePlacementsInCluster.get(sCode)!;
                    const sT = siteTemplates.get(sCode)!;
                    const absX = cl.x + p.x;
                    const absY = cl.y + p.y;

                    siteContainers.push({
                        siteCode: sCode,
                        siteName: sT.siteName,
                        x: absX,
                        y: absY,
                        width: sT.width,
                        height: sT.height,
                        deviceCount: sT.totalDevsInSite,
                        l3Count: sT.l3Count,
                        l2Count: sT.l2Count,
                        isCollapsed: sT.isCollapsed,
                        idfs: sT.idfs.map(idf => ({
                            ...idf,
                            x: absX + idf.relX,
                            y: absY + idf.relY
                        })),
                        connectedSites: Array.from(interSiteAdj.get(sCode) || []),
                        clusterId: cl.id,
                        isClusterHub: sCode === cl.hubSiteCode
                    });

                    for (const idf of sT.idfs) {
                        idfContainers.push({
                            ...idf,
                            x: absX + idf.relX,
                            y: absY + idf.relY
                        });
                    }

                    for (const d of sT.devOffsets) {
                        const nX = absX + d.relX;
                        const nY = absY + d.relY;
                        positions.set(d.nodeKey, { x: nX, y: nY });
                        if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                            positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                        }
                        layoutDevs.push(d.dev);
                    }
                }

                if (cl.height > maxRowH) maxRowH = cl.height;
                curClustX += cl.width + CLUSTER_GAP_X;
                if (curClustX > maxCanvasWidth) maxCanvasWidth = curClustX;
            }

            // Standalone single sites placed on shelf below
            let curSingleX = 60;
            let curSingleY = multiClusters.length > 0 ? (curClustY + maxRowH + 100) : 60;
            let maxSingleH = 0;

            for (const cl of singleClusters) {
                const sCode = cl.hubSiteCode;
                const sT = siteTemplates.get(sCode)!;

                if (curSingleX > 60 && curSingleX + sT.width > MAX_CANVAS_WIDTH) {
                    curSingleX = 60;
                    curSingleY += maxSingleH + 60;
                    maxSingleH = 0;
                }

                cl.x = curSingleX;
                cl.y = curSingleY;
                const absX = cl.x;
                const absY = cl.y;

                siteContainers.push({
                    siteCode: sCode,
                    siteName: sT.siteName,
                    x: absX,
                    y: absY,
                    width: sT.width,
                    height: sT.height,
                    deviceCount: sT.totalDevsInSite,
                    l3Count: sT.l3Count,
                    l2Count: sT.l2Count,
                    isCollapsed: sT.isCollapsed,
                    idfs: sT.idfs.map(idf => ({
                        ...idf,
                        x: absX + idf.relX,
                        y: absY + idf.relY
                    })),
                    connectedSites: [],
                    clusterId: cl.id,
                    isClusterHub: true
                });

                for (const idf of sT.idfs) {
                    idfContainers.push({
                        ...idf,
                        x: absX + idf.relX,
                        y: absY + idf.relY
                    });
                }

                for (const d of sT.devOffsets) {
                    const nX = absX + d.relX;
                    const nY = absY + d.relY;
                    positions.set(d.nodeKey, { x: nX, y: nY });
                    if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                        positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                    }
                    layoutDevs.push(d.dev);
                }

                if (sT.height > maxSingleH) maxSingleH = sT.height;
                curSingleX += sT.width + 48;
                if (curSingleX > maxCanvasWidth) maxCanvasWidth = curSingleX;
            }

            maxCanvasHeight = (singleClusters.length > 0 ? (curSingleY + maxSingleH) : (curClustY + maxRowH));

        } else {
            // Classic Linear Grid Mode
            const MAX_ROW_WIDTH = 2500;
            const SITE_GAP = 48;
            const ROW_GAP = 54;
            let currentSiteX = 40;
            let currentSiteY = 40;
            let maxRowHeight = 0;

            for (const [siteCode, sT] of siteTemplates.entries()) {
                if (currentSiteX > 40 && (currentSiteX + sT.width > MAX_ROW_WIDTH)) {
                    currentSiteX = 40;
                    currentSiteY += maxRowHeight + ROW_GAP;
                    maxRowHeight = 0;
                }

                const absX = currentSiteX;
                const absY = currentSiteY;

                siteContainers.push({
                    siteCode,
                    siteName: sT.siteName,
                    x: absX,
                    y: absY,
                    width: sT.width,
                    height: sT.height,
                    deviceCount: sT.totalDevsInSite,
                    l3Count: sT.l3Count,
                    l2Count: sT.l2Count,
                    isCollapsed: sT.isCollapsed,
                    idfs: sT.idfs.map(idf => ({
                        ...idf,
                        x: absX + idf.relX,
                        y: absY + idf.relY
                    })),
                    connectedSites: Array.from(interSiteAdj.get(siteCode) || []),
                    clusterId: `grid-${siteCode}`,
                    isClusterHub: false
                });

                for (const idf of sT.idfs) {
                    idfContainers.push({
                        ...idf,
                        x: absX + idf.relX,
                        y: absY + idf.relY
                    });
                }

                for (const d of sT.devOffsets) {
                    const nX = absX + d.relX;
                    const nY = absY + d.relY;
                    positions.set(d.nodeKey, { x: nX, y: nY });
                    if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                        positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                    }
                    layoutDevs.push(d.dev);
                }

                if (sT.height > maxRowHeight) maxRowHeight = sT.height;
                currentSiteX += sT.width + SITE_GAP;
                if (currentSiteX > maxCanvasWidth) maxCanvasWidth = currentSiteX;
            }
            maxCanvasHeight = currentSiteY + maxRowHeight;
        }

        // 5. Layout uncrawled directory sites if toggled ON
        if (showUncrawledSites) {
            const visibleUncrawled = uncrawledSiteCodes.filter(c => siteFilter === "ALL" || siteFilter === c);
            const MAX_ROW_WIDTH = 3200;
            let currentSiteX = 60;
            let currentSiteY = maxCanvasHeight + 90;
            let maxRowHeight = 0;

            for (const siteCode of visibleUncrawled) {
                const siteLookup = siteDirectory[siteCode];
                const siteWidth = 300;
                const siteHeight = 74;

                if (currentSiteX > 60 && (currentSiteX + siteWidth > MAX_ROW_WIDTH)) {
                    currentSiteX = 60;
                    currentSiteY += maxRowHeight + 50;
                    maxRowHeight = 0;
                }

                siteContainers.push({
                    siteCode,
                    siteName: siteLookup?.name || null,
                    siteAddress: siteLookup?.address || null,
                    siteStatus: siteLookup?.status || "Active",
                    siteNotes: siteLookup?.notes || null,
                    isUncrawled: true,
                    x: currentSiteX,
                    y: currentSiteY,
                    width: siteWidth,
                    height: siteHeight,
                    deviceCount: 0,
                    l3Count: 0,
                    l2Count: 0,
                    isCollapsed: true,
                    idfs: []
                });

                if (siteHeight > maxRowHeight) maxRowHeight = siteHeight;
                currentSiteX += siteWidth + 40;
                if (currentSiteX > maxCanvasWidth) maxCanvasWidth = currentSiteX;
            }
            maxCanvasHeight = currentSiteY + maxRowHeight;
        }

        // 6. Generate Inter-Site Highway Bridges between connected sites
        const bridges: InterSiteBridge[] = [];
        const siteBoxMap = new Map<string, SiteContainerBox>();
        for (const sb of siteContainers) {
            siteBoxMap.set(sb.siteCode, sb);
        }

        for (const edge of interSiteEdges.values()) {
            const boxA = siteBoxMap.get(edge.siteA);
            const boxB = siteBoxMap.get(edge.siteB);
            if (!boxA || !boxB) continue;

            let p1: { x: number; y: number };
            let p2: { x: number; y: number };
            let pathD: string;

            const cAx = boxA.x + boxA.width / 2;
            const cAy = boxA.y + boxA.height / 2;
            const cBx = boxB.x + boxB.width / 2;
            const cBy = boxB.y + boxB.height / 2;

            const dx = Math.abs(cAx - cBx);
            const dy = Math.abs(cAy - cBy);

            if (dy >= dx * 0.7) {
                // Vertical connection between site containers
                if (cAy < cBy) {
                    p1 = { x: cAx, y: boxA.y + boxA.height };
                    p2 = { x: cBx, y: boxB.y };
                } else {
                    p1 = { x: cAx, y: boxA.y };
                    p2 = { x: cBx, y: boxB.y + boxB.height };
                }
                const midY = (p1.y + p2.y) / 2;
                pathD = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
            } else {
                // Horizontal connection between site containers
                if (cAx < cBx) {
                    p1 = { x: boxA.x + boxA.width, y: cAy };
                    p2 = { x: boxB.x, y: cBy };
                } else {
                    p1 = { x: boxA.x, y: cAy };
                    p2 = { x: boxB.x + boxB.width, y: cBy };
                }
                const midX = (p1.x + p2.x) / 2;
                pathD = `M ${p1.x} ${p1.y} C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`;
            }

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const label = edge.isRouted
                ? "WAN (L3 Routed)"
                : edge.links.length > 1
                ? `Trunk (${edge.links.length} Links)`
                : "Site Trunk";

            bridges.push({
                id: edge.id,
                sourceSite: edge.siteA,
                targetSite: edge.siteB,
                path: pathD,
                midX,
                midY,
                linkCount: edge.links.length,
                isRouted: edge.isRouted,
                label,
                status: edge.status,
                speed: edge.speed,
                links: edge.links
            });
        }

        let maxX = maxCanvasWidth + 100;
        let maxY = maxCanvasHeight + 120;
        for (const sb of siteContainers) {
            if (sb.x + sb.width + 100 > maxX) maxX = sb.x + sb.width + 100;
            if (sb.y + sb.height + 120 > maxY) maxY = sb.y + sb.height + 120;
        }

        const totalWidth = Math.max(maxX, 1600);
        const totalHeight = Math.max(maxY, 850);

        return {
            nodePositions: positions,
            siteBoxes: siteContainers,
            idfBoxes: idfContainers,
            siteClusters: clusters,
            interSiteBridges: bridges,
            canvasSize: { width: totalWidth, height: totalHeight },
            layoutDevices: layoutDevs
        };
    }, [filteredDevices, layoutMode, stackingMode, siteDirectory, collapsedSites, collapsedIdfs, idfSpacing, showUncrawledSites, uncrawledSiteCodes, siteFilter, siteClusterMode, unifiedLinks, deviceLocationMap]);

    // Multi-neighbor trunk & MPLS convergence model
    // Converges multiple links that share the same physical trunk/interface into a single stem before connecting to the switch/site
    const convergedModel = useMemo(() => {
        if (!convergeTrunks) {
            return {
                adjustedLinks: bundledLinks,
                trunkStems: [],
                junctionHubs: []
            };
        }

        // 1. Group link bundles by (device, physical interface)
        const devInterfaceMap = new Map<string, Map<string, Array<{ neighbor: string; bundle: typeof bundledLinks[0] }>>>();

        for (const bundle of bundledLinks) {
            const p1 = nodePositions.get(bundle.sourceDevice);
            const p2 = nodePositions.get(bundle.targetDevice);
            if (!p1 || !p2 || (p1.x === p2.x && p1.y === p2.y)) continue;

            const l0 = bundle.links[0];
            const srcIntf = getBasePhysicalInterface(l0?.sourceInterface || bundle.channelName);
            const tgtIntf = getBasePhysicalInterface(l0?.targetInterface || bundle.channelName);

            // Source device interface mapping
            if (!devInterfaceMap.has(bundle.sourceDevice)) devInterfaceMap.set(bundle.sourceDevice, new Map());
            const srcMap = devInterfaceMap.get(bundle.sourceDevice)!;
            if (!srcMap.has(srcIntf)) srcMap.set(srcIntf, []);
            srcMap.get(srcIntf)!.push({ neighbor: bundle.targetDevice, bundle });

            // Target device interface mapping
            if (!devInterfaceMap.has(bundle.targetDevice)) devInterfaceMap.set(bundle.targetDevice, new Map());
            const tgtMap = devInterfaceMap.get(bundle.targetDevice)!;
            if (!tgtMap.has(tgtIntf)) tgtMap.set(tgtIntf, []);
            tgtMap.get(tgtIntf)!.push({ neighbor: bundle.sourceDevice, bundle });
        }

        // 2. Identify converged endpoints: any (device, intf) that connects to >= 2 distinct neighbor positions
        const junctionMap = new Map<string, {
            id: string;
            x: number;
            y: number;
            device: string;
            intf: string;
            neighbors: string[];
            status: string;
            memberLinks: any[];
        }>();

        const trunkStems: Array<{
            id: string;
            device: string;
            intf: string;
            p1: { x: number; y: number };
            p2: { x: number; y: number };
            status: string;
            neighborCount: number;
            neighbors: string[];
            memberLinks: any[];
        }> = [];

        for (const [dev, intfMap] of devInterfaceMap.entries()) {
            const pDev = nodePositions.get(dev);
            if (!pDev) continue;

            for (const [intf, entries] of intfMap.entries()) {
                if (intf === "unknown" && entries.length < 2) continue;

                const neighborHosts = Array.from(new Set(entries.map(e => e.neighbor)));
                const validNeighbors = neighborHosts.filter(n => {
                    const pn = nodePositions.get(n);
                    return pn && (pn.x !== pDev.x || pn.y !== pDev.y);
                });

                if (validNeighbors.length >= 2) {
                    // Average direction towards neighbors
                    let dx = 0;
                    let dy = 0;
                    let minNeighborDist = Infinity;
                    for (const n of validNeighbors) {
                        const pn = nodePositions.get(n)!;
                        dx += (pn.x - pDev.x);
                        dy += (pn.y - pDev.y);
                        const dist = Math.hypot(pn.x - pDev.x, pn.y - pDev.y);
                        if (dist < minNeighborDist) minNeighborDist = dist;
                    }
                    dx /= validNeighbors.length;
                    dy /= validNeighbors.length;
                    let len = Math.hypot(dx, dy);
                    if (len < 1) { dx = 0; dy = 1; len = 1; }
                    const ux = dx / len;
                    const uy = dy / len;

                    // Place junction ~25px outside card perimeter, at most 42% towards nearest neighbor
                    const cardRadius = Math.hypot(ux * 95, uy * 48);
                    const stemDist = Math.max(cardRadius + 18, Math.min(cardRadius + 50, minNeighborDist * 0.42));
                    const jx = pDev.x + ux * stemDist;
                    const jy = pDev.y + uy * stemDist;

                    const allLinks = entries.flatMap(e => e.bundle.links);
                    const isDown = entries.some(e => e.bundle.status === "DOWN");
                    const isUnverified = entries.some(e => e.bundle.status === "UNVERIFIED");
                    const stemStatus = isDown ? "DOWN" : isUnverified ? "UNVERIFIED" : "UP";

                    const jKey = `${dev}::${intf}`;
                    const jData = {
                        id: `hub-${jKey}`,
                        x: jx,
                        y: jy,
                        device: dev,
                        intf,
                        neighbors: validNeighbors,
                        status: stemStatus,
                        memberLinks: allLinks
                    };
                    junctionMap.set(jKey, jData);

                    trunkStems.push({
                        id: `stem-${jKey}`,
                        device: dev,
                        intf,
                        p1: pDev,
                        p2: { x: jx, y: jy },
                        status: stemStatus,
                        neighborCount: validNeighbors.length,
                        neighbors: validNeighbors,
                        memberLinks: allLinks
                    });
                }
            }
        }

        // 3. Connect branches from junctions to neighbors (or between junctions)
        const adjustedLinks = bundledLinks.map(bundle => {
            const l0 = bundle.links[0];
            const srcIntf = getBasePhysicalInterface(l0?.sourceInterface || bundle.channelName);
            const tgtIntf = getBasePhysicalInterface(l0?.targetInterface || bundle.channelName);

            const srcJunction = junctionMap.get(`${bundle.sourceDevice}::${srcIntf}`);
            const tgtJunction = junctionMap.get(`${bundle.targetDevice}::${tgtIntf}`);

            return {
                ...bundle,
                srcPointOverride: srcJunction ? { x: srcJunction.x, y: srcJunction.y } : undefined,
                tgtPointOverride: tgtJunction ? { x: tgtJunction.x, y: tgtJunction.y } : undefined,
                isConvergedBranch: Boolean(srcJunction || tgtJunction)
            };
        });

        return {
            adjustedLinks,
            trunkStems,
            junctionHubs: Array.from(junctionMap.values())
        };
    }, [bundledLinks, nodePositions, convergeTrunks]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button, select, input, a")) return;
        isDraggingRef.current = true;
        hasDraggedRef.current = false;
        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        startPointerRef.current = { x: e.clientX, y: e.clientY };
        // DO NOT setPointerCapture here: capturing on down intercepts child element clicks.
        // Pointer capture is deferred until movement actually exceeds the drag threshold in handlePointerMove.
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        const dist = Math.hypot(e.clientX - startPointerRef.current.x, e.clientY - startPointerRef.current.y);
        if (dist > 5) {
            if (!hasDraggedRef.current) {
                hasDraggedRef.current = true;
                try {
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                } catch {
                    // pointer capture fallback
                }
            }
        } else {
            return;
        }

        const svg = svgContainerRef.current?.querySelector("svg");
        if (!svg) return;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const ctmInv = ctm.inverse();

        const pt1 = svg.createSVGPoint();
        pt1.x = lastPointerRef.current.x;
        pt1.y = lastPointerRef.current.y;
        const p1 = pt1.matrixTransform(ctmInv);

        const pt2 = svg.createSVGPoint();
        pt2.x = e.clientX;
        pt2.y = e.clientY;
        const p2 = pt2.matrixTransform(ctmInv);

        // Accelerated drag calibrated to exact SVG viewBox coordinates multiplied by user speed setting
        const deltaX = (p2.x - p1.x) * panSpeed;
        const deltaY = (p2.y - p1.y) * panSpeed;

        lastPointerRef.current = { x: e.clientX, y: e.clientY };
        currentPanRef.current.x += deltaX;
        currentPanRef.current.y += deltaY;

        // Direct hardware-accelerated SVG transform bypasses React re-render during rapid movement
        if (rafIdRef.current === null) {
            rafIdRef.current = requestAnimationFrame(() => {
                rafIdRef.current = null;
                if (viewportRef.current) {
                    viewportRef.current.setAttribute(
                        "transform",
                        `translate(${currentPanRef.current.x}, ${currentPanRef.current.y}) scale(${zoom})`
                    );
                }
            });
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        isDraggingRef.current = false;
        try {
            if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            }
        } catch {
            // pointer release fallback
        }
        if (rafIdRef.current !== null) {
            cancelAnimationFrame(rafIdRef.current);
            rafIdRef.current = null;
        }
        if (hasDraggedRef.current) {
            setPan({ x: currentPanRef.current.x, y: currentPanRef.current.y });
        }
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
                            const label = siteMeta?.name ? `${s} (${siteMeta.name})` : s;
                            return (
                                <option key={s} value={s}>{label} [{count}]</option>
                            );
                        })}
                        {showUncrawledSites && uncrawledSiteCodes.length > 0 && (
                            <optgroup label="Uncrawled Directory Sites">
                                {uncrawledSiteCodes.map(s => {
                                    const siteMeta = siteDirectory[s];
                                    const label = siteMeta?.name ? `${s} (${siteMeta.name})` : s;
                                    return (
                                        <option key={s} value={s}>{label} [0 - Uncrawled]</option>
                                    );
                                })}
                            </optgroup>
                        )}
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

                        {/* Cluster Formation Toggle: Connected Clusters vs Linear Grid */}
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                            <button
                                type="button"
                                onClick={() => setSiteClusterMode("topological")}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    siteClusterMode === "topological"
                                        ? "bg-sky-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Connected Clusters (Topology-driven constellation grouping hub sites and connected satellite campuses)"
                            >
                                <Network className="w-3 h-3" />
                                Connected Clusters
                            </button>
                            <button
                                type="button"
                                onClick={() => setSiteClusterMode("grid")}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    siteClusterMode === "grid"
                                        ? "bg-sky-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Linear Grid (Sites arranged sequentially in row-wrapped grid)"
                            >
                                <LayoutGrid className="w-3 h-3" />
                                Linear Grid
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

                        {/* High-Level View Mode Selector (Site Map vs Expanded) */}
                        <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                            <button
                                type="button"
                                onClick={() => {
                                    setCollapsedSites(new Set(uniqueSites));
                                    setSiteFilter("ALL");
                                }}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    collapsedSites.size === uniqueSites.length && uniqueSites.length > 0
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Site Map View: Compact overview of all sites with WAN trunks (default)"
                            >
                                <Compass className="w-3 h-3 text-cyan-400" />
                                Site Map View
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollapsedSites(new Set())}
                                className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1 cursor-pointer ${
                                    collapsedSites.size === 0
                                        ? "bg-blue-600 text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                                title="Expanded View: Fully expand all sites, floors, and individual switches"
                            >
                                <Building2 className="w-3 h-3 text-indigo-400" />
                                Expanded View
                            </button>
                            <div className="h-3 w-[1px] bg-slate-800 mx-0.5"></div>
                            <button
                                type="button"
                                onClick={collapsedIdfs.size > 0 ? expandAllIdfs : collapseAllIdfs}
                                className="px-1.5 py-0.5 rounded font-medium hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer text-[10px]"
                                title={collapsedIdfs.size > 0 ? "Expand all floor slabs" : "Collapse all floor slabs"}
                            >
                                {collapsedIdfs.size > 0 ? "Expand Floors" : "Collapse Floors"}
                            </button>
                        </div>
                    </>
                )}

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Master Links Clean-Up Toggle (OFF by default) */}
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                    <button
                        type="button"
                        onClick={() => setShowAllLinks(prev => !prev)}
                        className={`px-2 py-0.5 rounded font-medium transition flex items-center gap-1.5 cursor-pointer ${
                            showAllLinks 
                                ? "bg-cyan-600 text-white shadow-sm" 
                                : "text-slate-400 hover:text-slate-200"
                        }`}
                        title={showAllLinks ? "Hide all links (clean clutter-free mode)" : "Show all topology links across the entire diagram"}
                    >
                        <Cable className="w-3.5 h-3.5 text-cyan-400" />
                        <span>All Links: <strong className={showAllLinks ? "text-white" : "text-slate-400"}>{showAllLinks ? "ON" : "OFF"}</strong></span>
                    </button>
                    {(visibleUplinkSites.size > 0 || visibleUplinkIdfs.size > 0) && !showAllLinks && (
                        <div className="flex items-center gap-1 pl-1.5 pr-1 text-[10px] text-cyan-300 font-mono border-l border-slate-800">
                            <span>{visibleUplinkSites.size + visibleUplinkIdfs.size} active</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setVisibleUplinkSites(new Set());
                                    setVisibleUplinkIdfs(new Set());
                                }}
                                className="text-slate-400 hover:text-white underline cursor-pointer ml-0.5"
                                title="Hide all selective uplinks"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                {/* Converge Multi-Neighbor Trunks & MPLS */}
                <button
                    type="button"
                    onClick={() => setConvergeTrunks(prev => !prev)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                        convergeTrunks
                            ? "bg-purple-950/60 border-purple-500/50 text-purple-200 shadow-sm"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                    title={convergeTrunks 
                        ? "Converging multi-neighbor trunks and MPLS into single physical links before entering switch/site (click to disable)" 
                        : "Showing separate lines for each neighbor (click to converge multi-neighbor trunks)"}
                >
                    <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                    <span>Converge Trunks: <strong className={convergeTrunks ? "text-purple-300" : "text-slate-400"}>{convergeTrunks ? "ON" : "OFF"}</strong></span>
                </button>

                {/* Vendor Managed Nodes Filter Toggle (Excluded by default) */}
                <button
                    type="button"
                    onClick={() => setShowVendorManaged(prev => !prev)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                        showVendorManaged
                            ? "bg-purple-950/70 border-purple-500/60 text-purple-200 shadow-sm"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                    title={showVendorManaged 
                        ? "Vendor Managed devices are currently visible in the topology. Click to exclude them." 
                        : "Vendor Managed devices are currently excluded from the topology. Click to show them."}
                >
                    <ShieldAlert className="w-3.5 h-3.5 text-purple-400" />
                    <span>Vendor Managed: <strong className={showVendorManaged ? "text-purple-300" : "text-slate-400"}>{showVendorManaged ? "INCLUDED" : "EXCLUDED"}</strong></span>
                    {vendorManagedCount > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {vendorManagedCount}
                        </span>
                    )}
                </button>

                {/* Uncrawled Directory Sites Filter Toggle */}
                <button
                    type="button"
                    onClick={() => setShowUncrawledSites(prev => !prev)}
                    className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition flex items-center gap-1.5 cursor-pointer ${
                        showUncrawledSites
                            ? "bg-amber-950/70 border-amber-500/60 text-amber-200 shadow-sm"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                    title={showUncrawledSites 
                        ? "Uncrawled directory sites are currently visible in the topology. Click to hide them." 
                        : "Uncrawled directory sites are currently hidden. Click to show them."}
                >
                    <Building className="w-3.5 h-3.5 text-amber-400" />
                    <span>Uncrawled Sites: <strong className={showUncrawledSites ? "text-amber-300" : "text-slate-400"}>{showUncrawledSites ? "SHOWN" : "HIDDEN"}</strong></span>
                    {uncrawledSiteCodes.length > 0 && (
                        <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {uncrawledSiteCodes.length}
                        </span>
                    )}
                </button>

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
                        onClick={() => setZoom(z => Math.max(z - 0.25, 0.05))}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom Out (Mouse Wheel Scroll Down)"
                    >
                        <ZoomOut size={13} />
                    </button>
                    <span className="text-[11px] font-mono text-slate-300 min-w-[38px] text-center font-bold">
                        {Math.round(zoom * 100)}%
                    </span>
                    <button
                        onClick={() => setZoom(z => Math.min(z + 0.25, 6.0))}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                        title="Zoom In (Mouse Wheel Scroll Up)"
                    >
                        <ZoomIn size={13} />
                    </button>
                    <button
                        onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                        className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer ml-0.5"
                        title="Reset View to 100%"
                    >
                        <RotateCcw size={13} />
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                {/* Pan Speed Controls */}
                <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800" title="Click-and-Drag Pan Speed (or use Arrow Keys)">
                    <Zap className="w-3 h-3 text-amber-400 ml-0.5" />
                    <span className="text-[10px] text-slate-400 font-medium mr-0.5">Pan:</span>
                    <button
                        type="button"
                        onClick={() => setPanSpeed(1.0)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                            panSpeed === 1.0 ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Normal Pan Speed (1.0x)"
                    >
                        1x
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanSpeed(1.5)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                            panSpeed === 1.5 ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Fast Pan Speed (1.5x - snappy)"
                    >
                        1.5x
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanSpeed(2.2)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                            panSpeed === 2.2 ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-slate-400 hover:text-slate-200"
                        }`}
                        title="Quick Pan Speed (2.2x - ultra fast across large campuses)"
                    >
                        2.2x
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
                {convergeTrunks && (
                    <div className="flex items-center gap-1.5 text-purple-300">
                        <GitMerge className="w-3.5 h-3.5 text-purple-400" />
                        <span className="font-semibold">Trunk / MPLS Hub</span>
                        <span className="text-slate-400">Converged</span>
                    </div>
                )}
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
                        <div className="flex flex-col gap-2 text-[11px]">
                            <div className="flex items-center justify-between">
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

                            <button
                                type="button"
                                onClick={handleOpenBulkEdit}
                                disabled={filteredDevices.length === 0}
                                className="w-full py-1 px-2.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-300 border border-amber-500/30 font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                                title="Bulk edit authoritative site, IDF, and role for selected/visible switches"
                            >
                                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                <span>Bulk Edit Visible ({filteredDevices.length})</span>
                            </button>
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

                            if (site.isUncrawled) {
                                if (!siteMatchesSearch) return null;
                                return (
                                    <div key={site.siteCode} className="rounded-xl border border-amber-800/40 bg-amber-950/20 overflow-hidden p-2 flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                            <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                            <span className="font-bold text-amber-200 font-mono text-[11px] truncate">
                                                {site.siteCode} {site.siteName ? `• ${site.siteName}` : ""}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 ml-1">
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                Uncrawled
                                            </span>
                                            {onReseedDevice && (
                                                <button
                                                    type="button"
                                                    onClick={() => onReseedDevice({ hostname: `Seed ${site.siteCode}`, site: site.siteCode, ipAddress: "" })}
                                                    className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 transition cursor-pointer"
                                                    title="Seed crawl for this site"
                                                >
                                                    Crawl
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            }

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
                                            <button
                                                type="button"
                                                onClick={() => toggleSiteUplinks(site.siteCode)}
                                                className={`px-1.5 py-0.2 rounded text-[10px] font-semibold transition cursor-pointer flex items-center gap-0.5 ${
                                                    visibleUplinkSites.has(site.siteCode)
                                                        ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                                                        : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                                                }`}
                                                title={`Toggle uplinks for site ${site.siteCode}`}
                                            >
                                                <Cable className="w-2.5 h-2.5" />
                                                <span>Uplinks</span>
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
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleIdfUplinks(site.siteCode, floor.idfCode)}
                                                                    className={`px-1 py-0.2 rounded text-[9px] font-semibold transition cursor-pointer flex items-center gap-0.5 ${
                                                                        visibleUplinkIdfs.has(`${site.siteCode}::${floor.idfCode}`)
                                                                            ? "bg-cyan-600/30 text-cyan-300 border border-cyan-500/40"
                                                                            : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                                                                    }`}
                                                                    title={`Toggle uplinks for floor ${floor.idfCode}`}
                                                                >
                                                                    <Cable className="w-2.5 h-2.5" />
                                                                    <span>Uplinks</span>
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
                className="w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
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

                    <g ref={viewportRef} transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                        {/* 1A. RENDER MULTI-SITE CLUSTER ENCLOSURES (Campus / Hub Constellations) */}
                        {layoutMode === "container" && siteClusterMode === "topological" && siteClusters.filter(c => !c.isSingle).map((cluster) => {
                            return (
                                <g key={`cluster-${cluster.id}`} className="transition-opacity duration-300 pointer-events-none">
                                    {/* Soft ambient glassmorphism enclosure rect */}
                                    <rect
                                        x={cluster.x}
                                        y={cluster.y}
                                        width={cluster.width}
                                        height={cluster.height}
                                        rx={24}
                                        fill="rgba(30, 41, 59, 0.22)"
                                        stroke="rgba(56, 189, 248, 0.28)"
                                        strokeWidth={1.5}
                                        strokeDasharray="8,6"
                                    />
                                    {/* Cluster Header Pill Badge */}
                                    <g transform={`translate(${cluster.x + 20}, ${cluster.y - 14})`}>
                                        <rect
                                            x={0}
                                            y={0}
                                            width={cluster.titleWidth}
                                            height={26}
                                            rx={7}
                                            fill="rgba(15, 23, 42, 0.95)"
                                            stroke="#38bdf8"
                                            strokeWidth={1}
                                            filter="drop-shadow(0 2px 8px rgba(0,0,0,0.5))"
                                        />
                                        <text
                                            x={14}
                                            y={17}
                                            fill="#38bdf8"
                                            fontSize={11}
                                            fontWeight="bold"
                                            fontFamily="sans-serif"
                                            letterSpacing="0.3"
                                        >
                                            🌐 Campus Cluster: Hub {cluster.hubSiteCode} ({cluster.siteCodes.length} Sites)
                                        </text>
                                    </g>
                                </g>
                            );
                        })}

                        {/* 1B. RENDER INTER-SITE BRIDGES (Highways Connecting Adjacent Sites) */}
                        {layoutMode === "container" && interSiteBridges.map((bridge) => {
                            const isSelected = selectedDevice && (
                                deviceLocationMap.get(selectedDevice.canonicalHostname || getCanonicalHostname(selectedDevice.hostname))?.site === bridge.sourceSite ||
                                deviceLocationMap.get(selectedDevice.canonicalHostname || getCanonicalHostname(selectedDevice.hostname))?.site === bridge.targetSite
                            );
                            const isDown = bridge.status === "DOWN";
                            const isUnverified = bridge.status === "UNVERIFIED";
                            const strokeColor = isDown 
                                ? "#ef4444" 
                                : isUnverified 
                                ? "#f59e0b" 
                                : bridge.isRouted 
                                ? "#06b6d4" 
                                : "#10b981";

                            const badgeFill = bridge.isRouted ? "rgba(6, 182, 212, 0.2)" : "rgba(16, 185, 129, 0.2)";
                            const badgeBorder = bridge.isRouted ? "#06b6d4" : "#10b981";
                            const badgeTextColor = bridge.isRouted ? "#67e8f9" : "#6ee7b7";

                            return (
                                <g
                                    key={bridge.id}
                                    className="cursor-pointer group"
                                    onMouseEnter={() => setHoveredLink({
                                        id: bridge.id,
                                        isPortChannel: bridge.links.length > 1,
                                        channelName: `${bridge.sourceSite} ⇄ ${bridge.targetSite} Inter-Site Highway (${bridge.label})`,
                                        links: bridge.links,
                                        status: bridge.status
                                    })}
                                    onMouseLeave={() => setHoveredLink(null)}
                                >
                                    {/* Wider invisible hover target */}
                                    <path
                                        d={bridge.path}
                                        fill="none"
                                        stroke="transparent"
                                        strokeWidth={24}
                                    />
                                    {/* Ambient Glow */}
                                    <path
                                        d={bridge.path}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={6}
                                        opacity={0.3}
                                        className="group-hover:opacity-60 transition"
                                    />
                                    {/* Primary Bridge Highway Line */}
                                    <path
                                        d={bridge.path}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={bridge.isRouted ? 3 : 3.5}
                                        strokeDasharray={bridge.isRouted ? "6,4" : undefined}
                                        className={isSelected ? "animate-pulse" : ""}
                                    />

                                    {/* Midpoint Badge Pill */}
                                    <g transform={`translate(${bridge.midX}, ${bridge.midY})`}>
                                        <g transform="translate(-55, -11)">
                                            <rect
                                                x={0}
                                                y={0}
                                                width={110}
                                                height={22}
                                                rx={6}
                                                fill="rgba(15, 23, 42, 0.95)"
                                                stroke={badgeBorder}
                                                strokeWidth={1}
                                                filter="drop-shadow(0 2px 6px rgba(0,0,0,0.6))"
                                                className="group-hover:scale-105 transition-transform"
                                            />
                                            <rect
                                                x={2}
                                                y={2}
                                                width={106}
                                                height={18}
                                                rx={4}
                                                fill={badgeFill}
                                            />
                                            <text
                                                x={55}
                                                y={14}
                                                fill={badgeTextColor}
                                                fontSize={9}
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                                textAnchor="middle"
                                                letterSpacing="0.2"
                                            >
                                                {bridge.label}
                                            </text>
                                        </g>
                                    </g>
                                </g>
                            );
                        })}

                        {layoutMode === "container" && siteBoxes.map((site) => {
                            if (site.isUncrawled) {
                                return (
                                    <g
                                        key={`site-${site.siteCode}`}
                                        className="group cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onReseedDevice) {
                                                onReseedDevice({ hostname: `Seed ${site.siteCode}`, site: site.siteCode, ipAddress: "" });
                                            }
                                        }}
                                    >
                                        <rect
                                            x={site.x}
                                            y={site.y}
                                            width={site.width}
                                            height={site.height}
                                            rx={10}
                                            fill="rgba(30, 22, 12, 0.95)"
                                            stroke="#f59e0b"
                                            strokeWidth={1.5}
                                            strokeDasharray="5,3"
                                            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
                                            className="group-hover:stroke-amber-300 group-hover:brightness-125 transition"
                                        />
                                        {/* Accent Strip */}
                                        <path
                                            d={`M ${site.x} ${site.y + 8} A 8 8 0 0 1 ${site.x + 8} ${site.y} L ${site.x + 4} ${site.y} L ${site.x + 4} ${site.y + site.height} L ${site.x + 8} ${site.y + site.height} A 8 8 0 0 1 ${site.x} ${site.y + site.height - 8} Z`}
                                            fill="#f59e0b"
                                        />
                                        <title>{`Uncrawled Site: ${site.siteCode}${site.siteName ? ` — ${site.siteName}` : ""}${site.siteAddress ? `\nAddress: ${site.siteAddress}` : ""}\nStatus: ${site.siteStatus || "Active"}\nNo switches discovered yet.${onReseedDevice ? " Click to initiate crawl." : ""}`}</title>

                                        {/* Site Code */}
                                        <text x={site.x + 14} y={site.y + 22} fill="#fbbf24" fontSize={13} fontWeight="bold" fontFamily="monospace">
                                            {site.siteCode}
                                        </text>

                                        {/* Uncrawled Badge on the right */}
                                        <g transform={`translate(${site.x + site.width - 124}, ${site.y + 11})`}>
                                            <rect x={0} y={0} width={112} height={18} rx={4} fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth={0.8} />
                                            <text x={56} y={12.5} fill="#fcd34d" fontSize={8} fontWeight="bold" textAnchor="middle" letterSpacing="0.4">
                                                UNCRAWLED / NO DATA
                                            </text>
                                        </g>

                                        {/* Site Name */}
                                        {site.siteName && (
                                            <text 
                                                x={site.x + 14} 
                                                y={site.y + 37} 
                                                fill="#fed7aa" 
                                                fontSize={9.5} 
                                                fontWeight="500" 
                                                fontFamily="sans-serif"
                                            >
                                                {site.siteName.length > 28 ? site.siteName.slice(0, 26) + "…" : site.siteName}
                                            </text>
                                        )}

                                        {/* Facility Address or Status */}
                                        <text x={site.x + 14} y={site.y + (site.siteName ? 57 : 46)} fill="#fde68a" fontSize={9} fontFamily="monospace">
                                            0 Discovered Devices • {site.siteAddress ? (site.siteAddress.length > 24 ? site.siteAddress.slice(0, 22) + "…" : site.siteAddress) : "Pending Discovery"}
                                        </text>
                                    </g>
                                );
                            }

                            if (site.isCollapsed) {
                                return (
                                    <g
                                        key={`site-${site.siteCode}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!hasDraggedRef.current) {
                                                toggleCollapseSite(site.siteCode);
                                            }
                                        }}
                                        className="cursor-pointer group"
                                        title={`Click to expand site ${site.siteCode}${site.siteName ? ` (${site.siteName})` : ""}`}
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
                                            className="group-hover:stroke-cyan-300 group-hover:brightness-125 transition"
                                        />
                                        {/* Accent Strip */}
                                        <path
                                            d={`M ${site.x} ${site.y + 8} A 8 8 0 0 1 ${site.x + 8} ${site.y} L ${site.x + 4} ${site.y} L ${site.x + 4} ${site.y + site.height} L ${site.x + 8} ${site.y + site.height} A 8 8 0 0 1 ${site.x} ${site.y + site.height - 8} Z`}
                                            fill="#3b82f6"
                                        />
                                        <title>{`${site.siteCode}${site.siteName ? ` — ${site.siteName}` : ""} (${site.deviceCount} Switches)`}</title>
                                        {/* Site Code (Prominent emphasis, no 'SITE:' prefix) */}
                                        <text x={site.x + 14} y={site.y + 22} fill="#ffffff" fontSize={13} fontWeight="bold" fontFamily="monospace">
                                            {site.siteCode}
                                            {site.isClusterHub && (
                                                <tspan fill="#f59e0b" fontSize={10} fontWeight="bold"> ★ HUB</tspan>
                                            )}
                                        </text>

                                        {/* Site Name (Appears below Site Code with smaller styling) */}
                                        {site.siteName && (
                                            <text 
                                                x={site.x + 14} 
                                                y={site.y + 37} 
                                                fill="#7dd3fc" 
                                                fontSize={9.5} 
                                                fontWeight="500" 
                                                fontFamily="sans-serif"
                                            >
                                                {site.siteName.length > 32 ? site.siteName.slice(0, 30) + "…" : site.siteName}
                                            </text>
                                        )}
                                        {/* Uplinks Toggle Button on Collapsed Site */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSiteUplinks(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-95 transition"
                                            transform={`translate(${site.x + site.width - 92}, ${site.y + 11})`}
                                            title={`Toggle WAN/core uplinks for site ${site.siteCode}`}
                                        >
                                            <rect
                                                x={0}
                                                y={0}
                                                width={62}
                                                height={18}
                                                rx={4}
                                                fill={visibleUplinkSites.has(site.siteCode) ? "rgba(56, 189, 248, 0.3)" : "rgba(148, 163, 184, 0.12)"}
                                                stroke={visibleUplinkSites.has(site.siteCode) ? "#38bdf8" : "rgba(148, 163, 184, 0.3)"}
                                                strokeWidth={0.8}
                                            />
                                            <text
                                                x={31}
                                                y={12.5}
                                                fill={visibleUplinkSites.has(site.siteCode) ? "#38bdf8" : "#94a3b8"}
                                                fontSize={9}
                                                fontWeight="bold"
                                                textAnchor="middle"
                                            >
                                                {visibleUplinkSites.has(site.siteCode) ? "✓ Uplinks" : "+ Uplinks"}
                                            </text>
                                        </g>

                                        {/* Expand Chevron Icon Badge */}
                                        <g transform={`translate(${site.x + site.width - 24}, ${site.y + 12})`}>
                                            <circle cx={6} cy={6} r={8} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={0.8} />
                                            <text x={6} y={9.5} fill="#60a5fa" fontSize={10} fontWeight="bold" textAnchor="middle">
                                                ▾
                                            </text>
                                        </g>
                                        {/* Switch Census */}
                                        <text x={site.x + 14} y={site.y + (site.siteName ? 57 : 46)} fill="#94a3b8" fontSize={9} fontFamily="monospace">
                                            {site.deviceCount} Switches ({site.l3Count} Core/L3 • {site.l2Count} Access/L2)
                                            {site.connectedSites && site.connectedSites.length > 0 && ` • ⇄ Peers: ${site.connectedSites.join(", ")}`}
                                        </text>
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
                                        <rect x={0} y={-2} width={28} height={20} rx={5} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={0.8} />
                                        <text x={14} y={12} fill="#60a5fa" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                                            {site.siteCode}
                                        </text>

                                        <text x={36} y={12} fill="#ffffff" fontSize={12} fontWeight="bold" fontFamily="monospace">
                                            {site.siteCode}
                                            {site.isClusterHub && (
                                                <tspan fill="#f59e0b" fontWeight="bold"> ★ HUB</tspan>
                                            )}
                                            {site.siteName && (
                                                <tspan fill="#7dd3fc" fontWeight="normal" fontFamily="sans-serif"> — {site.siteName}</tspan>
                                            )}
                                        </text>

                                        <text x={site.width - 128} y={12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                            {site.connectedSites && site.connectedSites.length > 0 && (
                                                <tspan fill="#38bdf8" fontWeight="bold">⇄ {site.connectedSites.join(", ")} • </tspan>
                                            )}
                                            {site.deviceCount} {site.deviceCount === 1 ? "device" : "devices"} • {site.idfs.length} {site.idfs.length === 1 ? "IDF" : "IDFs"}
                                        </text>

                                        {/* Site Uplinks Toggle Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSiteUplinks(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-95 transition"
                                            transform={`translate(${site.width - 120}, -3)`}
                                            title={`Toggle all directly connected uplinks for site ${site.siteCode}`}
                                        >
                                            <rect
                                                x={0}
                                                y={0}
                                                width={66}
                                                height={20}
                                                rx={5}
                                                fill={visibleUplinkSites.has(site.siteCode) ? "rgba(56, 189, 248, 0.3)" : "rgba(148, 163, 184, 0.12)"}
                                                stroke={visibleUplinkSites.has(site.siteCode) ? "#38bdf8" : "rgba(148, 163, 184, 0.3)"}
                                                strokeWidth={0.8}
                                            />
                                            <text
                                                x={33}
                                                y={13.5}
                                                fill={visibleUplinkSites.has(site.siteCode) ? "#38bdf8" : "#94a3b8"}
                                                fontSize={9.5}
                                                fontWeight="bold"
                                                textAnchor="middle"
                                            >
                                                {visibleUplinkSites.has(site.siteCode) ? "✓ Uplinks" : "+ Uplinks"}
                                            </text>
                                        </g>

                                        {/* Collapse Site Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleCollapseSite(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition"
                                            transform={`translate(${site.width - 46}, -3)`}
                                            title={`Collapse site ${site.siteCode}`}
                                        >
                                            <rect x={0} y={0} width={20} height={20} rx={5} fill="rgba(148, 163, 184, 0.12)" stroke="rgba(148, 163, 184, 0.3)" strokeWidth={0.8} />
                                            <text x={10} y={13.5} fill="#94a3b8" fontSize={13} fontWeight="bold" textAnchor="middle">
                                                −
                                            </text>
                                        </g>
                                    </g>

                                    {/* 2. RENDER NESTED IDF CONTAINERS */}
                                    {site.idfs.map((idf) => {
                                        const isIdfUplinksOn = visibleUplinkIdfs.has(`${site.siteCode}::${idf.idfCode}`);

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

                                                    {/* IDF Uplinks Toggle Button */}
                                                    <g
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleIdfUplinks(site.siteCode, idf.idfCode);
                                                        }}
                                                        className="cursor-pointer hover:opacity-95 transition"
                                                        transform={`translate(${idf.x + idf.width - 74}, ${idf.y + 14})`}
                                                        title={`Toggle uplinks for IDF ${idf.idfCode}`}
                                                    >
                                                        <rect
                                                            x={0}
                                                            y={0}
                                                            width={62}
                                                            height={20}
                                                            rx={4}
                                                            fill={isIdfUplinksOn ? "rgba(56, 189, 248, 0.3)" : "rgba(148, 163, 184, 0.12)"}
                                                            stroke={isIdfUplinksOn ? "#38bdf8" : "rgba(148, 163, 184, 0.3)"}
                                                            strokeWidth={0.8}
                                                        />
                                                        <text
                                                            x={31}
                                                            y={13.5}
                                                            fill={isIdfUplinksOn ? "#38bdf8" : "#94a3b8"}
                                                            fontSize={9.5}
                                                            fontWeight="bold"
                                                            textAnchor="middle"
                                                        >
                                                            {isIdfUplinksOn ? "✓ Uplinks" : "+ Uplinks"}
                                                        </text>
                                                    </g>
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
                                                    <text x={idf.width - 128} y={10} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
                                                        ({idf.deviceCount})
                                                    </text>

                                                    {/* IDF Uplinks Toggle Button */}
                                                    <g
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleIdfUplinks(site.siteCode, idf.idfCode);
                                                        }}
                                                        className="cursor-pointer hover:opacity-95 transition"
                                                        transform={`translate(${idf.width - 120}, -3)`}
                                                        title={`Toggle uplinks for IDF ${idf.idfCode}`}
                                                    >
                                                        <rect
                                                            x={0}
                                                            y={0}
                                                            width={62}
                                                            height={20}
                                                            rx={4}
                                                            fill={isIdfUplinksOn ? "rgba(56, 189, 248, 0.3)" : "rgba(148, 163, 184, 0.12)"}
                                                            stroke={isIdfUplinksOn ? "#38bdf8" : "rgba(148, 163, 184, 0.3)"}
                                                            strokeWidth={0.8}
                                                        />
                                                        <text
                                                            x={31}
                                                            y={13.5}
                                                            fill={isIdfUplinksOn ? "#38bdf8" : "#94a3b8"}
                                                            fontSize={9.5}
                                                            fontWeight="bold"
                                                            textAnchor="middle"
                                                        >
                                                            {isIdfUplinksOn ? "✓ Uplinks" : "+ Uplinks"}
                                                        </text>
                                                    </g>

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

                        {/* 3A. RENDER CONVERGED TRUNK STEMS (Single Physical Trunk Lines Entering Switch/Site) */}
                        {convergedModel.trunkStems.map((stem) => {
                            const devLoc = deviceLocationMap.get(stem.device);
                            const selectedCanon = selectedDevice ? (selectedDevice.canonicalHostname || getCanonicalHostname(selectedDevice.hostname)) : null;
                            const isDirectlyConnectedToSelected = Boolean(selectedCanon && stem.device === selectedCanon);
                            const isSiteUplinkActive = Boolean(devLoc && visibleUplinkSites.has(devLoc.site));
                            const isIdfUplinkActive = Boolean(devLoc && visibleUplinkIdfs.has(`${devLoc.site}::${devLoc.idf}`));
                            const isHighlighted = highlightedLinks.some(hl => hl.from === stem.device || hl.to === stem.device);

                            // Check if any neighbor is active
                            let anyNeighborActive = false;
                            for (const n of stem.neighbors) {
                                const nLoc = deviceLocationMap.get(n);
                                if (nLoc && (visibleUplinkSites.has(nLoc.site) || visibleUplinkIdfs.has(`${nLoc.site}::${nLoc.idf}`))) {
                                    anyNeighborActive = true;
                                    break;
                                }
                                if (selectedCanon && n === selectedCanon) {
                                    anyNeighborActive = true;
                                    break;
                                }
                            }

                            const isStemVisible = showAllLinks || isHighlighted || isDirectlyConnectedToSelected || isSiteUplinkActive || isIdfUplinkActive || anyNeighborActive;
                            if (!isStemVisible) return null;

                            const p1 = stem.p1;
                            const p2 = stem.p2;
                            const isFaded = fadedNodes.has(stem.device);
                            const strokeColor = isHighlighted 
                                ? "#f59e0b" 
                                : stem.status === "DOWN" 
                                ? "#ef4444" 
                                : stem.status === "UNVERIFIED" 
                                ? "#f59e0b" 
                                : "#a855f7";

                            const pathD = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;

                            return (
                                <g
                                    key={stem.id}
                                    onMouseEnter={() => setHoveredLink({
                                        id: stem.id,
                                        isPortChannel: true,
                                        channelName: `Trunk Stem: ${stem.intf} (${stem.neighborCount} Converged Neighbors)`,
                                        links: stem.memberLinks,
                                        status: stem.status
                                    })}
                                    onMouseLeave={() => setHoveredLink(null)}
                                    className="cursor-pointer group"
                                    opacity={isFaded ? 0.3 : 1}
                                >
                                    {/* Wider invisible hit area */}
                                    <path d={pathD} fill="none" stroke="transparent" strokeWidth={18} />
                                    {/* Outer glow */}
                                    <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={6} opacity={0.25} />
                                    {/* Main Trunk Solid Line */}
                                    <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={3.8} />
                                    {/* Multi-Strand Trunk Inner Dash Line */}
                                    <path d={pathD} fill="none" stroke="#ffffff" strokeWidth={1.2} strokeDasharray="3,3" opacity={0.8} />
                                </g>
                            );
                        })}

                        {/* 3B. RENDER TRUNK & MPLS CONVERGENCE JUNCTION HUBS */}
                        {convergedModel.junctionHubs.map((hub) => {
                            const devLoc = deviceLocationMap.get(hub.device);
                            const selectedCanon = selectedDevice ? (selectedDevice.canonicalHostname || getCanonicalHostname(selectedDevice.hostname)) : null;
                            const isDirectlyConnectedToSelected = Boolean(selectedCanon && hub.device === selectedCanon);
                            const isSiteUplinkActive = Boolean(devLoc && visibleUplinkSites.has(devLoc.site));
                            const isIdfUplinkActive = Boolean(devLoc && visibleUplinkIdfs.has(`${devLoc.site}::${devLoc.idf}`));
                            const isHighlighted = highlightedLinks.some(hl => hl.from === hub.device || hl.to === hub.device);

                            let anyNeighborActive = false;
                            for (const n of hub.neighbors) {
                                const nLoc = deviceLocationMap.get(n);
                                if (nLoc && (visibleUplinkSites.has(nLoc.site) || visibleUplinkIdfs.has(`${nLoc.site}::${nLoc.idf}`))) {
                                    anyNeighborActive = true;
                                    break;
                                }
                                if (selectedCanon && n === selectedCanon) {
                                    anyNeighborActive = true;
                                    break;
                                }
                            }

                            const isHubVisible = showAllLinks || isHighlighted || isDirectlyConnectedToSelected || isSiteUplinkActive || isIdfUplinkActive || anyNeighborActive;
                            if (!isHubVisible) return null;

                            const isFaded = fadedNodes.has(hub.device);
                            const strokeColor = isHighlighted 
                                ? "#f59e0b" 
                                : hub.status === "DOWN" 
                                ? "#ef4444" 
                                : hub.status === "UNVERIFIED" 
                                ? "#f59e0b" 
                                : "#a855f7";

                            return (
                                <g
                                    key={hub.id}
                                    transform={`translate(${hub.x}, ${hub.y})`}
                                    onMouseEnter={() => setHoveredLink({
                                        id: hub.id,
                                        isPortChannel: true,
                                        channelName: `Trunk Junction: ${hub.intf} (${hub.neighbors.length} Neighbors)`,
                                        links: hub.memberLinks,
                                        status: hub.status
                                    })}
                                    onMouseLeave={() => setHoveredLink(null)}
                                    className="cursor-pointer group"
                                    opacity={isFaded ? 0.3 : 1}
                                >
                                    {/* Outer Pulse Ring */}
                                    <circle cx={0} cy={0} r={8.5} fill={strokeColor} opacity={0.25} className="group-hover:scale-125 transition-transform" />
                                    {/* Hub Body */}
                                    <circle cx={0} cy={0} r={5} fill="#090d16" stroke={strokeColor} strokeWidth={1.5} />
                                    <circle cx={0} cy={0} r={2} fill={strokeColor} />

                                    {/* Trunk Interface & Count Badge */}
                                    <g transform="translate(8, -8)" className="pointer-events-none">
                                        <rect
                                            x={0}
                                            y={0}
                                            width={hub.intf.length * 5.6 + 28}
                                            height={15}
                                            rx={3.5}
                                            fill="#090d16"
                                            stroke={strokeColor}
                                            strokeWidth={0.8}
                                            filter="drop-shadow(0 2px 4px rgba(0,0,0,0.6))"
                                        />
                                        <text
                                            x={4}
                                            y={10.5}
                                            fill="#d8b4fe"
                                            fontSize={8}
                                            fontWeight="bold"
                                            fontFamily="monospace"
                                        >
                                            {hub.intf} ({hub.neighbors.length}x)
                                        </text>
                                    </g>
                                </g>
                            );
                        })}

                        {/* 3C. RENDER LINKS & PORT-CHANNEL BUNDLES (Adjusted with Convergence) */}
                        {convergedModel.adjustedLinks.map((bundle) => {
                            const getDevPoint = (devName: string, peerDevName: string) => {
                                const peerLoc = deviceLocationMap.get(peerDevName);
                                if (peerLoc) {
                                    const specific = nodePositions.get(`${devName}__closet__${peerLoc.site}_${peerLoc.idf}`);
                                    if (specific) return specific;
                                }
                                return nodePositions.get(devName);
                            };
                            const p1 = bundle.srcPointOverride || getDevPoint(bundle.sourceDevice, bundle.targetDevice);
                            const p2 = bundle.tgtPointOverride || getDevPoint(bundle.targetDevice, bundle.sourceDevice);
                            if (!p1 || !p2 || (p1.x === p2.x && p1.y === p2.y)) return null;

                            const isHighlighted = highlightedLinks.some(
                                hl => (hl.from === bundle.sourceDevice && hl.to === bundle.targetDevice) ||
                                      (hl.from === bundle.targetDevice && hl.to === bundle.sourceDevice)
                            );

                            const selectedCanon = selectedDevice ? (selectedDevice.canonicalHostname || getCanonicalHostname(selectedDevice.hostname)) : null;
                            const isDirectlyConnectedToSelected = Boolean(
                                selectedCanon && (bundle.sourceDevice === selectedCanon || bundle.targetDevice === selectedCanon)
                            );

                            const srcLoc = deviceLocationMap.get(bundle.sourceDevice);
                            const tgtLoc = deviceLocationMap.get(bundle.targetDevice);
                            const isSiteUplinkActive = Boolean(
                                (srcLoc && visibleUplinkSites.has(srcLoc.site)) ||
                                (tgtLoc && visibleUplinkSites.has(tgtLoc.site))
                            );
                            const isIdfUplinkActive = Boolean(
                                (srcLoc && visibleUplinkIdfs.has(`${srcLoc.site}::${srcLoc.idf}`)) ||
                                (tgtLoc && visibleUplinkIdfs.has(`${tgtLoc.site}::${tgtLoc.idf}`))
                            );

                            // Selective Uplink Visibility: off by default unless global toggle is ON or uplink is toggled
                            const isLinkVisible = showAllLinks || isHighlighted || isDirectlyConnectedToSelected || isSiteUplinkActive || isIdfUplinkActive;
                            if (!isLinkVisible) return null;

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
                                : bundle.isSiteTrunk
                                ? "#a855f7"
                                : bundle.isPortChannel 
                                ? "#38bdf8" 
                                : "#0284c7";

                            const strokeWidth = isHighlighted ? 4 : bundle.isSiteTrunk ? 3.5 : bundle.isPortChannel ? 3.2 : 2;
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

                                    {/* Secondary line to visually represent Port-Channel / Site Trunk multi-strand bundle */}
                                    {(bundle.isPortChannel || bundle.isSiteTrunk) && (
                                        <path
                                            d={pathD}
                                            fill="none"
                                            stroke="#0f172a"
                                            strokeWidth={1}
                                            strokeDasharray="3,3"
                                            opacity={bothFaded ? 0.08 : 0.9}
                                        />
                                    )}

                                    {/* Port-Channel / Site Trunk / Bundle Midpoint Badge */}
                                    {bundle.isPortChannel || bundle.isSiteTrunk ? (
                                        <g transform={`translate(${midX}, ${midY})`}>
                                            <rect
                                                x={-34}
                                                y={-9}
                                                width={68}
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
                        {layoutDevices.map((dev) => {
                            const { site, idf } = parseDeviceSiteAndIdf(dev.hostname, dev.site, dev.idf);
                            // Do not render individual nodes if their site container or IDF is collapsed
                            if (layoutMode === "container" && (collapsedSites.has(site) || collapsedIdfs.has(`${site}::${idf}`))) {
                                return null;
                            }

                            const canonHost = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
                            const nodeKey = dev._instanceNodeKey || canonHost;
                            const pos = nodePositions.get(nodeKey) || nodePositions.get(canonHost);
                            if (!pos) return null;

                            const isSelected = selectedDevice && (getCanonicalHostname(selectedDevice.hostname) === canonHost);
                            const isHop = isHopDevice(dev.hostname) || isHopDevice(canonHost);
                            const isMultiConflict = Boolean(dev.isMultiCloset || dev.flaggedForInvestigation);
                            const isUnverified = dev.status === "UNVERIFIED";
                            const isUnreachable = dev.status !== "REACHABLE" && !isUnverified;
                            const { layer, label: layerLabel } = getDeviceLayer(dev);
                            const stackInfo = detectSwitchStack(dev);

                            // Node Color scheme based on L3 vs L2 vs Unverified vs Multi-Closet Conflict
                            let borderColor = isSelected ? "#38bdf8" : isHop ? "#fbbf24" : "rgba(255,255,255,0.18)";
                            let borderDash: string | undefined = undefined;
                            let cardBg = "#0f172a";

                            if (dev.isVendorManaged) {
                                borderColor = isSelected ? "#ffffff" : "#a855f7";
                                cardBg = "rgba(28, 14, 46, 0.95)";
                            } else if (isMultiConflict) {
                                borderColor = isSelected ? "#ffffff" : "#f59e0b";
                                borderDash = "4,2";
                                cardBg = "rgba(35, 24, 12, 0.95)";
                            } else if (isUnverified) {
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
                                    key={nodeKey}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onClick={(e) => handleNodeClick(e, dev)}
                                    opacity={isFaded ? 0.22 : 1}
                                    className={isFaded 
                                        ? "cursor-pointer hover:opacity-75 transition-opacity" 
                                        : "cursor-pointer group"
                                    }
                                >
                                    <title>{`${canonHost}${dev.platform ? ` [${dev.platform}]` : ""}${isMultiConflict ? " • Multi-Closet Conflict (Flagged for Investigation)" : ""}${dev.isVendorManaged ? " • Vendor Managed" : ""}`}</title>
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
                                        className="transition-all duration-150 group-hover:stroke-blue-400 group-hover:brightness-125"
                                        filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                    />

                                    {/* Left Accent Strip (L3 Cyan, L2 Green, Unverified Amber, Unreachable Red) */}
                                    <path
                                        d={`M ${-CARD_W / 2} ${-CARD_H / 2 + 8} A 8 8 0 0 1 ${-CARD_W / 2 + 8} ${-CARD_H / 2} L ${-CARD_W / 2 + 4} ${-CARD_H / 2} L ${-CARD_W / 2 + 4} ${CARD_H / 2} L ${-CARD_W / 2 + 8} ${CARD_H / 2} A 8 8 0 0 1 ${-CARD_W / 2} ${CARD_H / 2 - 8} Z`}
                                        fill={dev.isVendorManaged ? "#a855f7" : isMultiConflict ? "#f59e0b" : isUnverified ? "#f59e0b" : isUnreachable ? "#ef4444" : layer === "L3" ? "#0284c7" : "#10b981"}
                                    />

                                    {/* L3 vs L2 & Switch Stack Badge Chips (Top-Right) */}
                                    <g transform={`translate(${CARD_W / 2 - (stackInfo.isStack ? (isMultiConflict ? 74 : 58) : (isMultiConflict ? 44 : 28))}, ${-CARD_H / 2 + 7})`}>
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
                                                width={isMultiConflict ? 40 : 22}
                                                height={13}
                                                rx={3}
                                                fill={dev.isVendorManaged ? "rgba(168, 85, 247, 0.2)" : isMultiConflict ? "rgba(245, 158, 11, 0.25)" : isUnverified ? "rgba(245, 158, 11, 0.2)" : layer === "L3" ? "rgba(56, 189, 248, 0.2)" : "rgba(16, 185, 129, 0.2)"}
                                                stroke={dev.isVendorManaged ? "#a855f7" : isMultiConflict ? "#f59e0b" : isUnverified ? "#f59e0b" : layer === "L3" ? "#38bdf8" : "#10b981"}
                                                strokeWidth={0.8}
                                            />
                                            <text
                                                x={isMultiConflict ? 20 : 11}
                                                y={9.5}
                                                fill={dev.isVendorManaged ? "#d8b4fe" : isMultiConflict ? "#fbbf24" : isUnverified ? "#fbbf24" : layer === "L3" ? "#7dd3fc" : "#6ee7b7"}
                                                fontSize={isMultiConflict ? 6.8 : 8}
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                                textAnchor="middle"
                                            >
                                                {dev.isVendorManaged ? "VND" : isMultiConflict ? "CONFLICT" : isUnverified ? "BND" : layer}
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
                                        {dev.isVendorManaged ? (
                                            <g>
                                                <rect x={0} y={0} width={80} height={12} rx={3} fill="rgba(168, 85, 247, 0.25)" stroke="#a855f7" strokeWidth={0.6} />
                                                <text x={4} y={9} fill="#d8b4fe" fontSize={7.5} fontWeight="bold" fontFamily="monospace">
                                                    VENDOR MGD
                                                </text>
                                            </g>
                                        ) : isMultiConflict ? (
                                            <g>
                                                <rect x={0} y={0} width={128} height={12} rx={3} fill="rgba(245, 158, 11, 0.25)" stroke="#f59e0b" strokeWidth={0.6} />
                                                <text x={4} y={9} fill="#fbbf24" fontSize={7.2} fontWeight="bold" fontFamily="monospace">
                                                    ⚠️ MULTI-CLOSET ({dev.discoveredClosets?.length || 2} IDFs)
                                                </text>
                                            </g>
                                        ) : isUnverified ? (
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

                                    {/* Quick Crawl Initiation button on card */}
                                    {onReseedDevice && !isUnreachable && (
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onReseedDevice(dev);
                                            }}
                                            className="cursor-pointer hover:opacity-100 transition opacity-75 hover:scale-110"
                                            transform={`translate(${CARD_W / 2 - 38}, ${CARD_H / 2 - 20})`}
                                        >
                                            <title>{`Initiate crawl seeding from ${canonHost} (${dev.ipAddress || dev.ip_address || "Mgmt IP"})`}</title>
                                            <rect 
                                                x={0} 
                                                y={0} 
                                                width={15} 
                                                height={15} 
                                                rx={3.5} 
                                                fill={isUnverified ? "rgba(245, 158, 11, 0.2)" : "rgba(14, 165, 233, 0.2)"} 
                                                stroke={isUnverified ? "#f59e0b" : "#38bdf8"} 
                                                strokeWidth={0.8} 
                                            />
                                            <CrawlIcon 
                                                x={1.5} 
                                                y={1.5} 
                                                size={12} 
                                                color={isUnverified ? "#fbbf24" : "#38bdf8"} 
                                            />
                                        </g>
                                    )}

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

            {/* Bulk Node Governance Override Modal */}
            {isBulkEditModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/80 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                    <Edit3 className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white tracking-tight">Bulk Node Governance Override</h3>
                                    <p className="text-[11px] text-slate-400">
                                        Authoritatively relocate switches or correct naming standards across {bulkTargetHostnames.length} devices.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsBulkEditModalOpen(false)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-300">Target Authoritative Site</label>
                                    <input
                                        type="text"
                                        value={bulkSiteOverride}
                                        onChange={(e) => setBulkSiteOverride(e.target.value.toUpperCase())}
                                        placeholder="e.g. KEL (leave blank to keep)"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-300">Target Authoritative IDF</label>
                                    <input
                                        type="text"
                                        value={bulkIdfOverride}
                                        onChange={(e) => setBulkIdfOverride(e.target.value.toUpperCase())}
                                        placeholder="e.g. 2MC (leave blank to keep)"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white font-mono uppercase focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-300">Device Role</label>
                                    <select
                                        value={bulkRoleOverride}
                                        onChange={(e) => setBulkRoleOverride(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                                    >
                                        <option value="">(Keep Existing Roles)</option>
                                        <option value="WLC">WLC (Wireless Controller)</option>
                                        <option value="L3 Switch">L3 Switch (Core / Distribution)</option>
                                        <option value="L2 Switch">L2 Switch (Access)</option>
                                        <option value="Router">Router (WAN / Edge)</option>
                                        <option value="Firewall">Firewall</option>
                                        <option value="Access Point">Access Point</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-300">Reason</label>
                                    <input
                                        type="text"
                                        value={bulkReason}
                                        onChange={(e) => setBulkReason(e.target.value)}
                                        placeholder="e.g. Campus re-architecture"
                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>

                            {/* Errant site cleanup option */}
                            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                                <input
                                    type="checkbox"
                                    checked={bulkCleanupEmptySite}
                                    onChange={(e) => setBulkCleanupEmptySite(e.target.checked)}
                                    className="w-4 h-4 accent-amber-500 rounded bg-slate-950 border-slate-700 cursor-pointer"
                                />
                                <span>Clean up any former sites from Site Directory if left with 0 devices</span>
                            </label>

                            {/* Targeted devices selector */}
                            <div className="space-y-1.5 pt-2">
                                <div className="flex items-center justify-between text-xs">
                                    <label className="font-semibold text-slate-300">
                                        Affected Switches ({bulkTargetHostnames.length})
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (bulkTargetHostnames.length === filteredDevices.length) {
                                                setBulkTargetHostnames([]);
                                            } else {
                                                setBulkTargetHostnames(filteredDevices.map(d => getCanonicalHostname(d.hostname)));
                                            }
                                        }}
                                        className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                                    >
                                        {bulkTargetHostnames.length === filteredDevices.length ? "Deselect All" : "Select All Visible"}
                                    </button>
                                </div>

                                <div className="max-h-48 overflow-y-auto border border-slate-800 bg-slate-950 rounded-xl p-2.5 space-y-1">
                                    {filteredDevices.map(d => {
                                        const canon = getCanonicalHostname(d.hostname);
                                        const isChecked = bulkTargetHostnames.includes(canon);
                                        return (
                                            <label key={canon} className="flex items-center justify-between text-[11px] font-mono text-slate-300 p-1 rounded hover:bg-slate-900 cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setBulkTargetHostnames(prev => [...prev, canon]);
                                                            } else {
                                                                setBulkTargetHostnames(prev => prev.filter(h => h !== canon));
                                                            }
                                                        }}
                                                        className="w-3.5 h-3.5 accent-amber-500 rounded bg-slate-900 border-slate-700 cursor-pointer"
                                                    />
                                                    <span className="text-white font-medium">{canon}</span>
                                                </div>
                                                <span className="text-slate-500 text-[10px]">{d.site || "UNK"} / {d.idf || "MDF"}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {bulkOverrideError && (
                                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <span>{bulkOverrideError}</span>
                                </div>
                            )}

                            {bulkOverrideSuccess && (
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                                    <span>{bulkOverrideSuccess}</span>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setIsBulkEditModalOpen(false)}
                                disabled={savingBulkOverrides}
                                className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveBulkOverrides}
                                disabled={savingBulkOverrides || bulkTargetHostnames.length === 0}
                                className="px-4 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
                            >
                                {savingBulkOverrides ? (
                                    <>
                                        <span className="w-3.5 h-3.5 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></span>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Apply Overrides ({bulkTargetHostnames.length})
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
