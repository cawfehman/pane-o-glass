"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
    Upload, 
    Download, 
    History, 
    CheckCircle2, 
    AlertCircle, 
    FileText, 
    Database,
    Plus,
    Edit2,
    Trash2,
    Search,
    ChevronDown,
    LayoutGrid,
    List,
    FileSpreadsheet
} from "lucide-react";

interface SiteVersion {
    id: string;
    filename: string;
    versionNumber: number;
    createdBy: string;
    createdAt: string;
    content?: string;
}

export default function SiteManagementPage() {
    const [versions, setVersions] = useState<SiteVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [dragActive, setDragActive] = useState(false);
    
    // Master view navigation tabs
    const [activeTab, setActiveTab] = useState<'directory' | 'archive'>('directory');
    
    // Unified CSV Dropdown toggle state
    const [isCsvMenuOpen, setIsCsvMenuOpen] = useState(false);
    const csvMenuRef = useRef<HTMLDivElement>(null);
    
    // High-Density layout collapse controller
    const [isCompactView, setIsCompactView] = useState(false);

    // Modal State (Add Site)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSite, setCurrentSite] = useState<any>({ code: "", name: "", address: "", status: "Active", notes: "" });
    const [actionLoading, setActionLoading] = useState(false);

    // Inline Edit State
    const [editingSiteCode, setEditingSiteCode] = useState<string | null>(null);
    const [editingSiteData, setEditingSiteData] = useState<any>({ name: "", address: "", status: "Active", notes: "" });

    // Close CSV dropdown menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (csvMenuRef.current && !csvMenuRef.current.contains(event.target as Node)) {
                setIsCsvMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const fetchVersions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/sites');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setVersions(data.versions);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

    const performAction = async (action: 'add' | 'update' | 'delete', siteData: any, addAnother: boolean = false) => {
        setActionLoading(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, site: siteData })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            setSuccess(`Site successfully ${action === 'add' ? 'added' : action === 'update' ? 'updated' : 'deleted'}.`);
            
            if (action === 'update') {
                setEditingSiteCode(null);
            } else if (action === 'add') {
                if (addAnother) {
                    setCurrentSite({ code: "", name: "", address: "", status: "Active", notes: "" });
                } else {
                    setIsModalOpen(false);
                }
            }
            fetchVersions();
            return true;
        } catch (e: any) {
            setError(e.message);
            return false;
        } finally {
            setActionLoading(false);
            setTimeout(() => { setError(""); setSuccess(""); }, 5000);
        }
    };

    const handleAddClick = () => {
        setCurrentSite({ code: "", name: "", address: "", status: "Active", notes: "" });
        setIsModalOpen(true);
    };

    const handleEditClick = (site: any) => {
        setEditingSiteCode(site.code);
        setEditingSiteData({ name: site.name, address: site.address, status: site.status || "Active", notes: site.notes || "" });
    };

    const handleDeleteClick = async (code: string) => {
        if (!confirm(`Are you sure you want to delete site ${code}?`)) return;
        await performAction('delete', { code });
    };

    const handleUpload = async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            setError("Please upload a valid CSV file.");
            return;
        }

        setUploading(true);
        setError("");
        setSuccess("");
        setIsCsvMenuOpen(false); // smoothly auto-close dropdown overlay

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/settings/sites', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            setSuccess(`CSV Site Map successfully imported and mapped.`);
            fetchVersions();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
    };

    const latestVersion = versions.length > 0 ? versions[0] : null;

    // Client-side parser for preview
    const parsePreview = (csv: string) => {
        if (!csv) return [];
        const lines = csv.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length <= 1) return [];

        const splitCsvRow = (row: string) => {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < row.length; i++) {
                const char = row[i];
                if (char === '"') inQuotes = !inQuotes;
                else if (char === ',' && !inQuotes) {
                    result.push(current.trim().replace(/^"|"$/g, ''));
                    current = '';
                } else current += char;
            }
            result.push(current.trim().replace(/^"|"$/g, ''));
            return result;
        };

        const headers = splitCsvRow(lines[0]).map(h => h.toLowerCase());
        const codeIdx = headers.indexOf('code');
        const nameIdx = headers.indexOf('name');
        const addrIdx = headers.indexOf('address');
        const statusIdx = headers.indexOf('status');
        const notesIdx = headers.indexOf('notes');

        if (codeIdx === -1) return [];

        return lines.slice(1).map(line => {
            const parts = splitCsvRow(line);
            const code = parts[codeIdx]?.toUpperCase() || "UNK";
            return {
                code,
                name: (nameIdx !== -1 ? parts[nameIdx] : "") || code,
                address: addrIdx !== -1 ? parts[addrIdx] || "" : "",
                status: statusIdx !== -1 ? parts[statusIdx] || "Active" : "Active",
                notes: notesIdx !== -1 ? parts[notesIdx] || "" : ""
            };
        });
    };

    const parsedPreview = latestVersion?.content ? parsePreview(latestVersion.content) : [];
    const totalSites = latestVersion?.content ? latestVersion.content.split(/\r?\n/).filter(l => l.trim()).length - 1 : 0;

    return (
        <div className="max-w-7xl mx-auto animate-in fade-in duration-400 space-y-6">
            
            {/* Upper Action Banner & Title row */}
            <header className="flex justify-between items-center shrink-0 mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                        <Database size={24} strokeWidth={2.5} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black tracking-tight uppercase text-white">Site Operations</h1>
                        <p className="text-xs text-muted font-bold tracking-wide">Mapping Engine & Access Directives</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Primary Trigger */}
                    <button 
                        onClick={handleAddClick}
                        className="btn-secondary flex items-center gap-2 px-4 py-2 font-black text-xs rounded-xl transition-all"
                    >
                        <Plus size={15} strokeWidth={3} />
                        <span>Add Site Record</span>
                    </button>

                    {/* Unified CSV Actions Dropdown */}
                    <div className="relative" ref={csvMenuRef}>
                        <button 
                            onClick={() => setIsCsvMenuOpen(!isCsvMenuOpen)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all border ${
                                isCsvMenuOpen 
                                    ? 'bg-accent-primary text-black border-accent-primary shadow-lg shadow-accent-primary/20' 
                                    : 'bg-white/5 hover:bg-white/10 text-white border-white/10'
                            }`}
                        >
                            <FileSpreadsheet size={15} strokeWidth={2.5} />
                            <span>CSV</span>
                            <ChevronDown size={14} className={`transition-transform duration-200 ${isCsvMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Clean minimal dropdown menu containing straightforward export and native OS file browser triggers */}
                        {isCsvMenuOpen && (
                            <div className="absolute right-0 mt-2 w-56 rounded-xl bg-black/95 border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                                <a 
                                    href="/api/settings/sites/download" 
                                    onClick={() => setIsCsvMenuOpen(false)}
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-white text-xs font-bold transition-all"
                                >
                                    <Download size={14} className="text-accent-primary" />
                                    <span>Export Mapping CSV</span>
                                </a>
                                
                                <label 
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-white/5 text-white text-xs font-bold transition-all cursor-pointer block"
                                >
                                    <Upload size={14} className="text-emerald-400" />
                                    <span>{uploading ? 'Importing...' : 'Import CSV File...'}</span>
                                    <input 
                                        type="file" 
                                        accept=".csv" 
                                        className="hidden" 
                                        onChange={(e) => {
                                            setIsCsvMenuOpen(false);
                                            if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                                        }} 
                                        disabled={uploading} 
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Error / Success Notifications */}
            {(error || success) && (
                <div className={`mb-4 p-3.5 rounded-xl border flex items-center gap-3 shrink-0 animate-in slide-in-from-top-2 ${
                    error ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                    {error ? <AlertCircle size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
                    <p className="font-bold text-xs">{error || success}</p>
                </div>
            )}

            {/* Main Content Workspace Stack without outer bounding box */}
            <div className="flex flex-col space-y-4">
                
                {/* Secondary Header Row: Tab Selectors & Directory Master collapse tool */}
                <div className="flex flex-wrap items-center justify-between border-b border-white/10 px-6 py-3 shrink-0 bg-white/[0.01] gap-4">
                    {/* Tab routes */}
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setActiveTab('directory')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                activeTab === 'directory'
                                    ? 'bg-white/10 text-white shadow-inner border border-white/5'
                                    : 'text-muted hover:text-white/80'
                            }`}
                        >
                            <span>Site Directory</span>
                            <span className="px-1.5 py-0.5 rounded-full bg-accent-primary/20 text-accent-primary text-[10px] font-black">
                                {totalSites}
                            </span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('archive')}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                activeTab === 'archive'
                                    ? 'bg-white/10 text-white shadow-inner border border-white/5'
                                    : 'text-muted hover:text-white/80'
                            }`}
                        >
                            <History size={13} />
                            <span>Archival Logs</span>
                        </button>
                    </div>

                    {/* View Controls normalizer (Available when on Site Directory tab) */}
                    {activeTab === 'directory' && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Density View:</span>
                            <div className="flex items-center rounded-lg bg-black/40 p-0.5 border border-white/5">
                                <button 
                                    onClick={() => setIsCompactView(false)}
                                    className={`p-1.5 rounded-md transition-all ${!isCompactView ? 'bg-white/10 text-accent-primary' : 'text-muted hover:text-white'}`}
                                    title="Detailed Card View"
                                >
                                    <LayoutGrid size={13} strokeWidth={2.5} />
                                </button>
                                <button 
                                    onClick={() => setIsCompactView(true)}
                                    className={`p-1.5 rounded-md transition-all ${isCompactView ? 'bg-white/10 text-accent-primary' : 'text-muted hover:text-white'}`}
                                    title="Compact List View"
                                >
                                    <List size={13} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Main View Area allowing independent scrolling of lists without global page blocking */}
                <div>
                    
                    {/* TAB 1: SITE DIRECTORY */}
                    {activeTab === 'directory' && (
                        <div className="max-h-[calc(100vh-240px)] overflow-y-auto custom-scrollbar space-y-3 pr-2">
                            {parsedPreview.map((s) => {
                                const isEditing = editingSiteCode === s.code;
                                
                                // Process inline custom edits state view
                                if (isEditing) {
                                    return (
                                        <div key={s.code} className="p-5 bg-accent-primary/[0.05] border-2 border-accent-primary/50 rounded-2xl space-y-4 shadow-xl relative overflow-hidden animate-in fade-in duration-200">
                                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-accent-primary to-emerald-400"></div>
                                            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                                                <div className="flex items-center gap-2.5">
                                                    <span className="px-2.5 py-0.5 rounded-md bg-accent-primary font-black text-black text-xs tracking-wider font-mono">{s.code}</span>
                                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Editing Metadata Record</h4>
                                                </div>
                                                <span className="text-[9px] uppercase font-black tracking-widest text-accent-primary">Inline Editor</span>
                                            </div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-1">Descriptive Identity</label>
                                                    <input 
                                                        type="text" 
                                                        value={editingSiteData.name} 
                                                        onChange={e => setEditingSiteData({...editingSiteData, name: e.target.value})}
                                                        className="w-full px-3 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs font-bold text-white transition-all"
                                                        placeholder="e.g. Regional Processing Center"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-1">Lifecycle Status</label>
                                                    <select 
                                                        value={editingSiteData.status} 
                                                        onChange={e => setEditingSiteData({...editingSiteData, status: e.target.value})}
                                                        className="w-full px-3 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs font-bold text-white transition-all appearance-none"
                                                    >
                                                        <option value="Active">🟢 Active</option>
                                                        <option value="Future">🟡 Future</option>
                                                        <option value="Retired">🔴 Retired</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-1">Physical Address</label>
                                                <textarea 
                                                    rows={1}
                                                    value={editingSiteData.address} 
                                                    onChange={e => setEditingSiteData({...editingSiteData, address: e.target.value})}
                                                    className="w-full px-3 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs font-medium text-white transition-all leading-relaxed"
                                                    placeholder="Full address string"
                                                    style={{ resize: 'vertical' }}
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-accent-primary mb-1">Optional Notes / Context</label>
                                                <textarea 
                                                    rows={2}
                                                    value={editingSiteData.notes} 
                                                    onChange={e => setEditingSiteData({...editingSiteData, notes: e.target.value})}
                                                    className="w-full px-3 py-2 bg-black/90 border border-accent-primary/30 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs font-medium text-white transition-all leading-relaxed"
                                                    placeholder="Add direct handling workflows..."
                                                    style={{ resize: 'vertical' }}
                                                />
                                            </div>

                                            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/10">
                                                <button 
                                                    onClick={() => setEditingSiteCode(null)} 
                                                    disabled={actionLoading}
                                                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-white font-bold text-xs transition-all"
                                                >
                                                    Cancel
                                                </button>
                                                <button 
                                                    onClick={() => performAction('update', { code: s.code, ...editingSiteData })} 
                                                    disabled={actionLoading}
                                                    className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5"
                                                >
                                                    <CheckCircle2 size={13} strokeWidth={3} />
                                                    {actionLoading ? "Saving..." : "Save Record"}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                const rawStatus = s.status || 'Active';
                                const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
                                const statusColorClass = 
                                    formattedStatus === 'Active' ? 'text-green-400' :
                                    formattedStatus === 'Retired' ? 'text-red-400' :
                                    'text-yellow-400';

                                // COMPACT LIST VIEW NORMALIZATION
                                if (isCompactView) {
                                    return (
                                        <div key={s.code} className="px-5 py-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-all duration-150 flex items-center justify-between gap-4 group">
                                            {/* Left side: ONLY SITE CODE */}
                                            <div className="flex items-center gap-3">
                                                <div className="w-2 h-2 rounded-full bg-accent-primary/50 group-hover:bg-accent-primary transition-colors"></div>
                                                <span className="text-base font-black text-white font-mono uppercase tracking-widest">{s.code}</span>
                                            </div>

                                            {/* Right side: Status and Premium Action buttons */}
                                            <div className="flex items-center gap-6 shrink-0">
                                                <span className={`text-xs italic font-semibold ${statusColorClass}`}>
                                                    {formattedStatus}
                                                </span>

                                                <div className="flex items-center gap-2.5">
                                                    <button 
                                                        onClick={() => handleEditClick(s)} 
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/[0.08] hover:bg-accent-primary/[0.15] border border-accent-primary/20 text-accent-primary font-bold text-xs transition-all"
                                                        title="Edit Record"
                                                    >
                                                        <Edit2 size={12} strokeWidth={2.5} />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteClick(s.code)} 
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/[0.08] hover:bg-red-500/[0.15] border border-red-500/20 text-red-400 font-bold text-xs transition-all"
                                                        title="Delete Record"
                                                    >
                                                        <Trash2 size={12} strokeWidth={2.5} />
                                                        <span>Delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // EXPANDED CARD VIEW NORMALIZATION
                                return (
                                    <div key={s.code} className="p-5 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-all duration-200 group relative">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0 pr-4 space-y-1">
                                                {/* 1. Site Code */}
                                                <div>
                                                    <span className="text-lg font-black text-accent-primary tracking-wider uppercase font-mono">
                                                        {s.code}
                                                    </span>
                                                </div>

                                                {/* 2. Site Name */}
                                                <h4 className="text-sm font-bold text-white tracking-tight truncate">
                                                    {s.name}
                                                </h4>

                                                {/* 3. Address */}
                                                {s.address ? (
                                                    <p className="text-xs text-muted font-medium break-words leading-relaxed pt-0.5">
                                                        {s.address}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-muted/40 italic pt-0.5">No physical address specified</p>
                                                )}

                                                {/* Optional Notes */}
                                                {s.notes && (
                                                    <div className="mt-2.5 p-2.5 rounded-lg bg-black/40 border border-white/5 text-xs text-secondary/90 whitespace-pre-wrap font-mono relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-accent-primary/40"></div>
                                                        <span className="text-[9px] block uppercase font-black tracking-widest text-accent-primary/80 mb-1">Notes</span>
                                                        {s.notes}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Right side: Status Badge and Gorgeous Premium Controls */}
                                            <div className="flex flex-col items-end justify-between gap-4 shrink-0 pl-4 border-l border-white/5 h-full min-h-[80px]">
                                                <span className={`text-xs italic font-semibold tracking-wide ${statusColorClass}`}>
                                                    {formattedStatus}
                                                </span>

                                                <div className="flex items-center gap-2.5 mt-auto">
                                                    <button 
                                                        onClick={() => handleEditClick(s)} 
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary/[0.08] hover:bg-accent-primary/[0.15] border border-accent-primary/20 text-accent-primary font-bold text-xs transition-all"
                                                        title="Edit Record"
                                                    >
                                                        <Edit2 size={12} strokeWidth={2.5} />
                                                        <span>Edit</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteClick(s.code)} 
                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/[0.08] hover:bg-red-500/[0.15] border border-red-500/20 text-red-400 font-bold text-xs transition-all"
                                                        title="Delete Record"
                                                    >
                                                        <Trash2 size={12} strokeWidth={2.5} />
                                                        <span>Delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {parsedPreview.length === 0 && (
                                <div className="p-12 border border-white/5 rounded-2xl text-center text-muted italic bg-white/[0.01]">
                                    No active mapping found. Please provision a site record or select CSV import tools.
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2: ARCHIVAL LOGS (Isolated configuration historical view) */}
                    {activeTab === 'archive' && (
                        <div className="max-h-[calc(100vh-240px)] overflow-y-auto custom-scrollbar pr-2">
                            <div className="mb-4 flex justify-between items-center shrink-0">
                                <span className="text-xs font-bold text-secondary uppercase tracking-wider">Version History Repository</span>
                                <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Retained Archive Sets</span>
                            </div>

                            <table className="w-full text-left border-collapse">
                                <thead className="bg-white/5 text-[10px] text-muted uppercase tracking-widest font-black border-b border-white/10">
                                    <tr>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Schema Baseline</th>
                                        <th className="px-6 py-4">Initiated By</th>
                                        <th className="px-6 py-4">Timestamp</th>
                                        <th className="px-6 py-4 text-right">Data Directives</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 text-xs">
                                    {loading ? (
                                        [...Array(3)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-6"><div className="h-4 bg-white/5 rounded w-full"></div></td>
                                            </tr>
                                        ))
                                    ) : versions.length > 0 ? (
                                        versions.map((v) => (
                                            <tr key={v.id} className="hover:bg-white/[0.02] transition-all">
                                                <td className="px-6 py-4">
                                                    {v.id === latestVersion?.id ? (
                                                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-black text-[10px] uppercase tracking-wider">Current Live</span>
                                                    ) : (
                                                        <span className="text-muted font-bold text-[10px] uppercase">Archived</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 font-bold text-white">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={13} className="text-accent-primary" />
                                                        <span>{v.filename}</span>
                                                        <span className="text-[10px] text-muted font-normal">(v{v.versionNumber})</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-medium text-secondary">{v.createdBy}</td>
                                                <td className="px-6 py-4 text-muted">
                                                    {new Date(v.createdAt).toLocaleString()}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <a 
                                                        href={`/api/settings/sites/download?id=${v.id}`}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase transition-all border border-white/5"
                                                    >
                                                        <Download size={11} />
                                                        <span>Extract</span>
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center text-muted italic">
                                                No historical configuration versions captured.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Overlay for Provisioning New Sites */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    backdropFilter: 'blur(8px)'
                }}>
                    <div className="glass-card w-full max-w-md shadow-[0_0_50px_rgba(0,0,0,0.9)] relative overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200" style={{ maxWidth: '90%', width: '450px' }}>
                        {actionLoading && (
                            <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-5 h-5 rounded-full border-3 border-accent-primary border-t-transparent animate-spin"></div>
                                    <p className="text-xs font-bold text-white">Saving Record Entry...</p>
                                </div>
                            </div>
                        )}
                        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/[0.02]">
                            <h3 className="text-sm font-black tracking-tight text-white uppercase">Provision New Site</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-muted hover:text-white font-bold text-base">&times;</button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div>
                                <label className="block text-[10px] font-black text-accent-primary uppercase tracking-widest mb-1.5">Site Code (Unique Id)</label>
                                <input 
                                    type="text" 
                                    value={currentSite.code} 
                                    onChange={e => setCurrentSite({...currentSite, code: e.target.value.toUpperCase()})}
                                    placeholder="e.g. LON"
                                    className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-black text-white text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Descriptive Identity</label>
                                <input 
                                    type="text" 
                                    value={currentSite.name} 
                                    onChange={e => setCurrentSite({...currentSite, name: e.target.value})}
                                    placeholder="e.g. London Tech Campus"
                                    className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold text-white text-xs"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Physical Address</label>
                                <textarea 
                                    rows={2}
                                    value={currentSite.address} 
                                    onChange={e => setCurrentSite({...currentSite, address: e.target.value})}
                                    placeholder="Street, District, Postal Code"
                                    className="w-full px-3.5 py-2 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium"
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-muted uppercase tracking-widest mb-1.5">Lifecycle Status</label>
                                <select 
                                    value={currentSite.status} 
                                    onChange={e => setCurrentSite({...currentSite, status: e.target.value})}
                                    className="w-full px-3.5 py-2 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary font-bold appearance-none text-white text-xs"
                                >
                                    <option value="Active">🟢 Active</option>
                                    <option value="Future">🟡 Future</option>
                                    <option value="Retired">🔴 Retired</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-accent-primary uppercase tracking-widest mb-1.5">Optional Notes</label>
                                <textarea 
                                    rows={2}
                                    value={currentSite.notes} 
                                    onChange={e => setCurrentSite({...currentSite, notes: e.target.value})}
                                    placeholder="Gate directives, clearance keys..."
                                    className="w-full px-3.5 py-2 bg-black/80 border border-accent-primary/30 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white font-medium placeholder:text-white/20"
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                        </div>
                        <div className="p-4 border-t border-white/10 flex flex-wrap justify-end gap-2.5 bg-white/[0.02]">
                            <button onClick={() => setIsModalOpen(false)} className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-muted hover:text-white transition-all" disabled={actionLoading}>Cancel</button>
                            <button 
                                onClick={() => performAction('add', currentSite, true)} 
                                className="px-3.5 py-1.5 text-xs font-black rounded-xl bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30 transition-all"
                                disabled={actionLoading || !currentSite.code.trim()}
                            >
                                Save & Add Another
                            </button>
                            <button 
                                onClick={() => performAction('add', currentSite, false)} 
                                className="px-4 py-1.5 text-xs font-black rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-black shadow-lg transition-all"
                                disabled={actionLoading || !currentSite.code.trim()}
                            >
                                Save Record
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
