import { useState, useEffect } from "react";
import { X, Copy, Check, FileJson } from "lucide-react";

interface EnrichmentDetailsModalProps {
    ip: string;
    onClose: () => void;
}

export function EnrichmentDetailsModal({ ip, onClose }: EnrichmentDetailsModalProps) {
    const [data, setData] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchRawData = async () => {
            try {
                const res = await fetch(`/api/firewall/shun-database/raw?ip=${encodeURIComponent(ip)}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        setError("No raw enrichment data found for this IP.");
                    } else {
                        throw new Error(`Failed to fetch raw data (Status: ${res.status})`);
                    }
                    return;
                }
                const json = await res.json();
                setData(JSON.stringify(json, null, 2));
            } catch (err: any) {
                console.error("Failed to load raw JSON", err);
                setError(err.message || "Failed to load raw JSON payload.");
            } finally {
                setLoading(false);
            }
        };
        fetchRawData();
    }, [ip]);

    const handleCopy = () => {
        if (data) {
            navigator.clipboard.writeText(data);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" onClick={onClose} />
            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-2xl rounded-xl z-50 flex flex-col max-h-[85vh] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-color)] bg-[var(--bg-surface)] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-[var(--accent-primary)]/10 rounded-lg text-[var(--accent-primary)]">
                            <FileJson className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Raw Enrichment Payload</h2>
                            <p className="text-sm font-mono text-[var(--text-secondary)]">{ip}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-auto bg-[#0d1117] relative p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-48 space-y-4">
                            <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[var(--text-secondary)] text-sm animate-pulse">Fetching IPLocate payload...</p>
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center h-48">
                            <p className="text-red-400 font-medium">{error}</p>
                        </div>
                    ) : (
                        <div className="relative group">
                            <button
                                onClick={handleCopy}
                                className="absolute right-0 top-0 p-2 bg-[#21262d] hover:bg-[#30363d] text-gray-300 rounded border border-[#30363d] shadow-sm transition-all flex items-center gap-2 opacity-0 group-hover:opacity-100"
                                title="Copy JSON"
                            >
                                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                                <span className="text-xs font-medium">{copied ? "Copied" : "Copy"}</span>
                            </button>
                            <pre className="text-sm font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap break-all pr-12">
                                {data}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
