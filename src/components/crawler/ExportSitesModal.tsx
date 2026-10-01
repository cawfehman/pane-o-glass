"use client";

import React, { useState, useMemo } from "react";
import { 
    X, 
    Download, 
    FileSpreadsheet, 
    Building2, 
    Server, 
    Check, 
    SlidersHorizontal,
    Filter,
    DoorOpen
} from "lucide-react";
import { getDeviceFreshness } from "./SiteInventoryManager";
import { parseDeviceSiteAndIdf, parseFloorFromIdf, detectSwitchStack } from "./TopologyGraph";

export interface ExportSitesModalProps {
    isOpen: boolean;
    onClose: () => void;
    devices?: any[];
    siteMap: Map<string, {
        siteCode: string;
        siteLookup: any;
        idfs: Map<string, any[]>;
        allDevices: any[];
    }>;
    currentFolder?: string;
    currentSite?: string;
    currentIdf?: string;
    searchQuery?: string;
    roleFilter?: string;
    freshnessFilter?: string;
}

interface ColumnOption {
    id: string;
    label: string;
    defaultChecked: boolean;
    getValue: (item: any) => string | number;
}

const DEVICE_COLUMNS: ColumnOption[] = [
    { id: "hostname", label: "Hostname", defaultChecked: true, getValue: (d) => d.hostname || "" },
    { id: "ip", label: "Management IP", defaultChecked: true, getValue: (d) => d.primaryIp || d.ip_address || d.ip || "" },
    { id: "siteCode", label: "Site Code", defaultChecked: true, getValue: (d) => d._resolvedSite || "" },
    { id: "siteName", label: "Site Name", defaultChecked: true, getValue: (d) => d._siteName || "" },
    { id: "idf", label: "Closet (IDF)", defaultChecked: true, getValue: (d) => d._resolvedIdf || "" },
    { id: "floor", label: "Floor Level", defaultChecked: true, getValue: (d) => d._floorLabel || "" },
    { id: "role", label: "Role / Tier", defaultChecked: true, getValue: (d) => d.role || "Switch" },
    { id: "model", label: "Hardware Model", defaultChecked: true, getValue: (d) => d.model || "" },
    { id: "serialNumber", label: "Serial Number", defaultChecked: true, getValue: (d) => d.serialNumber || d.serial || "" },
    { id: "status", label: "Crawl Reachability", defaultChecked: true, getValue: (d) => d.status || "UNVERIFIED" },
    { id: "freshness", label: "Crawl Freshness", defaultChecked: true, getValue: (d) => d._freshnessLabel || "" },
    { id: "lastVerifiedAt", label: "Last Verified Date", defaultChecked: true, getValue: (d) => d.lastVerifiedAt ? new Date(d.lastVerifiedAt).toLocaleString() : (d.createdAt ? new Date(d.createdAt).toLocaleString() : "") },
    { id: "version", label: "Software / OS Version", defaultChecked: false, getValue: (d) => d.version || d.softwareVersion || d.os_version || "" },
    { id: "stackStatus", label: "Switch Stack Info", defaultChecked: false, getValue: (d) => d._stackLabel || "" },
    { id: "interfacesCount", label: "Monitored Ports", defaultChecked: false, getValue: (d) => Array.isArray(d.interfaces) ? d.interfaces.length : 0 },
    { id: "folderPath", label: "Network Group / Folder", defaultChecked: true, getValue: (d) => d._folderPath || "Unassigned" },
    { id: "address", label: "Physical Address", defaultChecked: false, getValue: (d) => d._siteAddress || "" },
    { id: "city", label: "City", defaultChecked: false, getValue: (d) => d._siteCity || "" },
];

