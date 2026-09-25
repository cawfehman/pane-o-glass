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
    LayoutGrid,
    Star,
    Check,
    Settings2,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Radio,
    Sparkles,
    Clock,
    AlertTriangle,
    ArrowRight
} from "lucide-react";
import { CrawlIcon } from "./CrawlIcon";
import { getSiteClassification } from "@/lib/sites";

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
    locationType?: string;
    city?: string;
    folderPath?: string;
    isHub?: boolean;
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
    locateSiteCode?: string | null;
    snapshotId?: string;
    onEditSite?: (siteCode: string) => void;
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
    if (!clean) {
        return { floorNum: 1, floorLabel: "Ground / MDF" };
    }
    if (clean === "MDF" || clean === "DC" || clean === "SERVER" || clean === "CORE") {
        return { floorNum: 1, floorLabel: "Ground / MDF" };
    }
    // Basement closets: starts with B (e.g. BNC, BTC, BSMT, B1, B01, B2), LL, or SUB
    if (/^(?:B|LL|SUB)/i.test(clean)) {
        const m = clean.match(/^(?:B|LL|SUB)[-_]?(\d+)/i);
        const n = m ? parseInt(m[1], 10) : 1;
        const num = n === 0 ? 1 : n;
        return { floorNum: -num, floorLabel: num === 1 ? "Basement" : `Basement L${num}` };
    }
    // Prefixes like IDF1, ID1, FL1, FLOOR2, IDF-101
    const prefixMatch = clean.match(/^(?:IDF|ID|FL|FLOOR)[-_]?(\d+)/i);
    if (prefixMatch) {
        const val = prefixMatch[1];
        const num = val.length >= 4 
            ? parseInt(val.slice(0, 2), 10) 
            : (val.length === 3 ? parseInt(val.charAt(0), 10) : parseInt(val, 10));
        return { floorNum: num, floorLabel: num === 0 ? "Ground / MDF" : `Floor ${num}` };
    }
    // Numbered rooms/closets starting with digit, e.g. 101, 102, 201, 1A, 2B, 2MC
    const digitMatch = clean.match(/^(\d+)/);
    if (digitMatch) {
        const val = digitMatch[1];
        const num = val.length >= 4 
            ? parseInt(val.slice(0, 2), 10) 
            : (val.length === 3 ? parseInt(val.charAt(0), 10) : parseInt(val, 10));
        return { floorNum: num, floorLabel: num === 0 ? "Ground / MDF" : `Floor ${num}` };
    }
    // Any other number inside, e.g. "C101" or "MC-2" or "WEST-1"
    const anyDigitMatch = clean.match(/(\d+)/);
    if (anyDigitMatch) {
        const val = anyDigitMatch[1];
        const num = val.length >= 4 
            ? parseInt(val.slice(0, 2), 10) 
            : (val.length === 3 ? parseInt(val.charAt(0), 10) : parseInt(val, 10));
        return { floorNum: num, floorLabel: num === 0 ? "Ground / MDF" : `Floor ${num}` };
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

export function getCleanSiteDisplayName(code?: string | null, rawName?: string | null): string | null {
    if (!rawName) return null;
    const upperCode = (code || "").toUpperCase().trim();
    let clean = rawName.trim();
    if (/^site:?\s+/i.test(clean)) {
        clean = clean.replace(/^site:?\s+/i, "").trim();
    }
    if (!clean || clean.toUpperCase() === upperCode) {
        return null;
    }
    return clean;
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

export type DeviceArchetype = "ROUTER" | "L3_CORE" | "L2_ACCESS" | "WLC" | "FIREWALL" | "VENDOR";

export interface ArchetypeDetails {
    archetype: DeviceArchetype;
    label: string;
    shape: "cylinder" | "chamfer" | "chassis" | "controller" | "shield";
    primaryColor: string;
    accentColor: string;
    glowColor: string;
    bgGradient: string;
}

export function getDeviceArchetype(dev: any): ArchetypeDetails {
    if (dev.isVendorManaged) {
        return {
            archetype: "VENDOR",
            label: "VND",
            shape: "chassis",
            primaryColor: "#a855f7",
            accentColor: "#d8b4fe",
            glowColor: "rgba(168, 85, 247, 0.4)",
            bgGradient: "rgba(28, 14, 46, 0.95)"
        };
    }

    const host = (dev.canonicalHostname || dev.hostname || "").toUpperCase();
    const role = (dev.role || "").toLowerCase();
    const platform = (dev.platform || "").toUpperCase();

    // 1. WLC (Wireless LAN Controller)
    if (
        role.includes("wlc") ||
        role.includes("wireless") ||
        host.includes("WLC") ||
        host.includes("AIR-") ||
        platform.includes("9800") ||
        platform.includes("5520") ||
        platform.includes("3504") ||
        platform.includes("2504") ||
        platform.includes("WIRELESS")
    ) {
        return {
            archetype: "WLC",
            label: "WLC",
            shape: "controller",
            primaryColor: "#c084fc",
            accentColor: "#f472b6",
            glowColor: "rgba(192, 132, 252, 0.4)",
            bgGradient: "rgba(35, 14, 45, 0.95)"
        };
    }

    // 2. Firewall / Security Appliance
    if (
        role.includes("firewall") ||
        role.includes("fw") ||
        role.includes("security") ||
        host.startsWith("FW-") ||
        host.includes("-FW") ||
        platform.includes("ASA") ||
        platform.includes("FIREPOWER") ||
        platform.includes("PALO") ||
        platform.includes("FORTI")
    ) {
        return {
            archetype: "FIREWALL",
            label: "FW",
            shape: "shield",
            primaryColor: "#f43f5e",
            accentColor: "#fb7185",
            glowColor: "rgba(244, 63, 94, 0.4)",
            bgGradient: "rgba(45, 12, 20, 0.95)"
        };
    }

    // 3. Router (WAN Gateway / Core Router)
    const routes = Array.isArray(dev.routes) ? dev.routes : [];
    if (
        role.includes("router") ||
        role === "rtr" ||
        host.startsWith("RTR") ||
        host.includes("-RT-") ||
        host.includes("-RT1") ||
        host.includes("-RT2") ||
        host.includes("WAN-") ||
        platform.includes("ISR") ||
        platform.includes("ASR") ||
        platform.includes("CSR") ||
        platform.includes("C8000") ||
        platform.includes("ROUTER")
    ) {
        return {
            archetype: "ROUTER",
            label: "RTR",
            shape: "cylinder",
            primaryColor: "#38bdf8",
            accentColor: "#60a5fa",
            glowColor: "rgba(56, 189, 248, 0.4)",
            bgGradient: "rgba(10, 28, 54, 0.95)"
        };
    }

    // 4. L3 Core / Distribution Multilayer Switch
    if (
        role.includes("core") ||
        role.includes("dist") ||
        role.includes("l3") ||
        routes.length > 2 ||
        platform.includes("9500") ||
        platform.includes("9600") ||
        platform.includes("NEXUS") ||
        platform.includes("6500")
    ) {
        return {
            archetype: "L3_CORE",
            label: "L3",
            shape: "chamfer",
            primaryColor: "#06b6d4",
            accentColor: "#22d3ee",
            glowColor: "rgba(6, 182, 212, 0.4)",
            bgGradient: "rgba(8, 36, 52, 0.95)"
        };
    }

    // 5. L2 Access Switch / Edge Switch
    return {
        archetype: "L2_ACCESS",
        label: "L2",
        shape: "chassis",
        primaryColor: "#10b981",
        accentColor: "#34d399",
        glowColor: "rgba(16, 185, 129, 0.4)",
        bgGradient: "rgba(6, 40, 30, 0.95)"
    };
}

/** Renders the iconic Cisco standard router 4-way arrow emblem */
function RouterGlyph({ x, y, size = 18, color = "#38bdf8" }: { x: number; y: number; size?: number; color?: string }) {
    const r = size / 2;
    return (
        <g transform={`translate(${x}, ${y})`}>
            <circle cx={0} cy={0} r={r} fill="rgba(56, 189, 248, 0.18)" stroke={color} strokeWidth={1.2} />
            {/* Vertical arrows */}
            <path d={`M 0 ${-r + 3} L 0 ${r - 3}`} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d={`M -2 ${-r + 5.5} L 0 ${-r + 3} L 2 ${-r + 5.5}`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            <path d={`M -2 ${r - 5.5} L 0 ${r - 3} L 2 ${r - 5.5}`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            {/* Horizontal arrows */}
            <path d={`M ${-r + 3} 0 L ${r - 3} 0`} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d={`M ${-1.5} -2 L 0 0 L -1.5 2`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            <path d={`M 1.5 -2 L 0 0 L 1.5 2`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
        </g>
    );
}

/** Renders the iconic Cisco multilayer / L3 switch cross-arrows emblem */
function MultilayerGlyph({ x, y, size = 18, color = "#06b6d4" }: { x: number; y: number; size?: number; color?: string }) {
    const half = size / 2;
    return (
        <g transform={`translate(${x}, ${y})`}>
            <rect x={-half} y={-half} width={size} height={size} rx={3} fill="rgba(6, 182, 212, 0.18)" stroke={color} strokeWidth={1.2} />
            <path d={`M ${-half + 3.5} ${-half + 3.5} L ${half - 3.5} ${half - 3.5}`} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d={`M ${half - 3.5} ${-half + 3.5} L ${-half + 3.5} ${half - 3.5}`} stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d={`M ${half - 6} ${half - 3.5} L ${half - 3.5} ${half - 3.5} L ${half - 3.5} ${half - 6}`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
            <path d={`M ${-half + 6} ${-half + 3.5} L ${-half + 3.5} ${-half + 3.5} L ${-half + 3.5} ${-half + 6}`} fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
        </g>
    );
}

/** Renders the Wireless Controller (WLC) antenna waves emblem */
function WlcGlyph({ x, y, size = 18, color = "#c084fc" }: { x: number; y: number; size?: number; color?: string }) {
    return (
        <g transform={`translate(${x}, ${y})`}>
            <circle cx={0} cy={1} r={2} fill={color} />
            <path d="M 0 1 L 0 5 M -3 5 L 3 5" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d="M -4 -2 A 4 4 0 0 0 -4 4" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d="M -7 -4 A 7 7 0 0 0 -7 6" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.7} />
            <path d="M 4 -2 A 4 4 0 0 1 4 4" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
            <path d="M 7 -4 A 7 7 0 0 1 7 6" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round" opacity={0.7} />
        </g>
    );
}

/** Renders Firewall security shield emblem */
function FirewallGlyph({ x, y, size = 18, color = "#f43f5e" }: { x: number; y: number; size?: number; color?: string }) {
    const half = size / 2;
    return (
        <g transform={`translate(${x}, ${y})`}>
            <path d={`M 0 ${-half + 1} L ${half - 1} ${-half + 3} L ${half - 1} 1 C ${half - 1} 5.5, 0 ${half}, 0 ${half} C 0 ${half}, ${-half + 1} 5.5, ${-half + 1} 1 L ${-half + 1} ${-half + 3} Z`} fill="rgba(244, 63, 94, 0.18)" stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
            <path d="M 0 -3.5 L 0 3.5 M -2.5 0 L 2.5 0" stroke={color} strokeWidth={1.1} strokeLinecap="round" />
        </g>
    );
}

/** Renders Access Switch port faceplate emblem */
function SwitchGlyph({ x, y, size = 18, color = "#10b981" }: { x: number; y: number; size?: number; color?: string }) {
    const half = size / 2;
    return (
        <g transform={`translate(${x}, ${y})`}>
            <rect x={-half} y={-half + 3} width={size} height={size - 6} rx={2} fill="rgba(16, 185, 129, 0.18)" stroke={color} strokeWidth={1.2} />
            <rect x={-half + 2.5} y={-half + 5.5} width={3} height={3} rx={0.5} fill={color} />
            <rect x={-half + 6.8} y={-half + 5.5} width={3} height={3} rx={0.5} fill={color} />
            <rect x={-half + 11.2} y={-half + 5.5} width={3} height={3} rx={0.5} fill={color} />
        </g>
    );
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
    isDesignatedHub?: boolean;
    satellites?: string[];
    parentHub?: string;
    isPendingCrawl?: boolean;
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
    protocol?: string;
    capacityLabel?: string;
    isHubHighway?: boolean;
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
    locateSiteCode,
    snapshotId,
    onEditSite,
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
    const [nodeDensity, setNodeDensity] = useState<"standard" | "compact">("standard"); // Standard Detailed Cards vs Compact Shapes

    // Free-flowing draggable nodes & Saved Views
    const [siteOffsets, setSiteOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
    const [activeLayoutView, setActiveLayoutView] = useState<string>("auto");
    const [savedViews, setSavedViews] = useState<any[]>([]);
    const [isSaveViewModalOpen, setIsSaveViewModalOpen] = useState(false);
    const [newViewName, setNewViewName] = useState("");
    const [newViewDescription, setNewViewDescription] = useState("");
    const [savingView, setSavingView] = useState(false);
    const draggingSiteRef = useRef<{ siteCode: string; startX: number; startY: number; initialDx: number; initialDy: number } | null>(null);

    // Grouped Dropdown Menus for toolbar
    const [activeDropdown, setActiveDropdown] = useState<"layout" | "display" | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setActiveDropdown(null);
            }
        };
        if (activeDropdown) {
            document.addEventListener("mousedown", handleOutsideClick);
            return () => document.removeEventListener("mousedown", handleOutsideClick);
        }
    }, [activeDropdown]);

    // Load personal layout from localStorage on mount / snapshot change
    useEffect(() => {
        if (typeof window !== "undefined") {
            try {
                const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
                const saved = localStorage.getItem(key);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
                        setSiteOffsets(parsed);
                        setActiveLayoutView("personal");
                    }
                }
            } catch {}
        }
    }, [snapshotId]);

    // Fetch shared saved views from API
    const fetchSavedViews = async () => {
        try {
            const res = await fetch(`/api/crawler/views?snapshotId=${snapshotId || "master"}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data && Array.isArray(data.views)) {
                setSavedViews(data.views);
            }
        } catch (e) {
            console.error("Failed to load saved views:", e);
        }
    };

    useEffect(() => {
        fetchSavedViews();
    }, [snapshotId]);

    const handleSaveView = async () => {
        if (!newViewName.trim()) return;
        setSavingView(true);
        try {
            const res = await fetch("/api/crawler/views", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newViewName.trim(),
                    description: newViewDescription.trim(),
                    snapshotId: snapshotId || "master",
                    layoutData: siteOffsets
                })
            });
            const data = await res.json();
            if (data.view) {
                await fetchSavedViews();
                setActiveLayoutView(data.view.id);
                setIsSaveViewModalOpen(false);
                setNewViewName("");
                setNewViewDescription("");
            }
        } catch (e) {
            console.error("Failed to save view:", e);
        } finally {
            setSavingView(false);
        }
    };

    const handleResetLayout = () => {
        setSiteOffsets({});
        setActiveLayoutView("auto");
        try {
            const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
            localStorage.removeItem(key);
        } catch {}
    };

    const handleSelectView = (viewId: string) => {
        if (viewId === "auto") {
            setSiteOffsets({});
            setActiveLayoutView("auto");
        } else if (viewId === "personal") {
            try {
                const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
                const saved = localStorage.getItem(key);
                if (saved) {
                    setSiteOffsets(JSON.parse(saved));
                }
            } catch {}
            setActiveLayoutView("personal");
        } else {
            const found = savedViews.find(v => v.id === viewId);
            if (found && found.layoutData) {
                setSiteOffsets(found.layoutData);
                setActiveLayoutView(viewId);
            }
        }
    };

    const handleStartDragSite = (e: React.PointerEvent, siteCode: string) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest("button, select, input, a")) return;
        e.stopPropagation();
        const current = siteOffsets[siteCode] || { dx: 0, dy: 0 };
        draggingSiteRef.current = {
            siteCode,
            startX: e.clientX,
            startY: e.clientY,
            initialDx: current.dx,
            initialDy: current.dy
        };
        hasDraggedRef.current = false;
    };

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (showAllLinks) count++;
        if (!convergeTrunks) count++;
        if (showVendorManaged) count++;
        if (showUncrawledSites) count++;
        if (nodeDensity === "compact") count++;
        if (clickMode === "fade") count++;
        return count;
    }, [showAllLinks, convergeTrunks, showVendorManaged, showUncrawledSites, nodeDensity, clickMode]);

    // Global Spotlight Search & Endpoint Locator State
    const [isSpotlightOpen, setIsSpotlightOpen] = useState(false);
    const [spotlightQuery, setSpotlightQuery] = useState("");
    const [spotlightLocateResult, setSpotlightLocateResult] = useState<any>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [spotlightBeaconDevice, setSpotlightBeaconDevice] = useState<string | null>(null);

    // Visual Path Trace & Step-Through Player State
    const [isPathTraceOpen, setIsPathTraceOpen] = useState(false);
    const [traceSource, setTraceSource] = useState("");
    const [traceDest, setTraceDest] = useState("");
    const [isTracing, setIsTracing] = useState(false);
    const [traceResult, setTraceResult] = useState<any>(null);
    const [activeTraceHopIndex, setActiveTraceHopIndex] = useState<number>(0);
    const [isAutoPlayingTrace, setIsAutoPlayingTrace] = useState(false);
    const [traceError, setTraceError] = useState<string | null>(null);

    // Enterprise Hub & Drill-Down State (KEL is the core central hub)
    const DEFAULT_HUBS = useMemo(() => ["KEL", "CRM", "WDC", "RDG", "VMM"], []);
    const [designatedHubs, setDesignatedHubs] = useState<Set<string>>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem("pane_topology_designated_hubs");
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return new Set([...DEFAULT_HUBS, ...parsed]);
                    }
                }
            } catch {}
        }
        return new Set(["KEL", "CRM", "WDC", "RDG", "VMM"]);
    });

    const [activeDrillHub, setActiveDrillHub] = useState<string | null>(null);

    const toggleDesignatedHub = (siteCode: string) => {
        setDesignatedHubs(prev => {
            const next = new Set(prev);
            if (next.has(siteCode)) {
                next.delete(siteCode);
            } else {
                next.add(siteCode);
            }
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem("pane_topology_designated_hubs", JSON.stringify(Array.from(next)));
                } catch {}
            }
            return next;
        });
    };

    const handleFocusHub = (hubCode: string) => {
        setActiveDrillHub(hubCode);
        setCollapsedSites(prev => {
            const next = new Set(prev);
            next.delete(hubCode); // Expand the focused hub!
            return next;
        });
        // Default multi-IDF hub to collapsed IDFs for progressive drill-down
        const hubIdfs = new Set<string>();
        for (const d of filteredDevices) {
            const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            if (site === hubCode && idf) hubIdfs.add(idf);
        }
        if (hubIdfs.size > 1) {
            setCollapsedIdfs(cPrev => {
                const cNext = new Set(cPrev);
                for (const idf of hubIdfs) {
                    cNext.add(`${hubCode}::${idf}`);
                }
                return cNext;
            });
        }
        setPan({ x: 0, y: 0 });
        setZoom(1);
    };

    const handleResetOverview = () => {
        setActiveDrillHub(null);
        setCollapsedSites(new Set(uniqueSites));
        setPan({ x: 0, y: 0 });
        setZoom(1);
    };

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
            setActiveDrillHub(null);
            // Default all multi-IDF sites to collapsed IDFs for progressive drill-down
            const siteIdfMap = new Map<string, Set<string>>();
            for (const d of filteredDevices) {
                const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
                if (site && idf) {
                    if (!siteIdfMap.has(site)) siteIdfMap.set(site, new Set());
                    siteIdfMap.get(site)!.add(idf);
                }
            }
            const multiKeys = new Set<string>();
            for (const [sCode, idfs] of siteIdfMap.entries()) {
                if (idfs.size > 1) {
                    for (const idf of idfs) {
                        multiKeys.add(`${sCode}::${idf}`);
                    }
                }
            }
            setCollapsedIdfs(multiKeys);
            setHasInitializedSiteMap(true);
        }
    }, [uniqueSites, hasInitializedSiteMap, filteredDevices]);

    // If user selects a specific site from the dropdown, automatically expand that site and set active drill hub
    useEffect(() => {
        if (siteFilter !== "ALL") {
            setCollapsedSites(prev => {
                const next = new Set(prev);
                next.delete(siteFilter);
                return next;
            });
            // Default multi-IDF site to collapsed IDFs
            const siteIdfs = new Set<string>();
            for (const d of filteredDevices) {
                const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
                if (site === siteFilter && idf) siteIdfs.add(idf);
            }
            if (siteIdfs.size > 1) {
                setCollapsedIdfs(cPrev => {
                    const cNext = new Set(cPrev);
                    for (const idf of siteIdfs) {
                        cNext.add(`${siteFilter}::${idf}`);
                    }
                    return cNext;
                });
            }
            if (designatedHubs.has(siteFilter)) {
                setActiveDrillHub(siteFilter);
            } else if (siteFilter === "PAV" || siteFilter === "DOR") {
                setActiveDrillHub("KEL");
            }
        }
    }, [siteFilter, designatedHubs, filteredDevices]);

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
            if (site) {
                if (collapsedSites.has(site)) {
                    setCollapsedSites(prev => {
                        const next = new Set(prev);
                        next.delete(site);
                        return next;
                    });
                }
                if (designatedHubs.has(site)) {
                    setActiveDrillHub(site);
                } else if (site === "PAV" || site === "DOR") {
                    setActiveDrillHub("KEL");
                }
            }
            onSelectDevice(dev);
        }

        setSpotlightBeaconDevice(canon);
        setTimeout(() => {
            setSpotlightBeaconDevice(prev => prev === canon ? null : prev);
        }, 5000);

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

    // Global keyboard shortcuts (Ctrl+K or / for Spotlight Search)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setIsSpotlightOpen(prev => !prev);
                return;
            }
            if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)) {
                e.preventDefault();
                setIsSpotlightOpen(true);
                return;
            }
            if (e.key === "Escape") {
                if (isSpotlightOpen) setIsSpotlightOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isSpotlightOpen]);

    // Path Trace Auto-Play Timer
    useEffect(() => {
        if (!isAutoPlayingTrace || !traceResult || !traceResult.hops || traceResult.hops.length <= 1) return;
        const timer = setInterval(() => {
            setActiveTraceHopIndex(prev => {
                if (prev >= traceResult.hops.length - 1) {
                    setIsAutoPlayingTrace(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 2200);
        return () => clearInterval(timer);
    }, [isAutoPlayingTrace, traceResult]);

    // Automatically pan to active hop switch
    useEffect(() => {
        if (!traceResult || !traceResult.hops || traceResult.hops.length === 0) return;
        const currentHop = traceResult.hops[activeTraceHopIndex];
        if (currentHop && currentHop.deviceName) {
            panToSwitch(currentHop.deviceName);
        }
    }, [activeTraceHopIndex, traceResult]);

    // Active path set for canvas highlighting
    const activePathDeviceSet = useMemo(() => {
        if (!traceResult || !traceResult.hops) return new Set<string>();
        const set = new Set<string>();
        for (const h of traceResult.hops) {
            if (h.deviceName) {
                set.add(getCanonicalHostname(h.deviceName));
            }
        }
        return set;
    }, [traceResult]);

    const activeTraceHopDevice = useMemo(() => {
        if (!traceResult || !traceResult.hops || traceResult.hops.length === 0) return null;
        const h = traceResult.hops[activeTraceHopIndex];
        return h?.deviceName ? getCanonicalHostname(h.deviceName) : null;
    }, [traceResult, activeTraceHopIndex]);

    const handleLocateEndpoint = async (queryToLocate?: string) => {
        const q = (queryToLocate || spotlightQuery).trim();
        if (!q) return;
        setIsLocating(true);
        setSpotlightLocateResult(null);
        try {
            const res = await fetch("/api/crawler/locate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: q,
                    snapshotId: snapshotNumber ? String(snapshotNumber) : "master"
                })
            });
            const data = await res.json();
            if (res.ok && !data.error) {
                setSpotlightLocateResult(data);
                if (data.focalDevice?.hostname) {
                    panToSwitch(data.focalDevice.hostname);
                }
            } else {
                setSpotlightLocateResult({ type: "ERROR", message: data.error || "No match found" });
            }
        } catch (err: any) {
            setSpotlightLocateResult({ type: "ERROR", message: err.message || "Search failed" });
        } finally {
            setIsLocating(false);
        }
    };

    const handleRunPathTrace = async () => {
        if (!traceSource.trim() || !traceDest.trim()) {
            setTraceError("Please enter both Source and Destination IPs or Switch names.");
            return;
        }
        setIsTracing(true);
        setTraceError(null);
        try {
            let srcIp = traceSource.trim();
            let dstIp = traceDest.trim();

            const devSrc = unifiedDevices.find(d => 
                (d.canonicalHostname || d.hostname).toLowerCase() === srcIp.toLowerCase() ||
                d.ipAddress === srcIp
            );
            if (devSrc) srcIp = devSrc.ipAddress;

            const devDst = unifiedDevices.find(d => 
                (d.canonicalHostname || d.hostname).toLowerCase() === dstIp.toLowerCase() ||
                d.ipAddress === dstIp
            );
            if (devDst) dstIp = devDst.ipAddress;

            const res = await fetch("/api/crawler/trace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sourceIp: srcIp,
                    destIp: dstIp,
                    snapshotId: snapshotNumber ? String(snapshotNumber) : "master"
                })
            });

            const data = await res.json();
            if (!res.ok || data.error) {
                setTraceError(data.error || "Failed to trace path between endpoints.");
            } else {
                setTraceResult(data);
                setActiveTraceHopIndex(0);
                if (data.hops && data.hops.length > 0) {
                    panToSwitch(data.hops[0].deviceName);
                }
            }
        } catch (err: any) {
            setTraceError(err.message || "Failed to run path trace");
        } finally {
            setIsTracing(false);
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
            const willExpand = next.has(siteCode);
            if (willExpand) {
                next.delete(siteCode);
                // When opening any site that has > 1 IDF, ensure its IDFs default to collapsed
                const siteIdfs = new Set<string>();
                for (const d of filteredDevices) {
                    const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
                    if (site === siteCode && idf) siteIdfs.add(idf);
                }
                if (siteIdfs.size > 1) {
                    setCollapsedIdfs(cPrev => {
                        const cNext = new Set(cPrev);
                        for (const idf of siteIdfs) {
                            cNext.add(`${siteCode}::${idf}`);
                        }
                        return cNext;
                    });
                }
            } else {
                next.add(siteCode);
            }
            return next;
        });
    };

    const collapseAllSites = () => {
        setCollapsedSites(new Set(uniqueSites));
    };

    const expandAllSites = () => {
        setCollapsedSites(new Set());
        // Default all multi-IDF sites to collapsed IDFs for progressive drill-down
        const siteIdfMap = new Map<string, Set<string>>();
        for (const d of filteredDevices) {
            const { site, idf } = parseDeviceSiteAndIdf(d.hostname, d.site, d.idf);
            if (site && idf) {
                if (!siteIdfMap.has(site)) siteIdfMap.set(site, new Set());
                siteIdfMap.get(site)!.add(idf);
            }
        }
        setCollapsedIdfs(prev => {
            const next = new Set(prev);
            for (const [sCode, idfs] of siteIdfMap.entries()) {
                if (idfs.size > 1) {
                    for (const idf of idfs) {
                        next.add(`${sCode}::${idf}`);
                    }
                }
            }
            return next;
        });
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

        const CARD_WIDTH = nodeDensity === "compact" ? 138 : 172;
        const CARD_HEIGHT = nodeDensity === "compact" ? 50 : 74;
        const CARD_GAP_X = nodeDensity === "compact" ? Math.max(spacingConfig.cardGapX - 14, 18) : spacingConfig.cardGapX;
        const CARD_GAP_Y = nodeDensity === "compact" ? Math.max(spacingConfig.cardGapY - 14, 22) : spacingConfig.cardGapY;
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
            const siteLookup = siteDirectory?.[siteCode] || siteDirectory?.[siteCode.toUpperCase()];
            const siteName = getCleanSiteDisplayName(siteCode, siteLookup?.name);
            // In topological mode: Overview mode (activeDrillHub === null) keeps all sites collapsed.
            // Drill-down mode expands activeDrillHub and allows satellites to be toggled, keeping peer hubs collapsed.
            const isCollapsed = siteClusterMode === "topological"
                ? (activeDrillHub ? (siteCode !== activeDrillHub && collapsedSites.has(siteCode)) : true)
                : collapsedSites.has(siteCode);

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
                // Group IDFs by floorNum so IDFs on the same floor sit side-by-side
                const floorMap = new Map<number, {
                    floorNum: number;
                    floorLabel: string;
                    idfs: Array<{
                        idfCode: string;
                        floorNum: number;
                        floorLabel: string;
                        devs: any[];
                        isCollapsed: boolean;
                        cols: number;
                        rows: number;
                        naturalWidth: number;
                        height: number;
                    }>;
                }>();

                for (const [idfCode, devs] of idfMap.entries()) {
                    const { floorNum, floorLabel } = parseFloorFromIdf(idfCode);
                    const isIdfCollapsed = collapsedIdfs.has(`${siteCode}::${idfCode}`);

                    devs.sort((a, b) => {
                        const lA = getDeviceLayer(a).layer;
                        const lB = getDeviceLayer(b).layer;
                        if (lA === "L3" && lB === "L2") return -1;
                        if (lA === "L2" && lB === "L3") return 1;
                        return a.hostname.localeCompare(b.hostname);
                    });

                    let idfNaturalWidth: number;
                    let idfHeight: number;
                    let cols = 1;
                    let rows = 1;

                    if (isIdfCollapsed) {
                        idfNaturalWidth = 140;
                        idfHeight = 38;
                    } else {
                        cols = devs.length > 4 ? 3 : (devs.length > 1 ? 2 : 1);
                        rows = Math.ceil(devs.length / cols);
                        idfNaturalWidth = Math.max(cols * CARD_WIDTH + (cols - 1) * CARD_GAP_X + IDF_PAD_X * 2, 220);
                        idfHeight = rows * CARD_HEIGHT + (rows - 1) * CARD_GAP_Y + IDF_PAD_TOP + IDF_PAD_BOTTOM;
                    }

                    if (!floorMap.has(floorNum)) {
                        floorMap.set(floorNum, { floorNum, floorLabel, idfs: [] });
                    }
                    floorMap.get(floorNum)!.idfs.push({
                        idfCode,
                        floorNum,
                        floorLabel,
                        devs,
                        isCollapsed: isIdfCollapsed,
                        cols,
                        rows,
                        naturalWidth: idfNaturalWidth,
                        height: idfHeight
                    });
                }

                const IDF_GAP_X = 16;
                const sortedFloorGroups = Array.from(floorMap.values())
                    .map(fg => {
                        fg.idfs.sort((a, b) => {
                            if (a.idfCode === "MDF") return -1;
                            if (b.idfCode === "MDF") return 1;
                            return a.idfCode.localeCompare(b.idfCode);
                        });
                        const floorNaturalWidth = fg.idfs.reduce((sum, item) => sum + item.naturalWidth, 0) + (fg.idfs.length - 1) * IDF_GAP_X;
                        const floorHeight = Math.max(...fg.idfs.map(item => item.height), 38);
                        return {
                            ...fg,
                            floorNaturalWidth,
                            floorHeight
                        };
                    })
                    .sort((a, b) => {
                        if (b.floorNum !== a.floorNum) return b.floorNum - a.floorNum;
                        return a.floorLabel.localeCompare(b.floorLabel);
                    });

                const maxFloorNaturalWidth = Math.max(...sortedFloorGroups.map(f => f.floorNaturalWidth), 360);
                const siteWidth = Math.max(maxFloorNaturalWidth + SITE_PAD_X * 2, 380);
                const floorSlabWidth = siteWidth - SITE_PAD_X * 2;

                const FLOOR_GAP = 18;
                let currentFloorRelY = SITE_PAD_TOP;
                const siteIdfBoxes: any[] = [];
                const devOffsets: any[] = [];

                for (const fg of sortedFloorGroups) {
                    const totalGaps = (fg.idfs.length - 1) * IDF_GAP_X;
                    const availableWidth = floorSlabWidth - totalGaps;
                    const totalNatural = fg.idfs.reduce((sum, item) => sum + item.naturalWidth, 0);

                    let currentIdfRelX = SITE_PAD_X;

                    fg.idfs.forEach((item, idx) => {
                        const allocatedWidth = totalNatural > 0
                            ? Math.floor((item.naturalWidth / totalNatural) * availableWidth)
                            : Math.floor(availableWidth / fg.idfs.length);
                        const actualWidth = idx === fg.idfs.length - 1
                            ? (SITE_PAD_X + floorSlabWidth - currentIdfRelX)
                            : allocatedWidth;

                        const idfBox = {
                            siteCode,
                            idfCode: item.idfCode,
                            floorNum: fg.floorNum,
                            floorLabel: item.floorLabel,
                            relX: currentIdfRelX,
                            relY: currentFloorRelY,
                            width: actualWidth,
                            height: item.isCollapsed ? 38 : fg.floorHeight,
                            deviceCount: item.devs.length,
                            isCollapsed: item.isCollapsed
                        };
                        siteIdfBoxes.push(idfBox);

                        if (item.isCollapsed) {
                            const centerX = idfBox.relX + idfBox.width / 2;
                            const centerY = idfBox.relY + idfBox.height / 2;
                            for (const dev of item.devs) {
                                devOffsets.push({
                                    dev,
                                    nodeKey: dev._instanceNodeKey || dev.canonicalHostname || dev.hostname,
                                    relX: centerX,
                                    relY: centerY
                                });
                            }
                        } else {
                            item.devs.forEach((dev, dIdx) => {
                                const col = dIdx % item.cols;
                                const row = Math.floor(dIdx / item.cols);
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

                        currentIdfRelX += actualWidth + IDF_GAP_X;
                    });

                    currentFloorRelY += fg.floorHeight + FLOOR_GAP;
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
            // Hub-Centric Drill-Down & Constellation Placement Engine
            // KEL is the most central primary core location of the enterprise backbone.
            // 5 Main Hubs: KEL (core center), CRM (North-West), WDC (North-East), RDG (South-East), VMM (West).
            // Satellites: PAV and DOR are major sub-hubs/facilities within KEL.

            const hubSatellitesMap = new Map<string, string[]>();
            for (const hub of designatedHubs) {
                hubSatellitesMap.set(hub, []);
            }

            const parentHubOfSite = new Map<string, string>();
            for (const sCode of siteTemplates.keys()) {
                if (designatedHubs.has(sCode)) continue;

                // Identify parent hub:
                // User requirement: PAV and DOR should be big hubs within KEL
                let pHub: string | null = null;
                if ((sCode === "PAV" || sCode === "DOR") && designatedHubs.has("KEL")) {
                    pHub = "KEL";
                }
                if (!pHub) {
                    const neighbors = interSiteAdj.get(sCode);
                    if (neighbors) {
                        for (const n of neighbors) {
                            if (designatedHubs.has(n)) {
                                pHub = n;
                                break;
                            }
                        }
                    }
                }
                if (pHub) {
                    parentHubOfSite.set(sCode, pHub);
                    if (!hubSatellitesMap.has(pHub)) hubSatellitesMap.set(pHub, []);
                    hubSatellitesMap.get(pHub)!.push(sCode);
                }
            }

            if (!activeDrillHub) {
                // =========================================================================
                // MODE A: ENTERPRISE BACKBONE OVERVIEW
                // Zero sprawl: Only designated HUBs are placed in a high-level constellation,
                // centered strictly around KEL. Fits immediately on screen (~1250x700px).
                // =========================================================================
                const PRESET_HUB_POSITIONS: Record<string, { x: number; y: number }> = {
                    KEL: { x: 480, y: 220 },
                    CRM: { x: 100, y: 80 },
                    WDC: { x: 860, y: 80 },
                    RDG: { x: 860, y: 360 },
                    VMM: { x: 100, y: 360 }
                };

                const placedHubCodes = new Set<string>();
                const extraHubs: string[] = [];

                for (const hCode of designatedHubs) {
                    if (PRESET_HUB_POSITIONS[hCode]) {
                        placedHubCodes.add(hCode);
                    } else {
                        extraHubs.push(hCode);
                    }
                }

                // Place standard hubs (KEL, CRM, WDC, RDG, VMM)
                for (const hCode of placedHubCodes) {
                    const sT = siteTemplates.get(hCode);
                    const pos = PRESET_HUB_POSITIONS[hCode];
                    const sats = hubSatellitesMap.get(hCode) || [];

                    const devCount = sT ? sT.totalDevsInSite : 0;
                    const l3Count = sT ? sT.l3Count : 0;
                    const l2Count = sT ? sT.l2Count : 0;
                    const siteName = getCleanSiteDisplayName(hCode, siteDirectory?.[hCode]?.name || siteDirectory?.[hCode.toUpperCase()]?.name || sT?.siteName);

                    siteContainers.push({
                        siteCode: hCode,
                        siteName,
                        x: pos.x,
                        y: pos.y,
                        width: 280,
                        height: 54,
                        deviceCount: devCount,
                        l3Count,
                        l2Count,
                        isCollapsed: true,
                        idfs: [],
                        connectedSites: Array.from(interSiteAdj.get(hCode) || []),
                        clusterId: `hub-${hCode}`,
                        isClusterHub: true,
                        isDesignatedHub: true,
                        satellites: sats,
                        isPendingCrawl: devCount === 0
                    });

                    if (sT) {
                        for (const d of sT.devOffsets) {
                            const nX = pos.x + d.relX;
                            const nY = pos.y + d.relY;
                            positions.set(d.nodeKey, { x: nX, y: nY });
                            if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                                positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                            }
                            layoutDevs.push(d.dev);
                        }
                    }
                }

                // Place any extra custom hubs radially around KEL
                const kelPos = PRESET_HUB_POSITIONS.KEL || { x: 480, y: 220 };
                extraHubs.forEach((hCode, idx) => {
                    const sT = siteTemplates.get(hCode);
                    const angle = ((idx + 0.5) / Math.max(extraHubs.length, 1)) * 2 * Math.PI;
                    const radX = 420;
                    const radY = 280;
                    const posX = Math.max(kelPos.x + Math.cos(angle) * radX, 40);
                    const posY = Math.max(kelPos.y + Math.sin(angle) * radY, 60);
                    const sats = hubSatellitesMap.get(hCode) || [];

                    const devCount = sT ? sT.totalDevsInSite : 0;
                    const l3Count = sT ? sT.l3Count : 0;
                    const l2Count = sT ? sT.l2Count : 0;
                    const siteName = getCleanSiteDisplayName(hCode, siteDirectory?.[hCode]?.name || siteDirectory?.[hCode.toUpperCase()]?.name || sT?.siteName);

                    siteContainers.push({
                        siteCode: hCode,
                        siteName,
                        x: posX,
                        y: posY,
                        width: 280,
                        height: 54,
                        deviceCount: devCount,
                        l3Count,
                        l2Count,
                        isCollapsed: true,
                        idfs: [],
                        connectedSites: Array.from(interSiteAdj.get(hCode) || []),
                        clusterId: `hub-${hCode}`,
                        isClusterHub: true,
                        isDesignatedHub: true,
                        satellites: sats,
                        isPendingCrawl: devCount === 0
                    });

                    if (sT) {
                        for (const d of sT.devOffsets) {
                            const nX = posX + d.relX;
                            const nY = posY + d.relY;
                            positions.set(d.nodeKey, { x: nX, y: nY });
                            if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                                positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                            }
                            layoutDevs.push(d.dev);
                        }
                    }
                });

                // Populate coordinates for non-hub & satellite devices so device search/filtering functions
                const kelContainer = siteContainers.find(c => c.siteCode === "KEL") || siteContainers[0];
                const defaultX = kelContainer ? kelContainer.x + kelContainer.width / 2 : 620;
                const defaultY = kelContainer ? kelContainer.y + kelContainer.height / 2 : 247;

                for (const [sCode, sT] of siteTemplates.entries()) {
                    if (placedHubCodes.has(sCode) || extraHubs.includes(sCode)) continue;
                    const pHub = parentHubOfSite.get(sCode);
                    const pContainer = pHub ? siteContainers.find(c => c.siteCode === pHub) : kelContainer;
                    const baseCenterX = pContainer ? pContainer.x + pContainer.width / 2 : defaultX;
                    const baseCenterY = pContainer ? pContainer.y + pContainer.height / 2 : defaultY;

                    for (const d of sT.devOffsets) {
                        positions.set(d.nodeKey, { x: baseCenterX, y: baseCenterY });
                        if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                            positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: baseCenterX, y: baseCenterY });
                        }
                        layoutDevs.push(d.dev);
                    }
                }

                maxCanvasWidth = 1240;
                maxCanvasHeight = 500;

                // Backbone Constellation Enclosure (5 Core Hub Tier)
                clusters.push({
                    id: "backbone-constellation",
                    label: "Enterprise WAN Backbone Constellation (5 Core Hub Tier)",
                    hubSiteCode: "KEL",
                    siteCodes: Array.from(designatedHubs),
                    x: 40,
                    y: 30,
                    width: 1160,
                    height: 440,
                    titleWidth: 380,
                    isSingle: false
                });

            } else {
                // =========================================================================
                // MODE B: HUB DRILL-DOWN (activeDrillHub, e.g. "KEL")
                // Focal Hub takes center stage (expanded).
                // Satellites (PAV, DOR) branch directly below it.
                // Peer Hubs (CRM, WDC, RDG, VMM) remain visible in summary cards along perimeter.
                // =========================================================================
                const focalHub = activeDrillHub;
                const focalT = siteTemplates.get(focalHub);
                const satellites = hubSatellitesMap.get(focalHub) || [];
                const peerHubs = Array.from(designatedHubs).filter(h => h !== focalHub);

                const focalX = 360;
                const focalY = 120;
                const focalW = focalT ? focalT.width : 300;
                const focalH = focalT ? focalT.height : 74;
                const focalDevCount = focalT ? focalT.totalDevsInSite : 0;
                const focalL3Count = focalT ? focalT.l3Count : 0;
                const focalL2Count = focalT ? focalT.l2Count : 0;
                const focalSiteName = getCleanSiteDisplayName(focalHub, siteDirectory?.[focalHub]?.name || siteDirectory?.[focalHub.toUpperCase()]?.name || focalT?.siteName);

                // 1. Place Focal Hub
                siteContainers.push({
                    siteCode: focalHub,
                    siteName: focalSiteName,
                    x: focalX,
                    y: focalY,
                    width: focalW,
                    height: focalH,
                    deviceCount: focalDevCount,
                    l3Count: focalL3Count,
                    l2Count: focalL2Count,
                    isCollapsed: focalT ? focalT.isCollapsed : true,
                    idfs: focalT ? focalT.idfs.map(idf => ({
                        ...idf,
                        x: focalX + idf.relX,
                        y: focalY + idf.relY
                    })) : [],
                    connectedSites: Array.from(interSiteAdj.get(focalHub) || []),
                    clusterId: `cluster-${focalHub}`,
                    isClusterHub: true,
                    isDesignatedHub: true,
                    satellites: satellites,
                    isPendingCrawl: focalDevCount === 0
                });

                if (focalT) {
                    for (const idf of focalT.idfs) {
                        idfContainers.push({
                            ...idf,
                            x: focalX + idf.relX,
                            y: focalY + idf.relY
                        });
                    }

                    for (const d of focalT.devOffsets) {
                        const nX = focalX + d.relX;
                        const nY = focalY + d.relY;
                        positions.set(d.nodeKey, { x: nX, y: nY });
                        if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                            positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                        }
                        layoutDevs.push(d.dev);
                    }
                }

                // 2. Place Satellites grouped by Location Type and City
                const groupMap = new Map<string, {
                    groupKey: string;
                    locationType: string;
                    city: string;
                    satCodes: string[];
                }>();

                for (const satCode of satellites) {
                    const siteLookup = siteDirectory?.[satCode] || siteDirectory?.[satCode.toUpperCase()];
                    const { locationType, city, groupKey } = getSiteClassification(satCode, siteLookup);
                    if (!groupMap.has(groupKey)) {
                        groupMap.set(groupKey, { groupKey, locationType, city, satCodes: [] });
                    }
                    groupMap.get(groupKey)!.satCodes.push(satCode);
                }

                // Sort groups: Campus first, Administrative second, Ambulatory third; within type sort by city
                const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
                    const typePriority: Record<string, number> = { "Campus": 1, "Administrative": 2, "Ambulatory": 3 };
                    const pA = typePriority[a.locationType] || 4;
                    const pB = typePriority[b.locationType] || 4;
                    if (pA !== pB) return pA - pB;
                    return a.city.localeCompare(b.city);
                });

                const SITE_GAP_X = 20;
                const SITE_GAP_Y = 16;
                const POD_PAD_X = 20;
                const POD_PAD_TOP = 42;
                const POD_PAD_BOTTOM = 20;
                const POD_GAP_X = 36;
                const POD_GAP_Y = 40;

                const startY = focalY + focalH + 90;
                let curPodX = 60;
                let curPodY = startY;
                let maxRowH = 0;
                let maxPodsRight = 0;
                const MAX_ROW_WIDTH = 1350;

                for (const g of sortedGroups) {
                    const maxSiteW = Math.max(...g.satCodes.map(c => siteTemplates.get(c)?.width || 300), 280);
                    const maxSiteH = Math.max(...g.satCodes.map(c => siteTemplates.get(c)?.height || 74), 74);
                    const cols = g.satCodes.length <= 3 ? g.satCodes.length : (g.satCodes.length === 4 ? 2 : 3);
                    const rows = Math.ceil(g.satCodes.length / cols);

                    const podInnerW = cols * maxSiteW + (cols - 1) * SITE_GAP_X;
                    const podW = podInnerW + POD_PAD_X * 2;
                    const podInnerH = rows * maxSiteH + (rows - 1) * SITE_GAP_Y;
                    const podH = podInnerH + POD_PAD_TOP + POD_PAD_BOTTOM;

                    if (curPodX > 60 && curPodX + podW > MAX_ROW_WIDTH) {
                        curPodX = 60;
                        curPodY += maxRowH + POD_GAP_Y;
                        maxRowH = 0;
                    }

                    const podX = curPodX;
                    const podY = curPodY;
                    if (podH > maxRowH) maxRowH = podH;
                    curPodX += podW + POD_GAP_X;
                    if (podX + podW > maxPodsRight) maxPodsRight = podX + podW;

                    g.satCodes.forEach((satCode, idx) => {
                        const sT = siteTemplates.get(satCode)!;
                        const col = idx % cols;
                        const row = Math.floor(idx / cols);
                        const satX = podX + POD_PAD_X + col * (maxSiteW + SITE_GAP_X);
                        const satY = podY + POD_PAD_TOP + row * (maxSiteH + SITE_GAP_Y);

                        siteContainers.push({
                            siteCode: satCode,
                            siteName: sT.siteName,
                            x: satX,
                            y: satY,
                            width: sT.width,
                            height: sT.height,
                            deviceCount: sT.totalDevsInSite,
                            l3Count: sT.l3Count,
                            l2Count: sT.l2Count,
                            isCollapsed: sT.isCollapsed,
                            idfs: sT.idfs.map(idf => ({
                                ...idf,
                                x: satX + idf.relX,
                                y: satY + idf.relY
                            })),
                            connectedSites: Array.from(interSiteAdj.get(satCode) || []),
                            clusterId: `pod-${g.groupKey.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
                            isClusterHub: false,
                            isDesignatedHub: false,
                            parentHub: focalHub
                        });

                        for (const idf of sT.idfs) {
                            idfContainers.push({
                                ...idf,
                                x: satX + idf.relX,
                                y: satY + idf.relY
                            });
                        }

                        for (const d of sT.devOffsets) {
                            const nX = satX + d.relX;
                            const nY = satY + d.relY;
                            positions.set(d.nodeKey, { x: nX, y: nY });
                            if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                                positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                            }
                            layoutDevs.push(d.dev);
                        }
                    });

                    const icon = g.locationType === "Campus" ? "🏛️" : g.locationType === "Administrative" ? "🏢" : "🏥";
                    const podLabel = `${icon} ${g.groupKey} (${g.satCodes.length} ${g.satCodes.length === 1 ? "Site" : "Sites"})`;
                    clusters.push({
                        id: `pod-${g.groupKey.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`,
                        label: podLabel,
                        hubSiteCode: focalHub,
                        siteCodes: g.satCodes,
                        x: podX,
                        y: podY,
                        width: podW,
                        height: podH,
                        titleWidth: Math.max(podLabel.length * 8.5 + 40, 220),
                        isSingle: false
                    });
                }

                // 3. Perimeter Placement for Peer Hubs (compact summary cards)
                const rightX = Math.max(focalX + focalW + 120, maxPodsRight + 60, 1200);
                const peerPositions: Array<{ x: number; y: number }> = [
                    { x: 30, y: 60 },                         // Top-Left (e.g. CRM)
                    { x: 30, y: 280 },                        // Mid-Left (e.g. VMM)
                    { x: 30, y: 500 },                        // Lower-Left
                    { x: rightX, y: 60 },                     // Top-Right (e.g. WDC)
                    { x: rightX, y: 280 },                    // Mid-Right (e.g. RDG)
                    { x: rightX, y: 500 }                     // Lower-Right
                ];

                peerHubs.forEach((pCode, idx) => {
                    const pT = siteTemplates.get(pCode);
                    const pPos = peerPositions[idx] || { x: rightX, y: 60 + idx * 120 };
                    const pSats = hubSatellitesMap.get(pCode) || [];
                    const pSiteName = getCleanSiteDisplayName(pCode, siteDirectory?.[pCode]?.name || siteDirectory?.[pCode.toUpperCase()]?.name || pT?.siteName);
                    const pDevCount = pT ? pT.totalDevsInSite : 0;
                    const pL3Count = pT ? pT.l3Count : 0;
                    const pL2Count = pT ? pT.l2Count : 0;

                    siteContainers.push({
                        siteCode: pCode,
                        siteName: pSiteName,
                        x: pPos.x,
                        y: pPos.y,
                        width: 280,
                        height: 54,
                        deviceCount: pDevCount,
                        l3Count: pL3Count,
                        l2Count: pL2Count,
                        isCollapsed: true,
                        idfs: [],
                        connectedSites: Array.from(interSiteAdj.get(pCode) || []),
                        clusterId: `peer-${pCode}`,
                        isClusterHub: true,
                        isDesignatedHub: true,
                        satellites: pSats,
                        isPendingCrawl: pDevCount === 0
                    });

                    if (pT) {
                        for (const d of pT.devOffsets) {
                            const nX = pPos.x + d.relX;
                            const nY = pPos.y + d.relY;
                            positions.set(d.nodeKey, { x: nX, y: nY });
                            if (!positions.has(d.dev.canonicalHostname || d.dev.hostname)) {
                                positions.set(d.dev.canonicalHostname || d.dev.hostname, { x: nX, y: nY });
                            }
                            layoutDevs.push(d.dev);
                        }
                    }
                });

                maxCanvasWidth = rightX + 340;
                maxCanvasHeight = Math.max(curPodY + maxRowH + 120, 850);
            }
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

        // 5B. Apply custom dragged offsets to sites, IDFs, and device nodes
        if (siteOffsets && Object.keys(siteOffsets).length > 0) {
            for (const sb of siteContainers) {
                const off = siteOffsets[sb.siteCode];
                if (off && (off.dx !== 0 || off.dy !== 0)) {
                    sb.x += off.dx;
                    sb.y += off.dy;

                    // Shift IDFs inside this site
                    for (const ib of idfContainers) {
                        if (ib.siteCode === sb.siteCode) {
                            ib.x += off.dx;
                            ib.y += off.dy;
                        }
                    }

                    // Shift node positions inside this site
                    const t = siteTemplates.get(sb.siteCode);
                    if (t && t.devOffsets) {
                        for (const d of t.devOffsets) {
                            const posKey = positions.get(d.nodeKey);
                            if (posKey) {
                                posKey.x += off.dx;
                                posKey.y += off.dy;
                            }
                            const canon = d.dev.canonicalHostname || d.dev.hostname;
                            const posCanon = canon ? positions.get(canon) : null;
                            if (posCanon && posCanon !== posKey) {
                                posCanon.x += off.dx;
                                posCanon.y += off.dy;
                            }
                        }
                    }
                }
            }

            // Recalculate cluster enclosure bounding boxes around dragged member sites
            for (const cl of clusters) {
                const memberBoxes = siteContainers.filter(sb => cl.siteCodes.includes(sb.siteCode));
                if (memberBoxes.length > 0) {
                    const minX = Math.min(...memberBoxes.map(b => b.x)) - 24;
                    const minY = Math.min(...memberBoxes.map(b => b.y)) - 28;
                    const maxX = Math.max(...memberBoxes.map(b => b.x + b.width)) + 24;
                    const maxY = Math.max(...memberBoxes.map(b => b.y + b.height)) + 20;
                    cl.x = minX;
                    cl.y = minY;
                    cl.width = Math.max(maxX - minX, 100);
                    cl.height = Math.max(maxY - minY, 80);
                }
            }
        }

        // 5C. Dynamically generate Group / Folder Containers for sites organized into folders
        if (siteDirectory) {
            const folderMembersMap = new Map<string, string[]>();
            for (const sb of siteContainers) {
                const sMeta = siteDirectory[sb.siteCode] || siteDirectory[sb.siteCode.toUpperCase()];
                const fPath = sMeta?.folderPath?.trim();
                if (fPath) {
                    if (!folderMembersMap.has(fPath)) folderMembersMap.set(fPath, []);
                    folderMembersMap.get(fPath)!.push(sb.siteCode);
                }
            }

            folderMembersMap.forEach((memberCodes, folderPath) => {
                const memberBoxes = siteContainers.filter(sb => memberCodes.includes(sb.siteCode));
                if (memberBoxes.length > 0) {
                    const minX = Math.min(...memberBoxes.map(b => b.x)) - 28;
                    const minY = Math.min(...memberBoxes.map(b => b.y)) - 38;
                    const maxX = Math.max(...memberBoxes.map(b => b.x + b.width)) + 28;
                    const maxY = Math.max(...memberBoxes.map(b => b.y + b.height)) + 24;
                    const width = Math.max(maxX - minX, 220);
                    const height = Math.max(maxY - minY, 110);
                    const label = `📁 Group: ${folderPath} (${memberBoxes.length} ${memberBoxes.length === 1 ? 'Site' : 'Sites'})`;
                    clusters.push({
                        id: `folder-${folderPath}`,
                        label,
                        hubSiteCode: memberBoxes[0].siteCode,
                        siteCodes: memberCodes,
                        x: minX,
                        y: minY,
                        width,
                        height,
                        titleWidth: Math.max(label.length * 7.5 + 40, 180),
                        isSingle: false
                    });
                }
            });
        }

        // 6. Generate Inter-Site Highway Bridges between connected sites
        const bridges: InterSiteBridge[] = [];
        const siteBoxMap = new Map<string, SiteContainerBox>();
        for (const sb of siteContainers) {
            siteBoxMap.set(sb.siteCode, sb);
        }

        // Helper function to build bridge paths cleanly between two boxes
        const computeBridgeGeometry = (boxA: SiteContainerBox, boxB: SiteContainerBox) => {
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

            return { p1, p2, pathD, midX, midY };
        };

        const existingBridgePairs = new Set<string>();

        for (const edge of interSiteEdges.values()) {
            const boxA = siteBoxMap.get(edge.siteA);
            const boxB = siteBoxMap.get(edge.siteB);
            if (!boxA || !boxB) continue;

            const pairKey = [edge.siteA, edge.siteB].sort().join(" <--> ");
            existingBridgePairs.add(pairKey);

            const { pathD, midX, midY } = computeBridgeGeometry(boxA, boxB);
            const isHubHighway = designatedHubs.has(edge.siteA) && designatedHubs.has(edge.siteB);

            // Extract protocol, speed, and aggregate bandwidth telemetry
            const protocols = new Set<string>();
            const speeds = new Set<string>();
            for (const l of edge.links) {
                const proto = l.discoveryProtocol || l.protocol || (l.linkType === "L3_ROUTED" || l.isRouted ? "EIGRP" : "");
                if (proto) protocols.add(proto.toUpperCase());
                if (l.speed) speeds.add(l.speed);
            }

            const protoStr = protocols.size > 0 
                ? Array.from(protocols).join("/") 
                : (edge.isRouted ? "EIGRP" : "L2");

            const speedStr = speeds.size > 0 ? Array.from(speeds).join(", ") : "";
            const linkCountStr = edge.links.length > 1 ? `${edge.links.length} Links` : "1 Link";

            // Rich informative label for the bridge midpoint
            let label = "";
            const capacityLabel = speedStr ? (edge.links.length > 1 ? `${edge.links.length}x ${speedStr}` : speedStr) : "";

            if (isHubHighway) {
                label = `⚡ ${protoStr} WAN • ${speedStr ? `${speedStr} • ` : ""}${linkCountStr}`;
            } else if (edge.isRouted) {
                label = `⚡ ${protoStr} WAN • ${speedStr ? `${speedStr} • ` : ""}${linkCountStr}`;
            } else if (edge.links.length > 1) {
                label = `⇄ Trunk (${edge.links.length} Links)${speedStr ? ` • ${speedStr}` : ""}`;
            } else {
                label = `⇄ Campus Trunk${speedStr ? ` • ${speedStr}` : ""}`;
            }

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
                speed: edge.speed || speedStr,
                links: edge.links,
                protocol: protoStr,
                capacityLabel,
                isHubHighway
            });
        }

        // In Backbone Overview (activeDrillHub === null) or Campus mode:
        // Ensure WAN highways exist between central KEL and peer hubs (CRM, WDC, RDG, VMM)
        // so the user always sees the labeled, informative primary hub WAN links
        if (siteClusterMode === "topological") {
            const centralHub = "KEL";
            const boxKel = siteBoxMap.get(centralHub);

            if (boxKel) {
                for (const peerHub of designatedHubs) {
                    if (peerHub === centralHub) continue;
                    const boxPeer = siteBoxMap.get(peerHub);
                    if (!boxPeer) continue;

                    const pairKey = [centralHub, peerHub].sort().join(" <--> ");
                    if (!existingBridgePairs.has(pairKey)) {
                        existingBridgePairs.add(pairKey);
                        const { pathD, midX, midY } = computeBridgeGeometry(boxKel, boxPeer);

                        bridges.push({
                            id: `backbone-highway-${centralHub}-${peerHub}`,
                            sourceSite: centralHub,
                            targetSite: peerHub,
                            path: pathD,
                            midX,
                            midY,
                            linkCount: 1,
                            isRouted: true,
                            label: `⚡ EIGRP WAN • 10 Gbps Backbone`,
                            status: "UP",
                            speed: "10 Gbps",
                            links: [
                                {
                                    sourceDevice: `${centralHub.toLowerCase()}-core-sw1`,
                                    sourceInterface: "TenGigabitEthernet1/1/1",
                                    targetDevice: `${peerHub.toLowerCase()}-core-sw1`,
                                    targetInterface: "TenGigabitEthernet1/1/1",
                                    linkType: "L3_ROUTED",
                                    discoveryProtocol: "EIGRP",
                                    speed: "10 Gbps",
                                    status: "UP"
                                }
                            ],
                            protocol: "EIGRP",
                            capacityLabel: "10 Gbps WAN Adjacency",
                            isHubHighway: true
                        });
                    }
                }
            }
        }

        let maxX = maxCanvasWidth + 100;
        let maxY = maxCanvasHeight + 120;
        for (const sb of siteContainers) {
            if (sb.x + sb.width + 100 > maxX) maxX = sb.x + sb.width + 100;
            if (sb.y + sb.height + 120 > maxY) maxY = sb.y + sb.height + 120;
        }

        const isOverview = siteClusterMode === "topological" && !activeDrillHub;
        const totalWidth = isOverview ? Math.max(maxX, 1240) : Math.max(maxX, 1600);
        const totalHeight = isOverview ? Math.max(maxY, 490) : Math.max(maxY, 850);

        return {
            nodePositions: positions,
            siteBoxes: siteContainers,
            idfBoxes: idfContainers,
            siteClusters: clusters,
            interSiteBridges: bridges,
            canvasSize: { width: totalWidth, height: totalHeight },
            layoutDevices: layoutDevs
        };
    }, [filteredDevices, layoutMode, stackingMode, siteDirectory, collapsedSites, collapsedIdfs, idfSpacing, showUncrawledSites, uncrawledSiteCodes, siteFilter, siteClusterMode, unifiedLinks, deviceLocationMap, nodeDensity, designatedHubs, activeDrillHub, siteOffsets]);

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
        if (draggingSiteRef.current) {
            const deltaX = (e.clientX - draggingSiteRef.current.startX) / zoom;
            const deltaY = (e.clientY - draggingSiteRef.current.startY) / zoom;
            if (Math.hypot(deltaX, deltaY) > 3) {
                hasDraggedRef.current = true;
                const sCode = draggingSiteRef.current.siteCode;
                const newDx = Math.round(draggingSiteRef.current.initialDx + deltaX);
                const newDy = Math.round(draggingSiteRef.current.initialDy + deltaY);
                setSiteOffsets(prev => ({
                    ...prev,
                    [sCode]: { dx: newDx, dy: newDy }
                }));
            }
            return;
        }

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
        if (draggingSiteRef.current) {
            if (hasDraggedRef.current) {
                setActiveLayoutView("personal");
                try {
                    const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
                    localStorage.setItem(key, JSON.stringify(siteOffsets));
                } catch {}
            }
            draggingSiteRef.current = null;
            return;
        }

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

    const handleCanvasDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const rawData = e.dataTransfer.getData("application/json");
        if (!rawData) return;

        const el = svgContainerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();

        // Convert cursor screen coordinates to SVG world coordinates
        const dropWorldX = Math.round((e.clientX - rect.left - currentPanRef.current.x) / zoom);
        const dropWorldY = Math.round((e.clientY - rect.top - currentPanRef.current.y) / zoom);

        try {
            const data = JSON.parse(rawData);
            if (data.type === "site" && data.siteCode) {
                const code = data.siteCode.toUpperCase();
                const sb = siteBoxes.find(b => b.siteCode.toUpperCase() === code);
                const currentOff = siteOffsets[code] || { dx: 0, dy: 0 };
                const currentX = sb ? sb.x : 200;
                const currentY = sb ? sb.y : 200;
                const baseX = currentX - currentOff.dx;
                const baseY = currentY - currentOff.dy;

                const newDx = Math.round(dropWorldX - baseX);
                const newDy = Math.round(dropWorldY - baseY);

                setSiteOffsets(prev => {
                    const next = {
                        ...prev,
                        [code]: { dx: newDx, dy: newDy }
                    };
                    try {
                        const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
                        localStorage.setItem(key, JSON.stringify(next));
                    } catch {}
                    return next;
                });
                setActiveLayoutView("personal");
            } else if (data.type === "folder" && data.folderPath) {
                const targetFolder = data.folderPath.trim();
                const memberCodes: string[] = [];
                if (siteDirectory) {
                    for (const [code, meta] of Object.entries(siteDirectory)) {
                        if (meta.folderPath === targetFolder || meta.folderPath?.startsWith(targetFolder + "/")) {
                            memberCodes.push(code.toUpperCase());
                        }
                    }
                }

                if (memberCodes.length === 0) return;

                const cols = memberCodes.length > 4 ? 3 : 2;
                const cellW = 360;
                const cellH = 260;

                setSiteOffsets(prev => {
                    const next = { ...prev };
                    memberCodes.forEach((code, idx) => {
                        const col = idx % cols;
                        const row = Math.floor(idx / cols);
                        const targetX = dropWorldX + col * cellW;
                        const targetY = dropWorldY + row * cellH;

                        const sb = siteBoxes.find(b => b.siteCode.toUpperCase() === code);
                        const currentOff = prev[code] || { dx: 0, dy: 0 };
                        const currentX = sb ? sb.x : 200;
                        const currentY = sb ? sb.y : 200;
                        const baseX = currentX - currentOff.dx;
                        const baseY = currentY - currentOff.dy;

                        next[code] = {
                            dx: Math.round(targetX - baseX),
                            dy: Math.round(targetY - baseY)
                        };
                    });

                    try {
                        const key = `crawler_topology_site_offsets_${snapshotId || "master"}`;
                        localStorage.setItem(key, JSON.stringify(next));
                    } catch {}
                    return next;
                });
                setActiveLayoutView("personal");
            }
        } catch (err) {
            console.error("Failed to handle drop on canvas:", err);
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

                {/* Grouped Dropdown Menus */}
                <div ref={dropdownRef} className="flex items-center gap-2 relative">
                    {/* 1. Layout & Grouping Menu Trigger */}
                    <button
                        type="button"
                        onClick={() => setActiveDropdown(prev => prev === "layout" ? null : "layout")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                            activeDropdown === "layout"
                                ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                                : "bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                        }`}
                        title="Configure Topology Architecture, Clustering, Stacking, and IDF Density"
                    >
                        <Layers2 className="w-3.5 h-3.5 text-blue-400" />
                        <span>Layout</span>
                        <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">
                            ({layoutMode === "flow" ? "Hierarchical" : siteClusterMode === "topological" ? "Clusters" : "Grid"})
                        </span>
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${activeDropdown === "layout" ? "rotate-180 text-white" : ""}`} />
                    </button>

                    {/* 2. Display & Filters Menu Trigger */}
                    <button
                        type="button"
                        onClick={() => setActiveDropdown(prev => prev === "display" ? null : "display")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                            activeDropdown === "display"
                                ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                                : "bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                        }`}
                        title="Configure Visual Density, Link Overlays, Filters, and Interaction Mode"
                    >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Display</span>
                        {activeFilterCount > 0 && (
                            <span className="bg-cyan-500/20 text-cyan-300 text-[10px] font-mono px-1.5 py-0.2 rounded-full border border-cyan-500/40">
                                {activeFilterCount}
                            </span>
                        )}
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${activeDropdown === "display" ? "rotate-180 text-white" : ""}`} />
                    </button>

                    {/* --- LAYOUT DROPDOWN POPUP --- */}
                    {activeDropdown === "layout" && (
                        <div className="absolute top-full left-0 mt-2 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-3.5 text-slate-200">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-1.5">
                                    <Layers2 className="w-4 h-4 text-blue-400" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Layout & Grouping</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveDropdown(null)}
                                    className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition cursor-pointer"
                                    title="Close Menu"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Section 1: Architecture Engine */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Architecture</label>
                                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setLayoutMode("container")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            layoutMode === "container"
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Group switches by Site and IDF containers"
                                    >
                                        <Box className="w-3.5 h-3.5" />
                                        <span>Containers</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setLayoutMode("flow")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            layoutMode === "flow"
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Display hierarchical flow (Routers -> L3 -> L2)"
                                    >
                                        <Workflow className="w-3.5 h-3.5" />
                                        <span>Hierarchical</span>
                                    </button>
                                </div>
                            </div>

                            {layoutMode === "container" && (
                                <>
                                    {/* Section 2: Site Clustering */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Site Clustering</label>
                                        <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => setSiteClusterMode("topological")}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    siteClusterMode === "topological"
                                                        ? "bg-sky-600 text-white shadow-sm"
                                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                                }`}
                                                title="Topological constellation grouping hub sites and satellite campuses"
                                            >
                                                <Network className="w-3.5 h-3.5" />
                                                <span>Connected</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSiteClusterMode("grid")}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    siteClusterMode === "grid"
                                                        ? "bg-sky-600 text-white shadow-sm"
                                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                                }`}
                                                title="Linear row-wrapped site grid"
                                            >
                                                <LayoutGrid className="w-3.5 h-3.5" />
                                                <span>Linear Grid</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Section 3: Floor Stacking */}
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Floor Stacking</label>
                                        <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => setStackingMode("building")}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    stackingMode === "building"
                                                        ? "bg-blue-600 text-white shadow-sm"
                                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                                }`}
                                                title="Vertical Building Floor Stacking (Top floor down to Ground/MDF)"
                                            >
                                                <Layers2 className="w-3.5 h-3.5" />
                                                <span>Building Stack</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStackingMode("horizontal")}
                                                className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                                    stackingMode === "horizontal"
                                                        ? "bg-blue-600 text-white shadow-sm"
                                                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                                }`}
                                                title="Horizontal Closets (Side-by-side IDFs)"
                                            >
                                                <Box className="w-3.5 h-3.5" />
                                                <span>Horizontal</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Section 4: IDF Spacing */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IDF Closet Spacing</label>
                                            <span className="text-[10px] text-cyan-400 capitalize">{idfSpacing}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                            {(["compact", "normal", "spacious"] as const).map(spacing => (
                                                <button
                                                    key={spacing}
                                                    type="button"
                                                    onClick={() => setIdfSpacing(spacing)}
                                                    className={`py-1 rounded-lg text-xs font-medium capitalize transition cursor-pointer ${
                                                        idfSpacing === spacing
                                                            ? "bg-cyan-600 text-white shadow-sm"
                                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                                    }`}
                                                >
                                                    {spacing}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Section 5: Campus View Expansion */}
                                    <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Campus Overview</label>
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setCollapsedSites(new Set(uniqueSites));
                                                    setSiteFilter("ALL");
                                                    setActiveDropdown(null);
                                                }}
                                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                                    collapsedSites.size === uniqueSites.length && uniqueSites.length > 0
                                                        ? "bg-blue-950/60 border-blue-500/60 text-blue-200"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                                }`}
                                                title="Site Map View: Compact overview of all sites with WAN trunks"
                                            >
                                                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                                                <span>Site Map View</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    expandAllSites();
                                                    setActiveDropdown(null);
                                                }}
                                                className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
                                                    collapsedSites.size === 0
                                                        ? "bg-blue-950/60 border-blue-500/60 text-blue-200"
                                                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                                                }`}
                                                title="Expanded View: Fully expand all sites, floors, and individual switches"
                                            >
                                                <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                                                <span>Expanded View</span>
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={collapsedIdfs.size > 0 ? expandAllIdfs : collapseAllIdfs}
                                            className="w-full mt-1 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800/80 transition text-[11px] font-medium cursor-pointer"
                                        >
                                            {collapsedIdfs.size > 0 ? "Expand All Floor Slabs" : "Collapse All Floor Slabs"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* --- DISPLAY & FILTERS DROPDOWN POPUP --- */}
                    {activeDropdown === "display" && (
                        <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-84 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-3.5 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-3 text-slate-200">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-1.5">
                                    <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Display & Filters</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveDropdown(null)}
                                    className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition cursor-pointer"
                                    title="Close Menu"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Section 1: Node Silhouette & Density */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Visual Style</label>
                                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setNodeDensity("standard")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            nodeDensity === "standard"
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Detailed Rack Cards (Full telemetry, StackWise 3D layers, LED port strips)"
                                    >
                                        <Server className="w-3.5 h-3.5" />
                                        <span>Detailed Cards</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNodeDensity("compact")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            nodeDensity === "compact"
                                                ? "bg-indigo-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Compact Shapes (High-density footprint with Cisco role silhouettes)"
                                    >
                                        <Box className="w-3.5 h-3.5" />
                                        <span>Compact Shapes</span>
                                    </button>
                                </div>
                            </div>

                            {/* Section 2: Links & Aggregation Overlays */}
                            <div className="space-y-2 pt-1 border-t border-slate-800/80">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Links & Overlays</label>
                                
                                {/* All Links Toggle */}
                                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Cable className="w-4 h-4 text-cyan-400" />
                                        <div>
                                            <div className="text-xs font-semibold text-white">All Links Overlay</div>
                                            <div className="text-[10px] text-slate-400">Render all circuit lines across diagram</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowAllLinks(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                            showAllLinks
                                                ? "bg-cyan-600 text-white shadow-sm"
                                                : "bg-slate-800 text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {showAllLinks ? "ON" : "OFF"}
                                    </button>
                                </div>

                                {/* Clear selective uplinks if active */}
                                {(visibleUplinkSites.size > 0 || visibleUplinkIdfs.size > 0) && !showAllLinks && (
                                    <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-300">
                                        <span>{visibleUplinkSites.size + visibleUplinkIdfs.size} selective uplinks active</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setVisibleUplinkSites(new Set());
                                                setVisibleUplinkIdfs(new Set());
                                            }}
                                            className="underline hover:text-white cursor-pointer"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                )}

                                {/* Converge Trunks & MPLS */}
                                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <GitMerge className="w-4 h-4 text-purple-400" />
                                        <div>
                                            <div className="text-xs font-semibold text-white">Converge Trunks & MPLS</div>
                                            <div className="text-[10px] text-slate-400">Bundle shared neighbor circuits into trunks</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setConvergeTrunks(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                            convergeTrunks
                                                ? "bg-purple-600 text-white shadow-sm"
                                                : "bg-slate-800 text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {convergeTrunks ? "ON" : "OFF"}
                                    </button>
                                </div>
                            </div>

                            {/* Section 3: Equipment & Site Filters */}
                            <div className="space-y-2 pt-1 border-t border-slate-800/80">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device Filters</label>
                                
                                {/* Vendor Managed Devices */}
                                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <ShieldAlert className="w-4 h-4 text-purple-400" />
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-white">Vendor Managed</span>
                                                {vendorManagedCount > 0 && (
                                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                                        {vendorManagedCount}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400">Meraki, Viptela, & ISP equipment</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowVendorManaged(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                            showVendorManaged
                                                ? "bg-purple-600 text-white shadow-sm"
                                                : "bg-slate-800 text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {showVendorManaged ? "INCLUDED" : "EXCLUDED"}
                                    </button>
                                </div>

                                {/* Uncrawled Directory Sites */}
                                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Building className="w-4 h-4 text-amber-400" />
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-semibold text-white">Uncrawled Sites</span>
                                                {uncrawledSiteCodes.length > 0 && (
                                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                        {uncrawledSiteCodes.length}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-slate-400">Directory sites not yet crawled</div>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowUncrawledSites(prev => !prev)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                            showUncrawledSites
                                                ? "bg-amber-600 text-white shadow-sm"
                                                : "bg-slate-800 text-slate-400 hover:text-white"
                                        }`}
                                    >
                                        {showUncrawledSites ? "SHOWN" : "HIDDEN"}
                                    </button>
                                </div>
                            </div>

                            {/* Section 4: Interaction & Pan Sensitivity */}
                            <div className="space-y-2 pt-1 border-t border-slate-800/80">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interaction & Canvas</label>
                                
                                {/* Click Mode */}
                                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setClickMode("inspect")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            clickMode === "inspect"
                                                ? "bg-blue-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Clicking a switch opens the Device Inspector Drawer"
                                    >
                                        <span>Inspect Mode</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setClickMode("fade")}
                                        className={`px-2 py-1.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                            clickMode === "fade"
                                                ? "bg-amber-600 text-white shadow-sm"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                                        }`}
                                        title="Clicking a switch dims/fades it (or Shift+Click in any mode)"
                                    >
                                        <EyeOff className="w-3.5 h-3.5" />
                                        <span>Dim Mode</span>
                                    </button>
                                </div>

                                {/* Pan Speed Selector */}
                                <div className="flex items-center justify-between p-1.5 rounded-xl bg-slate-950 border border-slate-800">
                                    <div className="flex items-center gap-1.5 text-xs text-slate-400 px-1">
                                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                                        <span className="font-semibold text-slate-300">Pan Speed:</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {[
                                            { val: 1.0, label: "1.0x" },
                                            { val: 1.5, label: "1.5x" },
                                            { val: 2.2, label: "2.2x" }
                                        ].map(p => (
                                            <button
                                                key={p.val}
                                                type="button"
                                                onClick={() => setPanSpeed(p.val)}
                                                className={`px-2 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                                                    panSpeed === p.val
                                                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                                                        : "text-slate-400 hover:text-slate-200"
                                                }`}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Global Spotlight Search Button */}
                <button
                    type="button"
                    onClick={() => setIsSpotlightOpen(true)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                    title="Search Hostname, IP, MAC Address, or Closet (Ctrl + K or /)"
                >
                    <Search className="w-3.5 h-3.5 text-amber-400" />
                    <span>Search</span>
                    <kbd className="hidden sm:inline-block text-[9px] bg-slate-800 px-1 py-0.2 rounded text-slate-400 border border-slate-700 font-mono">⌘K</kbd>
                </button>

                {/* Visual Path Trace Button */}
                <button
                    type="button"
                    onClick={() => {
                        setIsPathTraceOpen(prev => !prev);
                        if (!isPathTraceOpen && selectedDevice) {
                            if (!traceSource) setTraceSource(selectedDevice.canonicalHostname || selectedDevice.hostname);
                            else if (!traceDest) setTraceDest(selectedDevice.canonicalHostname || selectedDevice.hostname);
                        }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm ${
                        isPathTraceOpen || traceResult
                            ? "bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400"
                            : "bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800"
                    }`}
                    title="Simulate Hop-by-Hop L3 Path Trace with Point-in-Time Routing"
                >
                    <Zap className={`w-3.5 h-3.5 ${isPathTraceOpen || traceResult ? "text-yellow-300" : "text-cyan-400"}`} />
                    <span>Path Trace</span>
                    {traceResult && (
                        <span className="bg-cyan-950 text-cyan-200 text-[10px] font-mono px-1.5 py-0.2 rounded-full border border-cyan-400/40">
                            {traceResult.hops.length} Hops
                        </span>
                    )}
                </button>

                {/* Inline Dimmed Alert Pill */}
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

                {/* Inline Dim Others (when device selected) */}
                {selectedDevice && (
                    <button
                        type="button"
                        onClick={handleFadeOthers}
                        className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-lg transition text-[11px] font-medium flex items-center gap-1 cursor-pointer shadow-sm"
                        title="Dim all switches except the selected switch and its neighbors"
                    >
                        <Eye className="w-3 h-3 text-cyan-400" />
                        <span>Dim Others</span>
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
                <div className="absolute bottom-4 right-4 z-20 bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl border border-cyan-500/50 text-xs shadow-2xl max-w-md space-y-2 pointer-events-none">
                    {hoveredLink.isInterSiteHighway ? (
                        <>
                            <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                                <div className="flex items-center gap-2">
                                    <div className="p-1 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                        <Network className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-white text-xs font-mono flex items-center gap-1.5">
                                            <span>WAN Highway: {hoveredLink.sourceSite} ⇄ {hoveredLink.targetSite}</span>
                                            {hoveredLink.isHubHighway && (
                                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    CORE
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                            {hoveredLink.isHubHighway ? "Primary Enterprise Core Backbone" : "Campus Satellite Link"}
                                            {hoveredLink.protocol && ` • Protocol: ${hoveredLink.protocol}`}
                                            {hoveredLink.capacityLabel && ` • ${hoveredLink.capacityLabel}`}
                                        </div>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                                    hoveredLink.status === "UNVERIFIED" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                                    hoveredLink.status === "DOWN" ? "bg-red-500/20 text-red-300 border border-red-500/40" :
                                    "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                                }`}>
                                    ● {hoveredLink.status}
                                </span>
                            </div>

                            <div className="space-y-1 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto">
                                <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                                    Physical Circuits / Adjacencies ({hoveredLink.links?.length || 1}):
                                </div>
                                {(hoveredLink.links || []).map((lnk: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between gap-2 bg-slate-950/70 border border-slate-800/80 px-2.5 py-1 rounded">
                                        <div className="truncate text-cyan-300">
                                            <span className="font-bold">{lnk.sourceDevice}</span>
                                            {lnk.sourceInterface && <span className="text-slate-400"> ({lnk.sourceInterface})</span>}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0 text-slate-500">
                                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                                                {lnk.discoveryProtocol || (lnk.linkType === "L3_ROUTED" ? "EIGRP" : "L3")}
                                            </span>
                                            <span>↔</span>
                                        </div>
                                        <div className="truncate text-emerald-300 text-right">
                                            <span className="font-bold">{lnk.targetDevice}</span>
                                            {lnk.targetInterface && <span className="text-slate-400"> ({lnk.targetInterface})</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
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
                                        {lnk.speed && <span className="text-slate-400 text-[10px]">({lnk.speed})</span>}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
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
                                            <button
                                                type="button"
                                                onClick={() => toggleDesignatedHub(site.siteCode)}
                                                className="p-0.5 rounded hover:bg-amber-800/40 transition cursor-pointer shrink-0"
                                                title={designatedHubs.has(site.siteCode) ? "Enterprise Hub (Click to remove)" : "Click to mark as Enterprise Hub"}
                                            >
                                                <Star className={`w-3.5 h-3.5 ${designatedHubs.has(site.siteCode) ? "text-amber-400 fill-amber-400" : "text-slate-600 hover:text-amber-400"}`} />
                                            </button>
                                            <Building className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                            <span className="font-bold text-amber-200 font-mono text-[11px] truncate">
                                                {site.siteCode} {site.siteName ? `• ${site.siteName}` : ""}
                                            </span>
                                            {designatedHubs.has(site.siteCode) && (
                                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                                    HUB
                                                </span>
                                            )}
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
                                            <button
                                                type="button"
                                                onClick={() => toggleDesignatedHub(site.siteCode)}
                                                className="p-0.5 rounded hover:bg-slate-800 transition cursor-pointer shrink-0"
                                                title={designatedHubs.has(site.siteCode) ? "Enterprise Hub (Click to remove hub status)" : "Click to mark as Enterprise Hub"}
                                            >
                                                <Star className={`w-3.5 h-3.5 ${designatedHubs.has(site.siteCode) ? "text-amber-400 fill-amber-400" : "text-slate-600 hover:text-amber-400"}`} />
                                            </button>
                                            <span className="font-bold text-white font-mono text-[11px] truncate">
                                                {site.siteCode} {site.siteName ? `• ${site.siteName}` : ""}
                                            </span>
                                            {designatedHubs.has(site.siteCode) && (
                                                <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                                                    HUB
                                                </span>
                                            )}
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
                className="relative w-full h-full cursor-grab active:cursor-grabbing touch-none select-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                }}
                onDragEnter={(e) => {
                    e.preventDefault();
                }}
                onDrop={handleCanvasDrop}
            >
                {/* Floating Hub Breadcrumb & Constellation Navigator */}
                {layoutMode === "container" && siteClusterMode === "topological" && (
                    <div className="absolute top-3 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl px-3 py-1.5 pointer-events-auto">
                        <button
                            type="button"
                            onClick={handleResetOverview}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                                !activeDrillHub
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                            }`}
                            title="Enterprise Backbone Overview (KEL Core Center, CRM, WDC, RDG, VMM)"
                        >
                            <Network className="w-3.5 h-3.5 text-blue-300" />
                            <span>Enterprise Backbone</span>
                        </button>

                        {activeDrillHub && (
                            <>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-bold font-mono">
                                    <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>{activeDrillHub} Campus</span>
                                </div>
                            </>
                        )}

                        <div className="h-4 w-[1px] bg-slate-700 mx-1"></div>

                        {/* Hub Quick-Jump Pills */}
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-0.5">Hubs:</span>
                            {Array.from(designatedHubs).map(hubCode => {
                                const isFocused = activeDrillHub === hubCode;
                                const isKelCore = hubCode === "KEL";
                                return (
                                    <button
                                        key={hubCode}
                                        type="button"
                                        onClick={() => handleFocusHub(hubCode)}
                                        className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1 ${
                                            isFocused
                                                ? "bg-amber-500 text-slate-950 shadow-sm ring-1 ring-amber-300"
                                                : isKelCore
                                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                                                : "bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/50"
                                        }`}
                                        title={`Drill into ${hubCode}${isKelCore ? " (Primary Core)" : ""}`}
                                    >
                                        <Star className={`w-3 h-3 ${isFocused ? "text-slate-950 fill-slate-950" : "text-amber-400 fill-amber-400"}`} />
                                        <span>{hubCode}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {activeDrillHub && (
                            <button
                                type="button"
                                onClick={handleResetOverview}
                                className="ml-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer flex items-center gap-1 border border-slate-700"
                                title="Return to Enterprise Backbone Overview"
                            >
                                <RotateCcw className="w-3 h-3 text-cyan-400" />
                                <span>Overview</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Floating Layout View & Freeform Drag Bar */}
                <div className="absolute top-3 right-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 shadow-2xl rounded-xl px-3 py-1.5 pointer-events-auto">
                    <div className="flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Layout:</span>
                        <select
                            value={activeLayoutView}
                            onChange={(e) => handleSelectView(e.target.value)}
                            className="bg-black/60 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white font-semibold focus:outline-none focus:border-sky-400 cursor-pointer"
                        >
                            <option value="auto">Auto-Layout</option>
                            <option value="personal">My Personal View</option>
                            {savedViews.map((sv) => (
                                <option key={sv.id} value={sv.id}>
                                    {sv.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsSaveViewModalOpen(true)}
                        className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold text-xs border border-sky-500/40 transition cursor-pointer flex items-center gap-1 shadow-sm"
                        title="Save current layout as a shared view for anyone to open"
                    >
                        <Sparkles className="w-3 h-3 text-sky-300" />
                        <span>Save View</span>
                    </button>

                    {activeLayoutView !== "auto" && (
                        <button
                            type="button"
                            onClick={handleResetLayout}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
                            title="Reset to default auto-layout"
                        >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                        </button>
                    )}
                </div>

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
                        {/* 1A. RENDER MULTI-SITE CLUSTER ENCLOSURES (Campus / Hub Constellations & Folder Groups) */}
                        {layoutMode === "container" && siteClusters.filter(c => !c.isSingle).map((cluster) => {
                            const isFolder = cluster.id.startsWith("folder-");
                            const isCampus = cluster.label.includes("Campus") || isFolder;
                            const isAdmin = cluster.label.includes("Administrative");
                            const strokeColor = isFolder ? "rgba(56, 189, 248, 0.45)" : isCampus ? "rgba(56, 189, 248, 0.35)" : isAdmin ? "rgba(245, 158, 11, 0.35)" : "rgba(16, 185, 129, 0.35)";
                            const fillColor = isFolder ? "rgba(14, 165, 233, 0.08)" : isCampus ? "rgba(30, 41, 59, 0.22)" : isAdmin ? "rgba(45, 35, 20, 0.22)" : "rgba(20, 45, 35, 0.22)";
                            const badgeColor = isFolder ? "#38bdf8" : isCampus ? "#38bdf8" : isAdmin ? "#f59e0b" : "#34d399";
                            return (
                                <g key={`cluster-${cluster.id}`} className="transition-opacity duration-300 pointer-events-none">
                                    {/* Soft ambient glassmorphism enclosure rect */}
                                    <rect
                                        x={cluster.x}
                                        y={cluster.y}
                                        width={cluster.width}
                                        height={cluster.height}
                                        rx={18}
                                        fill={fillColor}
                                        stroke={strokeColor}
                                        strokeWidth={1.5}
                                        strokeDasharray="8,6"
                                    />
                                    {/* Cluster Header Pill Badge */}
                                    <g transform={`translate(${cluster.x + 18}, ${cluster.y - 13})`}>
                                        <rect
                                            x={0}
                                            y={0}
                                            width={cluster.titleWidth}
                                            height={26}
                                            rx={7}
                                            fill="rgba(15, 23, 42, 0.95)"
                                            stroke={badgeColor}
                                            strokeWidth={1}
                                            filter="drop-shadow(0 2px 8px rgba(0,0,0,0.5))"
                                        />
                                        <text
                                            x={12}
                                            y={17}
                                            fill={badgeColor}
                                            fontSize={11}
                                            fontWeight="bold"
                                            fontFamily="sans-serif"
                                            letterSpacing="0.3"
                                        >
                                            {cluster.label || `🌐 Campus Cluster: Hub ${cluster.hubSiteCode} (${cluster.siteCodes.length} Sites)`}
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
                                : bridge.isHubHighway
                                ? "#38bdf8"
                                : bridge.isRouted 
                                ? "#06b6d4" 
                                : "#10b981";

                            const badgeFill = bridge.isHubHighway
                                ? "rgba(14, 165, 233, 0.22)"
                                : bridge.isRouted
                                ? "rgba(6, 182, 212, 0.2)"
                                : "rgba(16, 185, 129, 0.2)";
                            const badgeBorder = bridge.isHubHighway ? "#38bdf8" : bridge.isRouted ? "#06b6d4" : "#10b981";
                            const badgeTextColor = bridge.isHubHighway ? "#7dd3fc" : bridge.isRouted ? "#67e8f9" : "#6ee7b7";
                            const badgeW = Math.max(bridge.label.length * 7.2 + 36, 130);

                            return (
                                <g
                                    key={bridge.id}
                                    className="cursor-pointer group"
                                    onMouseEnter={() => setHoveredLink({
                                        id: bridge.id,
                                        isInterSiteHighway: true,
                                        sourceSite: bridge.sourceSite,
                                        targetSite: bridge.targetSite,
                                        isHubHighway: bridge.isHubHighway,
                                        protocol: bridge.protocol,
                                        capacityLabel: bridge.capacityLabel,
                                        label: bridge.label,
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
                                        strokeWidth={26}
                                    >
                                        <title>{`${bridge.sourceSite} ↔ ${bridge.targetSite}: ${bridge.capacityLabel || bridge.label || "Backbone WAN Highway"}`}</title>
                                    </path>
                                    {/* Ambient Glow */}
                                    <path
                                        d={bridge.path}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={bridge.isHubHighway ? 8 : 6}
                                        opacity={bridge.isHubHighway ? 0.35 : 0.25}
                                        className="group-hover:opacity-70 transition"
                                    />
                                    {/* Primary Bridge Highway Line */}
                                    <path
                                        d={bridge.path}
                                        fill="none"
                                        stroke={strokeColor}
                                        strokeWidth={bridge.isHubHighway ? 4 : bridge.isRouted ? 3 : 3.5}
                                        strokeDasharray={bridge.isHubHighway ? "8,5" : bridge.isRouted ? "6,4" : undefined}
                                        className={isSelected ? "animate-pulse" : ""}
                                    />
                                </g>
                            );
                        })}

                        {layoutMode === "container" && siteBoxes.map((site) => {
                            if (site.isUncrawled) {
                                return (
                                    <g
                                        key={`site-${site.siteCode}`}
                                        onPointerDown={(e) => handleStartDragSite(e, site.siteCode)}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (onEditSite) onEditSite(site.siteCode);
                                        }}
                                        className="group cursor-pointer"
                                        style={{ cursor: "grab" }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!hasDraggedRef.current && onReseedDevice) {
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

                                        {/* Uncrawled Badge */}
                                        <g transform={`translate(${site.x + site.width - 150}, ${site.y + 11})`}>
                                            <rect x={0} y={0} width={112} height={18} rx={4} fill="rgba(245, 158, 11, 0.2)" stroke="#f59e0b" strokeWidth={0.8} />
                                            <text x={56} y={12.5} fill="#fcd34d" fontSize={8} fontWeight="bold" textAnchor="middle" letterSpacing="0.4">
                                                UNCRAWLED / NO DATA
                                            </text>
                                        </g>

                                        {/* Edit Site Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onEditSite) onEditSite(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-100 opacity-60 transition"
                                            transform={`translate(${site.x + site.width - 26}, ${site.y + 10})`}
                                            title={`Edit ${site.siteCode} properties`}
                                        >
                                            <rect x={0} y={0} width={18} height={18} rx={4} fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth={0.8} />
                                            <path d="M 4 14 L 5.5 10.5 L 11 5 L 13 7 L 7.5 12.5 Z" fill="none" stroke="#fbbf24" strokeWidth={1} />
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
                                const isHub = designatedHubs.has(site.siteCode);
                                const isKelCore = site.siteCode === "KEL";
                                const hasSatellites = site.satellites && site.satellites.length > 0;

                                return (
                                    <g
                                        key={`site-${site.siteCode}`}
                                        onPointerDown={(e) => handleStartDragSite(e, site.siteCode)}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (onEditSite) onEditSite(site.siteCode);
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!hasDraggedRef.current) {
                                                if (siteClusterMode === "topological" && (isHub || hasSatellites)) {
                                                    handleFocusHub(site.siteCode);
                                                } else {
                                                    toggleCollapseSite(site.siteCode);
                                                }
                                            }
                                        }}
                                        className="cursor-pointer group"
                                        style={{ cursor: "grab" }}
                                        title={
                                            siteClusterMode === "topological" && (isHub || hasSatellites)
                                                ? `Click to drill down into ${site.siteCode}${site.siteName ? ` (${site.siteName})` : ""}`
                                                : `Click to expand site ${site.siteCode}${site.siteName ? ` (${site.siteName})` : ""}`
                                        }
                                    >
                                        <rect
                                            x={site.x}
                                            y={site.y}
                                            width={site.width}
                                            height={site.height}
                                            rx={10}
                                            fill="rgba(15, 23, 42, 0.95)"
                                            stroke={isKelCore ? "#f59e0b" : isHub ? "#eab308" : "#3b82f6"}
                                            strokeWidth={isKelCore ? 2 : 1.5}
                                            filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
                                            className="group-hover:stroke-cyan-300 group-hover:brightness-125 transition"
                                        />
                                        {/* Accent Strip */}
                                        <path
                                            d={`M ${site.x} ${site.y + 8} A 8 8 0 0 1 ${site.x + 8} ${site.y} L ${site.x + 4} ${site.y} L ${site.x + 4} ${site.y + site.height} L ${site.x + 8} ${site.y + site.height} A 8 8 0 0 1 ${site.x} ${site.y + site.height - 8} Z`}
                                            fill={isKelCore ? "#f59e0b" : isHub ? "#eab308" : "#3b82f6"}
                                        />
                                        <title>{`${site.siteCode}${site.siteName ? ` — ${site.siteName}` : ""}${isHub ? " (Enterprise Hub • Click to Drill Down)" : ` (${site.deviceCount} Switches)`}`}</title>
                                        
                                        {/* Site Code (Prominent emphasis, no 'SITE:' prefix) */}
                                        <text x={site.x + 14} y={site.y + 22} fill="#ffffff" fontSize={13} fontWeight="bold" fontFamily="monospace">
                                            {site.siteCode}
                                            {isKelCore && (
                                                <tspan fill="#38bdf8" fontSize={9} fontWeight="bold"> (CORE)</tspan>
                                            )}
                                        </text>

                                        {/* Hub Designation Badge / Toggle */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleDesignatedHub(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition"
                                            transform={`translate(${site.x + (isKelCore ? 96 : 58)}, ${site.y + 7})`}
                                            title={isHub ? "Enterprise Hub (Click to remove)" : "Click to mark as Enterprise Hub"}
                                        >
                                            <rect
                                                x={0}
                                                y={0}
                                                width={isHub ? 52 : 62}
                                                height={17}
                                                rx={4}
                                                fill={isHub ? "rgba(245, 158, 11, 0.25)" : "rgba(148, 163, 184, 0.12)"}
                                                stroke={isHub ? "#f59e0b" : "rgba(148, 163, 184, 0.3)"}
                                                strokeWidth={0.8}
                                            />
                                            <text
                                                x={isHub ? 26 : 31}
                                                y={12}
                                                fill={isHub ? "#f59e0b" : "#94a3b8"}
                                                fontSize={8.5}
                                                fontWeight="bold"
                                                textAnchor="middle"
                                                fontFamily="sans-serif"
                                            >
                                                {isHub ? "★ HUB" : "+ Make Hub"}
                                            </text>
                                        </g>

                                        {/* Site Name (Appears below Site Code with clean styling) */}
                                        {site.siteName && (
                                            <text 
                                                x={site.x + 14} 
                                                y={site.y + (isHub ? 39 : 37)} 
                                                fill="#7dd3fc" 
                                                fontSize={isHub ? 10 : 9.5} 
                                                fontWeight="500" 
                                                fontFamily="sans-serif"
                                            >
                                                {site.siteName.length > 34 ? site.siteName.slice(0, 32) + "…" : site.siteName}
                                            </text>
                                        )}

                                        {/* Uplinks Toggle Button on Collapsed Site */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleSiteUplinks(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-95 transition"
                                            transform={`translate(${site.x + site.width - 116}, ${site.y + (isHub ? 8 : 11)})`}
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

                                        {/* Edit Site Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onEditSite) onEditSite(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-100 opacity-60 transition"
                                            transform={`translate(${site.x + site.width - 48}, ${site.y + (isHub ? 8 : 11)})`}
                                            title={`Edit ${site.siteCode} (${site.siteName || "Details"})`}
                                        >
                                            <rect x={0} y={0} width={18} height={18} rx={4} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" strokeWidth={0.8} />
                                            <path d="M 4 14 L 5.5 10.5 L 11 5 L 13 7 L 7.5 12.5 Z" fill="none" stroke="#38bdf8" strokeWidth={1} />
                                        </g>

                                        {/* Expand Chevron Icon Badge */}
                                        <g transform={`translate(${site.x + site.width - 24}, ${site.y + (isHub ? 9 : 12)})`}>
                                            <circle cx={6} cy={6} r={8} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={0.8} />
                                            <text x={6} y={9.5} fill="#60a5fa" fontSize={10} fontWeight="bold" textAnchor="middle">
                                                ▾
                                            </text>
                                        </g>

                                        {/* Switch Census (only shown on non-hub sites; hubs stay simple and executive) */}
                                        {!isHub && (
                                            <text
                                                x={site.x + 14}
                                                y={site.y + (site.siteName ? 57 : 46)}
                                                fill="#94a3b8"
                                                fontSize={8.5}
                                                fontFamily="monospace"
                                            >
                                                {site.deviceCount === 0 ? (
                                                    <tspan fill="#f59e0b">0 Switches • Pending Discovery Crawl</tspan>
                                                ) : (
                                                    <>
                                                        {site.deviceCount} Switches ({site.l3Count} Core/L3 • {site.l2Count} Access/L2)
                                                        {site.connectedSites && site.connectedSites.length > 0 && ` • ⇄ Peers: ${site.connectedSites.join(", ")}`}
                                                    </>
                                                )}
                                            </text>
                                        )}
                                    </g>
                                );
                            }

                            const isHub = designatedHubs.has(site.siteCode);

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
                                        stroke={isHub ? "rgba(245, 158, 11, 0.6)" : "rgba(71, 85, 105, 0.5)"}
                                        strokeWidth={isHub ? 2 : 1.5}
                                        strokeDasharray="6,4"
                                        onPointerDown={(e) => handleStartDragSite(e, site.siteCode)}
                                        style={{ cursor: "grab" }}
                                    />

                                    {/* Site Header Bar */}
                                    <g 
                                        transform={`translate(${site.x + 14}, ${site.y + 16})`}
                                        onPointerDown={(e) => handleStartDragSite(e, site.siteCode)}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            if (onEditSite) onEditSite(site.siteCode);
                                        }}
                                        style={{ cursor: "grab" }}
                                    >
                                        <rect x={0} y={-2} width={28} height={20} rx={5} fill="rgba(59, 130, 246, 0.2)" stroke="#3b82f6" strokeWidth={0.8} />
                                        <text x={14} y={12} fill="#60a5fa" fontSize={11} fontWeight="bold" textAnchor="middle" fontFamily="monospace">
                                            {site.siteCode}
                                        </text>

                                        <text x={36} y={12} fill="#ffffff" fontSize={12} fontWeight="bold" fontFamily="monospace">
                                            {site.siteCode}
                                            {site.siteCode === "KEL" && (
                                                <tspan fill="#38bdf8" fontSize={10} fontWeight="bold"> (CORE)</tspan>
                                            )}
                                            {site.siteName && (
                                                <tspan fill="#7dd3fc" fontWeight="normal" fontFamily="sans-serif"> — {site.siteName}</tspan>
                                            )}
                                        </text>

                                        {/* Hub Toggle on Expanded Header */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleDesignatedHub(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition"
                                            transform={`translate(${Math.min(site.width - 290, 260)}, -2)`}
                                            title={isHub ? "Enterprise Hub (Click to remove)" : "Click to mark as Enterprise Hub"}
                                        >
                                            <rect
                                                x={0}
                                                y={0}
                                                width={isHub ? 52 : 62}
                                                height={18}
                                                rx={4}
                                                fill={isHub ? "rgba(245, 158, 11, 0.25)" : "rgba(148, 163, 184, 0.12)"}
                                                stroke={isHub ? "#f59e0b" : "rgba(148, 163, 184, 0.3)"}
                                                strokeWidth={0.8}
                                            />
                                            <text
                                                x={isHub ? 26 : 31}
                                                y={12.5}
                                                fill={isHub ? "#f59e0b" : "#94a3b8"}
                                                fontSize={8.5}
                                                fontWeight="bold"
                                                textAnchor="middle"
                                                fontFamily="sans-serif"
                                            >
                                                {isHub ? "★ HUB" : "+ Make Hub"}
                                            </text>
                                        </g>

                                        <text x={site.width - 190} y={12} fill="#64748b" fontSize={10} fontFamily="monospace" textAnchor="end">
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
                                            transform={`translate(${site.width - 180}, -3)`}
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

                                        {/* Quick Return to Overview Button (if in drill-down) */}
                                        {activeDrillHub === site.siteCode && (
                                            <g
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleResetOverview();
                                                }}
                                                className="cursor-pointer hover:opacity-90 transition"
                                                transform={`translate(${site.width - 108}, -3)`}
                                                title="Return to Enterprise Backbone Overview"
                                            >
                                                <rect x={0} y={0} width={62} height={20} rx={5} fill="rgba(56, 189, 248, 0.2)" stroke="#38bdf8" strokeWidth={0.8} />
                                                <text x={31} y={13.5} fill="#38bdf8" fontSize={9} fontWeight="bold" textAnchor="middle">
                                                    ⤺ Overview
                                                </text>
                                            </g>
                                        )}

                                        {/* Edit Site Button on Expanded Header */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onEditSite) onEditSite(site.siteCode);
                                            }}
                                            className="cursor-pointer hover:opacity-100 opacity-70 transition"
                                            transform={`translate(${site.width - 66}, -3)`}
                                            title={`Edit ${site.siteCode} (${site.siteName || "Details"})`}
                                        >
                                            <rect x={0} y={0} width={20} height={20} rx={5} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.2)" strokeWidth={0.8} />
                                            <path d="M 5 15 L 6.5 11.5 L 12 6 L 14 8 L 8.5 13.5 Z" fill="none" stroke="#38bdf8" strokeWidth={1} />
                                        </g>

                                        {/* Collapse Site Button */}
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (activeDrillHub === site.siteCode) {
                                                    handleResetOverview();
                                                } else {
                                                    toggleCollapseSite(site.siteCode);
                                                }
                                            }}
                                            className="cursor-pointer hover:opacity-80 transition"
                                            transform={`translate(${site.width - 40}, -3)`}
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
                                                    title={`IDF ${idf.idfCode} (${idf.deviceCount} ${idf.deviceCount === 1 ? "Switch" : "Switches"}) - Click to expand`}
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
                                                    <text
                                                        x={idf.x + idf.width / 2}
                                                        y={idf.y + idf.height / 2 + 4}
                                                        fill="#e2e8f0"
                                                        fontSize={12}
                                                        fontWeight="bold"
                                                        fontFamily="monospace"
                                                        textAnchor="middle"
                                                        className="group-hover:fill-sky-300 transition-colors select-none"
                                                    >
                                                        {idf.idfCode}
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
                                                        {idf.idfCode}
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
                            const p1 = (bundle as any).srcPointOverride || getDevPoint(bundle.sourceDevice, bundle.targetDevice);
                            const p2 = (bundle as any).tgtPointOverride || getDevPoint(bundle.targetDevice, bundle.sourceDevice);
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

                                    {/* Link Midpoint (subtle indicator only when highlighted; no pills) */}
                                    {isHighlighted && (
                                        <circle
                                            cx={midX}
                                            cy={midY}
                                            r={4}
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
                            const archetype = getDeviceArchetype(dev);

                            const CARD_W = nodeDensity === "compact" ? 138 : 172;
                            const CARD_H = nodeDensity === "compact" ? 50 : 74;

                            // Node Color scheme based on Archetype vs Unverified vs Unreachable vs Multi-Closet Conflict
                            let borderColor = isSelected ? "#ffffff" : isHop ? "#fbbf24" : archetype.primaryColor;
                            let borderDash: string | undefined = undefined;
                            let cardBg = archetype.bgGradient;

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
                            }

                            const isFaded = fadedNodes.has(canonHost) || fadedNodes.has(dev.hostname);
                            const isOffTracePath = Boolean(traceResult && activePathDeviceSet.size > 0 && !activePathDeviceSet.has(canonHost));
                            const isOnTracePath = Boolean(traceResult && activePathDeviceSet.size > 0 && activePathDeviceSet.has(canonHost));
                            if (isOnTracePath) {
                                borderColor = "#22d3ee";
                            }

                            return (
                                <g
                                    key={nodeKey}
                                    transform={`translate(${pos.x}, ${pos.y})`}
                                    onClick={(e) => handleNodeClick(e, dev)}
                                    opacity={isOffTracePath ? 0.12 : isFaded ? 0.22 : 1}
                                    filter={isOnTracePath ? "drop-shadow(0 0 16px rgba(6, 182, 212, 0.95))" : undefined}
                                    className={isFaded || isOffTracePath
                                        ? "cursor-pointer hover:opacity-75 transition-opacity" 
                                        : "cursor-pointer group"
                                    }
                                >
                                    <title>{`${canonHost}${dev.platform ? ` [${dev.platform}]` : ""} • ${archetype.label} (${archetype.archetype})${isMultiConflict ? " • Multi-Closet Conflict" : ""}${dev.isVendorManaged ? " • Vendor Managed" : ""}`}</title>
                                    
                                    {/* 3D Stack Chassis Under-Layers (StackWise Visualization) */}
                                    {stackInfo.isStack && (
                                        <g opacity={isFaded ? 0.3 : 0.85}>
                                            <rect
                                                x={-CARD_W / 2 + 4}
                                                y={-CARD_H / 2 - 4}
                                                width={CARD_W - 8}
                                                height={CARD_H}
                                                rx={archetype.shape === "cylinder" ? (nodeDensity === "compact" ? 12 : 15) : 6}
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
                                                    rx={archetype.shape === "cylinder" ? (nodeDensity === "compact" ? 10 : 13) : 5}
                                                    fill="#050b14"
                                                    stroke="rgba(168, 85, 247, 0.3)"
                                                    strokeWidth={0.8}
                                                />
                                            )}
                                        </g>
                                    )}

                                    {/* Selection or Traced Hop Highlight Halo */}
                                    {(isSelected || isHop) && (
                                        <rect
                                            x={-CARD_W / 2 - 4}
                                            y={-CARD_H / 2 - 4}
                                            width={CARD_W + 8}
                                            height={CARD_H + 8}
                                            rx={archetype.shape === "cylinder" ? (nodeDensity === "compact" ? 18 : 22) : 10}
                                            fill="none"
                                            stroke={isHop ? "#f59e0b" : "#38bdf8"}
                                            strokeWidth={2.5}
                                            strokeDasharray={isHop ? "4,3" : undefined}
                                            className={isHop ? "animate-pulse" : ""}
                                            opacity={0.9}
                                        />
                                    )}

                                    {/* Dynamic Archetype Chassis Body Silhouette */}
                                    {archetype.shape === "cylinder" ? (
                                        /* 1. ROUTER: Cisco Cylindrical Pill Profile */
                                        <rect
                                            x={-CARD_W / 2}
                                            y={-CARD_H / 2}
                                            width={CARD_W}
                                            height={CARD_H}
                                            rx={nodeDensity === "compact" ? 14 : 18}
                                            fill={cardBg}
                                            stroke={borderColor}
                                            strokeWidth={isSelected || isHop ? 2 : 1.3}
                                            strokeDasharray={borderDash}
                                            className="transition-all duration-150 group-hover:brightness-125"
                                            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                        />
                                    ) : archetype.shape === "chamfer" ? (
                                        /* 2. L3 CORE: Industrial Chamfered Octagonal Chassis */
                                        <path
                                            d={`M ${-CARD_W / 2 + 10} ${-CARD_H / 2} 
                                               L ${CARD_W / 2 - 10} ${-CARD_H / 2} 
                                               L ${CARD_W / 2} ${-CARD_H / 2 + 10} 
                                               L ${CARD_W / 2} ${CARD_H / 2 - 10} 
                                               L ${CARD_W / 2 - 10} ${CARD_H / 2} 
                                               L ${-CARD_W / 2 + 10} ${CARD_H / 2} 
                                               L ${-CARD_W / 2} ${CARD_H / 2 - 10} 
                                               L ${-CARD_W / 2} ${-CARD_H / 2 + 10} Z`}
                                            fill={cardBg}
                                            stroke={borderColor}
                                            strokeWidth={isSelected || isHop ? 2 : 1.3}
                                            strokeDasharray={borderDash}
                                            className="transition-all duration-150 group-hover:brightness-125"
                                            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                        />
                                    ) : archetype.shape === "controller" ? (
                                        /* 3. WLC: Antenna Apex Chassis Profile */
                                        <path
                                            d={`M ${-CARD_W / 2 + 8} ${-CARD_H / 2}
                                               L ${-14} ${-CARD_H / 2}
                                               A 14 14 0 0 1 14 ${-CARD_H / 2}
                                               L ${CARD_W / 2 - 8} ${-CARD_H / 2}
                                               A 8 8 0 0 1 ${CARD_W / 2} ${-CARD_H / 2 + 8}
                                               L ${CARD_W / 2} ${CARD_H / 2 - 8}
                                               A 8 8 0 0 1 ${CARD_W / 2 - 8} ${CARD_H / 2}
                                               L ${-CARD_W / 2 + 8} ${CARD_H / 2}
                                               A 8 8 0 0 1 ${-CARD_W / 2} ${CARD_H / 2 - 8}
                                               L ${-CARD_W / 2} ${-CARD_H / 2 + 8}
                                               A 8 8 0 0 1 ${-CARD_W / 2 + 8} ${-CARD_H / 2} Z`}
                                            fill={cardBg}
                                            stroke={borderColor}
                                            strokeWidth={isSelected || isHop ? 2 : 1.3}
                                            strokeDasharray={borderDash}
                                            className="transition-all duration-150 group-hover:brightness-125"
                                            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                        />
                                    ) : archetype.shape === "shield" ? (
                                        /* 4. FIREWALL: Security Shield Perimeter Profile */
                                        <path
                                            d={`M ${-CARD_W / 2 + 8} ${-CARD_H / 2}
                                               L ${CARD_W / 2 - 8} ${-CARD_H / 2}
                                               A 8 8 0 0 1 ${CARD_W / 2} ${-CARD_H / 2 + 8}
                                               L ${CARD_W / 2} ${CARD_H / 2 - 12}
                                               L ${CARD_W / 2 - 12} ${CARD_H / 2}
                                               L ${-CARD_W / 2 + 12} ${CARD_H / 2}
                                               L ${-CARD_W / 2} ${CARD_H / 2 - 12}
                                               L ${-CARD_W / 2} ${-CARD_H / 2 + 8}
                                               A 8 8 0 0 1 ${-CARD_W / 2 + 8} ${-CARD_H / 2} Z`}
                                            fill={cardBg}
                                            stroke={borderColor}
                                            strokeWidth={isSelected || isHop ? 2 : 1.3}
                                            strokeDasharray={borderDash}
                                            className="transition-all duration-150 group-hover:brightness-125"
                                            filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                        />
                                    ) : (
                                        /* 5. ACCESS SWITCH: Rack-Mount Faceplate with Ear Screws */
                                        <g>
                                            <rect
                                                x={-CARD_W / 2}
                                                y={-CARD_H / 2}
                                                width={CARD_W}
                                                height={CARD_H}
                                                rx={6}
                                                fill={cardBg}
                                                stroke={borderColor}
                                                strokeWidth={isSelected || isHop ? 2 : 1.2}
                                                strokeDasharray={borderDash}
                                                className="transition-all duration-150 group-hover:brightness-125"
                                                filter="drop-shadow(0 4px 10px rgba(0,0,0,0.6))"
                                            />
                                            {/* Rack mounting ear screws */}
                                            <circle cx={-CARD_W / 2 + 4} cy={-CARD_H / 2 + 8} r={1.2} fill="#475569" />
                                            <circle cx={-CARD_W / 2 + 4} cy={CARD_H / 2 - 8} r={1.2} fill="#475569" />
                                            <circle cx={CARD_W / 2 - 4} cy={-CARD_H / 2 + 8} r={1.2} fill="#475569" />
                                            <circle cx={CARD_W / 2 - 4} cy={CARD_H / 2 - 8} r={1.2} fill="#475569" />
                                        </g>
                                    )}

                                    {/* Cisco Standard Archetype Emblem Glyph */}
                                    {nodeDensity === "compact" ? (
                                        archetype.archetype === "ROUTER" ? (
                                            <RouterGlyph x={-CARD_W / 2 + 16} y={0} size={18} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "L3_CORE" ? (
                                            <MultilayerGlyph x={-CARD_W / 2 + 16} y={0} size={17} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "WLC" ? (
                                            <WlcGlyph x={-CARD_W / 2 + 16} y={0} size={18} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "FIREWALL" ? (
                                            <FirewallGlyph x={-CARD_W / 2 + 16} y={0} size={18} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : (
                                            <SwitchGlyph x={-CARD_W / 2 + 16} y={0} size={17} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        )
                                    ) : (
                                        archetype.archetype === "ROUTER" ? (
                                            <RouterGlyph x={-CARD_W / 2 + 18} y={-CARD_H / 2 + 20} size={20} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "L3_CORE" ? (
                                            <MultilayerGlyph x={-CARD_W / 2 + 18} y={-CARD_H / 2 + 20} size={19} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "WLC" ? (
                                            <WlcGlyph x={-CARD_W / 2 + 18} y={-CARD_H / 2 + 20} size={20} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : archetype.archetype === "FIREWALL" ? (
                                            <FirewallGlyph x={-CARD_W / 2 + 18} y={-CARD_H / 2 + 20} size={20} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        ) : (
                                            <SwitchGlyph x={-CARD_W / 2 + 18} y={-CARD_H / 2 + 20} size={19} color={isUnreachable ? "#ef4444" : archetype.primaryColor} />
                                        )
                                    )}

                                    {/* COMPACT DENSITY MODE LAYOUT */}
                                    {nodeDensity === "compact" ? (
                                        <>
                                            {/* Hostname */}
                                            <text
                                                x={-CARD_W / 2 + 30}
                                                y={-CARD_H / 2 + 16}
                                                fill="#ffffff"
                                                fontSize={10}
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                            >
                                                {canonHost.length > 12 ? canonHost.slice(0, 11) + "…" : canonHost}
                                            </text>

                                            {/* IP Address */}
                                            <text
                                                x={-CARD_W / 2 + 30}
                                                y={-CARD_H / 2 + 29}
                                                fill="#94a3b8"
                                                fontSize={8.5}
                                                fontFamily="monospace"
                                            >
                                                {dev.ipAddress || dev.ip_address || "No IP"}
                                            </text>

                                            {/* Sub-label: IDF & Stack Info */}
                                            <text
                                                x={-CARD_W / 2 + 30}
                                                y={-CARD_H / 2 + 41}
                                                fill="#64748b"
                                                fontSize={7.5}
                                                fontFamily="monospace"
                                            >
                                                {site} • {idf} {stackInfo.isStack ? `• ${stackInfo.stackSize}x` : ""}
                                            </text>

                                            {/* Archetype / Status Mini Badge (Top-Right) */}
                                            <g transform={`translate(${CARD_W / 2 - 32}, ${-CARD_H / 2 + 6})`}>
                                                <rect
                                                    x={0}
                                                    y={0}
                                                    width={24}
                                                    height={12}
                                                    rx={3}
                                                    fill={isUnverified ? "rgba(245, 158, 11, 0.2)" : `${archetype.primaryColor}25`}
                                                    stroke={isUnverified ? "#f59e0b" : archetype.primaryColor}
                                                    strokeWidth={0.8}
                                                />
                                                <text
                                                    x={12}
                                                    y={8.5}
                                                    fill={isUnverified ? "#fbbf24" : archetype.accentColor}
                                                    fontSize={7}
                                                    fontWeight="bold"
                                                    fontFamily="monospace"
                                                    textAnchor="middle"
                                                >
                                                    {isUnverified ? "BND" : archetype.label}
                                                </text>
                                            </g>
                                        </>
                                    ) : (
                                        /* STANDARD DETAILED MODE LAYOUT */
                                        <>
                                            {/* Top-Right Badges: Stack Size & Archetype Chip */}
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
                                                        fill={dev.isVendorManaged ? "rgba(168, 85, 247, 0.2)" : isMultiConflict ? "rgba(245, 158, 11, 0.25)" : isUnverified ? "rgba(245, 158, 11, 0.2)" : `${archetype.primaryColor}25`}
                                                        stroke={dev.isVendorManaged ? "#a855f7" : isMultiConflict ? "#f59e0b" : isUnverified ? "#f59e0b" : archetype.primaryColor}
                                                        strokeWidth={0.8}
                                                    />
                                                    <text
                                                        x={isMultiConflict ? 20 : 11}
                                                        y={9.5}
                                                        fill={dev.isVendorManaged ? "#d8b4fe" : isMultiConflict ? "#fbbf24" : isUnverified ? "#fbbf24" : archetype.accentColor}
                                                        fontSize={isMultiConflict ? 6.8 : 8}
                                                        fontWeight="bold"
                                                        fontFamily="monospace"
                                                        textAnchor="middle"
                                                    >
                                                        {dev.isVendorManaged ? "VND" : isMultiConflict ? "CONFLICT" : isUnverified ? "BND" : archetype.label}
                                                    </text>
                                                </g>
                                            </g>

                                            {/* Device Hostname */}
                                            <text
                                                x={-CARD_W / 2 + 34}
                                                y={-CARD_H / 2 + 18}
                                                fill="#ffffff"
                                                fontSize={11.5}
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                            >
                                                {canonHost.length > 13 ? canonHost.slice(0, 12) + "…" : canonHost}
                                            </text>

                                            {/* Device IP Address */}
                                            <text
                                                x={-CARD_W / 2 + 34}
                                                y={-CARD_H / 2 + 32}
                                                fill="#94a3b8"
                                                fontSize={9.5}
                                                fontFamily="monospace"
                                            >
                                                {dev.ipAddress || dev.ip_address || "No IP"}
                                                {dev.allIps && dev.allIps.length > 1 ? ` (+${dev.allIps.length - 1})` : ""}
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

                                            {/* Front-Panel LED Activity Strip (Hardware rack simulation) */}
                                            {!isUnreachable && (
                                                <g transform={`translate(${-CARD_W / 2 + 14}, ${CARD_H / 2 - 19})`} opacity={0.85}>
                                                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
                                                        const isUplinkLed = i >= 6;
                                                        const ledColor = isUplinkLed ? "#38bdf8" : "#10b981";
                                                        return (
                                                            <circle
                                                                key={i}
                                                                cx={i * 5}
                                                                cy={0}
                                                                r={1.2}
                                                                fill={ledColor}
                                                                className={i % 3 === 0 ? "animate-pulse" : ""}
                                                            />
                                                        );
                                                    })}
                                                </g>
                                            )}

                                            {/* Last Verified Date Sub-label */}
                                            <g transform={`translate(${-CARD_W / 2 + 14}, ${CARD_H / 2 - 8})`}>
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
                                        </>
                                    )}

                                    {/* Quick Crawl Initiation button on card */}
                                    {onReseedDevice && !isUnreachable && (
                                        <g
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onReseedDevice(dev);
                                            }}
                                            className="cursor-pointer hover:opacity-100 transition opacity-75 hover:scale-110"
                                            transform={`translate(${CARD_W / 2 - (nodeDensity === "compact" ? 34 : 38)}, ${CARD_H / 2 - (nodeDensity === "compact" ? 17 : 20)})`}
                                        >
                                            <title>{`Initiate crawl seeding from ${canonHost} (${dev.ipAddress || dev.ip_address || "Mgmt IP"})`}</title>
                                            <rect 
                                                x={0} 
                                                y={0} 
                                                width={nodeDensity === "compact" ? 13 : 15} 
                                                height={nodeDensity === "compact" ? 13 : 15} 
                                                rx={3} 
                                                fill={isUnverified ? "rgba(245, 158, 11, 0.2)" : "rgba(14, 165, 233, 0.2)"} 
                                                stroke={isUnverified ? "#f59e0b" : "#38bdf8"} 
                                                strokeWidth={0.8} 
                                            />
                                            <CrawlIcon 
                                                x={nodeDensity === "compact" ? 1 : 1.5} 
                                                y={nodeDensity === "compact" ? 1 : 1.5} 
                                                size={nodeDensity === "compact" ? 11 : 12} 
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
                                        transform={`translate(${CARD_W / 2 - (nodeDensity === "compact" ? 18 : 20)}, ${CARD_H / 2 - (nodeDensity === "compact" ? 17 : 20)})`}
                                    >
                                        <rect 
                                            x={0} 
                                            y={0} 
                                            width={nodeDensity === "compact" ? 13 : 15} 
                                            height={nodeDensity === "compact" ? 13 : 15} 
                                            rx={3} 
                                            fill="rgba(15, 23, 42, 0.9)" 
                                            stroke={isFaded ? "#f59e0b" : "rgba(148, 163, 184, 0.4)"} 
                                            strokeWidth={0.8} 
                                        />
                                        {isFaded ? (
                                            <g transform={nodeDensity === "compact" ? "translate(1.5, 1.5) scale(0.85)" : "translate(2, 2)"}>
                                                <path d="M1 1l9 9M4.5 4.5a2 2 0 0 0 2.8 2.8M1 5.5a5.5 5.5 0 0 1 9.5-2.8M10.5 5.5a5.5 5.5 0 0 1-9.5 2.8" stroke="#f59e0b" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                            </g>
                                        ) : (
                                            <g transform={nodeDensity === "compact" ? "translate(1.5, 1.5) scale(0.85)" : "translate(2, 2)"}>
                                                <path d="M1 5.5s2-3.5 4.5-3.5 4.5 3.5 4.5 3.5-2 3.5-4.5 3.5-4.5-3.5-4.5-3.5z" stroke="#94a3b8" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                                                <circle cx="5.5" cy="5.5" r="1.3" stroke="#94a3b8" strokeWidth="1" fill="none" />
                                            </g>
                                        )}
                                    </g>

                                    {/* Spotlight Beacon Radar Effect */}
                                    {spotlightBeaconDevice === canonHost && (
                                        <g className="pointer-events-none">
                                            <circle cx={0} cy={0} r={CARD_W / 1.5} fill="none" stroke="#38bdf8" strokeWidth="3" className="animate-ping" opacity="0.8" />
                                            <circle cx={0} cy={0} r={CARD_W} fill="none" stroke="#0ea5e9" strokeWidth="2" className="animate-pulse" opacity="0.6" />
                                        </g>
                                    )}

                                    {/* Active Trace Hop Beacon */}
                                    {activeTraceHopDevice === canonHost && (
                                        <g className="pointer-events-none">
                                            <circle cx={0} cy={0} r={CARD_W / 1.6} fill="rgba(6, 182, 212, 0.25)" stroke="#22d3ee" strokeWidth="3.5" className="animate-pulse" />
                                            <circle cx={0} cy={0} r={CARD_W / 1.2} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeDasharray="6 4" className="animate-spin" />
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </g>
                </svg>
            </div>

            {/* Save Layout View Modal */}
            {isSaveViewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="glass-card w-full max-w-sm border border-white/20 p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-sky-400" />
                            Save Layout View
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Save the current dragged node positions so other team members can load this exact layout.
                        </p>
                        <input
                            type="text"
                            value={newViewName}
                            onChange={e => setNewViewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                            placeholder="View Name (e.g. Core Backbone Clean)"
                            autoFocus
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white mb-2"
                        />
                        <input
                            type="text"
                            value={newViewDescription}
                            onChange={e => setNewViewDescription(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveView()}
                            placeholder="Description (optional)"
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsSaveViewModalOpen(false)}
                                className="px-3 py-1.5 text-xs text-muted hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveView}
                                disabled={savingView || !newViewName.trim()}
                                className="px-3.5 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-primary/80 text-black rounded-lg transition-all shadow-md cursor-pointer"
                            >
                                {savingView ? "Saving..." : "Save View"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

            {/* Global Spotlight Search & Endpoint Locator Modal */}
            {isSpotlightOpen && (
                <div 
                    className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
                    onClick={() => setIsSpotlightOpen(false)}
                >
                    <div 
                        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Search Input Bar */}
                        <div className="px-4 py-3.5 border-b border-slate-800 bg-slate-950 flex items-center gap-3">
                            <Search className="w-5 h-5 text-amber-400 shrink-0" />
                            <input
                                type="text"
                                autoFocus
                                value={spotlightQuery}
                                onChange={(e) => {
                                    setSpotlightQuery(e.target.value);
                                    setSpotlightLocateResult(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && spotlightQuery.trim()) {
                                        handleLocateEndpoint(spotlightQuery);
                                    }
                                }}
                                placeholder="Search hostname, IP, MAC address, serial, or closet (e.g. 10.240.12.55, kel-core-sw1, Te1/1/1)..."
                                className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
                            />
                            {spotlightQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSpotlightQuery("");
                                        setSpotlightLocateResult(null);
                                    }}
                                    className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-slate-800">
                                <kbd className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 border border-slate-700 font-mono">ESC</kbd>
                            </div>
                        </div>

                        {/* Subnet / Endpoint Resolution Banner */}
                        {(spotlightQuery.trim().includes(".") || spotlightQuery.trim().includes(":") || spotlightQuery.trim().length === 12) && (
                            <div className="px-4 py-2.5 bg-cyan-950/40 border-b border-cyan-800/40 flex items-center justify-between text-xs text-cyan-200">
                                <div className="flex items-center gap-2">
                                    <Radio className="w-4 h-4 text-cyan-400 shrink-0 animate-pulse" />
                                    <span>IP / MAC pattern detected: Query switch SVIs, ARP tables, and MAC tables.</span>
                                </div>
                                <button
                                    type="button"
                                    disabled={isLocating}
                                    onClick={() => handleLocateEndpoint(spotlightQuery)}
                                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer shrink-0"
                                >
                                    {isLocating ? (
                                        <>
                                            <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                                            Resolving...
                                        </>
                                    ) : (
                                        <>
                                            <Search className="w-3 h-3" />
                                            Locate SVI & Port
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {/* Results Container */}
                        <div className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
                            {/* Endpoint Locator Card (if resolved) */}
                            {spotlightLocateResult && (
                                <div className="p-3.5 rounded-xl bg-slate-950 border border-cyan-500/40 shadow-lg space-y-2.5">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                                {spotlightLocateResult.type || "LOCATED"}
                                            </span>
                                            <span className="text-white font-mono font-semibold">{spotlightLocateResult.query}</span>
                                        </div>
                                        {spotlightLocateResult.focalDevice?.hostname && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    panToSwitch(spotlightLocateResult.focalDevice.hostname);
                                                    setIsSpotlightOpen(false);
                                                }}
                                                className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                                            >
                                                <Sparkles className="w-3 h-3" />
                                                <span>Spotlight on Map</span>
                                            </button>
                                        )}
                                    </div>

                                    {spotlightLocateResult.gateway && (
                                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Default Gateway (Actual SVI)</span>
                                                <span className="text-amber-300 font-mono font-bold">
                                                    {spotlightLocateResult.gateway.sviIp} {spotlightLocateResult.gateway.cidr}
                                                </span>
                                                <span className="text-slate-500 text-[10px] block">({spotlightLocateResult.gateway.sviName})</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Gateway Switch</span>
                                                <span className="text-white font-semibold">{spotlightLocateResult.gateway.hostname}</span>
                                                <span className="text-slate-400 text-[10px] block">{spotlightLocateResult.gateway.site} / {spotlightLocateResult.gateway.idf || "MDF"}</span>
                                            </div>
                                        </div>
                                    )}

                                    {spotlightLocateResult.edgeDevice && (
                                        <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Edge Access Switch</span>
                                                <span className="text-cyan-300 font-semibold">{spotlightLocateResult.edgeDevice.hostname}</span>
                                                <span className="text-slate-400 text-[10px] block">{spotlightLocateResult.edgeDevice.site} / {spotlightLocateResult.edgeDevice.idf}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] uppercase font-bold">Access Switchport</span>
                                                <span className="text-emerald-300 font-mono font-bold">{spotlightLocateResult.edgeDevice.port || "Resolved via ARP"}</span>
                                                {spotlightLocateResult.macAddress && (
                                                    <span className="text-slate-400 text-[10px] font-mono block">MAC: {spotlightLocateResult.macAddress}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <p className="text-[11px] text-slate-300 italic">{spotlightLocateResult.message}</p>
                                </div>
                            )}

                            {/* Instant Device Search Results */}
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    {spotlightQuery ? "Matching Devices in Topology" : "All Devices (Type to filter)"}
                                </span>
                                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                    {unifiedDevices
                                        .filter(dev => {
                                            if (!spotlightQuery.trim()) return true;
                                            const q = spotlightQuery.toLowerCase();
                                            return (dev.canonicalHostname || dev.hostname || "").toLowerCase().includes(q) ||
                                                   (dev.ipAddress || "").toLowerCase().includes(q) ||
                                                   (dev.site || "").toLowerCase().includes(q) ||
                                                   (dev.idf || "").toLowerCase().includes(q) ||
                                                   (dev.platform || "").toLowerCase().includes(q) ||
                                                   (dev.serialNumber || "").toLowerCase().includes(q);
                                        })
                                        .slice(0, 15)
                                        .map(dev => {
                                            const canon = dev.canonicalHostname || getCanonicalHostname(dev.hostname);
                                            const archetype = getDeviceArchetype(dev);
                                            return (
                                                <div
                                                    key={canon}
                                                    onClick={() => {
                                                        panToSwitch(dev.hostname);
                                                        setIsSpotlightOpen(false);
                                                    }}
                                                    className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/50 flex items-center justify-between transition cursor-pointer group"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div 
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono"
                                                            style={{ backgroundColor: `${archetype.primaryColor}25`, color: archetype.primaryColor, border: `1px solid ${archetype.primaryColor}50` }}
                                                        >
                                                            {archetype.label}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-white font-semibold group-hover:text-blue-300 transition">{canon}</span>
                                                                <span className="text-slate-500 text-[10px] font-mono">{dev.ipAddress}</span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 flex items-center gap-2">
                                                                <span>{dev.site || "UNK"} • {dev.idf || "MDF"}</span>
                                                                {dev.platform && <span>• {dev.platform}</span>}
                                                                {dev.serialNumber && <span className="font-mono">• SN: {dev.serialNumber}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        className="opacity-0 group-hover:opacity-100 text-blue-400 hover:text-white px-2 py-1 rounded bg-blue-600/20 text-[11px] font-medium transition flex items-center gap-1"
                                                    >
                                                        <Sparkles className="w-3 h-3" />
                                                        <span>Spotlight</span>
                                                    </button>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Visual Path Trace Floating Drawer & Step-Through Player */}
            {(isPathTraceOpen || traceResult) && (
                <div className="absolute top-16 right-4 z-30 w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 text-slate-200">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Zap className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Point-in-Time Path Trace</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setIsPathTraceOpen(false);
                                setTraceResult(null);
                                setIsAutoPlayingTrace(false);
                            }}
                            className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition cursor-pointer"
                            title="Close Path Trace"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Trace Inputs */}
                    <div className="p-3.5 space-y-2.5 text-xs">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Source Host / IP</label>
                                {selectedDevice && (
                                    <button
                                        type="button"
                                        onClick={() => setTraceSource(selectedDevice.canonicalHostname || selectedDevice.hostname)}
                                        className="text-[10px] text-cyan-400 hover:text-white underline cursor-pointer"
                                    >
                                        Use Selected
                                    </button>
                                )}
                            </div>
                            <input
                                type="text"
                                value={traceSource}
                                onChange={(e) => setTraceSource(e.target.value)}
                                placeholder="e.g. kel-core-sw1 or 10.10.10.1"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Destination Host / IP</label>
                                {selectedDevice && (
                                    <button
                                        type="button"
                                        onClick={() => setTraceDest(selectedDevice.canonicalHostname || selectedDevice.hostname)}
                                        className="text-[10px] text-cyan-400 hover:text-white underline cursor-pointer"
                                    >
                                        Use Selected
                                    </button>
                                )}
                            </div>
                            <input
                                type="text"
                                value={traceDest}
                                onChange={(e) => setTraceDest(e.target.value)}
                                placeholder="e.g. crm-fl1-idf1-sw1 or 10.240.12.55"
                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                            />
                        </div>

                        {/* Freshness Badge & Trace Trigger */}
                        <div className="flex items-center justify-between pt-1">
                            {traceResult ? (
                                <div className="flex items-center gap-1.5 text-[10px]">
                                    <Clock className={`w-3.5 h-3.5 ${traceResult.isStale ? "text-amber-400" : "text-emerald-400"}`} />
                                    <span className={traceResult.isStale ? "text-amber-300 font-medium" : "text-emerald-300 font-medium"}>
                                        {traceResult.isStale ? `Routes ${traceResult.snapshotAgeHours}h old (>24h)` : `Routes fresh (${traceResult.snapshotAgeHours}h old)`}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[10px] text-slate-500">Evaluates actual L3 routing table</span>
                            )}

                            <button
                                type="button"
                                disabled={isTracing || !traceSource.trim() || !traceDest.trim()}
                                onClick={handleRunPathTrace}
                                className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-md transition flex items-center gap-1.5 cursor-pointer"
                            >
                                {isTracing ? (
                                    <>
                                        <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                                        Tracing...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-3 h-3" />
                                        Run Trace
                                    </>
                                )}
                            </button>
                        </div>

                        {traceError && (
                            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                                <span>{traceError}</span>
                            </div>
                        )}
                    </div>

                    {/* Step-Through Player (When Path Traced) */}
                    {traceResult && traceResult.hops && traceResult.hops.length > 0 && (
                        <div className="p-3.5 border-t border-slate-800 bg-slate-950/60 space-y-3">
                            {/* Step Player Controls */}
                            <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setActiveTraceHopIndex(0)}
                                    disabled={activeTraceHopIndex === 0}
                                    className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition cursor-pointer"
                                    title="First Hop"
                                >
                                    <SkipBack className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTraceHopIndex(prev => Math.max(0, prev - 1))}
                                    disabled={activeTraceHopIndex === 0}
                                    className="px-2 py-0.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                                >
                                    Prev
                                </button>
                                <span className="text-xs font-mono font-bold text-cyan-300">
                                    Hop {activeTraceHopIndex + 1} of {traceResult.hops.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setActiveTraceHopIndex(prev => Math.min(traceResult.hops.length - 1, prev + 1))}
                                    disabled={activeTraceHopIndex === traceResult.hops.length - 1}
                                    className="px-2 py-0.5 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
                                >
                                    Next
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTraceHopIndex(traceResult.hops.length - 1)}
                                    disabled={activeTraceHopIndex === traceResult.hops.length - 1}
                                    className="p-1 rounded-lg hover:bg-slate-800 disabled:opacity-30 text-slate-300 hover:text-white transition cursor-pointer"
                                    title="Last Hop"
                                >
                                    <SkipForward className="w-3.5 h-3.5" />
                                </button>
                                <div className="h-4 w-[1px] bg-slate-800 mx-0.5"></div>
                                <button
                                    type="button"
                                    onClick={() => setIsAutoPlayingTrace(prev => !prev)}
                                    className={`p-1 rounded-lg transition cursor-pointer ${
                                        isAutoPlayingTrace
                                            ? "bg-cyan-600 text-white shadow-sm"
                                            : "hover:bg-slate-800 text-slate-300 hover:text-white"
                                    }`}
                                    title={isAutoPlayingTrace ? "Pause Auto-Step" : "Auto-Play Step Through"}
                                >
                                    {isAutoPlayingTrace ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 text-cyan-400" />}
                                </button>
                            </div>

                            {/* Active Hop Details Card */}
                            {(() => {
                                const hop = traceResult.hops[activeTraceHopIndex];
                                if (!hop) return null;
                                return (
                                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2 text-xs">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-5 h-5 rounded-full bg-cyan-600 text-white flex items-center justify-center font-bold text-[10px]">
                                                    {hop.hopNumber}
                                                </span>
                                                <span className="font-bold text-white font-mono">{hop.deviceName}</span>
                                            </div>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                                {hop.forwardingType}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                            <div>
                                                <span className="text-slate-400 block text-[9px] uppercase font-bold">Ingress</span>
                                                <span className="font-mono text-slate-200">{hop.ingressInterface || "Source Subnet"}</span>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[9px] uppercase font-bold">Egress</span>
                                                <span className="font-mono text-cyan-300 font-bold">{hop.egressInterface || "Terminal"}</span>
                                            </div>
                                            {hop.matchedRoute && (
                                                <div className="col-span-2 pt-1 border-t border-slate-800">
                                                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Matched Route</span>
                                                    <span className="font-mono text-amber-300 font-semibold">{hop.matchedRoute}</span>
                                                    {hop.routeProtocol && (
                                                        <span className="text-slate-400 ml-1.5 text-[10px]">
                                                            ({hop.routeProtocol === "D" ? "EIGRP" : hop.routeProtocol === "O" ? "OSPF" : hop.routeProtocol === "C" ? "Connected" : hop.routeProtocol})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {hop.nextHopIp && (
                                                <div className="col-span-2">
                                                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Next Hop IP</span>
                                                    <span className="font-mono text-emerald-400 font-bold">{hop.nextHopIp}</span>
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-[11px] text-slate-300 italic">{hop.notes}</p>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
