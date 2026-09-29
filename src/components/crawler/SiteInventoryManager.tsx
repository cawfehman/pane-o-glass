"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { 
    Folder, 
    FolderPlus, 
    FolderOpen, 
    FolderTree,
    ChevronRight, 
    ChevronDown, 
    Plus, 
    Search, 
    Building2, 
    Edit2, 
    Edit3,
    Crosshair, 
    Server,
    Network,
    Cpu,
    Activity,
    Layers,
    Clock,
    Tag,
    Share2,
    Route as RouteIcon,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Compass,
    Check,
    X,
    RefreshCw,
    SlidersHorizontal,
    Star,
    ExternalLink,
    Filter,
    DoorOpen,
    ArrowRight,
    MapPin,
    Eye,
    EyeOff,
    MoreVertical,
    KeyRound,
    Wifi,
    Phone
} from "lucide-react";
import { CrawlIcon } from "./CrawlIcon";
import { SiteMetadataLookup, parseDeviceSiteAndIdf, parseFloorFromIdf, detectSwitchStack } from "./TopologyGraph";
import EditIdfModal from "./EditIdfModal";
import { formatFullVerifiedDate, getInterfaceStatus, classifyCdpNeighbor, CdpDeviceCategory } from "./DeviceInspectorDrawer";

interface SiteInventoryManagerProps {
    devices: any[];
    links: any[];
    siteDirectory?: Record<string, SiteMetadataLookup>;
    onReseedDevice: (dev: any) => void;
    onSelectDevice?: (dev: any) => void;
    onEditSite?: (siteCode: string) => void;
    onAddSite?: (folderPath?: string) => void;
    onRefreshSnapshot?: () => void;
    onNavigateToTopology?: (siteCode?: string) => void;
}

export type FreshnessCategory = "fresh" | "recent" | "stale" | "uncrawled" | "failed";

export interface FreshnessInfo {
    category: FreshnessCategory;
    label: string;
    subLabel: string;
    color: "emerald" | "amber" | "slate" | "red";
    dotClass: string;
    badgeClass: string;
    hoursAgo: number | null;
}

export function getDeviceFreshness(device: any): FreshnessInfo {
    const hasActiveFailure = device.status && device.status !== "REACHABLE" && device.status !== "UNVERIFIED" && Boolean(device.failureReason || device.error);

    const ts = device.lastVerifiedAt || (device.status === "REACHABLE" ? (device.createdAt || device.timestamp) : null);
    
    if (!ts) {
        if (hasActiveFailure) {
            return {
                category: "failed",
                label: "Crawl Failed",
                subLabel: device.failureReason || "Connection failed",
                color: "red",
                dotClass: "bg-red-400",
                badgeClass: "bg-red-950/60 text-red-400 border-red-800/60",
                hoursAgo: null
            };
        }
        return {
            category: "uncrawled",
            label: "Never Crawled",
            subLabel: "No crawl history",
            color: "slate",
            dotClass: "bg-slate-500",
            badgeClass: "bg-slate-900 text-slate-400 border-slate-700/60",
            hoursAgo: null
        };
    }

    const date = new Date(ts);
    const diffMs = Date.now() - date.getTime();
    const hoursAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
    const daysAgo = Math.floor(hoursAgo / 24);

    if (hoursAgo <= 24) {
        const timeStr = hoursAgo === 0 ? "Just now" : `${hoursAgo}h ago`;
        return {
            category: "fresh",
            label: `Fresh (${timeStr})`,
            subLabel: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            color: "emerald",
            dotClass: "bg-emerald-400",
            badgeClass: "bg-emerald-950/60 text-emerald-400 border-emerald-800/60",
            hoursAgo
        };
    } else if (daysAgo <= 7) {
        return {
            category: "recent",
            label: `${daysAgo}d ago`,
            subLabel: date.toLocaleDateString(),
            color: "amber",
            dotClass: "bg-amber-400",
            badgeClass: "bg-amber-950/60 text-amber-400 border-amber-800/60",
            hoursAgo
        };
    } else {
        return {
            category: "stale",
            label: `Stale (${daysAgo}d ago)`,
            subLabel: date.toLocaleDateString(),
            color: "slate",
            dotClass: "bg-slate-400",
            badgeClass: "bg-slate-900 text-slate-400 border-slate-700",
            hoursAgo
        };
    }
}

type SelectedEntity = 
    | { type: "site"; siteCode: string }
    | { type: "idf"; siteCode: string; idfCode: string }
    | { type: "device"; hostname: string }
    | { type: "folder"; folderPath: string };