const SITE_COLUMNS: ColumnOption[] = [
    { id: "siteCode", label: "Site Code", defaultChecked: true, getValue: (s) => s.siteCode },
    { id: "siteName", label: "Site Name / Description", defaultChecked: true, getValue: (s) => s.siteLookup?.name || s.siteCode },
    { id: "address", label: "Physical Address", defaultChecked: true, getValue: (s) => s.siteLookup?.address || "" },
    { id: "city", label: "City", defaultChecked: true, getValue: (s) => s.siteLookup?.city || "" },
    { id: "status", label: "Operational Status", defaultChecked: true, getValue: (s) => s.siteLookup?.status || "Active" },
    { id: "folderPath", label: "Network Group / Folder", defaultChecked: true, getValue: (s) => s.siteLookup?.folderPath || "Unassigned" },
    { id: "isHub", label: "Critical Facility (Hub)", defaultChecked: true, getValue: (s) => s.siteLookup?.isHub ? "Yes" : "No" },
    { id: "locationType", label: "Facility / Location Type", defaultChecked: false, getValue: (s) => s.siteLookup?.locationType || "" },
    { id: "idfCount", label: "Total Closets (IDFs)", defaultChecked: true, getValue: (s) => s.idfs.size },
    { id: "switchCount", label: "Total Managed Switches", defaultChecked: true, getValue: (s) => s.allDevices.length },
    { id: "freshCount", label: "Fresh Switches (≤24h Verified)", defaultChecked: false, getValue: (s) => s.allDevices.filter((d: any) => getDeviceFreshness(d).category === "fresh").length },
    { id: "notes", label: "Notes / Operational Details", defaultChecked: false, getValue: (s) => s.siteLookup?.notes || "" }
];

