import React from 'react';
import { Download, History, FileText } from 'lucide-react';

export interface SiteVersion {
    id: string;
    filename: string;
    versionNumber: number;
    createdBy: string;
    createdAt: string;
    content?: string;
}

interface SiteArchiveProps {
    versions: SiteVersion[];
    loading: boolean;
    latestVersion: SiteVersion | null;
    actionLoading: boolean;
    onRevert: (versionId: string, versionNumber: number) => Promise<void>;
}

export function SiteArchive({ versions, loading, latestVersion, actionLoading, onRevert }: SiteArchiveProps) {
    return (
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
                                                onClick={() => onRevert(v.id, v.versionNumber)}
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
    );
}
