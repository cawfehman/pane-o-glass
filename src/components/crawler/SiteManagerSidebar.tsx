"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
    Folder, 
    FolderPlus, 
    FolderOpen, 
    FolderTree,
    ChevronRight, 
    ChevronDown, 
    Plus, 
    Search, 
    Building, 
    Edit2, 
    Crosshair, 
    FileSpreadsheet, 
    Upload, 
    Download, 
    Check, 
    X, 
    SlidersHorizontal,
    Tag,
    Layers,
    ChevronLeft,
    RefreshCw
} from "lucide-react";

import { SiteMetadata, parseSiteCsv, stringifySiteCsv } from "@/lib/sites";
import { SiteModal } from "@/components/sites/SiteModal";

interface TreeNode {
    name: string;
    fullPath: string;
    subFolders: Record<string, TreeNode>;
    sites: SiteMetadata[];
}

interface SiteManagerSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
    onLocateSite?: (siteCode: string) => void;
    onSitesChanged?: (sites: SiteMetadata[]) => void;
    highlightedSiteCode?: string | null;
}

export default function SiteManagerSidebar({
    isOpen,
    onToggle,
    onLocateSite,
    onSitesChanged,
    highlightedSiteCode
}: SiteManagerSidebarProps) {
    const [sites, setSites] = useState<SiteMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

    // Modal states
    const [isSiteModalOpen, setIsSiteModalOpen] = useState(false);
    const [siteModalMode, setSiteModalMode] = useState<'add' | 'edit'>('add');
    const [selectedSite, setSelectedSite] = useState<any>({
        code: "",
        name: "",
        address: "",
        status: "Active",
        notes: "",
        locationType: "Ambulatory",
        city: "",
        folderPath: "",
        isHub: false
    });
    const [actionLoading, setActionLoading] = useState(false);
    const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // New Folder prompt modal
    const [newFolderParent, setNewFolderParent] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState("");
    const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);

    // Fetch sites from API
    const loadSites = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/sites');
            const data = await res.json();
            if (data.versions && data.versions.length > 0) {
                const latest = data.versions[0];
                if (latest.content) {
                    const parsed = parseSiteCsv(latest.content);
                    setSites(parsed);
                    if (onSitesChanged) onSitesChanged(parsed);
                }
            }
        } catch (e: any) {
            console.error("Failed to load sites in sidebar:", e);
        } finally {
            setLoading(false);
        }
    }, [onSitesChanged]);

    useEffect(() => {
        loadSites();
    }, [loadSites]);

    // Unique existing folder paths
    const existingFolderPaths = useMemo(() => {
        const set = new Set<string>();
        sites.forEach(s => {
            if (s.folderPath) {
                const parts = s.folderPath.split("/").map(p => p.trim()).filter(Boolean);
                let current = "";
                for (const part of parts) {
                    current = current ? `${current}/${part}` : part;
                    set.add(current);
                }
            }
        });
        return Array.from(set).sort();
    }, [sites]);

    // Build hierarchy tree
    const rootTree = useMemo(() => {
        const root: TreeNode = {
            name: "Root",
            fullPath: "",
            subFolders: {},
            sites: []
        };

        const query = searchQuery.toLowerCase().trim();

        sites.forEach(site => {
            if (query) {
                const matches = site.code.toLowerCase().includes(query) ||
                    site.name.toLowerCase().includes(query) ||
                    (site.city && site.city.toLowerCase().includes(query)) ||
                    (site.folderPath && site.folderPath.toLowerCase().includes(query)) ||
                    (site.locationType && site.locationType.toLowerCase().includes(query));
                if (!matches) return;
            }

            const rawPath = site.folderPath?.trim();
            if (!rawPath) {
                // Put in Unassigned folder
                if (!root.subFolders["Unassigned"]) {
                    root.subFolders["Unassigned"] = {
                        name: "Unassigned",
                        fullPath: "Unassigned",
                        subFolders: {},
                        sites: []
                    };
                }
                root.subFolders["Unassigned"].sites.push(site);
                return;
            }

            const parts = rawPath.split("/").map(p => p.trim()).filter(Boolean);
            let currentLevel = root;
            let pathAccum = "";

            parts.forEach((part, idx) => {
                pathAccum = pathAccum ? `${pathAccum}/${part}` : part;
                if (!currentLevel.subFolders[part]) {
                    currentLevel.subFolders[part] = {
                        name: part,
                        fullPath: pathAccum,
                        subFolders: {},
                        sites: []
                    };
                }
                if (idx === parts.length - 1) {
                    currentLevel.subFolders[part].sites.push(site);
                }
                currentLevel = currentLevel.subFolders[part];
            });
        });

        return root;
    }, [sites, searchQuery]);

    // Auto-expand root level folders on initial load
    useEffect(() => {
        if (existingFolderPaths.length > 0 && Object.keys(expandedFolders).length === 0) {
            const initial: Record<string, boolean> = { "Unassigned": true };
            existingFolderPaths.forEach(p => {
                if (!p.includes("/")) initial[p] = true;
            });
            setExpandedFolders(initial);
        }
    }, [existingFolderPaths]);

    const toggleFolder = (folderPath: string) => {
        setExpandedFolders(prev => ({
            ...prev,
            [folderPath]: !prev[folderPath]
        }));
    };

    // Site CRUD Action
    const performAction = async (action: 'add' | 'update' | 'delete', siteData: any, addAnother: boolean = false) => {
        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, site: siteData })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setFeedbackMsg({ 
                type: 'success', 
                text: `Site ${siteData.code} successfully ${action === 'add' ? 'created' : action === 'update' ? 'saved' : 'removed'}.` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            if (action === 'add' && addAnother) {
                setSelectedSite({
                    code: "",
                    name: "",
                    address: "",
                    status: "Active",
                    notes: "",
                    locationType: siteData.locationType || "Ambulatory",
                    city: siteData.city || "",
                    folderPath: siteData.folderPath || "",
                    isHub: false
                });
            } else {
                setIsSiteModalOpen(false);
            }

            await loadSites();
            return true;
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Operation failed' });
            setTimeout(() => setFeedbackMsg(null), 5000);
            return false;
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenEdit = (site: SiteMetadata) => {
        setSelectedSite({ ...site });
        setSiteModalMode('edit');
        setIsSiteModalOpen(true);
    };

    const handleOpenAdd = (defaultFolderPath?: string) => {
        setSelectedSite({
            code: "",
            name: "",
            address: "",
            status: "Active",
            notes: "",
            locationType: "Ambulatory",
            city: "",
            folderPath: defaultFolderPath || "",
            isHub: false
        });
        setSiteModalMode('add');
        setIsSiteModalOpen(true);
    };

    // Add folder handler
    const handleCreateFolder = () => {
        if (!newFolderName.trim()) return;
        const targetPath = newFolderParent 
            ? `${newFolderParent}/${newFolderName.trim()}` 
            : newFolderName.trim();
        
        // Auto-expand parent and new folder
        setExpandedFolders(prev => ({
            ...prev,
            [newFolderParent || '']: true,
            [targetPath]: true
        }));

        setIsNewFolderOpen(false);
        setNewFolderName("");
        setNewFolderParent(null);

        // Open Add Site dialog pre-filled with this folder!
        handleOpenAdd(targetPath);
    };

    // Export CSV
    const handleExportCsv = () => {
        const csv = stringifySiteCsv(sites);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Site_Hierarchy_Export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Render tree recursively
    const renderFolder = (node: TreeNode, depth: number = 0) => {
        const isExpanded = expandedFolders[node.fullPath] !== false;
        const subFolderKeys = Object.keys(node.subFolders).sort();
        const totalSites = countFolderSites(node);

        return (
            <div key={node.fullPath || "root"} className="select-none">
                {node.name !== "Root" && (
                    <div 
                        className={`group flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer text-xs ${
                            depth > 0 ? 'ml-3' : ''
                        }`}
                        onClick={() => toggleFolder(node.fullPath)}
                    >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <button 
                                type="button" 
                                className="text-muted group-hover:text-white p-0.5 rounded transition-transform"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFolder(node.fullPath);
                                }}
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-accent-primary" />
                                ) : (
                                    <ChevronRight className="w-3.5 h-3.5 text-muted" />
                                )}
                            </button>
                            {isExpanded ? (
                                <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                            ) : (
                                <Folder className="w-3.5 h-3.5 text-sky-400/70 shrink-0" />
                            )}
                            <span className="font-semibold text-white/90 truncate text-[11px]">
                                {node.name}
                            </span>
                            <span className="text-[10px] text-muted px-1.5 py-0.2 bg-white/5 rounded-full border border-white/10 shrink-0">
                                {totalSites}
                            </span>
                        </div>

                        {/* Folder Quick Actions */}
                        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                            <button
                                type="button"
                                title="Add Subfolder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setNewFolderParent(node.fullPath);
                                    setIsNewFolderOpen(true);
                                }}
                                className="p-1 rounded hover:bg-white/10 text-muted hover:text-sky-300"
                            >
                                <FolderPlus className="w-3 h-3" />
                            </button>
                            <button
                                type="button"
                                title="Add Site to Folder"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenAdd(node.fullPath);
                                }}
                                className="p-1 rounded hover:bg-white/10 text-muted hover:text-emerald-300"
                            >
                                <Plus className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Sub-items if expanded */}
                {(isExpanded || node.name === "Root") && (
                    <div className={node.name !== "Root" ? "pl-2 border-l border-white/5 ml-3" : ""}>
                        {subFolderKeys.map(k => renderFolder(node.subFolders[k], depth + 1))}

                        {/* Sites directly in this folder */}
                        {node.sites.map(site => {
                            const isHighlighted = highlightedSiteCode?.toUpperCase() === site.code.toUpperCase();
                            return (
                                <div 
                                    key={site.code} 
                                    className={`group flex items-center justify-between py-1 px-2 my-0.5 rounded-lg border transition-all text-xs ${
                                        isHighlighted 
                                            ? 'bg-accent-primary/20 border-accent-primary/60 text-white' 
                                            : 'border-transparent hover:bg-white/[0.04] text-white/80'
                                    }`}
                                >
                                    <div 
                                        className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                        onClick={() => onLocateSite && onLocateSite(site.code)}
                                        title={`${site.code} - ${site.name}\nClick to locate on canvas`}
                                    >
                                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            site.status === 'Active' ? 'bg-emerald-400' :
                                            site.status === 'Future' ? 'bg-amber-400' : 'bg-rose-400'
                                        }`} />
                                        <span className="font-black text-[11px] tracking-wide text-white truncate">
                                            {site.code}
                                        </span>
                                        {site.isHub && (
                                            <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                HUB
                                            </span>
                                        )}
                                        <span className="text-[10px] text-muted truncate">
                                            {site.name}
                                        </span>
                                    </div>

                                    {/* Action Icons */}
                                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                                        <button
                                            type="button"
                                            title="Locate on Canvas"
                                            onClick={() => onLocateSite && onLocateSite(site.code)}
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-accent-primary"
                                        >
                                            <Crosshair className="w-3 h-3" />
                                        </button>
                                        <button
                                            type="button"
                                            title="Edit Site Details"
                                            onClick={() => handleOpenEdit(site)}
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-white"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    function countFolderSites(node: TreeNode): number {
        let count = node.sites.length;
        Object.values(node.subFolders).forEach(sub => {
            count += countFolderSites(sub);
        });
        return count;
    }

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={onToggle}
                className="absolute top-16 left-3 z-30 flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/90 border border-white/20 text-white hover:text-accent-primary shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md transition-all cursor-pointer group"
                title="Expand Site & Hierarchy Manager"
            >
                <FolderTree className="w-4 h-4 text-accent-primary group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold tracking-tight">Site Directory</span>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-hover:text-white" />
            </button>
        );
    }

    return (
        <aside className="w-80 h-full flex flex-col bg-slate-950/95 border-r border-white/10 backdrop-blur-xl shrink-0 z-30 shadow-2xl relative animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <FolderTree className="w-4 h-4 text-accent-primary" />
                    <div>
                        <h2 className="text-xs font-black text-white tracking-wide uppercase">Site Hierarchy</h2>
                        <p className="text-[10px] text-muted">{sites.length} sites provisioned</p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={loadSites}
                        disabled={loading}
                        title="Reload Site Directory"
                        className="p-1.5 rounded-lg border border-white/10 text-muted hover:text-white hover:bg-white/5 transition-all"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        type="button"
                        onClick={onToggle}
                        title="Collapse Sidebar"
                        className="p-1.5 rounded-lg border border-white/10 text-muted hover:text-white hover:bg-white/5 transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="p-2 border-b border-white/5 bg-white/[0.01] flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => handleOpenAdd()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent-primary/10 hover:bg-accent-primary/20 border border-accent-primary/30 text-accent-primary text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Site
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setNewFolderParent(null);
                        setIsNewFolderOpen(true);
                    }}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold transition-all cursor-pointer"
                    title="Create Root Group"
                >
                    <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                    Group
                </button>
                <button
                    type="button"
                    onClick={handleExportCsv}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-white transition-all cursor-pointer"
                    title="Export Hierarchy CSV"
                >
                    <Download className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Search Box */}
            <div className="p-2.5 border-b border-white/5">
                <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Filter sites, folders, cities..."
                        className="w-full pl-8 pr-7 py-1.5 bg-black/60 border border-white/10 rounded-lg text-xs text-white placeholder:text-muted/60 focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-2 text-muted hover:text-white text-xs"
                        >
                            &times;
                        </button>
                    )}
                </div>
            </div>

            {/* Feedback alert toast */}
            {feedbackMsg && (
                <div className={`mx-3 my-2 p-2 rounded-lg text-[11px] font-semibold border flex items-center gap-2 animate-in fade-in duration-200 ${
                    feedbackMsg.type === 'success' 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}>
                    {feedbackMsg.type === 'success' ? <Check className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{feedbackMsg.text}</span>
                </div>
            )}

            {/* Tree View Canvas */}
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted">
                        <RefreshCw className="w-5 h-5 animate-spin text-accent-primary" />
                        <span className="text-xs">Loading site hierarchy...</span>
                    </div>
                ) : (
                    renderFolder(rootTree)
                )}
            </div>

            {/* Bottom Footer Info */}
            <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px] text-muted">
                <span>Multi-level folders</span>
                <span className="font-mono text-[10px] text-accent-primary">Drag or edit nodes</span>
            </div>

            {/* Create Folder Modal */}
            {isNewFolderOpen && (
                <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-sm border border-white/20 p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FolderPlus className="w-4 h-4 text-sky-400" />
                            {newFolderParent ? `New Subfolder in "${newFolderParent}"` : "Create New Group Folder"}
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Group sites into this category for organized rendering on the topology canvas.
                        </p>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            placeholder="e.g. South Jersey Clinics or Acute Care Hubs"
                            autoFocus
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsNewFolderOpen(false);
                                    setNewFolderName("");
                                    setNewFolderParent(null);
                                }}
                                className="px-3 py-1.5 text-xs text-muted hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreateFolder}
                                disabled={!newFolderName.trim()}
                                className="px-3.5 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-primary/80 text-black rounded-lg transition-all shadow-md cursor-pointer"
                            >
                                Create & Add Site
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Site Add / Edit Modal */}
            <SiteModal
                isModalOpen={isSiteModalOpen}
                setIsModalOpen={setIsSiteModalOpen}
                currentSite={selectedSite}
                setCurrentSite={setSelectedSite}
                performAction={performAction}
                actionLoading={actionLoading}
                mode={siteModalMode}
                existingFolders={existingFolderPaths}
            />
        </aside>
    );
}
