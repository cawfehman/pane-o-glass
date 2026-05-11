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
    ShieldAlert
} from "lucide-react";

interface SiteVersion {
    id: string;
    filename: string;
    versionNumber: number;
    createdBy: string;
    createdAt: string;
}

export default function SiteManagementPage() {
    const [versions, setVersions] = useState<SiteVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [dragActive, setDragActive] = useState(false);

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
            
            setSuccess(`Successfully uploaded version ${data.version.versionNumber}: ${file.name}`);
            fetchVersions();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0]);
        }
    };

    const latestVersion = versions[0];

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <header className="mb-8">
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Site Metadata Management</h1>
                        <p className="text-secondary max-w-2xl">
                            Manage the mapping of network site codes to physical names and addresses. 
                            This data enriches the Cisco ISE Triage dashboard and other forensic tools.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <a 
                            href="/api/settings/sites/download" 
                            className="btn-secondary flex items-center gap-2"
                            title="Download current active list"
                        >
                            <Download size={18} />
                            Export Current
                        </a>
                    </div>
                </div>
            </header>

            {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <AlertCircle size={20} />
                    <p>{error}</p>
                </div>
            )}

            {success && (
                <div className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                    <CheckCircle2 size={20} />
                    <p>{success}</p>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Current Status & Upload */}
                <div className="lg:col-span-1 flex flex-col gap-8">
                    {/* Active Version Card */}
                    <div className="glass-card p-6 border-l-4 border-accent-primary">
                        <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4">Active Configuration</h3>
                        {latestVersion ? (
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-3 rounded-xl bg-accent-primary/10 text-accent-primary">
                                        <ShieldAlert size={24} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-lg">v{latestVersion.versionNumber}</p>
                                        <p className="text-xs text-muted">{latestVersion.filename}</p>
                                    </div>
                                </div>
                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-secondary">Updated By</span>
                                        <span className="font-medium text-primary">{latestVersion.createdBy}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-secondary">Effective Since</span>
                                        <span className="font-medium text-primary">{new Date(latestVersion.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-4 text-center text-muted italic">
                                No site map uploaded yet.
                            </div>
                        )}
                    </div>

                    {/* Upload Dropzone */}
                    <div 
                        className={`glass-card p-8 border-2 border-dashed transition-all duration-200 text-center flex flex-col items-center gap-4 ${
                            dragActive ? 'border-accent-primary bg-accent-primary/5' : 'border-white/10 hover:border-white/20'
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <div className={`p-4 rounded-full ${uploading ? 'animate-pulse bg-accent-primary/20' : 'bg-white/5'}`}>
                            <Upload className={uploading ? 'text-accent-primary' : 'text-muted'} size={32} />
                        </div>
                        <div>
                            <h4 className="font-bold mb-1">Upload New CSV</h4>
                            <p className="text-xs text-muted">Drag & Drop or click to browse</p>
                        </div>
                        <input 
                            type="file" 
                            accept=".csv" 
                            className="hidden" 
                            id="csv-upload"
                            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
                            disabled={uploading}
                        />
                        <label 
                            htmlFor="csv-upload" 
                            className={`btn-primary w-full cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                            {uploading ? 'Processing...' : 'Select CSV File'}
                        </label>
                        <p className="text-[10px] text-muted italic mt-2">
                            Required columns: <strong>Code, Name, Address</strong>
                        </p>
                    </div>
                </div>

                {/* Right Column: History */}
                <div className="lg:col-span-2">
                    <div className="glass-card overflow-hidden">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                            <div className="flex items-center gap-2">
                                <History size={18} className="text-accent-primary" />
                                <h3 className="font-bold">Version History</h3>
                            </div>
                            <span className="text-xs text-muted">Showing last 10 versions</span>
                        </div>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-white/[0.01] text-xs text-muted uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Version</th>
                                        <th className="px-6 py-4 font-semibold">Filename</th>
                                        <th className="px-6 py-4 font-semibold">Author</th>
                                        <th className="px-6 py-4 font-semibold">Date</th>
                                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {loading ? (
                                        [...Array(3)].map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td colSpan={5} className="px-6 py-4">
                                                    <div className="h-4 bg-white/5 rounded w-full"></div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : versions.length > 0 ? (
                                        versions.map((v) => (
                                            <tr key={v.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                        v.id === latestVersion?.id 
                                                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                                            : 'bg-white/5 text-secondary'
                                                    }`}>
                                                        v{v.versionNumber}
                                                        {v.id === latestVersion?.id && " (Active)"}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm font-medium">{v.filename}</td>
                                                <td className="px-6 py-4 text-sm text-secondary">{v.createdBy}</td>
                                                <td className="px-6 py-4 text-sm text-secondary">
                                                    {new Date(v.createdAt).toLocaleString(undefined, { 
                                                        month: 'short', 
                                                        day: 'numeric', 
                                                        hour: '2-digit', 
                                                        minute: '2-digit' 
                                                    })}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <a 
                                                        href={`/api/settings/sites/download?id=${v.id}`}
                                                        className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-accent-primary transition-all inline-block"
                                                        title="Download this version"
                                                    >
                                                        <Download size={16} />
                                                    </a>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center text-muted">
                                                <div className="flex flex-col items-center gap-3">
                                                    <FileText size={40} className="opacity-20" />
                                                    <p>No version history available.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Quick Guide Card */}
                    <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="glass-card p-4 bg-emerald-500/[0.02] border border-emerald-500/10">
                            <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2 flex items-center gap-2">
                                <Search size={14} />
                                Search Integration
                            </h4>
                            <p className="text-xs text-secondary leading-relaxed">
                                Once a site map is active, you can search for site codes directly in the ISE Triage dashboard. 
                                The system will automatically resolve "NYC" to "New York Global Headquarters".
                            </p>
                        </div>
                        <div className="glass-card p-4 bg-accent-primary/[0.02] border border-accent-primary/10">
                            <h4 className="text-xs font-bold text-accent-primary uppercase mb-2 flex items-center gap-2">
                                <ArrowRight size={14} />
                                CSV Template
                            </h4>
                            <p className="text-xs text-secondary leading-relaxed">
                                Use headers: <strong>Code, Name, Address</strong>. 
                                Example: <code>NYC, New York HQ, 123 Broadway, NY 10001</code>. 
                                Site codes must be 3-4 letters.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