export default function SiteInventoryManager({
    devices = [],
    links = [],
    siteDirectory = {},
    onReseedDevice,
    onSelectDevice,
    onEditSite,
    onAddSite,
    onRefreshSnapshot,
    onNavigateToTopology
}: SiteInventoryManagerProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [roleFilter, setRoleFilter] = useState<string>("ALL");
    const [freshnessFilter, setFreshnessFilter] = useState<"ALL" | "FRESH" | "RECENT" | "STALE" | "UNCRAWLED" | "FAILED">("ALL");

    // Tree expanded states
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
    const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
    const [expandedIdfs, setExpandedIdfs] = useState<Record<string, boolean>>({});

    // Selection
    const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(() => {
        // Default to KEL if available, or first site
        const codes = Object.keys(siteDirectory);
        if (codes.includes("KEL")) return { type: "site", siteCode: "KEL" };
        if (codes.length > 0) return { type: "site", siteCode: codes[0] };
        return { type: "folder", folderPath: "All" };
    });

    // Modal states
    const [isEditIdfModalOpen, setIsEditIdfModalOpen] = useState(false);
    const [activeEditIdf, setActiveEditIdf] = useState<{ siteCode: string; idfCode: string; devices: any[] } | null>(null);

    // Quick New IDF Modal
    const [isAddIdfModalOpen, setIsAddIdfModalOpen] = useState(false);
    const [newIdfSiteCode, setNewIdfSiteCode] = useState("");
    const [newIdfName, setNewIdfName] = useState("");
    const [newIdfSelectedHosts, setNewIdfSelectedHosts] = useState<string[]>([]);
    const [addIdfSaving, setAddIdfSaving] = useState(false);
    const [addIdfError, setAddIdfError] = useState<string | null>(null);

    // Node Governance Override inline form
    const [editingNodeHost, setEditingNodeHost] = useState<string | null>(null);
    const [overrideSite, setOverrideSite] = useState("");
    const [overrideIdf, setOverrideIdf] = useState("");
    const [overrideRole, setOverrideRole] = useState("");
    const [overrideReason, setOverrideReason] = useState("");
    const [savingOverride, setSavingOverride] = useState(false);
    const [overrideSuccessMsg, setOverrideSuccessMsg] = useState<string | null>(null);
    const [overrideErrorMsg, setOverrideErrorMsg] = useState<string | null>(null);

    // Device Detail Tabs & Filters
    const [deviceActiveTab, setDeviceActiveTab] = useState<"overview" | "interfaces" | "routes" | "vlans" | "cdp">("overview");
    const [deviceStackFilter, setDeviceStackFilter] = useState<string>("ALL");
    const [interfaceSearch, setInterfaceSearch] = useState<string>("");
    const [cdpTypeFilter, setCdpTypeFilter] = useState<CdpDeviceCategory>("ALL");
    const [cdpSearchQuery, setCdpSearchQuery] = useState<string>("");

    // Group devices by site and IDF
    const { siteMap, unassignedDevices, allIdfMap } = useMemo(() => {
        const sMap = new Map<string, {
            siteCode: string;
            siteLookup: SiteMetadataLookup | null;
            idfs: Map<string, any[]>;
            allDevices: any[];
        }>();

        const unassigned: any[] = [];
        const idfLookup = new Map<string, any[]>(); // key: `${siteCode}:${idfCode}`

        // Initialize sites from siteDirectory
        for (const [code, lookup] of Object.entries(siteDirectory)) {
            const upper = code.toUpperCase();
            sMap.set(upper, {
                siteCode: upper,
                siteLookup: lookup,
                idfs: new Map<string, any[]>(),
                allDevices: []
            });
        }

        // Distribute devices
        devices.forEach(dev => {
            const { site: resolvedSite, idf: resolvedIdf } = parseDeviceSiteAndIdf(
                dev.hostname, 
                dev.siteOverride || dev.site, 
                dev.idfOverride || dev.idf
            );

            const upperSite = resolvedSite.toUpperCase();
            const upperIdf = resolvedIdf.toUpperCase();

            let siteEntry = sMap.get(upperSite);
            if (!siteEntry) {
                siteEntry = {
                    siteCode: upperSite,
                    siteLookup: siteDirectory[upperSite] || null,
                    idfs: new Map<string, any[]>(),
                    allDevices: []
                };
                sMap.set(upperSite, siteEntry);
            }

            siteEntry.allDevices.push(dev);

            let idfDevices = siteEntry.idfs.get(upperIdf);
            if (!idfDevices) {
                idfDevices = [];
                siteEntry.idfs.set(upperIdf, idfDevices);
            }
            idfDevices.push(dev);

            const idfKey = `${upperSite}:${upperIdf}`;
            let allIdfDevs = idfLookup.get(idfKey);
            if (!allIdfDevs) {
                allIdfDevs = [];
                idfLookup.set(idfKey, allIdfDevs);
            }
            allIdfDevs.push(dev);
        });

        return { siteMap: sMap, unassignedDevices: unassigned, allIdfMap: idfLookup };
    }, [devices, siteDirectory]);

    // Group sites into folders
    const folderTree = useMemo(() => {
        const root: Record<string, any> = {
            name: "Root",
            subFolders: {},
            sites: []
        };

        const ensureFolder = (path: string) => {
            if (!path) return root;
            const segments = path.split("/").map(s => s.trim()).filter(Boolean);
            let curr = root;
            let accPath = "";
            for (const seg of segments) {
                accPath = accPath ? `${accPath}/${seg}` : seg;
                if (!curr.subFolders[seg]) {
                    curr.subFolders[seg] = {
                        name: seg,
                        fullPath: accPath,
                        subFolders: {},
                        sites: []
                    };
                }
                curr = curr.subFolders[seg];
            }
            return curr;
        };

        for (const [siteCode, entry] of siteMap.entries()) {
            const folderPath = entry.siteLookup?.folderPath || "";
            const targetFolder = ensureFolder(folderPath);
            targetFolder.sites.push(entry);
        }

        return root;
    }, [siteMap]);

    // Auto-expand default items on initial load
    useEffect(() => {
        if (selectedEntity.type === "site") {
            setExpandedSites(prev => ({ ...prev, [selectedEntity.siteCode]: true }));
        } else if (selectedEntity.type === "idf") {
            setExpandedSites(prev => ({ ...prev, [selectedEntity.siteCode]: true }));
            setExpandedIdfs(prev => ({ ...prev, [`${selectedEntity.siteCode}:${selectedEntity.idfCode}`]: true }));
        }
    }, [selectedEntity]);

    // Handle Quick Node Override Save
    const handleSaveNodeOverride = async (canonicalHost: string) => {
        if (!overrideSite.trim()) {
            setOverrideErrorMsg("Site is required.");
            return;
        }
        setSavingOverride(true);
        setOverrideErrorMsg(null);
        setOverrideSuccessMsg(null);

        try {
            const res = await fetch("/api/crawler/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostname: canonicalHost.toLowerCase(),
                    siteOverride: overrideSite.trim().toUpperCase(),
                    idfOverride: overrideIdf.trim().toUpperCase() || undefined,
                    roleOverride: overrideRole.trim() || undefined,
                    reason: overrideReason.trim() || "Assigned via Site Inventory Manager"
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update node override.");

            setOverrideSuccessMsg("Node assignment saved successfully!");
            if (onRefreshSnapshot) onRefreshSnapshot();
            setTimeout(() => {
                setEditingNodeHost(null);
                setOverrideSuccessMsg(null);
            }, 1200);
        } catch (e: any) {
            setOverrideErrorMsg(e.message || "Failed to save node override.");
        } finally {
            setSavingOverride(false);
        }
    };

    // Quick Add IDF to Site
    const handleSaveNewIdf = async () => {
        if (!newIdfName.trim()) {
            setAddIdfError("Closet / IDF name is required (e.g. MDF, 2MC, IDF1).");
            return;
        }
        if (newIdfSelectedHosts.length === 0) {
            setAddIdfError("Please select at least one switch to place in this closet.");
            return;
        }
        setAddIdfSaving(true);
        setAddIdfError(null);

        try {
            const canonicalHosts = newIdfSelectedHosts
                .filter(Boolean)
                .map(h => String(h).split(".")[0].split("(")[0].trim().toLowerCase())
                .filter(Boolean);
            const res = await fetch("/api/crawler/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostnames: canonicalHosts,
                    siteOverride: newIdfSiteCode.toUpperCase(),
                    idfOverride: newIdfName.trim().toUpperCase(),
                    reason: `Created closet ${newIdfName.trim().toUpperCase()} via Site Manager`
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create closet.");

            setIsAddIdfModalOpen(false);
            setNewIdfName("");
            setNewIdfSelectedHosts([]);
            if (onRefreshSnapshot) onRefreshSnapshot();
        } catch (e: any) {
            setAddIdfError(e.message || "Failed to create closet.");
        } finally {
            setAddIdfSaving(false);
        }
    };

    // Filter devices based on search query, role filter, freshness filter
    const matchesFilter = useCallback((dev: any) => {
        if (roleFilter !== "ALL") {
            const devRole = dev.roleOverride || dev.role || "";
            if (roleFilter === "CORE" && !devRole.toLowerCase().includes("core")) return false;
            if (roleFilter === "DIST" && !devRole.toLowerCase().includes("dist")) return false;
            if (roleFilter === "ACCESS" && !devRole.toLowerCase().includes("access")) return false;
            if (roleFilter === "L3" && devRole !== "L3 Switch" && devRole !== "Router") return false;
            if (roleFilter === "L2" && (devRole === "L3 Switch" || devRole === "Router")) return false;
        }

        if (freshnessFilter !== "ALL") {
            const freshness = getDeviceFreshness(dev);
            if (freshnessFilter === "FRESH" && freshness.category !== "fresh") return false;
            if (freshnessFilter === "RECENT" && freshness.category !== "recent") return false;
            if (freshnessFilter === "STALE" && freshness.category !== "stale") return false;
            if (freshnessFilter === "UNCRAWLED" && freshness.category !== "uncrawled") return false;
            if (freshnessFilter === "FAILED" && freshness.category !== "failed") return false;
        }

        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const host = (dev.hostname || "").toLowerCase();
        const ip = (dev.primaryIp || dev.ip_address || "").toLowerCase();
        const model = (dev.model || "").toLowerCase();
        const serial = (dev.serialNumber || "").toLowerCase();
        const site = (dev.siteOverride || dev.site || "").toLowerCase();
        const idf = (dev.idfOverride || dev.idf || "").toLowerCase();

        return host.includes(q) || ip.includes(q) || model.includes(q) || serial.includes(q) || site.includes(q) || idf.includes(q);
    }, [searchQuery, roleFilter, freshnessFilter]);

    // Active selected object data
    const activeSite = selectedEntity.type === "site" ? siteMap.get(selectedEntity.siteCode) : null;
    const activeIdfDevices = selectedEntity.type === "idf" 
        ? allIdfMap.get(`${selectedEntity.siteCode}:${selectedEntity.idfCode}`) || []
        : [];
    const activeDevice = selectedEntity.type === "device" 
        ? devices.find(d => (d.hostname || "").toLowerCase() === selectedEntity.hostname.toLowerCase())
        : null;

    // Render tree recursively
    const renderFolderNode = (node: any, depth: number = 0) => {
        const isRoot = node.name === "Root";
        const isExpanded = isRoot ? true : expandedFolders[node.fullPath] !== false;
        const folderIndent = isRoot ? 0 : Math.max(depth * 16 + 8, 8);

        const subKeys = Object.keys(node.subFolders).sort((a, b) => a.localeCompare(b));
        const sortedSites = [...node.sites].sort((a: any, b: any) => {
            if (a.siteLookup?.isHub && !b.siteLookup?.isHub) return -1;
            if (!a.siteLookup?.isHub && b.siteLookup?.isHub) return 1;
            return a.siteCode.localeCompare(b.siteCode, undefined, { numeric: true });
        });

        // Filter sites if search query is active
        const visibleSites = sortedSites.filter(siteEntry => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            if (siteEntry.siteCode.toLowerCase().includes(q)) return true;
            if ((siteEntry.siteLookup?.name || "").toLowerCase().includes(q)) return true;
            return siteEntry.allDevices.some((d: any) => matchesFilter(d));
        });

        if (!isRoot && visibleSites.length === 0 && subKeys.length === 0 && searchQuery.trim()) {
            return null;
        }

        return (
            <div key={node.fullPath || "root"} className="space-y-0.5 select-none">
                {!isRoot && (
                    <div 
                        onClick={() => {
                            setExpandedFolders(prev => ({ ...prev, [node.fullPath]: !isExpanded }));
                            setSelectedEntity({ type: "folder", folderPath: node.fullPath });
                        }}
                        className={`flex items-center justify-between pr-2 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                            selectedEntity.type === "folder" && selectedEntity.folderPath === node.fullPath
                                ? "bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30"
                                : "hover:bg-slate-800/60 text-slate-300"
                        }`}
                        style={{ paddingLeft: `${folderIndent}px` }}
                    >
                        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                            {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <Folder className={`w-3.5 h-3.5 shrink-0 ${isExpanded ? "text-blue-400" : "text-slate-400"}`} />
                            <span className="truncate text-[11px] font-medium">{node.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 px-1.5 py-0.2 bg-slate-900 rounded-full border border-slate-800 shrink-0">
                            {sortedSites.length}
                        </span>
                    </div>
                )}

                {isExpanded && (
                    <div className="space-y-0.5">
                        {subKeys.map(k => renderFolderNode(node.subFolders[k], depth + 1))}

                        {visibleSites.map((siteEntry: any) => {
                            const isSiteExpanded = expandedSites[siteEntry.siteCode] === true;
                            const isSiteSelected = selectedEntity.type === "site" && selectedEntity.siteCode === siteEntry.siteCode;
                            const freshCount = siteEntry.allDevices.filter((d: any) => getDeviceFreshness(d).category === "fresh").length;
                            const totalDevs = siteEntry.allDevices.length;
                            const isHub = siteEntry.siteLookup?.isHub;
                            const idfKeys = Array.from(siteEntry.idfs.keys()).sort((a: any, b: any) => {
                                if (a === "MDF") return -1;
                                if (b === "MDF") return 1;
                                return (a as string).localeCompare(b as string, undefined, { numeric: true });
                            });

                            // Indentation geometry: Site -> IDFs (+18px) -> Switches (+18px)
                            const siteIndent = isRoot ? 12 : folderIndent + 16;
                            const idfIndent = siteIndent + 18;
                            const switchIndent = idfIndent + 18;

                            return (
                                <div key={siteEntry.siteCode} className="space-y-0.5">
                                    <div
                                        onClick={() => {
                                            setSelectedEntity({ type: "site", siteCode: siteEntry.siteCode });
                                        }}
                                        className={`group flex items-center justify-between pr-2 py-1.5 rounded-lg text-xs cursor-pointer transition ${
                                            isSiteSelected
                                                ? "bg-blue-600/25 text-white border border-blue-500/50 shadow-sm"
                                                : "hover:bg-slate-800/60 text-slate-200 border border-transparent"
                                        }`}
                                        style={{ paddingLeft: `${siteIndent}px` }}
                                    >
                                        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedSites(prev => ({ ...prev, [siteEntry.siteCode]: !isSiteExpanded }));
                                                }}
                                                className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 group-hover:text-slate-200 transition"
                                            >
                                                {isSiteExpanded ? (
                                                    <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                                                ) : (
                                                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                                                )}
                                            </button>
                                            <Building2 className={`w-3.5 h-3.5 shrink-0 ${isHub ? "text-amber-400" : "text-blue-400/80"}`} />
                                            <span className="font-bold font-mono text-[11px] tracking-wide text-white">
                                                {siteEntry.siteCode}
                                            </span>
                                            {isHub && <span className="text-amber-400 text-xs" title="Critical Site">★</span>}
                                            <span className="text-[10px] text-slate-400 truncate">
                                                {siteEntry.siteLookup?.name || ""}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            <span 
                                                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono border flex items-center gap-1 ${
                                                    totalDevs === 0 
                                                        ? "bg-slate-800 text-slate-400 border-slate-700" 
                                                        : freshCount === totalDevs 
                                                        ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60" 
                                                        : freshCount > 0
                                                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                                                        : "bg-slate-800 text-slate-400 border-slate-700"
                                                }`}
                                                title={`${freshCount} fresh (≤24h) of ${totalDevs} total switches`}
                                            >
                                                <span className={`w-1.5 h-1.5 rounded-full ${freshCount > 0 ? "bg-emerald-400" : "bg-slate-500"}`} />
                                                <span>{freshCount}/{totalDevs}</span>
                                            </span>
                                            <button
                                                type="button"
                                                title={`Crawl site ${siteEntry.siteCode}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const seed = siteEntry.allDevices[0];
                                                    if (seed) onReseedDevice(seed);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition"
                                            >
                                                <CrawlIcon size={12} className="text-blue-400" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* IDFs inside this Site */}
                                    {isSiteExpanded && (
                                        <div className="relative space-y-0.5 my-0.5">
                                            {/* Vertical hierarchy guide line under Site */}
                                            <div 
                                                className="absolute top-1 bottom-1 w-[1px] bg-slate-800 pointer-events-none"
                                                style={{ left: `${siteIndent + 7}px` }}
                                            />

                                            {idfKeys.map((idfCode: any) => {
                                                const idfKey = `${siteEntry.siteCode}:${idfCode}`;
                                                const isIdfExpanded = expandedIdfs[idfKey] === true;
                                                const isIdfSelected = selectedEntity.type === "idf" && selectedEntity.siteCode === siteEntry.siteCode && selectedEntity.idfCode === idfCode;
                                                const idfDevs = siteEntry.idfs.get(idfCode) || [];
                                                const filteredIdfDevs = idfDevs.filter((d: any) => matchesFilter(d));
                                                const floorInfo = parseFloorFromIdf(idfCode);

                                                return (
                                                    <div key={idfKey} className="space-y-0.5">
                                                        <div
                                                            onClick={() => setSelectedEntity({ type: "idf", siteCode: siteEntry.siteCode, idfCode })}
                                                            className={`group relative flex items-center justify-between pr-2 py-1 rounded-md text-[11px] cursor-pointer transition ${
                                                                isIdfSelected
                                                                    ? "bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/40"
                                                                    : "hover:bg-slate-800/50 text-slate-300 border border-transparent"
                                                            }`}
                                                            style={{ paddingLeft: `${idfIndent}px` }}
                                                        >
                                                            {/* Horizontal branch tick connector */}
                                                            <span 
                                                                className="absolute w-2.5 h-[1px] bg-slate-800 pointer-events-none"
                                                                style={{ left: `${siteIndent + 8}px`, top: "50%" }}
                                                            />

                                                            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedIdfs(prev => ({ ...prev, [idfKey]: !isIdfExpanded }));
                                                                    }}
                                                                    className="p-0.5 rounded hover:bg-slate-700/50 text-slate-400 transition"
                                                                >
                                                                    {isIdfExpanded ? (
                                                                        <ChevronDown className="w-3 h-3 text-blue-400" />
                                                                    ) : (
                                                                        <ChevronRight className="w-3 h-3 text-slate-500" />
                                                                    )}
                                                                </button>
                                                                <DoorOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                                <span className="font-semibold text-slate-100">{idfCode}</span>
                                                                <span className="text-[10px] text-slate-500 font-normal truncate">
                                                                    ({floorInfo.floorLabel})
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {(() => {
                                                                    const freshIdfCount = idfDevs.filter((d: any) => getDeviceFreshness(d).category === "fresh").length;
                                                                    return (
                                                                        <span 
                                                                            className={`text-[9px] px-1 py-0.2 rounded font-mono flex items-center gap-1 ${
                                                                                freshIdfCount > 0 
                                                                                    ? "bg-emerald-950/40 text-emerald-300 border border-emerald-800/40" 
                                                                                    : "bg-slate-800 text-slate-400 border border-slate-700/60"
                                                                            }`}
                                                                            title={`${freshIdfCount} fresh (≤24h) of ${idfDevs.length} total switches`}
                                                                        >
                                                                            <span className={`w-1 h-1 rounded-full ${freshIdfCount > 0 ? "bg-emerald-400" : "bg-slate-500"}`} />
                                                                            <span>{freshIdfCount}/{idfDevs.length}</span>
                                                                        </span>
                                                                    );
                                                                })()}
                                                                <button
                                                                    type="button"
                                                                    title={`Crawl closet ${idfCode}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const seed = idfDevs[0];
                                                                        if (seed) onReseedDevice(seed);
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-blue-500/20 text-blue-400 transition"
                                                                >
                                                                    <CrawlIcon size={11} className="text-blue-400" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Switches inside this IDF */}
                                                        {isIdfExpanded && (
                                                            <div className="relative space-y-0.5 my-0.5">
                                                                {/* Vertical hierarchy guide line under IDF */}
                                                                <div 
                                                                    className="absolute top-1 bottom-1 w-[1px] bg-slate-800/80 pointer-events-none"
                                                                    style={{ left: `${idfIndent + 7}px` }}
                                                                />

                                                                {filteredIdfDevs.map((dev: any) => {
                                                                    const isDevSelected = selectedEntity.type === "device" && selectedEntity.hostname.toLowerCase() === dev.hostname.toLowerCase();
                                                                    const freshness = getDeviceFreshness(dev);
                                                                    const isL3 = dev.role === "Router" || dev.role === "L3 Switch";

                                                                    return (
                                                                        <div
                                                                            key={dev.hostname}
                                                                            onClick={() => setSelectedEntity({ type: "device", hostname: dev.hostname })}
                                                                            className={`group relative flex items-center justify-between pr-2 py-1 rounded text-[11px] cursor-pointer transition ${
                                                                                isDevSelected
                                                                                    ? "bg-blue-600 text-white font-medium shadow-sm"
                                                                                    : "hover:bg-slate-800/60 text-slate-300"
                                                                            }`}
                                                                            style={{ paddingLeft: `${switchIndent}px` }}
                                                                        >
                                                                            {/* Horizontal branch tick connector */}
                                                                            <span 
                                                                                className="absolute w-2.5 h-[1px] bg-slate-800/80 pointer-events-none"
                                                                                style={{ left: `${idfIndent + 8}px`, top: "50%" }}
                                                                            />

                                                                            <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
                                                                                <div 
                                                                                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${freshness.dotClass}`} 
                                                                                    title={freshness.label} 
                                                                                />
                                                                                <Server className="w-3 h-3 text-slate-400 shrink-0" />
                                                                                <span className="font-mono truncate">{dev.hostname}</span>
                                                                            </div>

                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${
                                                                                    isL3 ? "bg-cyan-950 text-cyan-300 border border-cyan-800/40" : "bg-slate-800 text-slate-400"
                                                                                }`}>
                                                                                    {isL3 ? "L3" : "L2"}
                                                                                </span>
                                                                                <button
                                                                                    type="button"
                                                                                    title={`Crawl switch ${dev.hostname}`}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        onReseedDevice(dev);
                                                                                    }}
                                                                                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-blue-500/20 text-blue-300 transition"
                                                                                >
                                                                                    <CrawlIcon size={11} className="text-blue-300" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Quick Add IDF to this site */}
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setNewIdfSiteCode(siteEntry.siteCode);
                                                    setNewIdfName("");
                                                    setNewIdfSelectedHosts([]);
                                                    setIsAddIdfModalOpen(true);
                                                }}
                                                className="flex items-center gap-1.5 pr-2 py-1 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-md transition w-full text-left"
                                                style={{ paddingLeft: `${idfIndent}px` }}
                                            >
                                                <Plus className="w-3 h-3" />
                                                <span>Add IDF Closet to {siteEntry.siteCode}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 min-h-0 flex flex-row overflow-hidden relative rounded-2xl border border-slate-800 bg-slate-950/70 shadow-xl">
            {/* Left Column: Asset Hierarchy Tree */}
            <div className="w-80 md:w-96 border-r border-slate-800 flex flex-col bg-slate-900/60 shrink-0">
                {/* Search & Actions Header */}
                <div className="p-3 border-b border-slate-800 space-y-2.5 bg-slate-950/80">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-400" />
                            <h3 className="text-xs font-bold text-white tracking-wide uppercase">Network Hierarchy</h3>
                        </div>
                        <div className="flex items-center gap-1">
                            {onAddSite && (
                                <button
                                    onClick={() => onAddSite()}
                                    title="Add New Site"
                                    className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-emerald-400 transition"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (onRefreshSnapshot) onRefreshSnapshot();
                                }}
                                title="Refresh Hierarchy"
                                className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Filter sites, closets, hostnames, IPs..."
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {/* Filters Row */}
                    <div className="flex items-center gap-2 pt-0.5">
                        <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 flex-1"
                        >
                            <option value="ALL">All Roles</option>
                            <option value="CORE">Core</option>
                            <option value="DIST">Distribution</option>
                            <option value="ACCESS">Access</option>
                            <option value="L3">L3 Switches</option>
                            <option value="L2">L2 Switches</option>
                        </select>

                        <select
                            value={freshnessFilter}
                            onChange={(e) => setFreshnessFilter(e.target.value as any)}
                            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-[10px] text-slate-300 focus:outline-none focus:border-blue-500 flex-1"
                        >
                            <option value="ALL">All Freshness</option>
                            <option value="FRESH">🟢 Fresh (≤ 24h)</option>
                            <option value="RECENT">🟡 Recent (1 - 7d)</option>
                            <option value="STALE">⚪ Stale (&gt; 7d)</option>
                            <option value="UNCRAWLED">⚪ Never Crawled</option>
                            <option value="FAILED">🔴 Crawl Errors</option>
                        </select>
                    </div>
                </div>

                {/* Tree View Body */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {renderFolderNode(folderTree, 0)}
                </div>

                {/* Tree Footer Summary */}
                <div className="p-2.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
                    <span>{siteMap.size} Sites</span>
                    <span>{allIdfMap.size} Closets</span>
                    <span className="font-mono text-slate-300">{devices.length} Switches</span>
                </div>
            </div>

            {/* Right Column: Command & Validation Workspace */}
            <div className="flex-1 min-w-0 flex flex-col bg-slate-950/50 h-full overflow-hidden">
                {/* 1. SITE VIEW */}
                {selectedEntity.type === "site" && activeSite && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Pinned Site Header */}
                        <div className="shrink-0 px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 shadow-sm">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2.5">
                                    <div className={`p-2 rounded-xl border ${
                                        activeSite.siteLookup?.isHub 
                                            ? "bg-amber-500/10 border-amber-500/30 text-amber-400" 
                                            : "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                    }`}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-white tracking-tight font-mono">
                                                {activeSite.siteCode}
                                            </h2>
                                            {activeSite.siteLookup?.isHub && (
                                                <span className="px-2 py-0.5 text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                                                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                                    Critical Core Hub
                                                </span>
                                            )}
                                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                                                activeSite.siteLookup?.status === "Active" 
                                                    ? "bg-emerald-950/60 text-emerald-400 border-emerald-800/60"
                                                    : "bg-amber-950/60 text-amber-400 border-amber-800/60"
                                            }`}>
                                                {activeSite.siteLookup?.status || "Active"}
                                            </span>
                                            {activeSite.siteLookup?.locationType && (
                                                <span className="px-2 py-0.5 text-xs font-semibold bg-slate-800 text-slate-300 rounded-full border border-slate-700">
                                                    {activeSite.siteLookup.locationType}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {activeSite.siteLookup?.name || activeSite.siteCode}
                                            {activeSite.siteLookup?.city && ` • ${activeSite.siteLookup.city}`}
                                            {activeSite.siteLookup?.address && ` • ${activeSite.siteLookup.address}`}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                {activeSite.allDevices.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onReseedDevice(activeSite.allDevices[0])}
                                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <CrawlIcon size={14} className="text-white" />
                                        <span>Crawl Site</span>
                                    </button>
                                )}
                                {onEditSite && (
                                    <button
                                        type="button"
                                        onClick={() => onEditSite(activeSite.siteCode)}
                                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        <span>Edit Site</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewIdfSiteCode(activeSite.siteCode);
                                        setNewIdfName("");
                                        setNewIdfSelectedHosts([]);
                                        setIsAddIdfModalOpen(true);
                                    }}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5 text-blue-400" />
                                    <span>Add IDF Closet</span>
                                </button>
                                {onNavigateToTopology && (
                                    <button
                                        type="button"
                                        onClick={() => onNavigateToTopology(activeSite.siteCode)}
                                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                                        title="View Site in Topology Map"
                                    >
                                        <Network className="w-3.5 h-3.5 text-emerald-400" />
                                        <span>View on Map</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Scrollable Site Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                            {/* KPI Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                                    <span className="text-[11px] text-slate-400 font-medium">Closets & IDFs</span>
                                    <div className="text-2xl font-bold font-mono text-white">
                                        {activeSite.idfs.size}
                                    </div>
                                    <span className="text-[10px] text-slate-500">Distribution rooms</span>
                                </div>

                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                                <span className="text-[11px] text-slate-400 font-medium">Total Switches</span>
                                {(() => {
                                    const siteFreshCount = activeSite.allDevices.filter(d => getDeviceFreshness(d).category === "fresh").length;
                                    return (
                                        <>
                                            <div className="text-2xl font-bold font-mono text-white flex items-center gap-2">
                                                <span>{activeSite.allDevices.length}</span>
                                                <span className="text-xs font-normal text-emerald-400 flex items-center gap-1 font-sans">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                                                    {siteFreshCount} fresh
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400">
                                                {siteFreshCount > 0 
                                                    ? `${siteFreshCount} crawled in last 24h • ${activeSite.allDevices.length - siteFreshCount} awaiting crawl` 
                                                    : "Awaiting crawl validation"
                                                }
                                            </span>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                                <span className="text-[11px] text-slate-400 font-medium">Layer 3 / Layer 2</span>
                                <div className="text-2xl font-bold font-mono text-cyan-300">
                                    {activeSite.allDevices.filter(d => d.role === "Router" || d.role === "L3 Switch").length}
                                    <span className="text-slate-500 text-lg font-normal"> / </span>
                                    {activeSite.allDevices.filter(d => d.role !== "Router" && d.role !== "L3 Switch").length}
                                </div>
                                <span className="text-[10px] text-slate-500">Routing cores vs Access switches</span>
                            </div>

                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1">
                                <span className="text-[11px] text-slate-400 font-medium">Total Interfaces</span>
                                <div className="text-2xl font-bold font-mono text-white">
                                    {activeSite.allDevices.reduce((acc, d) => acc + (Array.isArray(d.interfaces) ? d.interfaces.length : 0), 0)}
                                </div>
                                <span className="text-[10px] text-slate-500">Monitored switchports</span>
                            </div>
                        </div>

                        {/* IDFs in this Site */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                    <DoorOpen className="w-4 h-4 text-cyan-400" />
                                    Closets in {activeSite.siteCode} ({activeSite.idfs.size})
                                </h3>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.from(activeSite.idfs.entries()).map(([idfCode, devs]) => {
                                    const floor = parseFloorFromIdf(idfCode);
                                    const reachableInIdf = devs.filter(d => d.status === "REACHABLE").length;
                                    const stackCount = devs.filter(d => detectSwitchStack(d).isStack).length;

                                    return (
                                        <div
                                            key={idfCode}
                                            onClick={() => setSelectedEntity({ type: "idf", siteCode: activeSite.siteCode, idfCode })}
                                            className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl p-4 transition cursor-pointer space-y-3"
                                        >
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
                                                        <DoorOpen className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-sm font-mono flex items-center gap-1.5">
                                                            {idfCode}
                                                            {idfCode === "MDF" && (
                                                                <span className="px-1.5 py-0.2 text-[9px] bg-blue-500/20 text-blue-300 rounded font-semibold border border-blue-500/30">
                                                                    Main
                                                                </span>
                                                            )}
                                                        </h4>
                                                        <span className="text-xs text-slate-400">{floor.floorLabel}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        title={`Crawl closet ${idfCode}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (devs[0]) onReseedDevice(devs[0]);
                                                        }}
                                                        className="p-1 rounded hover:bg-blue-500/20 text-blue-400 transition"
                                                    >
                                                        <CrawlIcon size={14} className="text-blue-400" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Edit Closet / Move Switches"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setActiveEditIdf({ siteCode: activeSite.siteCode, idfCode, devices: devs });
                                                            setIsEditIdfModalOpen(true);
                                                        }}
                                                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80 text-slate-400">
                                                <span>{devs.length} switches {stackCount > 0 && `(${stackCount} stack)`}</span>
                                                {(() => {
                                                    const idfFresh = devs.filter((d: any) => getDeviceFreshness(d).category === "fresh").length;
                                                    return (
                                                        <span className={idfFresh > 0 ? "text-emerald-400 font-medium" : "text-slate-400 font-medium"}>
                                                            {idfFresh}/{devs.length} fresh
                                                        </span>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* All Switches Table in this Site */}
                        <div className="space-y-3 pt-2">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Server className="w-4 h-4 text-blue-400" />
                                Switches in {activeSite.siteCode} ({activeSite.allDevices.length})
                            </h3>

                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="py-3 px-4">Freshness</th>
                                            <th className="py-3 px-4">Hostname</th>
                                            <th className="py-3 px-4">Management IP</th>
                                            <th className="py-3 px-4">Closet / IDF</th>
                                            <th className="py-3 px-4">Role</th>
                                            <th className="py-3 px-4">Model</th>
                                            <th className="py-3 px-4">Serial</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {activeSite.allDevices.map((dev: any) => {
                                            const { idf: devIdf } = parseDeviceSiteAndIdf(dev.hostname, dev.siteOverride || dev.site, dev.idfOverride || dev.idf);
                                            const freshness = getDeviceFreshness(dev);
                                            const isL3 = dev.role === "Router" || dev.role === "L3 Switch";

                                            return (
                                                <tr 
                                                    key={dev.hostname}
                                                    onClick={() => setSelectedEntity({ type: "device", hostname: dev.hostname })}
                                                    className="hover:bg-slate-800/40 cursor-pointer transition"
                                                >
                                                    <td className="py-3 px-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${freshness.badgeClass}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dotClass}`} />
                                                            {freshness.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-white">
                                                        {dev.hostname}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-cyan-300">
                                                        {dev.primaryIp || dev.ip_address || "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                                                            {devIdf}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                                                            isL3 ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30" : "bg-slate-800 text-slate-300"
                                                        }`}>
                                                            {dev.role || "Switch"}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-400">
                                                        {dev.model || "—"}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                                                        {dev.serialNumber || "—"}
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <button
                                                                type="button"
                                                                title={`Crawl switch ${dev.hostname}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onReseedDevice(dev);
                                                                }}
                                                                className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition"
                                                            >
                                                                <CrawlIcon size={13} className="text-blue-400" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

                {/* 2. IDF CLOSET VIEW */}
                {selectedEntity.type === "idf" && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Pinned IDF Header */}
                        <div className="shrink-0 px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 z-10 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                    <DoorOpen className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-white tracking-tight font-mono">
                                            {selectedEntity.siteCode} • Closet {selectedEntity.idfCode}
                                        </h2>
                                        {selectedEntity.idfCode === "MDF" && (
                                            <span className="px-2 py-0.5 text-xs font-bold bg-blue-500/15 text-blue-300 border border-blue-500/40 rounded-full">
                                                Main Distribution Frame
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        {parseFloorFromIdf(selectedEntity.idfCode).floorLabel} • {activeIdfDevices.length} Member Switches
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                {activeIdfDevices.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => onReseedDevice(activeIdfDevices[0])}
                                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <CrawlIcon size={14} className="text-white" />
                                        <span>Crawl Closet</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActiveEditIdf({
                                            siteCode: selectedEntity.siteCode,
                                            idfCode: selectedEntity.idfCode,
                                            devices: activeIdfDevices
                                        });
                                        setIsEditIdfModalOpen(true);
                                    }}
                                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                                >
                                    <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                    <span>Reassign / Move Switches</span>
                                </button>
                            </div>
                        </div>

                        {/* Scrollable IDF Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                            {/* Closet Switches Table */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                                <Server className="w-4 h-4 text-cyan-400" />
                                Switches in Closet {selectedEntity.idfCode} ({activeIdfDevices.length})
                            </h3>

                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                                        <tr>
                                            <th className="py-3 px-4">Freshness</th>
                                            <th className="py-3 px-4">Hostname</th>
                                            <th className="py-3 px-4">Management IP</th>
                                            <th className="py-3 px-4">Role</th>
                                            <th className="py-3 px-4">Model</th>
                                            <th className="py-3 px-4">Serial</th>
                                            <th className="py-3 px-4">Stack Status</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {activeIdfDevices.map((dev: any) => {
                                            const freshness = getDeviceFreshness(dev);
                                            const stack = detectSwitchStack(dev);

                                            return (
                                                <tr
                                                    key={dev.hostname}
                                                    onClick={() => setSelectedEntity({ type: "device", hostname: dev.hostname })}
                                                    className="hover:bg-slate-800/40 cursor-pointer transition"
                                                >
                                                    <td className="py-3 px-4">
                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${freshness.badgeClass}`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${freshness.dotClass}`} />
                                                            {freshness.label}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 font-mono font-bold text-white">
                                                        {dev.hostname}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-cyan-300">
                                                        {dev.primaryIp || dev.ip_address || "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold text-[10px]">
                                                            {dev.role || "Switch"}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 px-4 text-slate-400">
                                                        {dev.model || "—"}
                                                    </td>
                                                    <td className="py-3 px-4 font-mono text-slate-400 text-[11px]">
                                                        {dev.serialNumber || "—"}
                                                    </td>
                                                    <td className="py-3 px-4">
                                                        {stack.isStack ? (
                                                            <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                                                                Stack ({stack.stackSize}x)
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-500 text-[11px]">Standalone</span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-4 text-right">
                                                        <button
                                                            type="button"
                                                            title={`Crawl switch ${dev.hostname}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onReseedDevice(dev);
                                                            }}
                                                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition"
                                                        >
                                                            <CrawlIcon size={13} className="text-blue-400" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

                {/* 3. DEVICE / SWITCH VIEW */}
                {selectedEntity.type === "device" && activeDevice && (() => {
                    const stackInfo = detectSwitchStack(activeDevice);

                    const rawInterfaces = activeDevice.interfaces || {};
                    const interfaces: any[] = Array.isArray(rawInterfaces)
                        ? rawInterfaces
                        : Object.entries(rawInterfaces).map(([name, val]: [string, any]) => ({
                            name,
                            ...(typeof val === "object" ? val : {})
                        }));

                    const displayedInterfaces = interfaces.filter((i: any) => {
                        if (stackInfo.isStack && deviceStackFilter !== "ALL") {
                            const m = (i.name || "").match(/^[A-Za-z]+(\d+)\/\d+\/\d+/);
                            if (!m || m[1] !== deviceStackFilter) return false;
                        }
                        if (interfaceSearch.trim()) {
                            const q = interfaceSearch.toLowerCase().trim();
                            const name = (i.name || "").toLowerCase();
                            const desc = (i.description || "").toLowerCase();
                            const ip = (i.ip_address || "").toLowerCase();
                            const vlan = String(i.vlan || "").toLowerCase();
                            return name.includes(q) || desc.includes(q) || ip.includes(q) || vlan.includes(q);
                        }
                        return true;
                    });

                    const rawRoutes = activeDevice.routes || [];
                    const routes: any[] = Array.isArray(rawRoutes) ? rawRoutes : Object.values(rawRoutes);

                    const rawVlans = activeDevice.vlans || [];
                    const vlans: any[] = Array.isArray(rawVlans) ? rawVlans : Object.values(rawVlans);

                    const rawCdp = activeDevice.cdpNeighbors || activeDevice.cdp_neighbors || [];
                    const cdpNeighbors: any[] = Array.isArray(rawCdp) ? rawCdp : Object.values(rawCdp);

                    const classifiedCdpNeighbors = cdpNeighbors.map((n: any) => ({
                        neighbor: n,
                        typeInfo: classifyCdpNeighbor(n)
                    }));

                    const cdpCounts = (() => {
                        const counts = { ALL: classifiedCdpNeighbors.length, SWITCH: 0, AP: 0, ROUTER: 0, PHONE: 0, OTHER: 0 };
                        for (const item of classifiedCdpNeighbors) {
                            counts[item.typeInfo.category] = (counts[item.typeInfo.category] || 0) + 1;
                        }
                        return counts;
                    })();

                    const displayedCdpNeighbors = classifiedCdpNeighbors.filter(({ neighbor, typeInfo }) => {
                        if (cdpTypeFilter !== "ALL" && typeInfo.category !== cdpTypeFilter) {
                            return false;
                        }
                        if (cdpSearchQuery.trim()) {
                            const q = cdpSearchQuery.toLowerCase().trim();
                            const host = String(neighbor.destination_host || neighbor.device_id || "").toLowerCase();
                            const platform = String(neighbor.platform || "").toLowerCase();
                            const local = String(neighbor.local_port || neighbor.local_interface || "").toLowerCase();
                            const remote = String(neighbor.remote_port || neighbor.remote_interface || "").toLowerCase();
                            const ip = String(neighbor.management_ip || "").toLowerCase();
                            return host.includes(q) || platform.includes(q) || local.includes(q) || remote.includes(q) || ip.includes(q);
                        }
                        return true;
                    });

                    const isUnverified = activeDevice.status === "UNVERIFIED";
                    const isReachable = activeDevice.status ? activeDevice.status === "REACHABLE" : activeDevice.reachable !== false;
                    const isL3 = activeDevice.role === "Router" || activeDevice.role === "L3 Switch" || activeDevice.role === "L3";
                    const primaryIp = activeDevice.primaryIp || activeDevice.ip_address || activeDevice.ipAddress || (interfaces.find((i: any) => i.ip_address)?.ip_address ?? "");
                    const deviceError = activeDevice.failureReason || activeDevice.error;
                    const deviceVersion = activeDevice.osVersion || activeDevice.version || "—";
                    const deviceSerial = activeDevice.serialNumber || activeDevice.serial || "—";
                    const deviceModel = activeDevice.platform || activeDevice.model || "Cisco Catalyst";

                    const shortHost = (activeDevice.hostname || "").split(".")[0].trim();
                    const siteCode = activeDevice.siteOverride || activeDevice.site || (shortHost.length >= 3 ? shortHost.slice(0, 3).toUpperCase() : "UNK");
                    const idfCode = activeDevice.idfOverride || activeDevice.idf || (shortHost.includes("-") && shortHost.split("-")[1] ? shortHost.split("-")[1].slice(0, 3).toUpperCase() : "MDF");
                    const floorInfo = parseFloorFromIdf(idfCode);
                    const freshness = getDeviceFreshness(activeDevice);

                    return (
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            {/* Pinned Device Header */}
                            <div className="shrink-0 px-6 pt-4 pb-0 border-b border-slate-800 bg-slate-950/95 backdrop-blur-md z-10 shadow-sm flex flex-col gap-3">
                                {/* Top Row: Device Title, Badges, Quick Actions */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3.5">
                                        <div className={`p-2.5 rounded-xl border ${
                                            isUnverified
                                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                                : freshness.category === "fresh"
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                                : freshness.category === "recent"
                                                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                                : freshness.category === "failed"
                                                ? "bg-red-500/10 border-red-500/30 text-red-400"
                                                : "bg-slate-800 border-slate-700 text-slate-400"
                                        }`}>
                                            {isUnverified ? <Compass className="w-5 h-5" /> : <Server className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-xl font-bold text-white tracking-tight font-mono">
                                                    {activeDevice.hostname}
                                                </h2>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${freshness.badgeClass}`}>
                                                    <span className={`w-2 h-2 rounded-full ${freshness.dotClass}`} />
                                                    {freshness.label}
                                                </span>
                                                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                                                    isL3 ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                }`}>
                                                    {isL3 ? 'L3' : 'L2'}
                                                </span>
                                                {stackInfo.isStack && (
                                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-purple-500/10 text-purple-300 border-purple-500/40 flex items-center gap-1">
                                                        <Layers className="w-3 h-3 text-purple-400" />
                                                        StackWise ({stackInfo.stackSize}x • {stackInfo.portCount}p)
                                                    </span>
                                                )}
                                                {(activeDevice.isCustomOverride || activeDevice.siteOverride || activeDevice.idfOverride) && (
                                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded border bg-amber-500/10 text-amber-300 border-amber-500/40 flex items-center gap-1">
                                                        <Tag className="w-3 h-3 text-amber-400" />
                                                        Override
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                                                <span className="font-mono text-cyan-300 font-semibold">{primaryIp || "No IP"}</span>
                                                <span>•</span>
                                                <span>Site: <strong className="text-slate-200">{siteCode}</strong></span>
                                                <span>•</span>
                                                <span>Closet: <strong className="text-slate-200">{idfCode}</strong></span>
                                                <span>•</span>
                                                <span className="text-slate-400 font-medium">{activeDevice.role || "Switch"}</span>
                                                {(activeDevice.hopDistance !== undefined && activeDevice.hopDistance !== null) && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="px-1.5 py-0.2 bg-blue-950 text-blue-300 rounded font-mono text-[10px] border border-blue-800/60">
                                                            {activeDevice.hopDistance === 0 ? "Seed (Hop 0)" : `Hop ${activeDevice.hopDistance}`}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => onReseedDevice(activeDevice)}
                                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <CrawlIcon size={14} className="text-white" />
                                            <span>Crawl Switch</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingNodeHost(activeDevice.hostname);
                                                setOverrideSite(activeDevice.siteOverride || activeDevice.site || "");
                                                setOverrideIdf(activeDevice.idfOverride || activeDevice.idf || "");
                                                setOverrideRole(activeDevice.roleOverride || activeDevice.role || "");
                                                setOverrideReason("");
                                            }}
                                            className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                            <span>Edit Assignment</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Pinned Tab Navigation */}
                                <div className="flex items-center gap-1 border-t border-slate-800/80 -mb-[1px] overflow-x-auto pt-1">
                                    {[
                                        { id: "overview", label: "Overview", icon: Cpu },
                                        { id: "interfaces", label: `Interfaces (${interfaces.length})`, icon: Network },
                                        { id: "routes", label: `Routes (${routes.length})`, icon: RouteIcon },
                                        { id: "vlans", label: `VLANs (${vlans.length})`, icon: Layers },
                                        { id: "cdp", label: `CDP / LLDP (${cdpNeighbors.length})`, icon: Share2 }
                                    ].map((t) => {
                                        const Icon = t.icon;
                                        const isActive = deviceActiveTab === t.id;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setDeviceActiveTab(t.id as any)}
                                                className={`flex items-center gap-1.5 py-2.5 px-3.5 text-xs font-semibold border-b-2 transition -mb-[1px] whitespace-nowrap cursor-pointer ${
                                                    isActive 
                                                        ? "text-blue-400 border-blue-500 bg-slate-900/60" 
                                                        : "text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700"
                                                }`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                <span>{t.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Scrollable Device Body */}
                            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                                {/* Inline Edit Form if active */}
                                {editingNodeHost && (
                                    <div className="p-4 bg-slate-900 border border-amber-500/40 rounded-xl space-y-3 shadow-xl">
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                            <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                                <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                                                Authoritative Node Assignment Override
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={() => setEditingNodeHost(null)}
                                                className="text-slate-400 hover:text-white"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="text-[11px] text-slate-400 font-semibold block mb-1">Target Site</label>
                                                <input
                                                    type="text"
                                                    value={overrideSite}
                                                    onChange={(e) => setOverrideSite(e.target.value.toUpperCase())}
                                                    placeholder="e.g. KEL"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-slate-400 font-semibold block mb-1">Target Closet / IDF</label>
                                                <input
                                                    type="text"
                                                    value={overrideIdf}
                                                    onChange={(e) => setOverrideIdf(e.target.value.toUpperCase())}
                                                    placeholder="e.g. MDF or 2MC"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white uppercase font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-slate-400 font-semibold block mb-1">Role Override</label>
                                                <input
                                                    type="text"
                                                    value={overrideRole}
                                                    onChange={(e) => setOverrideRole(e.target.value)}
                                                    placeholder="e.g. Core Switch"
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                                                />
                                            </div>
                                        </div>

                                        {overrideErrorMsg && (
                                            <p className="text-xs text-red-400">{overrideErrorMsg}</p>
                                        )}
                                        {overrideSuccessMsg && (
                                            <p className="text-xs text-emerald-400">{overrideSuccessMsg}</p>
                                        )}

                                        <div className="flex justify-end gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setEditingNodeHost(null)}
                                                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSaveNodeOverride(activeDevice.hostname)}
                                                disabled={savingOverride}
                                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition cursor-pointer"
                                            >
                                                {savingOverride ? "Saving..." : "Save Override"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Crawl Failure Alert Banner */}
                                {(!isReachable || deviceError) && (
                                    <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/80 text-red-200 space-y-1.5">
                                        <div className="flex items-center gap-2 font-semibold text-red-300 text-xs">
                                            <AlertTriangle className="w-4 h-4 text-red-400" />
                                            <span>Device Crawl Alert</span>
                                        </div>
                                        <p className="text-xs text-red-300/90 leading-relaxed font-mono">
                                            {deviceError || "Device was unreachable during the network crawl. Check credentials, ACLs, or physical connectivity."}
                                        </p>
                                    </div>
                                )}

                                {/* TAB 1: OVERVIEW */}
                                {deviceActiveTab === "overview" && (
                                    <div className="space-y-6">
                                        {/* Discovered Peer Port & Purpose Clue */}
                                        {(activeDevice.peerInterfaceDescription || activeDevice.discoveredPort || activeDevice.discoveredVia) && (
                                            <div className="bg-slate-900/60 rounded-xl p-4 border border-cyan-800/50 space-y-2.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wide">
                                                        <Tag className="w-3.5 h-3.5 text-cyan-400" />
                                                        Discovered Peer Port & Purpose Clue
                                                    </span>
                                                    {activeDevice.discoveredPort && (
                                                        <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60 font-semibold">
                                                            {activeDevice.discoveredPort}
                                                        </span>
                                                    )}
                                                </div>
                                                {activeDevice.peerInterfaceDescription ? (
                                                    <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40">
                                                        <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                                                            Connected Peer Interface Description:
                                                        </span>
                                                        <span className="font-mono text-xs font-semibold text-cyan-200 block">
                                                            "{activeDevice.peerInterfaceDescription}"
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <p className="text-xs text-slate-400">
                                                        No interface description configured on discovering switch port.
                                                    </p>
                                                )}
                                                {activeDevice.discoveredVia && (
                                                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                                                        <span className="text-slate-500">Discovered via peer:</span>
                                                        <span className="font-mono text-slate-300 font-medium">{activeDevice.discoveredVia}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Switch Stack Architecture Card */}
                                        {stackInfo.isStack && (
                                            <div className="bg-purple-950/20 rounded-xl p-4 border border-purple-800/60 space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                                                        <Layers className="w-4 h-4 text-purple-400" />
                                                        Cisco Switch Stack Architecture (StackWise)
                                                    </span>
                                                    <span className="text-xs font-mono font-bold text-purple-300 bg-purple-900/60 px-2.5 py-0.5 rounded-full border border-purple-700">
                                                        {stackInfo.stackSize} Chassis • {stackInfo.portCount} Ports
                                                    </span>
                                                </div>
                                                <p className="text-xs text-purple-200/80 leading-relaxed">
                                                    This managed switch operates as a unified multi-chassis StackWise stack of {stackInfo.stackSize} physical switches under a single management plane. Interfaces span {Array.from({ length: stackInfo.stackSize }, (_, i) => `Switch ${i + 1}`).join(", ")}.
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-purple-900/40">
                                                    <span className="text-[11px] font-semibold text-purple-300">Inspect Member:</span>
                                                    {stackInfo.members.map((m) => (
                                                        <button
                                                            key={m}
                                                            type="button"
                                                            onClick={() => {
                                                                setDeviceStackFilter(m);
                                                                setDeviceActiveTab("interfaces");
                                                            }}
                                                            className="px-2.5 py-1 text-xs rounded-lg bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 border border-purple-700/60 transition cursor-pointer flex items-center gap-1 font-mono"
                                                        >
                                                            <span>Switch {m}</span>
                                                            <span className="text-[10px] text-purple-400">→</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Multi-IP Inventory & SVIs Card */}
                                        {activeDevice.allIps && activeDevice.allIps.length > 1 && (
                                            <div className="bg-slate-900/60 rounded-xl p-4 border border-cyan-800/40 space-y-2">
                                                <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                                                    <Network className="w-3.5 h-3.5 text-cyan-400" />
                                                    Multi-IP Inventory & SVIs ({activeDevice.allIps.length} Detected IPs)
                                                </h3>
                                                <p className="text-[11px] text-slate-400">
                                                    This switch is reachable and managed across multiple configured IP addresses unified under this canonical device:
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                    {activeDevice.allIps.map((ip: string) => (
                                                        <span key={ip} className="font-mono text-xs text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded-lg border border-cyan-800/50">
                                                            {ip}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Specs Grid (2x2) */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Hardware & Software */}
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                                                    Hardware & Software Info
                                                </h3>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Model</span>
                                                        <span className="font-semibold text-white">{deviceModel}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Serial Number</span>
                                                        <span className="font-mono text-white">{deviceSerial}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Software Version</span>
                                                        <span className="font-mono text-slate-200 text-[11px] truncate max-w-[240px]" title={deviceVersion}>
                                                            {deviceVersion}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between py-1">
                                                        <span className="text-slate-400">Uptime</span>
                                                        <span className="text-slate-200">{activeDevice.uptime || "—"}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Network Capabilities */}
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                                                    Network Capabilities
                                                </h3>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Primary Role</span>
                                                        <span className="font-semibold text-white">{activeDevice.role || "Switch"}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Active Routing Engine</span>
                                                        <span className="font-semibold text-white">{routes.length > 0 ? "Enabled (IPv4 Routing Active)" : "L2 Switching Only"}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Total Interfaces Monitored</span>
                                                        <span className="font-mono text-white">{interfaces.length} ports</span>
                                                    </div>
                                                    <div className="flex justify-between py-1">
                                                        <span className="text-slate-400">Direct Neighbor Adjacencies</span>
                                                        <span className="font-mono text-white">{cdpNeighbors.length} peers</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Discovery & Telemetry Audit */}
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                                                    Credential & Crawl Audit
                                                </h3>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Credential Profile</span>
                                                        <span className="font-mono text-emerald-400 font-semibold">{activeDevice.credentialUsed || "—"}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Auth Latency</span>
                                                        <span className="text-slate-200 font-mono">{activeDevice.authTimeMs !== undefined && activeDevice.authTimeMs !== null ? `${activeDevice.authTimeMs} ms` : "—"}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Hop Distance from Seed</span>
                                                        <span className="text-blue-300 font-mono font-semibold">{activeDevice.hopDistance === 0 ? "0 (Seed Switch)" : activeDevice.hopDistance !== undefined ? `${activeDevice.hopDistance} hops` : "—"}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1">
                                                        <span className="text-slate-400">Last Verified</span>
                                                        <span className="text-emerald-400 font-mono">{formatFullVerifiedDate(activeDevice.lastVerifiedAt)}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Closet & Location */}
                                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
                                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <DoorOpen className="w-3.5 h-3.5 text-indigo-400" />
                                                    Closet & Placement Hierarchy
                                                </h3>
                                                <div className="space-y-2 text-xs">
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Assigned Site</span>
                                                        <span className="font-mono font-bold text-white">{siteCode}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Assigned IDF / Closet</span>
                                                        <span className="font-mono font-bold text-white">{idfCode}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                                                        <span className="text-slate-400">Floor Level</span>
                                                        <span className="font-semibold text-blue-300">{floorInfo.floorLabel}</span>
                                                    </div>
                                                    <div className="flex justify-between py-1">
                                                        <span className="text-slate-400">Topology Map Visibility</span>
                                                        <span className={activeDevice.excludeFromTopology ? "text-rose-400 font-semibold" : "text-emerald-400 font-semibold"}>
                                                            {activeDevice.excludeFromTopology ? "Hidden from Map" : "Visible on Canvas"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB 2: INTERFACES */}
                                {deviceActiveTab === "interfaces" && (
                                    <div className="space-y-4">
                                        {/* Interface Search and Stack Filter Bar */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                                            <div className="relative flex-1">
                                                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={interfaceSearch}
                                                    onChange={(e) => setInterfaceSearch(e.target.value)}
                                                    placeholder="Filter ports by name, IP, VLAN, description..."
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                                                />
                                                {interfaceSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setInterfaceSearch("")}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Stack Member Switch Filter */}
                                            {stackInfo.isStack && (
                                                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] shrink-0">
                                                    <span className="px-1.5 text-slate-400 font-bold uppercase text-[9px]">Stack:</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDeviceStackFilter("ALL")}
                                                        className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                                            deviceStackFilter === "ALL"
                                                                ? "bg-purple-600 text-white shadow-sm"
                                                                : "text-slate-400 hover:text-white"
                                                        }`}
                                                    >
                                                        All ({interfaces.length})
                                                    </button>
                                                    {Array.from({ length: stackInfo.stackSize }, (_, i) => String(i + 1)).map((swNum) => (
                                                        <button
                                                            key={swNum}
                                                            type="button"
                                                            onClick={() => setDeviceStackFilter(swNum)}
                                                            className={`px-2 py-0.5 rounded font-medium transition cursor-pointer ${
                                                                deviceStackFilter === swNum
                                                                    ? "bg-purple-600 text-white shadow-sm"
                                                                    : "text-slate-400 hover:text-white"
                                                            }`}
                                                        >
                                                            Switch {swNum}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <span className="text-xs text-slate-400 font-mono self-center shrink-0">
                                                {displayedInterfaces.length} of {interfaces.length} ports
                                            </span>
                                        </div>

                                        {/* Interfaces Table */}
                                        {displayedInterfaces.length === 0 ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-xs">
                                                No interfaces match the current filter.
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800 uppercase">
                                                        <tr>
                                                            <th className="py-2.5 px-4 font-semibold">Port</th>
                                                            <th className="py-2.5 px-4 font-semibold">Status</th>
                                                            <th className="py-2.5 px-4 font-semibold">IP Address</th>
                                                            <th className="py-2.5 px-4 font-semibold">VLAN / Mode</th>
                                                            <th className="py-2.5 px-4 font-semibold">Speed / Duplex</th>
                                                            <th className="py-2.5 px-4 font-semibold">Description</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/60 font-mono">
                                                        {displayedInterfaces.map((intf: any, idx: number) => {
                                                            const intfStatus = getInterfaceStatus(intf);
                                                            return (
                                                                <tr key={idx} className="hover:bg-slate-800/40 transition">
                                                                    <td className="py-2.5 px-4 font-bold text-white">
                                                                        {intf.name}
                                                                    </td>
                                                                    <td className="py-2.5 px-4 font-sans">
                                                                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${intfStatus.badgeClass}`}>
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${intfStatus.dotClass}`} />
                                                                            {intfStatus.label}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2.5 px-4">
                                                                        {intf.ip_address ? (
                                                                            <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 font-mono text-[11px] border border-blue-800/60 font-semibold">
                                                                                {intf.ip_address}{intf.cidr ? `/${intf.cidr}` : ''}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-600">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-4 text-slate-300 font-sans">
                                                                        {intf.vlan ? (
                                                                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[11px] font-mono">
                                                                                VLAN {intf.vlan}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-400">{intf.mode || "Routed"}</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                                                                        {intf.speed || intf.duplex ? `${intf.speed || ""} ${intf.duplex || ""}`.trim() : "—"}
                                                                    </td>
                                                                    <td className="py-2.5 px-4 text-slate-300 max-w-xs truncate" title={intf.description}>
                                                                        {intf.description || <span className="text-slate-600">—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TAB 3: ROUTES */}
                                {deviceActiveTab === "routes" && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>Active IPv4 Routing Table (Longest Prefix Match)</span>
                                            <span className="font-mono">{routes.length} prefixes parsed</span>
                                        </div>

                                        {routes.length === 0 ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-xs">
                                                No routing entries recorded (L2 access switch or zero routes in crawl telemetry).
                                            </div>
                                        ) : (
                                            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
                                                <table className="w-full text-xs text-left">
                                                    <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800 uppercase">
                                                        <tr>
                                                            <th className="py-2.5 px-4 font-semibold">Network / Prefix</th>
                                                            <th className="py-2.5 px-4 font-semibold">Protocol</th>
                                                            <th className="py-2.5 px-4 font-semibold">Next Hop</th>
                                                            <th className="py-2.5 px-4 font-semibold">Outgoing Interface</th>
                                                            <th className="py-2.5 px-4 font-semibold">Metric</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-800/60 font-mono">
                                                        {routes.map((r: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-slate-800/40 transition">
                                                                <td className="py-2.5 px-4 font-bold text-white">
                                                                    {r.network || r.prefix || "0.0.0.0"}/{r.cidr || r.mask || "0"}
                                                                </td>
                                                                <td className="py-2.5 px-4">
                                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                                                                        r.protocol === "connected" ? "bg-emerald-950 text-emerald-400 border border-emerald-800/60" :
                                                                        r.protocol === "static" ? "bg-blue-950 text-blue-400 border border-blue-800/60" :
                                                                        r.protocol === "ospf" ? "bg-purple-950 text-purple-400 border border-purple-800/60" :
                                                                        r.protocol === "eigrp" ? "bg-amber-950 text-amber-400 border border-amber-800/60" :
                                                                        "bg-slate-800 text-slate-300"
                                                                    }`}>
                                                                        {r.protocol || "Connected"}
                                                                    </span>
                                                                </td>
                                                                <td className="py-2.5 px-4 text-cyan-300 font-semibold">
                                                                    {r.next_hop || "Directly Connected"}
                                                                </td>
                                                                <td className="py-2.5 px-4 text-slate-200">
                                                                    {r.interface || "—"}
                                                                </td>
                                                                <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                                                                    {r.metric !== undefined ? r.metric : "—"}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TAB 4: VLANS */}
                                {deviceActiveTab === "vlans" && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>Configured Layer-2 VLAN Database</span>
                                            <span className="font-mono">{vlans.length} VLANs</span>
                                        </div>

                                        {vlans.length === 0 ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-xs">
                                                No VLAN database entries parsed for this device.
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {vlans.map((v: any, idx: number) => (
                                                    <div key={idx} className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl flex items-center justify-between text-xs hover:border-slate-700 transition">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center font-mono font-bold text-blue-400 text-sm">
                                                                {v.id || v.vlan_id}
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-white block">{v.name || `VLAN ${v.id}`}</span>
                                                                <span className="text-[11px] text-slate-400 font-mono">
                                                                    Status: <span className="text-emerald-400 font-semibold">{v.status || "active"}</span>
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {v.ports && (
                                                            <span className="text-[11px] text-slate-400 font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800" title={Array.isArray(v.ports) ? v.ports.join(", ") : String(v.ports)}>
                                                                {Array.isArray(v.ports) ? `${v.ports.length} ports` : v.ports}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* TAB 5: CDP / LLDP */}
                                {deviceActiveTab === "cdp" && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-xs text-slate-400">
                                            <span>Cisco Discovery Protocol (CDP) & LLDP Adjacencies</span>
                                            <span className="font-mono">{displayedCdpNeighbors.length} of {cdpNeighbors.length} peers</span>
                                        </div>

                                        {/* Search and Device Type Filter Pills */}
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={cdpSearchQuery}
                                                    onChange={(e) => setCdpSearchQuery(e.target.value)}
                                                    placeholder="Search host, platform, port, IP..."
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-sans"
                                                />
                                                {cdpSearchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setCdpSearchQuery("")}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Type Filter Buttons */}
                                            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                                                {[
                                                    { id: "ALL", label: `All (${cdpCounts.ALL})`, icon: Share2 },
                                                    { id: "SWITCH", label: `Switches (${cdpCounts.SWITCH})`, icon: Network },
                                                    { id: "AP", label: `APs (${cdpCounts.AP})`, icon: Wifi },
                                                    { id: "ROUTER", label: `Routers (${cdpCounts.ROUTER})`, icon: RouteIcon },
                                                    ...(cdpCounts.PHONE > 0 ? [{ id: "PHONE", label: `Phones (${cdpCounts.PHONE})`, icon: Phone }] : []),
                                                    ...(cdpCounts.OTHER > 0 ? [{ id: "OTHER", label: `Other (${cdpCounts.OTHER})`, icon: Server }] : [])
                                                ].map((tab) => {
                                                    const Icon = tab.icon;
                                                    const isSelected = cdpTypeFilter === tab.id;
                                                    return (
                                                        <button
                                                            key={tab.id}
                                                            type="button"
                                                            onClick={() => setCdpTypeFilter(tab.id as any)}
                                                            className={`px-2.5 py-1 rounded font-medium transition cursor-pointer flex items-center gap-1.5 text-xs ${
                                                                isSelected
                                                                    ? "bg-blue-600 text-white shadow-sm font-semibold"
                                                                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                                                            }`}
                                                        >
                                                            <Icon className="w-3.5 h-3.5" />
                                                            <span>{tab.label}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {displayedCdpNeighbors.length === 0 ? (
                                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-8 text-center text-slate-500 text-xs">
                                                {cdpNeighbors.length === 0
                                                    ? "No direct neighbor adjacencies recorded in crawl telemetry."
                                                    : "No neighbors match the selected filter."}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {displayedCdpNeighbors.map(({ neighbor: n, typeInfo }, idx: number) => {
                                                    const Icon = typeInfo.icon;
                                                    return (
                                                        <div key={idx} className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2 text-xs hover:border-slate-700 transition">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                                                                    <span className="font-bold text-white font-mono truncate" title={n.destination_host || n.device_id}>
                                                                        {n.destination_host || n.device_id}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${typeInfo.badgeClass}`}>
                                                                        {typeInfo.label}
                                                                    </span>
                                                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700 truncate max-w-[140px]" title={n.platform || "Cisco"}>
                                                                        {n.platform || "Cisco"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] pt-1.5 border-t border-slate-800 font-mono">
                                                                <div>
                                                                    <span className="text-slate-500 block text-[10px]">LOCAL PORT</span>
                                                                    <span className="text-slate-200 font-semibold">{n.local_port || n.local_interface || "—"}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-slate-500 block text-[10px]">REMOTE PORT</span>
                                                                    <span className="text-slate-200 font-semibold">{n.remote_port || n.remote_interface || "—"}</span>
                                                                </div>
                                                            </div>
                                                            {n.management_ip && (
                                                                <div className="pt-1 text-[11px] font-mono text-cyan-300">
                                                                    IP: {n.management_ip}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                {/* 4. FOLDER VIEW */}
                {selectedEntity.type === "folder" && (
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Pinned Folder Header */}
                        <div className="shrink-0 px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex items-center justify-between z-10 shadow-sm">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                                    <FolderTree className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">
                                        {selectedEntity.folderPath}
                                    </h2>
                                    <p className="text-xs text-slate-400 mt-0.5">
                                        Group container for network sites
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Folder Body */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-6 text-center text-slate-400 text-xs">
                                Select a specific site or closet from this group in the tree to manage and crawl assets.
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Add IDF Modal */}
            {isAddIdfModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <DoorOpen className="w-5 h-5 text-blue-400" />
                                <h3 className="text-base font-bold text-white">
                                    Add IDF Closet to {newIdfSiteCode}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAddIdfModalOpen(false)}
                                className="text-slate-400 hover:text-white"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-slate-300 font-semibold block mb-1">
                                    Closet / IDF Name
                                </label>
                                <input
                                    type="text"
                                    value={newIdfName}
                                    onChange={(e) => setNewIdfName(e.target.value.toUpperCase())}
                                    placeholder="e.g. 2MC, 3MC, IDF1, MDF"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-slate-300 font-semibold block mb-1">
                                    Select Switches to Assign to this Closet
                                </label>
                                <div className="max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-lg p-2 space-y-1">
                                    {siteMap.get(newIdfSiteCode)?.allDevices.map((dev: any) => {
                                        const isSelected = newIdfSelectedHosts.includes(dev.hostname);
                                        return (
                                            <div
                                                key={dev.hostname}
                                                onClick={() => {
                                                    setNewIdfSelectedHosts(prev => 
                                                        prev.includes(dev.hostname)
                                                            ? prev.filter(h => h !== dev.hostname)
                                                            : [...prev, dev.hostname]
                                                    );
                                                }}
                                                className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition ${
                                                    isSelected ? "bg-blue-600/30 text-blue-200 border border-blue-500/40" : "hover:bg-slate-800 text-slate-300"
                                                }`}
                                            >
                                                <span className="font-mono">{dev.hostname}</span>
                                                <span className="text-[10px] text-slate-500">{dev.primaryIp || "No IP"}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {addIdfError && (
                                <p className="text-xs text-red-400">{addIdfError}</p>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                            <button
                                type="button"
                                onClick={() => setIsAddIdfModalOpen(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNewIdf}
                                disabled={addIdfSaving}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow transition"
                            >
                                {addIdfSaving ? "Saving..." : "Create Closet"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit IDF Modal (reassign switches) */}
            {isEditIdfModalOpen && activeEditIdf && (
                <EditIdfModal
                    isOpen={isEditIdfModalOpen}
                    onClose={() => {
                        setIsEditIdfModalOpen(false);
                        setActiveEditIdf(null);
                    }}
                    siteCode={activeEditIdf.siteCode}
                    idfCode={activeEditIdf.idfCode}
                    devices={activeEditIdf.devices}
                    siteDirectory={siteDirectory}
                    onSuccess={() => {
                        if (onRefreshSnapshot) onRefreshSnapshot();
                    }}
                />
            )}
        </div>
    );
}
