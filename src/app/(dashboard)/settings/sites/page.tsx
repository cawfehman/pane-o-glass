"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
    const [activeTab, setActiveTab] = useState<'directory' | 'csv' | 'archive'>('directory');
    
    // Unified CSV Dropdown toggle state
    const [isCsvMenuOpen, setIsCsvMenuOpen] = useState(false);
    const csvMenuRef = useRef<HTMLDivElement>(null);
    
    // High-Density layout collapse controller
    const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});

    // Modal State (Add Site)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSite, setCurrentSite] = useState<any>({ code: "", name: "", address: "", status: "Active", notes: "" });
    const [actionLoading, setActionLoading] = useState(false);

    // Inline Edit State
    const [editingSiteCode, setEditingSiteCode] = useState<string | null>(null);
    const [editingSiteData, setEditingSiteData] = useState<any>({ name: "", address: "", status: "Active", notes: "" });

    // Client Sort State
    const [sortField, setSortField] = useState<'code' | 'status'>('code');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
        setEditingSiteData({ code: site.code, name: site.name, address: site.address, status: site.status || "Active", notes: site.notes || "" });
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
    const parsePreview = useCallback((csv: string) => {
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

        return lines.slice(1).map((line, index) => {
            const parts = splitCsvRow(line);
            const rawCode = parts[codeIdx]?.toUpperCase()?.trim();
            const code = rawCode || `UNK-${index}`;
            return {
                id: `${code}-${index}`,
                code,
                name: (nameIdx !== -1 ? parts[nameIdx] : "") || code,
                address: addrIdx !== -1 ? parts[addrIdx] || "" : "",
                status: statusIdx !== -1 ? parts[statusIdx] || "Active" : "Active",
                notes: notesIdx !== -1 ? parts[notesIdx] || "" : ""
            };
        });
    }, []);

    const parsedPreview = useMemo(() => {
        return latestVersion?.content ? parsePreview(latestVersion.content) : [];
    }, [latestVersion?.content, parsePreview]);

    const totalSites = latestVersion?.content ? latestVersion.content.split(/\r?\n/).filter(l => l.trim()).length - 1 : 0;

    const sortedSites = useMemo(() => {
        return [...parsedPreview].sort((a, b) => {
            if (sortField === 'code') {
                return sortDirection === 'asc' 
                    ? a.code.localeCompare(b.code) 
                    : b.code.localeCompare(a.code);
            } else {
                const statusA = a.status || 'Active';
                const statusB = b.status || 'Active';
                return sortDirection === 'asc' 
                    ? statusA.localeCompare(statusB) 
                    : statusB.localeCompare(statusA);
            }
        });
    }, [parsedPreview, sortField, sortDirection]);

    return (
        <div className="internal-scroll-layout animate-in fade-in duration-400">
            {/* Top fixed sections layout housing standard actions and view configurations */}
            <div className="shrink-0">
                <header className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                            <Database size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tight uppercase text-white">Site Operations</h1>
                            <p className="text-xs text-muted font-bold tracking-wide">Mapping Engine & Access Directives</p>
                        </div>
                    </div>

                    {/* Premium Bold Configuration Metrics Card on the extreme right */}
                    <div className="flex items-center gap-3 text-right">
                        <div>
                            <div className="text-2xl font-black tracking-tighter text-accent-primary leading-none">
                                {totalSites}
                            </div>
                            <span className="text-[10px] font-black text-muted uppercase tracking-widest block mt-0.5">
                                {totalSites === 1 ? 'Configured Site' : 'Configured Sites'}
                            </span>
                        </div>
                        <div className="h-8 w-1 rounded-full bg-accent-primary/20"></div>
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

                {/* Secondary Header Row: Tab Selectors & Directory Master collapse tool */}
                <div className="flex flex-wrap items-center justify-between border-b border-border-color pb-4 mb-4 gap-4">
                    {/* Tab routes */}
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setActiveTab('directory')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer bg-transparent ${
                                activeTab === 'directory'
                                    ? 'text-accent-primary border border-border-color'
                                    : 'text-muted hover:text-white border-none'
                            }`}
                        >
                            <List size={13} />
                            <span>Site Directory</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('csv')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer bg-transparent ${
                                activeTab === 'csv'
                                    ? 'text-accent-primary border border-border-color'
                                    : 'text-muted hover:text-white border-none'
                            }`}
                        >
                            <FileSpreadsheet size={13} />
                            <span>CSV Directives</span>
                        </button>
                        <button 
                            onClick={() => setActiveTab('archive')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer bg-transparent ${
                                activeTab === 'archive'
                                    ? 'text-accent-primary border border-border-color'
                                    : 'text-muted hover:text-white border-none'
                            }`}
                        >
                            <History size={13} />
                            <span>Archival Logs</span>
                        </button>
                    </div>

                    {/* Bulk Expand/Collapse Actions */}
                    {activeTab === 'directory' && (
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => {
                                    const allExpanded: Record<string, boolean> = {};
                                    parsedPreview.forEach((s: any) => { allExpanded[s.id] = true; });
                                    setExpandedSites(allExpanded);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-muted hover:text-accent-primary cursor-pointer bg-transparent border-none"
                                title="Expand all rows"
                            >
                                Expand All
                            </button>
                            <button 
                                onClick={() => setExpandedSites({})}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-muted hover:text-accent-primary cursor-pointer bg-transparent border-none"
                                title="Collapse all rows"
                            >
                                Collapse All
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom flex-1 List Container housed inside a glass-card mimicking Account Management container boundaries */}
            <div className="glass-card flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="m-0">Configured Sites</h3>
                    {activeTab === 'directory' && (
                        <button 
                            onClick={handleAddClick}
                            className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-lg transition-all text-accent-primary hover:bg-accent-primary/10 border border-accent-primary/30 cursor-pointer bg-transparent"
                        >
                            <Plus size={14} strokeWidth={2.5} />
                            <span>Add Site</span>
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    
                    {/* TAB 1: SITE DIRECTORY */}
                    {activeTab === 'directory' && (
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead className="sticky-header">
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '12px 8px', cursor: 'pointer', width: '140px' }} onClick={() => {
                                        if (sortField === 'code') {
                                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setSortField('code');
                                            setSortDirection('asc');
                                        }
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Site Code {sortField === 'code' ? <span className="text-accent-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span> : <span style={{ opacity: 0.3 }}>↕</span>}
                                        </div>
                                    </th>
                                    <th style={{ padding: '12px 8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Site Name / Summary</div>
                                    </th>
                                    <th style={{ padding: '12px 8px', cursor: 'pointer', width: '140px' }} onClick={() => {
                                        if (sortField === 'status') {
                                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setSortField('status');
                                            setSortDirection('asc');
                                        }
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            Status {sortField === 'status' ? <span className="text-accent-primary">{sortDirection === 'asc' ? '↑' : '↓'}</span> : <span style={{ opacity: 0.3 }}>↕</span>}
                                        </div>
                                    </th>
                                    <th style={{ padding: '12px 8px', textAlign: 'right', width: '120px' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSites.map((s: any) => {
                                    const isEditing = editingSiteCode === s.code;
                                    
                                    // Process inline custom edits state view
                                    if (isEditing) {
                                        return (
                                            <tr key={s.id} style={{ borderBottom: '2px solid var(--accent-primary)', backgroundColor: 'transparent' }}>
                                                <td colSpan={4} style={{ padding: '12px 0' }}>
                                                    <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-surface)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '12px' }}>
                                                            <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)' }}>{s.code}</span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Inline Editor</span>
                                                        </div>
                                                        
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                                                <div style={{ width: '130px' }}>
                                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Site Code</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={editingSiteData.code !== undefined ? editingSiteData.code : s.code} 
                                                                        onChange={e => setEditingSiteData({...editingSiteData, code: e.target.value})}
                                                                        style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', fontFamily: 'monospace', fontWeight: 700 }}
                                                                        placeholder="CODE"
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: '180px' }}>
                                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Site Name</label>
                                                                    <input 
                                                                        type="text" 
                                                                        value={editingSiteData.name} 
                                                                        onChange={e => setEditingSiteData({...editingSiteData, name: e.target.value})}
                                                                        style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem' }}
                                                                        placeholder="Site Name"
                                                                    />
                                                                </div>
                                                                <div style={{ width: '130px' }}>
                                                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Status</label>
                                                                    <select 
                                                                        value={editingSiteData.status} 
                                                                        onChange={e => setEditingSiteData({...editingSiteData, status: e.target.value})}
                                                                        style={{ 
                                                                            width: '100%', 
                                                                            padding: '6px 10px', 
                                                                            background: '#000', 
                                                                            border: '1px solid var(--border-color)', 
                                                                            borderRadius: '6px', 
                                                                            color: editingSiteData.status === 'Retired' ? '#f87171' : editingSiteData.status === 'Future' ? '#facc15' : '#4ade80', 
                                                                            fontSize: '0.9rem', 
                                                                            fontWeight: 700 
                                                                        }}
                                                                    >
                                                                        <option value="Active" style={{ color: '#4ade80' }}>Active</option>
                                                                        <option value="Future" style={{ color: '#facc15' }}>Future</option>
                                                                        <option value="Retired" style={{ color: '#f87171' }}>Retired</option>
                                                                    </select>
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Address</label>
                                                                <textarea 
                                                                    rows={1}
                                                                    value={editingSiteData.address} 
                                                                    onChange={e => setEditingSiteData({...editingSiteData, address: e.target.value})}
                                                                    style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', lineHeight: '1.3' }}
                                                                    placeholder="Full Address"
                                                                />
                                                            </div>

                                                            <div>
                                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '2px' }}>Notes</label>
                                                                <textarea 
                                                                    rows={2}
                                                                    value={editingSiteData.notes} 
                                                                    onChange={e => setEditingSiteData({...editingSiteData, notes: e.target.value})}
                                                                    style={{ width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: '#fff', fontSize: '0.9rem', lineHeight: '1.3' }}
                                                                    placeholder="Notes"
                                                                />
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                                                            <button 
                                                                onClick={() => setEditingSiteCode(null)} 
                                                                disabled={actionLoading}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button 
                                                                onClick={() => performAction('update', { 
                                                                    oldCode: s.code, 
                                                                    code: editingSiteData.code !== undefined ? editingSiteData.code : s.code, 
                                                                    ...editingSiteData 
                                                                })} 
                                                                disabled={actionLoading}
                                                                style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', padding: '4px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                                                            >
                                                                {actionLoading ? "Saving..." : "Save"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    const rawStatus = s.status || 'Active';
                                    const formattedStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
                                    const statusColorHex = 
                                        formattedStatus === 'Active' ? '#4ade80' :
                                        formattedStatus === 'Retired' ? '#f87171' :
                                        '#facc15';

                                    const isExpanded = !!expandedSites[s.id];
                                    const toggleExpand = () => {
                                        setExpandedSites(prev => ({ ...prev, [s.id]: !prev[s.id] }));
                                    };

                                    return (
                                        <React.Fragment key={s.id}>
                                            <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '12px 8px' }}>
                                                    <div 
                                                        onClick={toggleExpand}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                                        className="group"
                                                        title="Click to expand/collapse details"
                                                    >
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                                                            ▶
                                                        </span>
                                                        <span style={{ fontWeight: 800, fontFamily: 'monospace', fontSize: '1.05rem', color: 'var(--accent-primary)' }} className="uppercase tracking-wider group-hover:underline">
                                                            {s.code}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 8px' }}>
                                                    <div className="flex items-center gap-2">
                                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{s.name}</span>
                                                        {!isExpanded && s.address && (
                                                            <span className="text-xs text-text-muted truncate max-w-xs">
                                                                • {s.address}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 8px' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '12px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 700,
                                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                        color: statusColorHex,
                                                        border: `1px solid ${statusColorHex}33`
                                                    }}>
                                                        {formattedStatus}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                                    <div className="flex justify-end gap-2 items-center">
                                                        <button 
                                                            onClick={() => handleEditClick(s)} 
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}
                                                            className="nav-link"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDeleteClick(s.code)} 
                                                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.8rem' }}
                                                            className="nav-link"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {isExpanded && (
                                                <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'rgba(0,0,0,0.1)' }}>
                                                    <td colSpan={4} style={{ padding: '8px 12px 16px 32px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px' }}>Address</span>
                                                                <span style={{ fontSize: '0.85rem', color: s.address ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                                                                    {s.address || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>No physical address specified</span>}
                                                                </span>
                                                            </div>
                                                            {s.notes && (
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginTop: '2px' }}>
                                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '70px', marginTop: '2px' }}>Notes</span>
                                                                    <div style={{ flex: 1, fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.3)', padding: '6px 10px', borderRadius: '6px', borderLeft: '2px solid var(--accent-primary)' }}>
                                                                        {s.notes}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                                {sortedSites.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-muted)' }}>
                                            No sites configured yet. Upload a CSV or add a site mapping above!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {/* TAB 2: ARCHIVAL LOGS (Isolated configuration historical view) */}
                    {activeTab === 'archive' && (
                        <div>
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
                                                    <div className="flex items-center justify-end gap-2">
                                                        <a 
                                                            href={`/api/settings/sites/download?id=${v.id}`}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-transparent hover:bg-white/[0.05] text-white font-black text-[10px] uppercase transition-all border border-white/15"
                                                            title="Download mapped configuration version state"
                                                        >
                                                            <Download size={11} />
                                                            <span>Extract</span>
                                                        </a>
                                                        {v.id !== latestVersion?.id && (
                                                            <button 
                                                                onClick={async () => {
                                                                    if (!confirm(`Are you absolutely sure you want to rollback the active mapping engine straight to version ${v.versionNumber}? This will immediately overwrite current mapped access directives.`)) return;
                                                                    setActionLoading(true);
                                                                    setError("");
                                                                    setSuccess("");
                                                                    try {
                                                                        const res = await fetch('/api/settings/sites', {
                                                                            method: 'PATCH',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ action: 'revert', versionId: v.id })
                                                                        });
                                                                        const data = await res.json();
                                                                        if (data.error) throw new Error(data.error);
                                                                        setSuccess(`Successfully reverted configuration engine back to v${v.versionNumber}.`);
                                                                        fetchVersions();
                                                                    } catch (e: any) {
                                                                        setError(e.message);
                                                                    } finally {
                                                                        setActionLoading(false);
                                                                        setTimeout(() => { setError(""); setSuccess(""); }, 5000);
                                                                    }
                                                                }}
                                                                disabled={actionLoading}
                                                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-transparent hover:bg-amber-500/10 text-amber-400 font-black text-[10px] uppercase transition-all border border-amber-500/20 cursor-pointer"
                                                                title="Rollback active mapping parameters directly to this checkpoint baseline"
                                                            >
                                                                <History size={11} />
                                                                <span>Revert</span>
                                                            </button>
                                                        )}
                                                    </div>
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

                    {/* TAB 3: CSV DIRECTIVES (Dedicated Import / Export Tab) */}
                    {activeTab === 'csv' && (
                        <div className="space-y-6">
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
                                <h4 className="text-xs font-black uppercase text-accent-primary tracking-wider mb-2">CSV Directives & Engine Mapping Rules</h4>
                                <p className="text-xs text-muted leading-relaxed">
                                    Upload a standard comma-separated file to completely sync active topology routes. The spreadsheet must enforce a header row starting with the identifier key <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Code</code> alongside any optional metadata attributes (<code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Name</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Address</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Status</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Notes</code>).
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Upload / Drop Zone */}
                                <div 
                                    onDragEnter={handleDrag}
                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); }}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
                                        dragActive 
                                            ? 'border-accent-primary bg-accent-primary/5 scale-[1.02]' 
                                            : 'border-white/10 hover:border-accent-primary/40 bg-black/20'
                                    }`}
                                >
                                    <div className="p-3.5 rounded-2xl bg-white/5 text-muted mb-3 group-hover:text-accent-primary transition-colors">
                                        <Upload size={28} className={uploading ? 'animate-bounce text-accent-primary' : ''} />
                                    </div>
                                    <span className="text-xs font-black text-white uppercase tracking-wide mb-1">
                                        {uploading ? 'Parsing CSV Records...' : 'Drop spreadsheet mapping file here'}
                                    </span>
                                    <span className="text-[10px] text-muted font-bold mb-4 block">or click to browse local OS storage</span>
                                    
                                    <label className="px-4 py-2 rounded-xl bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30 text-xs font-black transition-all cursor-pointer">
                                        <span>Select Spreadsheet</span>
                                        <input 
                                            type="file" 
                                            accept=".csv" 
                                            className="hidden" 
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                                            }}
                                            disabled={uploading}
                                        />
                                    </label>
                                </div>

                                {/* Live Configuration Downloader Card */}
                                <div className="border border-white/10 rounded-2xl p-6 bg-black/20 flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center gap-2.5 mb-3">
                                            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                                                <FileSpreadsheet size={18} />
                                            </div>
                                            <span className="text-xs font-black text-white uppercase tracking-wide">Live Base Extraction</span>
                                        </div>
                                        <p className="text-xs text-muted mb-4 leading-relaxed">
                                            Download the exact live base CSV payload currently feeding triage path routing, physical maps mapping, and address telemetry. Use this baseline to seed edits offline before bulk import processing.
                                        </p>
                                    </div>

                                    <a 
                                        href="/api/settings/sites/download" 
                                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black text-xs transition-all uppercase tracking-wider"
                                    >
                                        <Download size={14} className="text-emerald-400" />
                                        <span>Download Live Base CSV</span>
                                    </a>
                                </div>
                            </div>
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
                            <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-transparent hover:bg-white/[0.05] border border-white/15 text-muted hover:text-white transition-all cursor-pointer" disabled={actionLoading}>Cancel</button>
                            <button 
                                onClick={() => performAction('add', currentSite, true)} 
                                className="px-3 py-1.5 text-xs font-black rounded-lg bg-transparent hover:bg-accent-primary/10 text-accent-primary border border-accent-primary/30 transition-all cursor-pointer"
                                disabled={actionLoading || !currentSite.code.trim()}
                            >
                                Save & Add Another
                            </button>
                            <button 
                                onClick={() => performAction('add', currentSite, false)} 
                                className="px-3 py-1.5 text-xs font-black rounded-lg bg-transparent hover:bg-accent-primary/10 text-accent-primary border border-accent-primary transition-all cursor-pointer"
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
