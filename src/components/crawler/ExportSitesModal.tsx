"use client";

import React, { useState, useMemo } from "react";
import { 
    X, 
    Download, 
    FileSpreadsheet, 
    Building2, 
    Server, 
    CheckSquare, 
    Square, 
    Check, 
    Layers, 
    SlidersHorizontal,
    Filter
} from "lucide-react";
import { getDeviceFreshness } from "./SiteInventoryManager";

export interface ExportSitesModalProps {
    isOpen: boolean;
    onClose: () => void;
    siteMap: Map<string, {
        siteCode: string;
        siteLookup: any;
        idfs: Map<string, any[]>;
        allDevices: any[];
    }>;
    currentFolder?: string;
    searchQuery?: string;
    roleFilter?: string;
    freshnessFilter?: string;
}

interface ColumnOption {
    id: string;
    label: string;
    category: "site" | "metrics" | "metadata";
    defaultChecked: boolean;
    getValue: (entry: any) => string | number;
}

const AVAILABLE_COLUMNS: ColumnOption[] = [
    {
        id: "siteCode",
        label: "Site Code",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteCode
    },
    {
        id: "siteName",
        label: "Site Name / Description",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.name || entry.siteCode
    },
    {
        id: "address",
        label: "Physical Address",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.address || ""
    },
    {
        id: "city",
        label: "City",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.city || ""
    },
    {
        id: "status",
        label: "Operational Status",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.status || "Active"
    },
    {
        id: "folderPath",
        label: "Network Group / Folder",
        category: "site",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.folderPath || "Unassigned"
    },
    {
        id: "isHub",
        label: "Critical Facility (Hub)",
        category: "metadata",
        defaultChecked: true,
        getValue: (entry) => entry.siteLookup?.isHub ? "Yes" : "No"
    },
    {
        id: "locationType",
        label: "Facility / Location Type",
        category: "metadata",
        defaultChecked: false,
        getValue: (entry) => entry.siteLookup?.locationType || ""
    },
    {
        id: "idfCount",
        label: "Total Closets (IDFs)",
        category: "metrics",
        defaultChecked: true,
        getValue: (entry) => entry.idfs.size
    },
    {
        id: "switchCount",
        label: "Total Managed Switches",
        category: "metrics",
        defaultChecked: true,
        getValue: (entry) => entry.allDevices.length
    },
    {
        id: "freshCount",
        label: "Fresh Switches (≤24h Verified)",
        category: "metrics",
        defaultChecked: false,
        getValue: (entry) => entry.allDevices.filter((d: any) => getDeviceFreshness(d).category === "fresh").length
    },
    {
        id: "notes",
        label: "Notes / Operational Details",
        category: "metadata",
        defaultChecked: false,
        getValue: (entry) => entry.siteLookup?.notes || ""
    }
];

