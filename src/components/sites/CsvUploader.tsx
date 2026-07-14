import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Download } from 'lucide-react';

interface CsvUploaderProps {
    uploading: boolean;
    handleUpload: (file: File) => Promise<void>;
}

export function CsvUploader({ uploading, handleUpload }: CsvUploaderProps) {
    const [dragActive, setDragActive] = useState(false);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) handleUpload(e.dataTransfer.files[0]);
    };

    return (
        <div className="space-y-6">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10">
                <h4 className="text-xs font-black uppercase text-accent-primary tracking-wider mb-2">CSV Directives & Engine Mapping Rules</h4>
                <p className="text-xs text-muted leading-relaxed">
                    Upload a standard comma-separated file to completely sync active topology routes. The spreadsheet must enforce a header row starting with the identifier key <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Code</code> alongside any optional metadata attributes (<code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Name</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Address</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Status</code>, <code className="text-white font-mono bg-black/40 px-1 py-0.5 rounded">Notes</code>).
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
    );
}
