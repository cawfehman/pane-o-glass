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
    RefreshCw,
    Trash2,
    GripVertical,
    Info
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
    onInspectSite?: (siteCode: string) => void;
}

export default function SiteManagerSidebar({
    isOpen,
    onToggle,
    onLocateSite,
    onSitesChanged,
    highlightedSiteCode,
    onInspectSite
}: SiteManagerSidebarProps) {
    const [sites, setSites] = useState<SiteMetadata[]>([]);
    const [folders, setFolders] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

    // Modal states for Site Add/Edit
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

    // Rename Folder modal
    const [folderToRename, setFolderToRename] = useState<{ oldPath: string; newName: string } | null>(null);
    const [isRenameFolderOpen, setIsRenameFolderOpen] = useState(false);

    // Drag-and-drop state
    const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

    // Fetch sites and folders from API
    const loadSites = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/sites');
            if (!res.ok) return;
            const data = await res.json();
            
            let loadedSites: SiteMetadata[] = [];
            let loadedFolders: string[] = [];

            if (data.sites && Array.isArray(data.sites)) {
                loadedSites = data.sites;
            } else if (data.versions && data.versions.length > 0 && data.versions[0].content) {
                loadedSites = parseSiteCsv(data.versions[0].content);
            }

            if (data.folders && Array.isArray(data.folders)) {
                loadedFolders = data.folders;
            } else if ((loadedSites as any).folders) {
                loadedFolders = (loadedSites as any).folders;
            }

            setSites(loadedSites);
            setFolders(loadedFolders);
        } catch (e: any) {
            console.error("Failed to load sites in sidebar:", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSites();
    }, [loadSites]);

    // Unique existing folder paths (combining declared folders and assigned folderPaths)
    const existingFolderPaths = useMemo(() => {
        const set = new Set<string>();
        
        folders.forEach(f => {
            if (f) {
                const parts = f.split("/").map(p => p.trim()).filter(Boolean);
                let current = "";
                for (const part of parts) {
                    current = current ? `${current}/${part}` : part;
                    set.add(current);
                }
            }
        });

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

        return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
    }, [sites, folders]);

    // Build hierarchy tree with both declared folders and member sites
    const rootTree = useMemo(() => {
        const root: TreeNode = {
            name: "Root",
            fullPath: "",
            subFolders: {},
            sites: []
        };

        const query = searchQuery.toLowerCase().trim();

        // 1. First ensure all declared/existing folders are represented in the tree
        existingFolderPaths.forEach(folderPath => {
            if (!folderPath) return;
            const parts = folderPath.split("/").map(p => p.trim()).filter(Boolean);
            let currentLevel = root;
            let pathAccum = "";
            parts.forEach(part => {
                pathAccum = pathAccum ? `${pathAccum}/${part}` : part;
                if (!currentLevel.subFolders[part]) {
                    currentLevel.subFolders[part] = {
                        name: part,
                        fullPath: pathAccum,
                        subFolders: {},
                        sites: []
                    };
                }
                currentLevel = currentLevel.subFolders[part];
            });
        });

        // 2. Populate sites into folders (or Unassigned)
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
                // Place in Unassigned group
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
    }, [sites, existingFolderPaths, searchQuery]);

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

    // Auto-expand all folders when actively filtering/searching
    useEffect(() => {
        if (searchQuery.trim()) {
            const allExpanded: Record<string, boolean> = { "Unassigned": true };
            existingFolderPaths.forEach(p => {
                allExpanded[p] = true;
            });
            setExpandedFolders(prev => ({ ...prev, ...allExpanded }));
        }
    }, [searchQuery, existingFolderPaths]);

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
            if (onSitesChanged) onSitesChanged(sites);
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
            folderPath: defaultFolderPath === "Unassigned" ? "" : defaultFolderPath || "",
            isHub: false
        });
        setSiteModalMode('add');
        setIsSiteModalOpen(true);
    };

    // Standalone Add Folder Handler (Does NOT force site creation)
    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        const targetPath = newFolderParent 
            ? `${newFolderParent}/${newFolderName.trim()}` 
            : newFolderName.trim();
        
        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_folder', folderPath: targetPath })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Auto-expand parent and new folder
            setExpandedFolders(prev => ({
                ...prev,
                [newFolderParent || '']: true,
                [targetPath]: true
            }));

            setFeedbackMsg({ 
                type: 'success', 
                text: `Group folder "${targetPath}" created successfully.` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            setIsNewFolderOpen(false);
            setNewFolderName("");
            setNewFolderParent(null);

            await loadSites();
            if (onSitesChanged) onSitesChanged(sites);
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Failed to create folder' });
            setTimeout(() => setFeedbackMsg(null), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    // Rename Folder Handler
    const handleRenameFolder = async () => {
        if (!folderToRename || !folderToRename.newName.trim()) return;
        const oldPath = folderToRename.oldPath;
        const pathSegments = oldPath.split('/');
        pathSegments[pathSegments.length - 1] = folderToRename.newName.trim();
        const newPath = pathSegments.join('/');

        if (newPath === oldPath) {
            setIsRenameFolderOpen(false);
            return;
        }

        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename_folder', oldPath, newPath })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setFeedbackMsg({ 
                type: 'success', 
                text: `Group folder renamed to "${newPath}".` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            setIsRenameFolderOpen(false);
            setFolderToRename(null);

            await loadSites();
            if (onSitesChanged) onSitesChanged(sites);
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Failed to rename folder' });
            setTimeout(() => setFeedbackMsg(null), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    // Delete Folder Handler
    const handleDeleteFolder = async (folderPath: string) => {
        if (!window.confirm(`Delete group "${folderPath}"? Member sites will become unassigned.`)) {
            return;
        }

        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete_folder', folderPath })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setFeedbackMsg({ 
                type: 'success', 
                text: `Group folder "${folderPath}" deleted.` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            await loadSites();
            if (onSitesChanged) onSitesChanged(sites);
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Failed to delete folder' });
            setTimeout(() => setFeedbackMsg(null), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    // Move site into folder via drag-and-drop
    const handleMoveSite = async (siteCode: string, targetFolder: string) => {
        const cleanFolder = targetFolder === "Unassigned" ? "" : targetFolder;
        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'move_site', siteCode, folderPath: cleanFolder })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setFeedbackMsg({ 
                type: 'success', 
                text: `Moved ${siteCode} to "${cleanFolder || 'Unassigned'}".` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            await loadSites();
            if (onSitesChanged) onSitesChanged(sites);
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Failed to move site' });
            setTimeout(() => setFeedbackMsg(null), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    // Nest folder into another folder via drag-and-drop
    const handleNestFolder = async (sourceFolder: string, targetParentFolder: string) => {
        if (sourceFolder === targetParentFolder || targetParentFolder.startsWith(sourceFolder + '/')) {
            setFeedbackMsg({ type: 'error', text: 'Cannot move a group into itself or its own subfolder.' });
            setTimeout(() => setFeedbackMsg(null), 4000);
            return;
        }

        const baseName = sourceFolder.split('/').pop() || sourceFolder;
        const newPath = targetParentFolder === "Unassigned" ? baseName : `${targetParentFolder}/${baseName}`;
        if (newPath === sourceFolder) return;

        setActionLoading(true);
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rename_folder', oldPath: sourceFolder, newPath })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setFeedbackMsg({ 
                type: 'success', 
                text: `Moved group "${baseName}" into "${targetParentFolder}".` 
            });
            setTimeout(() => setFeedbackMsg(null), 4000);

            // Auto-expand target folder
            setExpandedFolders(prev => ({
                ...prev,
                [targetParentFolder]: true,
                [newPath]: true
            }));

            await loadSites();
            if (onSitesChanged) onSitesChanged(sites);
        } catch (e: any) {
            setFeedbackMsg({ type: 'error', text: e.message || 'Failed to nest folder' });
            setTimeout(() => setFeedbackMsg(null), 5000);
        } finally {
            setActionLoading(false);
        }
    };

    // Handle Drag Over / Drop on a Folder
    const handleFolderDragOver = (e: React.DragEvent, folderPath: string) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        if (dragOverFolder !== folderPath) {
            setDragOverFolder(folderPath);
        }
    };

    const handleFolderDragLeave = (e: React.DragEvent, folderPath: string) => {
        e.stopPropagation();
        if (dragOverFolder === folderPath) {
            setDragOverFolder(null);
        }
    };

    const handleFolderDrop = async (e: React.DragEvent, targetFolderPath: string) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOverFolder(null);

        const rawData = e.dataTransfer.getData("application/json");
        if (!rawData) return;

        try {
            const data = JSON.parse(rawData);
            if (data.type === "site" && data.siteCode) {
                await handleMoveSite(data.siteCode, targetFolderPath);
            } else if (data.type === "folder" && data.folderPath) {
                await handleNestFolder(data.folderPath, targetFolderPath);
            }
        } catch (err) {
            console.error("Drop parsing error:", err);
        }
    };

    // Export CSV
    const handleExportCsv = () => {
        const csv = stringifySiteCsv(sites, existingFolderPaths);
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

        // Logical and alphabetical group sorting:
        // "Unassigned" always at the very bottom, named groups sorted A-Z (natural numeric)
        const subFolderKeys = Object.keys(node.subFolders).sort((a, b) => {
            if (a === "Unassigned") return 1;
            if (b === "Unassigned") return -1;
            return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
        });

        // Logical and alphabetical site sorting:
        // 1. HUB sites prioritized first at the top of their group container
        // 2. Alphabetical natural sort by site code (e.g. CAM1, CAM2, CAM10)
        // 3. Alphabetical natural sort by site name
        const sortedSites = [...node.sites].sort((a, b) => {
            if (a.isHub && !b.isHub) return -1;
            if (!a.isHub && b.isHub) return 1;
            const codeDiff = a.code.localeCompare(b.code, undefined, { sensitivity: 'base', numeric: true });
            if (codeDiff !== 0) return codeDiff;
            return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: 'base', numeric: true });
        });

        const totalSites = countFolderSites(node);
        const isTarget = dragOverFolder === node.fullPath;
        const isUnassigned = node.name === "Unassigned";

        return (
            <div key={node.fullPath || "root"} className="relative select-none">
                {node.name !== "Root" && (
                    <div className="relative">
                        {/* Traditional tree branch horizontal tick connector */}
                        <span className="absolute -left-3.5 top-1/2 w-3 h-[1px] bg-white/20 -translate-y-1/2 pointer-events-none" />
                        <div 
                            draggable={!isUnassigned}
                            onDragStart={(e) => {
                                e.stopPropagation();
                                e.dataTransfer.setData("application/json", JSON.stringify({
                                    type: "folder",
                                    folderPath: node.fullPath
                                }));
                                e.dataTransfer.effectAllowed = "copyMove";
                            }}
                            onDragOver={(e) => handleFolderDragOver(e, node.fullPath)}
                            onDragLeave={(e) => handleFolderDragLeave(e, node.fullPath)}
                            onDrop={(e) => handleFolderDrop(e, node.fullPath)}
                            className={`group flex items-center justify-between py-1.5 px-2 rounded-lg transition-all cursor-pointer text-xs ${
                                isTarget 
                                    ? 'bg-sky-500/20 border-2 border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.4)]' 
                                    : 'hover:bg-white/[0.06] border border-transparent'
                            }`}
                            onClick={() => toggleFolder(node.fullPath)}
                            title={isUnassigned ? "Unassigned sites without a folder" : `Group: ${node.fullPath}\nDrag to nest, or drag onto canvas to place`}
                        >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {!isUnassigned && (
                                    <GripVertical className="w-3 h-3 text-muted/40 group-hover:text-muted cursor-grab shrink-0" />
                                )}
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
                                    <FolderOpen className={`w-3.5 h-3.5 shrink-0 ${isUnassigned ? 'text-amber-400/80' : 'text-sky-400'}`} />
                                ) : (
                                    <Folder className={`w-3.5 h-3.5 shrink-0 ${isUnassigned ? 'text-amber-400/60' : 'text-sky-400/70'}`} />
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
                                {!isUnassigned && (
                                    <>
                                        <button
                                            type="button"
                                            title="Add Subgroup"
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
                                            title="Rename Group"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFolderToRename({ oldPath: node.fullPath, newName: node.name });
                                                setIsRenameFolderOpen(true);
                                            }}
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-amber-300"
                                        >
                                            <Edit2 className="w-3 h-3" />
                                        </button>
                                        <button
                                            type="button"
                                            title="Delete Group"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteFolder(node.fullPath);
                                            }}
                                            className="p-1 rounded hover:bg-white/10 text-muted hover:text-rose-400"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </>
                                )}
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
                    </div>
                )}

                {/* Sub-items if expanded (indented cleanly with hierarchy guide line according to depth) */}
                {(isExpanded || node.name === "Root") && (
                    <div className={node.name !== "Root" ? "relative ml-4 pl-3.5 border-l border-white/15 space-y-0.5 my-1" : "space-y-0.5"}>
                        {/* Sub-groups first (alphabetical & logical) */}
                        {subFolderKeys.map(k => renderFolder(node.subFolders[k], depth + 1))}

                        {/* Sites directly in this folder (Hubs first, then alphabetical) */}
                        {sortedSites.map(site => {
                            const isHighlighted = highlightedSiteCode?.toUpperCase() === site.code.toUpperCase();
                            return (
                                <div key={site.code} className="relative">
                                    {/* Traditional tree branch horizontal tick connector */}
                                    <span className="absolute -left-3.5 top-1/2 w-3 h-[1px] bg-white/20 -translate-y-1/2 pointer-events-none" />
                                    <div 
                                        draggable={true}
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData("application/json", JSON.stringify({
                                                type: "site",
                                                siteCode: site.code,
                                                folderPath: site.folderPath || ""
                                            }));
                                            e.dataTransfer.effectAllowed = "copyMove";
                                        }}
                                        className={`group flex items-center justify-between py-1 pl-2 pr-1.5 my-0.5 rounded-lg border transition-all text-xs cursor-grab active:cursor-grabbing ${
                                            isHighlighted 
                                                ? 'bg-accent-primary/20 border-accent-primary/60 text-white shadow-sm' 
                                                : 'border-transparent hover:bg-white/[0.05] text-white/80'
                                        }`}
                                        title={`${site.code} - ${site.name}${site.isHub ? ' (HUB)' : ''}\nDrag to folder or canvas`}
                                    >
                                        <div 
                                            className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
                                            onClick={() => onLocateSite && onLocateSite(site.code)}
                                        >
                                            <GripVertical className="w-3 h-3 text-muted/30 group-hover:text-muted shrink-0" />
                                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                                site.status === 'Active' ? 'bg-emerald-400' :
                                                site.status === 'Future' ? 'bg-amber-400' : 'bg-rose-400'
                                            }`} />
                                            <span className="font-black text-[11px] tracking-wide text-white truncate">
                                                {site.code}
                                            </span>
                                            {site.isHub && (
                                                <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
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
                                                title="Inspect Site Details & Switches"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onInspectSite) onInspectSite(site.code);
                                                }}
                                                className="p-1 rounded hover:bg-white/10 text-muted hover:text-sky-300 transition"
                                            >
                                                <Info className="w-3 h-3" />
                                            </button>
                                            <button
                                                type="button"
                                                title="Locate on Canvas"
                                                onClick={() => onLocateSite && onLocateSite(site.code)}
                                                className="p-1 rounded hover:bg-white/10 text-muted hover:text-accent-primary transition"
                                            >
                                                <Crosshair className="w-3 h-3" />
                                            </button>
                                            <button
                                                type="button"
                                                title="Edit Site Details"
                                                onClick={() => handleOpenEdit(site)}
                                                className="p-1 rounded hover:bg-white/10 text-muted hover:text-white transition"
                                            >
                                                <Edit2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Empty group indicator */}
                        {node.name !== "Root" && subFolderKeys.length === 0 && sortedSites.length === 0 && (
                            <div className="py-1 px-2 text-[10px] text-muted/50 italic">
                                Empty group (drag sites here)
                            </div>
                        )}
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
                    title="Create Root Group Folder"
                >
                    <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                    New Group
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
                <span className="font-mono text-[10px] text-accent-primary">Drag to group or canvas</span>
            </div>

            {/* Create Folder Modal */}
            {isNewFolderOpen && (
                <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-sm border border-white/20 p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                            <FolderPlus className="w-4 h-4 text-sky-400" />
                            {newFolderParent ? `New Subgroup in "${newFolderParent}"` : "Create New Group Folder"}
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Group sites into this container category for hierarchical organization on the topology canvas.
                        </p>
                        <input
                            type="text"
                            value={newFolderName}
                            onChange={e => setNewFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                            placeholder="e.g. Campus, Acute Care Hubs, Ambulatory"
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
                                disabled={!newFolderName.trim() || actionLoading}
                                className="px-3.5 py-1.5 text-xs font-bold bg-accent-primary hover:bg-accent-primary/80 text-black rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                                {actionLoading ? "Creating..." : "Create Group"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rename Folder Modal */}
            {isRenameFolderOpen && folderToRename && (
                <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="glass-card w-full max-w-sm border border-white/20 p-5 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Edit2 className="w-4 h-4 text-amber-400" />
                            Rename Group Folder
                        </h3>
                        <p className="text-xs text-muted mb-4">
                            Renaming &quot;{folderToRename.oldPath}&quot; will update all member sites and nested subfolders.
                        </p>
                        <input
                            type="text"
                            value={folderToRename.newName}
                            onChange={e => setFolderToRename({ ...folderToRename, newName: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleRenameFolder()}
                            autoFocus
                            className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white mb-4"
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsRenameFolderOpen(false);
                                    setFolderToRename(null);
                                }}
                                className="px-3 py-1.5 text-xs text-muted hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRenameFolder}
                                disabled={!folderToRename.newName.trim() || actionLoading}
                                className="px-3.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                                {actionLoading ? "Renaming..." : "Save Rename"}
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