export default function ExportSitesModal({
    isOpen,
    onClose,
    siteMap,
    currentFolder = "All",
    searchQuery = "",
    roleFilter = "ALL",
    freshnessFilter = "ALL"
}: ExportSitesModalProps) {
    const isRootOrAll = currentFolder === "Root" || currentFolder === "All";

    // Export Scope
    const [scope, setScope] = useState<"all" | "folder" | "active" | "filtered">(
        isRootOrAll ? "all" : "folder"
    );

    // Selected Column IDs
    const [selectedColumns, setSelectedColumns] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        AVAILABLE_COLUMNS.forEach(col => {
            if (col.defaultChecked) initial.add(col.id);
        });
        return initial;
    });

    // Custom Filename
    const today = new Date().toISOString().split("T")[0];
    const [filename, setFilename] = useState(`cooper_network_sites_${today}.csv`);

    // Calculate candidate sites based on selected scope
    const exportedSites = useMemo(() => {
        const allList = Array.from(siteMap.values());

        return allList.filter(entry => {
            if (scope === "active") {
                return (entry.siteLookup?.status || "Active").toLowerCase() === "active";
            }
            if (scope === "folder") {
                if (isRootOrAll) return true;
                const fp = entry.siteLookup?.folderPath || "";
                return fp === currentFolder || fp.startsWith(currentFolder + "/");
            }
            if (scope === "filtered") {
                // Apply search filter if present
                if (searchQuery) {
                    const q = searchQuery.toLowerCase();
                    const codeMatch = entry.siteCode.toLowerCase().includes(q);
                    const nameMatch = (entry.siteLookup?.name || "").toLowerCase().includes(q);
                    const addrMatch = (entry.siteLookup?.address || "").toLowerCase().includes(q);
                    const devMatch = entry.allDevices.some((d: any) => 
                        (d.hostname || "").toLowerCase().includes(q) || (d.ip || "").toLowerCase().includes(q)
                    );
                    if (!codeMatch && !nameMatch && !addrMatch && !devMatch) return false;
                }
                // Apply freshness filter
                if (freshnessFilter !== "ALL") {
                    const matchesFreshness = entry.allDevices.some((d: any) => 
                        getDeviceFreshness(d).category.toUpperCase() === freshnessFilter
                    );
                    if (!matchesFreshness && entry.allDevices.length > 0) return false;
                }
                return true;
            }
            return true; // "all"
        }).sort((a, b) => a.siteCode.localeCompare(b.siteCode, undefined, { numeric: true }));
    }, [siteMap, scope, currentFolder, isRootOrAll, searchQuery, freshnessFilter]);

    if (!isOpen) return null;

    const toggleColumn = (id: string) => {
        setSelectedColumns(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size > 1) next.delete(id); // Keep at least one column
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSelectAllColumns = () => {
        setSelectedColumns(new Set(AVAILABLE_COLUMNS.map(c => c.id)));
    };

    const handleResetColumns = () => {
        const next = new Set<string>();
        AVAILABLE_COLUMNS.forEach(c => {
            if (c.defaultChecked) next.add(c.id);
        });
        setSelectedColumns(next);
    };

    // Generate CSV and trigger browser download
    const handleDownload = () => {
        const activeCols = AVAILABLE_COLUMNS.filter(c => selectedColumns.has(c.id));
        
        // Escape helper for RFC 4180 CSV
        const escapeCsv = (val: any) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        // Header Row
        const headers = activeCols.map(c => escapeCsv(c.label)).join(",");

        // Data Rows
        const rows = exportedSites.map(site => {
            return activeCols.map(c => escapeCsv(c.getValue(site))).join(",");
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                                <span>Export Sites to CSV</span>
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">
                                    {exportedSites.length} Sites Ready
                                </span>
                            </h3>
                            <p className="text-xs text-slate-400">
                                Configure target site scope and choose fields to export.
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
                <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                    {/* Section 1: Scope Selection */}
                    <div className="space-y-2.5">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                            <Filter className="w-3.5 h-3.5 text-blue-400" />
                            <span>1. Select Export Scope</span>
                        </label>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                                type="button"
                                onClick={() => setScope("all")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                                    scope === "all"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">All Sites</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    {siteMap.size} sites
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("folder")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                                    scope === "folder"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block truncate" title={currentFolder}>
                                    Group: {currentFolder}
                                </span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    Active group
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("active")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                                    scope === "active"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">Active Only</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    Status: Active
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setScope("filtered")}
                                className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 cursor-pointer ${
                                    scope === "filtered"
                                        ? "bg-blue-600/15 border-blue-500 text-white shadow-sm"
                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                                }`}
                            >
                                <span className="text-xs font-bold block">Search Results</span>
                                <span className="text-[11px] font-mono text-slate-500">
                                    {searchQuery ? `"${searchQuery}"` : "Filtered"}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Section 2: Choose Fields */}
                    <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                                <span>2. Select Columns ({selectedColumns.size} selected)</span>
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleSelectAllColumns}
                                    className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                                >
                                    Select All
                                </button>
                                <span className="text-slate-600">•</span>
                                <button
                                    type="button"
                                    onClick={handleResetColumns}
                                    className="text-[11px] text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
                                >
                                    Default
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                            {AVAILABLE_COLUMNS.map(col => {
                                const isChecked = selectedColumns.has(col.id);
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

                    {/* Section 3: File Output Name */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                            3. Filename
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
                        Exporting <strong className="text-white font-mono">{exportedSites.length}</strong> sites with{" "}
                        <strong className="text-blue-400 font-mono">{selectedColumns.size}</strong> columns
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={exportedSites.length === 0 || selectedColumns.size === 0}
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
