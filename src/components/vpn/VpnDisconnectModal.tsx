"use client";

import { useState } from "react";
import { Power, AlertTriangle, ShieldAlert, CheckCircle, X, Loader2 } from "lucide-react";

interface VpnDisconnectModalProps {
    isOpen: boolean;
    session: any | null;
    onClose: () => void;
    onSuccess: (result: any) => void;
}

export function VpnDisconnectModal({
    isOpen,
    session,
    onClose,
    onSuccess
}: VpnDisconnectModalProps) {
    const [reason, setReason] = useState<string>("Analyst manual session termination");
    const [dryRun, setDryRun] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [result, setResult] = useState<any | null>(null);

    if (!isOpen || !session) return null;

    const handleTerminate = async () => {
        setLoading(true);
        setError("");
        setResult(null);

        try {
            const res = await fetch("/api/vpn/terminate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: session.username,
                    ip: session.assignedIp || session.sourceIp,
                    firewallId: session.firewallId,
                    dryRun,
                    reason
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to terminate session on firewall");
            }

            setResult(data);
            onSuccess(data);
            if (!dryRun) {
                setTimeout(() => {
                    onClose();
                }, 1800);
            }
        } catch (err: any) {
            setError(err.message || "Failed to execute session termination");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="glass-card w-full max-w-lg bg-[var(--bg-surface)] border border-red-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-red-500/10">
                    <div className="flex items-center gap-3 text-red-400">
                        <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30">
                            <Power size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-text-primary m-0">
                                Disconnect AnyConnect Session
                            </h3>
                            <p className="text-xs text-text-secondary m-0">
                                Live Cisco FTD Lina Engine Session Termination
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        disabled={loading}
                        className="text-text-muted hover:text-text-primary p-1 rounded-lg transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex flex-col gap-5">
                    {/* Warning Notice */}
                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-3">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <div>
                            <strong>Active Tunnel Interruption:</strong> This command directly instructs the firewall to invalidate the user&apos;s security association (<code className="text-amber-200">vpn-sessiondb logoff</code>). Their VPN connection will drop immediately.
                        </div>
                    </div>

                    {/* Session Details */}
                    <div className="bg-[var(--bg-background)] border border-border-color rounded-xl p-4 flex flex-col gap-2.5 text-xs">
                        <div className="flex justify-between items-center py-1 border-b border-border-color/60">
                            <span className="text-text-muted">Username:</span>
                            <span className="font-semibold text-text-primary text-sm">{session.username}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-border-color/60">
                            <span className="text-text-muted">Assigned Lease IP:</span>
                            <span className="font-mono text-emerald-400">{session.assignedIp || "N/A"}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-border-color/60">
                            <span className="text-text-muted">Public Endpoint IP:</span>
                            <span className="font-mono text-text-secondary">{session.publicIp || session.sourceIp || "N/A"}</span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-border-color/60">
                            <span className="text-text-muted">Gateway Node:</span>
                            <span className="font-medium text-text-primary">{session.firewallName || session.firewallId || "FTD Active"}</span>
                        </div>
                        {session.duration && (
                            <div className="flex justify-between items-center py-1">
                                <span className="text-text-muted">Active Duration:</span>
                                <span className="text-text-primary">{session.duration}</span>
                            </div>
                        )}
                    </div>

                    {/* Reason input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-text-secondary">
                            Audit Justification / Reason:
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Security quarantine, stuck session, client request..."
                            className="w-full px-3.5 py-2 rounded-xl text-xs bg-[var(--bg-background)] border border-border-color text-text-primary outline-none focus:border-red-500/50"
                        />
                    </div>

                    {/* Dry run checkbox */}
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs select-none">
                        <input
                            type="checkbox"
                            checked={dryRun}
                            onChange={(e) => setDryRun(e.target.checked)}
                            className="rounded border-border-color text-red-500 focus:ring-0"
                        />
                        <span className="text-text-secondary">
                            <strong>Safe Dry-Run:</strong> Simulate firewall execution without dropping connection
                        </span>
                    </label>

                    {/* Error display */}
                    {error && (
                        <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                            <ShieldAlert size={16} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Success display */}
                    {result && (
                        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-2">
                            <CheckCircle size={16} />
                            <span>
                                {result.dryRun ? "[Simulation Complete] " : "Session terminated successfully! "}
                                {result.results?.[0]?.output || result.results?.[0]?.message || "Firewall acknowledged command."}
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-color bg-[var(--bg-background)]">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="btn-secondary text-xs px-4 py-2"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleTerminate}
                        disabled={loading}
                        className="btn-danger text-xs px-5 py-2 rounded-xl font-bold flex items-center gap-2 border border-red-500/40 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20 disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>Executing on Gateway...</span>
                            </>
                        ) : (
                            <>
                                <Power size={14} />
                                <span>{dryRun ? "Simulate Disconnect" : "Terminate Active Session"}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
