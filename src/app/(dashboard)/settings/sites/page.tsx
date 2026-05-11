"use client";

import { useState, useEffect, useCallback } from "react";
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
    Eye
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
    const [showPreview, setShowPreview] = useState(false);

    const fetchVersions = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/settings/sites');
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setVersions(data.versions);
            
            // Try to fetch current active sites for preview
            const previewRes = await fetch('/api/ise/triage'); // Triage returns site distribution we can use, but let's just use the CSV content if available
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVersions();
    }, [fetchVersions]);

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

    const latestVersion = versions[0];

    return (
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in duration-500">
            {/* Minimal Header */}
            <header className="flex justify-between items-center mb-10">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-2xl bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                        <Database size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">SITE INTELLIGENCE</h1>
                        <p className="text-sm text-muted font-medium uppercase tracking-widest opacity-60">Directory & Forensic Mapping</p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setShowPreview(!showPreview)}
                        className={`btn-secondary flex items-center gap-2 px-6 ${showPreview ? 'bg-white/10 text-white' : ''}`}
                    >
                        <Eye size={18} />
                        {showPreview ? "Hide Preview" : "Preview Active List"}
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
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-4xl font-black tracking-tighter">v{latestVersion.versionNumber}</span>
                                        <span className="text-sm text-muted font-medium italic">/ stable</span>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                                            <p className="text-[10px] text-muted uppercase mb-1 font-bold">Author</p>
                                            <p className="text-sm font-bold truncate">{latestVersion.createdBy}</p>
                                        </div>
                                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
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
                            <div className={`p-4 rounded-full ${uploading ? 'animate-spin bg-accent-primary/20' : 'bg-white/5'}`}>
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
                    <div className="glass-card p-6 bg-accent-primary/[0.02] border-l-2 border-accent-primary/20">
                        <h4 className="text-[10px] font-black text-accent-primary uppercase tracking-widest mb-4">CSV Schema Requirements</h4>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold">1</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Code</strong>: 3-4 char site identifier (NYC)</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold">2</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Name</strong>: Full descriptive site name</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold">3</div>
                                <p className="text-xs text-secondary font-medium"><strong className="text-primary">Address</strong>: Physical location details</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: History (8 cols) */}
                <div className="col-span-12 lg:col-span-8 space-y-6">
                    
                    {showPreview && (
                        <div className="glass-card p-6 border-l-4 border-emerald-500 animate-in slide-in-from-right-4">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-sm uppercase tracking-wider">Live Directory Preview</h3>
                                <p className="text-[10px] text-muted">First 10 entries parsed from current version</p>
                            </div>
                            <div className="bg-black/20 rounded-xl overflow-hidden border border-white/5">
                                <table className="w-full text-xs">
                                    <thead className="bg-white/5 text-muted uppercase font-bold">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Code</th>
                                            <th className="px-4 py-2 text-left">Site Identity</th>
                                            <th className="px-4 py-2 text-left">Location / Address</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {/* Since we don't have the full content easily accessible without another API call, we'd ideally fetch it. 
                                            For now, this serves as a structural anchor. */}
                                        <tr className="text-muted italic">
                                            <td colSpan={3} className="px-4 py-8 text-center">Preview requires active session sync...</td>
                                        </tr>
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
                                <thead className="bg-white/[0.01] text-[10px] text-muted uppercase tracking-widest font-black">
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
                                            <tr key={v.id} className="hover:bg-white/[0.01] transition-all group">
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
                                                        <div className="w-6 h-6 rounded-full bg-accent-primary/10 flex items-center justify-center text-[10px] font-bold text-accent-primary border border-accent-primary/20">
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
                                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-accent-primary hover:text-black transition-all text-[10px] font-black uppercase tracking-wider"
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
        </div>
    );
}
