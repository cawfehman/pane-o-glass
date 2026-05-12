"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { 
    Upload, 
    Download, 
    History, 
    CheckCircle2, 
    AlertCircle, 
    FileText, 
    ArrowRight,
    Search,
    ShieldCheck,
    Database,
    Clock,
    User,
    Eye,
    Plus,
    Edit2,
    Trash2,
    X
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
    const [activeSites, setActiveSites] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const [showDirectory, setShowDirectory] = useState(false);
    
    // Modal State (Add Site)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSite, setCurrentSite] = useState<any>({ code: "", name: "", address: "", status: "Active" });
    const [actionLoading, setActionLoading] = useState(false);

    // Inline Edit State
    const [editingSiteCode, setEditingSiteCode] = useState<string | null>(null);
    const [editingSiteData, setEditingSiteData] = useState<any>({ name: "", address: "", status: "Active" });

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

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
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
                    setCurrentSite({ code: "", name: "", address: "", status: "Active" });
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
        setCurrentSite({ code: "", name: "", address: "", status: "Active" });
        setIsModalOpen(true);
    };

    const handleEditClick = (site: any) => {
        setEditingSiteCode(site.code);
        setEditingSiteData({ name: site.name, address: site.address, status: site.status || "Active" });
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

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/settings/sites', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            setSuccess(`Site Map v${data.version.versionNumber} is now live.`);
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

        if (codeIdx === -1) return [];

        return lines.slice(1).map(line => {
            const parts = splitCsvRow(line);
            const code = parts[codeIdx]?.toUpperCase() || "UNK";
            return {
                code,
                name: (nameIdx !== -1 ? parts[nameIdx] : "") || code,
                address: addrIdx !== -1 ? parts[addrIdx] || "" : "",
                status: statusIdx !== -1 ? parts[statusIdx] || "Active" : "Active"
            };
        });
    };

    const parsedPreview = latestVersion?.content ? parsePreview(latestVersion.content) : [];
    const totalSites = latestVersion?.content ? latestVersion.content.split(/\r?\n/).filter(l => l.trim()).length - 1 : 0;

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Minimal Header */}
            <header className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-accent-primary-10 text-accent-primary border border-accent-primary/20">
                        <Database size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">SITE INTELLIGENCE</h1>
                        <p className="text-sm text-muted font-medium uppercase tracking-widest opacity-60">Directory & Forensic Mapping</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowDirectory(!showDirectory)}
                        className={`btn-secondary flex items-center gap-2 px-6 ${showDirectory ? 'bg-white/10 text-white' : ''}`}
                    >
                        <Eye size={18} />
                        {showDirectory ? "Hide Site Directory" : "View Site Directory"}
                    </button>
                    <a href="/api/settings/sites/download" className="btn-primary flex items-center gap-2 px-6">
                        <Download size={18} />
                        Export CSV
                    </a>
                </div>
            </header>

            {/* Status Messages */}
            {(error || success) && (
                <div className={`mb-8 p-4 rounded-xl border flex items-center gap-4 animate-in slide-in-from-top-4 ${
                    error ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                    {error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                    <p className="font-medium">{error || success}</p>
                </div>
            )}

            <div className="grid grid-cols-12 gap-8">
                
                {/* Left: Active Config & Upload (4 cols) */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    
                    {/* Active Card */}
                    <div className="glass-card relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-1 bg-accent-primary opacity-50" />
                        <div className="p-6">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="text-xs font-bold text-muted uppercase tracking-widest">Active Mapping</h3>
                                <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase border border-emerald-500/20">Live</span>
                            </div>
                            
                            {latestVersion ? (
                                <div className="space-y-6">
                                    <div className="flex items-baseline justify-between">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-4xl font-black tracking-tighter">v{latestVersion.versionNumber}</span>
                                            <span className="text-sm text-muted font-medium italic">/ stable</span>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-accent-primary uppercase tracking-widest">Total Sites</p>
                                            <p className="text-2xl font-black tracking-tight">{totalSites}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 rounded-xl bg-white-5 border border-white/5">
                                            <p className="text-[10px] text-muted uppercase mb-1 font-bold">Author</p>
                                            <p className="text-sm font-bold truncate">{latestVersion.createdBy}</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white-5 border border-white/5">
                                            <p className="text-[10px] text-muted uppercase mb-1 font-bold">Modified</p>
                                            <p className="text-sm font-bold">{new Date(latestVersion.createdAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-center py-10 text-muted italic text-sm">Waiting for initial configuration...</p>
                            )}
                        </div>
                    </div>

                    {/* Compact Upload */}
                    <div 
                        className={`glass-card p-6 border-2 border-dashed transition-all duration-300 ${
                            dragActive ? 'border-accent-primary bg-accent-primary/5 scale-[1.02]' : 'border-white/10 hover:border-white/20'
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className={`p-4 rounded-full ${uploading ? 'animate-spin bg-accent-primary-10' : 'bg-white-5'}`}>
                                <Upload className={uploading ? 'text-accent-primary' : 'text-muted'} size={24} />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm">Sync New Directory</h4>
                                <p className="text-xs text-muted mt-1">Drag CSV here to update global site mappings</p>
                            </div>
                            <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} disabled={uploading} />
                            <label htmlFor="csv-upload" className={`btn-secondary w-full py-2 text-xs font-bold cursor-pointer transition-all ${uploading ? 'opacity-50 pointer-events-none' : 'hover:bg-white/10'}`}>
                                {uploading ? 'INGESTING...' : 'BROWSE FILES'}
                            </label>
                        </div>
                    </div>

                    {/* Quick Specs */}
                    <div className="glass-card p-6 bg-accent-primary-10 border-l-2 border-accent-primary/20">
                        <h4 className="text-[10px] font-black text-accent-primary uppercase tracking-widest mb-4">CSV Schema Requirements</h4>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white-5 flex items-center justify-center text-[10px] font-bold">1</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Code</strong>: 3-4 char site identifier (NYC)</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white-5 flex items-center justify-center text-[10px] font-bold">2</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Name</strong>: Full descriptive site name</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white-5 flex items-center justify-center text-[10px] font-bold">3</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Address</strong>: Physical location details</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white-5 flex items-center justify-center text-[10px] font-bold">4</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Status</strong>: Active, Retired, or Future</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: History (8 cols) */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    
                    {showDirectory && (
                        <div className="glass-card p-6 border-l-4 border-emerald-500 animate-in slide-in-from-right-4 flex flex-col h-full max-h-[600px]">
                            <div className="flex justify-between items-center mb-4 shrink-0">
                                <div>
                                    <h3 className="font-bold text-sm uppercase tracking-wider">Active Directory</h3>
                                    <p className="text-[10px] text-muted">All sites parsed from the current mapping</p>
                                </div>
                                <button 
                                    onClick={handleAddClick} 
                                    className="btn-primary flex items-center gap-2 px-4 py-2 text-xs"
                                >
                                    <Plus size={14} />
                                    Add Site
                                </button>
                            </div>
                            <div className="bg-white-5 rounded-xl border border-white/5 flex-1 overflow-y-auto custom-scrollbar">
                                <table className="w-full text-xs relative">
                                    <thead className="bg-white-5 text-muted uppercase font-bold sticky top-0 backdrop-blur-md">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Code</th>
                                            <th className="px-4 py-3 text-left">Site Identity</th>
                                            <th className="px-4 py-3 text-left">Status</th>
                                            <th className="px-4 py-3 text-left">Physical Address</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {parsedPreview.map((s, idx) => {
                                            const isEditing = editingSiteCode === s.code;
                                            return (
                                                <tr key={idx} className={`hover:bg-white/5 transition-all duration-200 group ${isEditing ? 'bg-accent-primary/[0.08] shadow-inner' : ''}`}>
                                                    <td className="px-4 py-3.5 font-black text-accent-primary tracking-wider text-xs">{s.code}</td>
                                                    <td className="px-4 py-3.5">
                                                        {isEditing ? (
                                                            <input 
                                                                type="text" 
                                                                value={editingSiteData.name} 
                                                                onChange={e => setEditingSiteData({...editingSiteData, name: e.target.value})}
                                                                className="w-full min-w-[180px] px-3 py-1.5 bg-black/80 border border-accent-primary/40 rounded-lg focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs font-bold text-white shadow-sm transition-all"
                                                                placeholder="Site Name"
                                                            />
                                                        ) : (
                                                            <span className="text-secondary font-bold tracking-tight">{s.name}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        {isEditing ? (
                                                            <select 
                                                                value={editingSiteData.status} 
                                                                onChange={e => setEditingSiteData({...editingSiteData, status: e.target.value})}
                                                                className="px-3 py-1.5 bg-black/80 border border-accent-primary/40 rounded-lg focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-all"
                                                            >
                                                                <option value="Active">Active</option>
                                                                <option value="Future">Future</option>
                                                                <option value="Retired">Retired</option>
                                                            </select>
                                                        ) : (
                                                            <span className={`text-[9px] uppercase px-2.5 py-1 rounded-full font-black tracking-wider ${
                                                                s.status?.toLowerCase() === 'active' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                                                s.status?.toLowerCase() === 'retired' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                                                'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                                            }`}>
                                                                {s.status || 'Active'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        {isEditing ? (
                                                            <textarea 
                                                                rows={2}
                                                                value={editingSiteData.address} 
                                                                onChange={e => setEditingSiteData({...editingSiteData, address: e.target.value})}
                                                                className="w-full min-w-[320px] px-3 py-1.5 bg-black/90 border border-accent-primary/50 rounded-lg focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary text-xs text-white shadow-sm transition-all leading-relaxed"
                                                                placeholder="Physical Address"
                                                                style={{ resize: 'vertical' }}
                                                            />
                                                        ) : (
                                                            <span className="text-muted block break-words leading-relaxed font-medium max-w-xl">{s.address}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        {isEditing ? (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button 
                                                                    onClick={() => performAction('update', { code: s.code, ...editingSiteData })} 
                                                                    disabled={actionLoading}
                                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.3)] text-black font-black text-[10px] transition-all tracking-wider uppercase"
                                                                    title="Save Changes"
                                                                >
                                                                    {actionLoading ? "..." : "Save"}
                                                                </button>
                                                                <button 
                                                                    onClick={() => setEditingSiteCode(null)} 
                                                                    disabled={actionLoading}
                                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] text-muted hover:text-white font-bold text-[10px] transition-all tracking-wide"
                                                                    title="Cancel"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button 
                                                                    onClick={() => handleEditClick(s)} 
                                                                    style={{ backgroundColor: '#ffffff', color: '#000000', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 900, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                                                                    title="Edit Site Directory"
                                                                >
                                                                    <Edit2 size={12} strokeWidth={3} />
                                                                    <span>EDIT</span>
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleDeleteClick(s.code)} 
                                                                    style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 900, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
                                                                    title="Delete Site"
                                                                >
                                                                    <Trash2 size={12} strokeWidth={3} />
                                                                    <span>DELETE</span>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {parsedPreview.length === 0 && (
                                            <tr className="text-muted italic">
                                                <td colSpan={5} className="px-4 py-12 text-center">No active mapping found. Please upload a CSV.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="glass-card flex flex-col h-full">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <History size={20} className="text-accent-primary" />
                                <h3 className="font-black tracking-tight uppercase text-sm">Archival Logs</h3>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-[10px] font-bold text-muted uppercase tracking-widest">Retention: Last 10 Versions</span>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white-5 text-[10px] text-muted uppercase tracking-widest font-black">
                                    <tr>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-5">Source File</th>
                                        <th className="px-6 py-5">Initiated By</th>
                                        <th className="px-6 py-5">Timestamp</th>
                                        <th className="px-6 py-5 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        [...Array(5)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-6"><div className="h-4 bg-white/5 rounded w-full"></div></td>
                                            </tr>
                                        ))
                                    ) : versions.length > 0 ? (
                                        versions.map((v) => (
                                            <tr key={v.id} className="hover:bg-white-5 transition-all group">
                                                <td className="px-6 py-4">
                                                    {v.id === latestVersion?.id ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-tighter">Current</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-muted uppercase">Archived</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <FileText size={14} className="text-muted" />
                                                        <span className="text-sm font-bold">{v.filename}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-accent-primary-10 flex items-center justify-center text-[10px] font-bold text-accent-primary border border-accent-primary/20">
                                                            {v.createdBy[0].toUpperCase()}
                                                        </div>
                                                        <span className="text-xs font-medium text-secondary">{v.createdBy}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium">{new Date(v.createdAt).toLocaleDateString()}</span>
                                                        <span className="text-[10px] text-muted">{new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <a 
                                                        href={`/api/settings/sites/download?id=${v.id}`}
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white-5 hover:bg-accent-primary hover:text-black transition-all text-[10px] font-black uppercase tracking-wider"
                                                    >
                                                        <Download size={12} />
                                                        Fetch
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-32 text-center">
                                                <div className="flex flex-col items-center gap-4 opacity-30">
                                                    <Search size={48} />
                                                    <p className="font-bold uppercase tracking-widest text-xs">Repository Empty</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal for Add Site matching platform overlay style standard precisely */}
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
                    <div className="glass-card w-full max-w-md shadow-[0_0_50px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200 relative overflow-hidden border border-white/20" style={{ maxWidth: '90%', width: '450px' }}>
                        {actionLoading && (
                            <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full border-4 border-accent-primary border-t-transparent animate-spin"></div>
                                    <p className="text-sm font-bold animate-pulse text-white">Adding Site Directory...</p>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                            <h3 className="text-lg font-black tracking-tight text-white" style={{ margin: 0 }}>Add New Site Directory</h3>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>
                                &times;
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-accent-primary uppercase tracking-widest mb-2">Site Code (3-4 Chars)</label>
                                <input 
                                    type="text" 
                                    value={currentSite.code} 
                                    onChange={e => setCurrentSite({...currentSite, code: e.target.value.toUpperCase()})}
                                    placeholder="e.g. NYC"
                                    className="w-full px-4 py-3 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all font-black text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Descriptive Name</label>
                                <input 
                                    type="text" 
                                    value={currentSite.name} 
                                    onChange={e => setCurrentSite({...currentSite, name: e.target.value})}
                                    placeholder="e.g. New York HQ"
                                    className="w-full px-4 py-3 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all font-bold text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Physical Address</label>
                                <input 
                                    type="text" 
                                    value={currentSite.address} 
                                    onChange={e => setCurrentSite({...currentSite, address: e.target.value})}
                                    placeholder="e.g. 123 Broadway, NY 10001"
                                    className="w-full px-4 py-3 bg-black/80 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all text-sm text-white font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-muted uppercase tracking-widest mb-2">Lifecycle Status</label>
                                <select 
                                    value={currentSite.status} 
                                    onChange={e => setCurrentSite({...currentSite, status: e.target.value})}
                                    className="w-full px-4 py-3 bg-black/90 border border-white/20 rounded-xl focus:border-accent-primary focus:outline-none focus:ring-2 focus:ring-accent-primary transition-all font-bold appearance-none text-white text-sm"
                                >
                                    <option value="Active">🟢 Active</option>
                                    <option value="Future">🟡 Future</option>
                                    <option value="Retired">🔴 Retired</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-6 border-t border-white/10 flex flex-wrap justify-end gap-3 bg-white/[0.02]">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-bold rounded-xl bg-white-5 hover:bg-white-10 border border-white/10 text-muted hover:text-white transition-all" disabled={actionLoading}>Cancel</button>
                            <button 
                                onClick={() => performAction('add', currentSite, true)} 
                                className="px-4 py-2 text-xs font-black rounded-xl bg-accent-primary/10 hover:bg-accent-primary/20 text-accent-primary border border-accent-primary/30 transition-all"
                                disabled={actionLoading || !currentSite.code.trim()}
                            >
                                Save & Add Another
                            </button>
                            <button 
                                onClick={() => performAction('add', currentSite, false)} 
                                className="px-5 py-2 text-xs font-black rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-black shadow-[0_0_15px_rgba(var(--accent-primary-rgb),0.5)] transition-all"
                                disabled={actionLoading || !currentSite.code.trim()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