export default function ExportSitesModal({
    isOpen,
    onClose,
    devices = [],
    siteMap,
    currentFolder = "All",
    currentSite,
    currentIdf,
    searchQuery = "",
    roleFilter = "ALL",
    freshnessFilter = "ALL"
}: ExportSitesModalProps) {
    const isRootOrAll = currentFolder === "Root" || currentFolder === "All";
    const today = new Date().toISOString().split("T")[0];

    // Export Mode: "devices" (Nodes) vs "sites" (Summary)
    const [exportMode, setExportMode] = useState<"devices" | "sites">("devices");

    // Scope Selection
    const [scope, setScope] = useState<"all" | "context" | "filtered" | "reachable">(
        (currentSite || currentIdf || !isRootOrAll) ? "context" : "all"
    );

    // Selected Column IDs for Device Export
    const [deviceColumns, setDeviceColumns] = useState<Set<string>>(() => {
        const s = new Set<string>();
        DEVICE_COLUMNS.forEach(c => { if (c.defaultChecked) s.add(c.id); });
        return s;
    });

    // Selected Column IDs for Site Export
    const [siteColumns, setSiteColumns] = useState<Set<string>>(() => {
        const s = new Set<string>();
        SITE_COLUMNS.forEach(c => { if (c.defaultChecked) s.add(c.id); });
        return s;
    });

    // Output Filename
    const [filename, setFilename] = useState(`cooper_network_nodes_${today}.csv`);

    // Switch filename dynamically when toggling mode if user hasn't heavily customized it
    const handleModeChange = (newMode: "devices" | "sites") => {
        setExportMode(newMode);
        if (newMode === "devices") {
            setFilename(`cooper_network_nodes_${today}.csv`);
        } else {
            setFilename(`cooper_network_sites_${today}.csv`);
        }
    };

    // Enrich all devices with resolved site, IDF, floor, stack, and freshness info
    const enrichedDevices = useMemo(() => {
        return devices.map(dev => {
            const { site: resolvedSite, idf: resolvedIdf } = parseDeviceSiteAndIdf(
                dev.hostname, 
                dev.siteOverride || dev.site, 
                dev.idfOverride || dev.idf
            );
            const upperSite = resolvedSite.toUpperCase();
            const upperIdf = resolvedIdf.toUpperCase();
            const siteEntry = siteMap.get(upperSite);
            const floorInfo = parseFloorFromIdf(upperIdf);
            const stackInfo = detectSwitchStack(dev);
            const freshness = getDeviceFreshness(dev);

            return {
                ...dev,
                _resolvedSite: upperSite,
                _resolvedIdf: upperIdf,
                _floorLabel: floorInfo.floorLabel,
                _siteName: siteEntry?.siteLookup?.name || upperSite,
                _siteAddress: siteEntry?.siteLookup?.address || "",
                _siteCity: siteEntry?.siteLookup?.city || "",
                _folderPath: siteEntry?.siteLookup?.folderPath || "Unassigned",
                _freshnessCategory: freshness.category,
                _freshnessLabel: freshness.label,
                _stackLabel: stackInfo.isStack 
                    ? `Stack (${stackInfo.stackMembers?.length || 2} members)` 
                    : "Standalone"
            };
        });
    }, [devices, siteMap]);

    // Candidate Devices to Export
    const exportedDevices = useMemo(() => {
        return enrichedDevices.filter(dev => {
            // Scope Filter
            if (scope === "reachable") {
                if (dev.status !== "REACHABLE") return false;
            } else if (scope === "context") {
                if (currentIdf && currentSite) {
                    if (dev._resolvedSite !== currentSite.toUpperCase() || dev._resolvedIdf !== currentIdf.toUpperCase()) return false;
                } else if (currentSite) {
                    if (dev._resolvedSite !== currentSite.toUpperCase()) return false;
                } else if (!isRootOrAll) {
                    const fp = dev._folderPath || "";
                    if (fp !== currentFolder && !fp.startsWith(currentFolder + "/")) return false;
                }
            } else if (scope === "filtered") {
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const hostMatch = (dev.hostname || "").toLowerCase().includes(q);
                    const ipMatch = (dev.primaryIp || dev.ip_address || dev.ip || "").toLowerCase().includes(q);
                    const siteMatch = dev._resolvedSite.toLowerCase().includes(q) || dev._siteName.toLowerCase().includes(q);
                    const idfMatch = dev._resolvedIdf.toLowerCase().includes(q);
                    const modelMatch = (dev.model || "").toLowerCase().includes(q);
                    if (!hostMatch && !ipMatch && !siteMatch && !idfMatch && !modelMatch) return false;
                }
                if (roleFilter !== "ALL") {
                    if (roleFilter === "CORE" && dev.role !== "Core") return false;
                    if (roleFilter === "DIST" && dev.role !== "Distribution") return false;
                    if (roleFilter === "ACCESS" && dev.role !== "Access") return false;
                    if (roleFilter === "L3" && (dev.role !== "Router" && dev.role !== "L3 Switch")) return false;
                    if (roleFilter === "L2" && (dev.role === "Router" || dev.role === "L3 Switch")) return false;
                }
                if (freshnessFilter !== "ALL") {
                    if (dev._freshnessCategory.toUpperCase() !== freshnessFilter) return false;
                }
            }
            return true;
        }).sort((a, b) => {
            if (a._resolvedSite !== b._resolvedSite) return a._resolvedSite.localeCompare(b._resolvedSite);
            if (a._resolvedIdf !== b._resolvedIdf) return a._resolvedIdf.localeCompare(b._resolvedIdf);
            return (a.hostname || "").localeCompare(b.hostname || "");
        });
    }, [enrichedDevices, scope, currentSite, currentIdf, isRootOrAll, currentFolder, searchQuery, roleFilter, freshnessFilter]);

    // Candidate Sites to Export (when in Sites Summary mode)
    const exportedSites = useMemo(() => {
        const allList = Array.from(siteMap.values());
        return allList.filter(entry => {
            if (scope === "reachable") {
                return (entry.siteLookup?.status || "Active").toLowerCase() === "active";
            }
            if (scope === "context") {
                if (currentSite) {
                    return entry.siteCode === currentSite.toUpperCase();
                }
                if (!isRootOrAll) {
                    const fp = entry.siteLookup?.folderPath || "";
                    return fp === currentFolder || fp.startsWith(currentFolder + "/");
                }
            }
            if (scope === "filtered") {
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const codeMatch = entry.siteCode.toLowerCase().includes(q);
                    const nameMatch = (entry.siteLookup?.name || "").toLowerCase().includes(q);
                    const devMatch = entry.allDevices.some((d: any) => (d.hostname || "").toLowerCase().includes(q));
                    if (!codeMatch && !nameMatch && !devMatch) return false;
                }
            }
            return true;
        }).sort((a, b) => a.siteCode.localeCompare(b.siteCode, undefined, { numeric: true }));
    }, [siteMap, scope, currentSite, isRootOrAll, currentFolder, searchQuery]);

    if (!isOpen) return null;

    const activeCols = exportMode === "devices" ? DEVICE_COLUMNS : SITE_COLUMNS;
    const selectedCols = exportMode === "devices" ? deviceColumns : siteColumns;
    const setSelectedCols = exportMode === "devices" ? setDeviceColumns : setSiteColumns;

    const toggleColumn = (id: string) => {
        setSelectedCols(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size > 1) next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectAll = () => {
        setSelectedCols(new Set(activeCols.map(c => c.id)));
    };

    const handleResetDefault = () => {
        const next = new Set<string>();
        activeCols.forEach(c => { if (c.defaultChecked) next.add(c.id); });
        setSelectedCols(next);
    };

    // Generate CSV and trigger browser download
    const handleDownload = () => {
        const colsToRender = activeCols.filter(c => selectedCols.has(c.id));
        const escapeCsv = (val: any) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const headers = colsToRender.map(c => escapeCsv(c.label)).join(",");
        const records = exportMode === "devices" ? exportedDevices : exportedSites;
        const rows = records.map(item => {
            return colsToRender.map(c => escapeCsv(c.getValue(item))).join(",");
        });

        const csvContent = [headers, ...rows].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        onClose();
    };

    const recordCount = exportMode === "devices" ? exportedDevices.length : exportedSites.length;

    // Descriptive context label
    let contextLabel = "Current View";
    if (currentIdf && currentSite) contextLabel = `Closet ${currentSite}:${currentIdf}`;
    else if (currentSite) contextLabel = `Site ${currentSite}`;
    else if (!isRootOrAll) contextLabel = `Group: ${currentFolder}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                <span>Network Inventory CSV Export</span>
                                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono font-bold">
                                    {recordCount} {exportMode === "devices" ? "Nodes" : "Sites"}
                                </span>
                            </h3>
                            <p className="text-xs text-slate-400">
                                Export individual switches/nodes or site facility summaries with custom columns.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
                    {/* Step 1: Export Mode Toggle (Nodes vs Sites) */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <span>1. Export Record Type</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => handleModeChange("devices")}
                                className={`p-3.5 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                                    exportMode === "devices"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${exportMode === "devices" ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-400"}`}>
                                    <Server className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="text-xs font-bold block">Network Nodes & Switches</span>
                                    <span className="text-[11px] text-slate-400">
                                        1 row per switch with site, IDF, IP, model, & status
                                    </span>
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleModeChange("sites")}
                                className={`p-3.5 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                                    exportMode === "sites"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <div className={`p-2 rounded-lg ${exportMode === "sites" ? "bg-blue-500/20 text-blue-400" : "bg-slate-800 text-slate-400"}`}>
                                    <Building2 className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="text-xs font-bold block">Sites & Facilities Summary</span>
                                    <span className="text-[11px] text-slate-400">
                                        1 row per site with closet & device totals
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Step 2: Scope Selection */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <Filter className="w-3.5 h-3.5 text-blue-400" />
                            <span>2. Target Scope</span>
                        </label>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                                type="button"
                                onClick={() => setScope("all")}
                                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                                    scope === "all"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">Entire Network</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    {exportMode === "devices" ? `${devices.length} switches` : `${siteMap.size} sites`}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("context")}
                                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                                    scope === "context"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block truncate" title={contextLabel}>
                                    {contextLabel}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    Current workspace
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("filtered")}
                                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                                    scope === "filtered"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">Search / Filters</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    {searchQuery ? `"${searchQuery}"` : "Active filters"}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("reachable")}
                                className={`p-2.5 rounded-xl border text-left transition flex flex-col gap-0.5 cursor-pointer ${
                                    scope === "reachable"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">
                                    {exportMode === "devices" ? "Reachable Only" : "Active Only"}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    Healthy status
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Step 3: Select Columns */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                                <span>3. Select Columns ({selectedCols.size} selected)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                                >
                                    Select All
                                </button>
                                <span className="text-slate-600">•</span>
                                <button
                                    type="button"
                                    onClick={handleResetDefault}
                                    className="text-[11px] text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
                                >
                                    Default
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800 max-h-56 overflow-y-auto custom-scrollbar">
                            {activeCols.map(col => {
                                const isChecked = selectedCols.has(col.id);
                                return (
                                    <div
                                        key={col.id}
                                        onClick={() => toggleColumn(col.id)}
                                        className={`flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer select-none transition ${
                                            isChecked 
                                                ? "bg-blue-500/10 border-blue-500/30 text-slate-100" 
                                                : "bg-slate-900/40 border-slate-800/80 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                        }`}
                                    >
                                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                            isChecked
                                                ? "bg-blue-600 border-blue-500 text-white"
                                                : "border-slate-700 bg-slate-900"
                                        }`}>
                                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <span className="text-xs font-medium truncate">
                                            {col.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 4: Filename */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                            4. Filename
                        </label>
                        <input
                            type="text"
                            value={filename}
                            onChange={(e) => setFilename(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
                    <div className="text-xs text-slate-400">
                        Exporting <strong className="text-white font-mono">{recordCount}</strong> {exportMode === "devices" ? "nodes" : "sites"} with{" "}
                        <strong className="text-blue-400 font-mono">{selectedCols.size}</strong> columns
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={recordCount === 0 || selectedCols.size === 0}
                            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download .CSV</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
