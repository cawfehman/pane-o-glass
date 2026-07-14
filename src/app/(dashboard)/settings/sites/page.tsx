"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { 
    CheckCircle2, 
    AlertCircle, 
    Plus,
    History,
    List,
    FileSpreadsheet
} from "lucide-react";

import { SiteStats } from "@/components/sites/SiteStats";
import { CsvUploader } from "@/components/sites/CsvUploader";
import { SiteArchive, SiteVersion } from "@/components/sites/SiteArchive";
import { SiteModal } from "@/components/sites/SiteModal";
import { SiteTable } from "@/components/sites/SiteTable";

export default function SiteManagementPage() {
    const [versions, setVersions] = useState<SiteVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    
    // Master view navigation tabs
    const [activeTab, setActiveTab] = useState<'directory' | 'csv' | 'archive'>('directory');
    
    // Modal State (Add Site)
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentSite, setCurrentSite] = useState<any>({ code: "", name: "", address: "", status: "Active", notes: "" });
    const [actionLoading, setActionLoading] = useState(false);

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
            
            if (action === 'add') {
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

    const handleRevert = async (versionId: string, versionNumber: number) => {
        if (!confirm(`Are you absolutely sure you want to rollback the active mapping engine straight to version ${versionNumber}? This will immediately overwrite current mapped access directives.`)) return;
        setActionLoading(true);
        setError("");
        setSuccess("");
        try {
            const res = await fetch('/api/settings/sites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'revert', versionId })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setSuccess(`Successfully reverted configuration engine back to v${versionNumber}.`);
            fetchVersions();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setActionLoading(false);
            setTimeout(() => { setError(""); setSuccess(""); }, 5000);
        }
    };

    const handleAddClick = () => {
        setCurrentSite({ code: "", name: "", address: "", status: "Active", notes: "" });
        setIsModalOpen(true);
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
            
            setSuccess(`CSV Site Map successfully imported and mapped.`);
            fetchVersions();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploading(false);
        }
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

    return (
        <div className="internal-scroll-layout animate-in fade-in duration-400">
            {/* Top fixed sections layout housing standard actions and view configurations */}
            <div className="shrink-0">
                <SiteStats totalSites={totalSites} />

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
                        <SiteTable 
                            parsedPreview={parsedPreview} 
                            actionLoading={actionLoading} 
                            performAction={performAction} 
                        />
                    )}

                    {/* TAB 2: ARCHIVAL LOGS */}
                    {activeTab === 'archive' && (
                        <SiteArchive 
                            versions={versions} 
                            loading={loading} 
                            latestVersion={latestVersion} 
                            actionLoading={actionLoading} 
                            onRevert={handleRevert} 
                        />
                    )}

                    {/* TAB 3: CSV DIRECTIVES */}
                    {activeTab === 'csv' && (
                        <CsvUploader 
                            uploading={uploading} 
                            handleUpload={handleUpload} 
                        />
                    )}
                </div>
            </div>

            {/* Modal Overlay for Provisioning New Sites */}
            <SiteModal 
                isModalOpen={isModalOpen} 
                setIsModalOpen={setIsModalOpen} 
                currentSite={currentSite} 
                setCurrentSite={setCurrentSite} 
                performAction={performAction} 
                actionLoading={actionLoading} 
            />
        </div>
    );
}
