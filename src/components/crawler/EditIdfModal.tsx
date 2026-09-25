"use client";

import React, { useState } from "react";
import { 
    X, 
    Layers, 
    Building2, 
    Server, 
    ArrowRight, 
    CheckCircle2, 
    AlertTriangle,
    Save
} from "lucide-react";
import { SiteMetadataLookup } from "./TopologyGraph";

interface EditIdfModalProps {
    isOpen: boolean;
    onClose: () => void;
    siteCode: string;
    idfCode: string;
    devices: any[];
    siteDirectory?: Record<string, SiteMetadataLookup>;
    onSuccess?: () => void;
}

export default function EditIdfModal({
    isOpen,
    onClose,
    siteCode,
    idfCode,
    devices = [],
    siteDirectory = {},
    onSuccess
}: EditIdfModalProps) {
    const [targetSite, setTargetSite] = useState(siteCode);
    const [targetIdf, setTargetIdf] = useState(idfCode);
    const [reason, setReason] = useState("");
    const [selectedHosts, setSelectedHosts] = useState<string[]>(
        devices.map(d => d.hostname)
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Reset fields when props change
    React.useEffect(() => {
        setTargetSite(siteCode);
        setTargetIdf(idfCode);
        setSelectedHosts(devices.map(d => d.hostname));
        setReason("");
        setError(null);
        setSuccess(null);
    }, [siteCode, idfCode, devices]);

    if (!isOpen) return null;

    const availableSiteCodes = Object.keys(siteDirectory).sort();
    if (!availableSiteCodes.includes(siteCode)) {
        availableSiteCodes.unshift(siteCode);
    }

    const toggleHost = (host: string) => {
        setSelectedHosts(prev => 
            prev.includes(host) ? prev.filter(h => h !== host) : [...prev, host]
        );
    };

    const toggleAllHosts = () => {
        if (selectedHosts.length === devices.length) {
            setSelectedHosts([]);
        } else {
            setSelectedHosts(devices.map(d => d.hostname));
        }
    };

    const handleSave = async () => {
        const cleanSite = targetSite.trim().toUpperCase();
        const cleanIdf = targetIdf.trim().toUpperCase();

        if (!cleanSite) {
            setError("Target Site is required.");
            return;
        }
        if (!cleanIdf) {
            setError("IDF Closet Name is required.");
            return;
        }
        if (selectedHosts.length === 0) {
            setError("At least one switch must be selected to reassign.");
            return;
        }

        setSaving(true);
        setError(null);
        setSuccess(null);

        try {
            const canonicalHosts = selectedHosts.map(h => 
                h.split(".")[0].split("(")[0].trim().toLowerCase()
            );

            const res = await fetch("/api/crawler/overrides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    hostnames: canonicalHosts,
                    siteOverride: cleanSite,
                    idfOverride: cleanIdf,
                    reason: reason.trim() || `IDF Closet Reassignment: ${siteCode} ${idfCode} -> ${cleanSite} ${cleanIdf}`
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update IDF closet assignment.");

            setSuccess(`Successfully reassigned ${selectedHosts.length} switch(es) to ${cleanSite} • IDF ${cleanIdf}!`);
            if (onSuccess) onSuccess();

            setTimeout(() => {
                onClose();
            }, 1000);
        } catch (err: any) {
            setError(err.message || "Failed to update closet.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700/80 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                Edit Closet: <span className="font-mono text-sky-400">{idfCode}</span>
                            </h3>
                            <p className="text-xs text-slate-400">
                                Current Site: <span className="font-mono text-slate-300 font-semibold">{siteCode}</span> • {devices.length} member {devices.length === 1 ? "switch" : "switches"}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Target Site */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-sky-400" />
                                Target Site
                            </label>
                            <input
                                list="siteOptions"
                                value={targetSite}
                                onChange={(e) => setTargetSite(e.target.value.toUpperCase())}
                                placeholder="e.g. KEL"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-sky-400"
                            />
                            <datalist id="siteOptions">
                                {availableSiteCodes.map(code => (
                                    <option key={code} value={code}>
                                        {code}{siteDirectory[code]?.name ? ` — ${siteDirectory[code].name}` : ""}
                                    </option>
                                ))}
                            </datalist>
                            <p className="text-[10px] text-slate-500">Site code where this closet resides</p>
                        </div>

                        {/* Target IDF */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-sky-400" />
                                IDF Closet Name
                            </label>
                            <input
                                type="text"
                                value={targetIdf}
                                onChange={(e) => setTargetIdf(e.target.value.toUpperCase())}
                                placeholder="e.g. 2MC, MDF, IDF-1"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:outline-none focus:border-sky-400"
                            />
                            <p className="text-[10px] text-slate-500">Physical closet or rack room code</p>
                        </div>
                    </div>

                    {/* Documentation Reason */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-300">
                            Reason / Governance Note (Optional)
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Relocated IDF or non-standard closet name correction"
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-400"
                        />
                    </div>

                    {/* Member Switches List */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                <Server className="w-3.5 h-3.5 text-sky-400" />
                                Member Switches to Update ({selectedHosts.length}/{devices.length})
                            </span>
                            <button
                                type="button"
                                onClick={toggleAllHosts}
                                className="text-[11px] text-sky-400 hover:text-sky-300 transition cursor-pointer"
                            >
                                {selectedHosts.length === devices.length ? "Deselect All" : "Select All"}
                            </button>
                        </div>

                        <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-slate-800 bg-slate-950/60 p-2">
                            {devices.length === 0 ? (
                                <p className="text-xs text-slate-500 italic p-2">No switches found in this closet.</p>
                            ) : (
                                devices.map(dev => {
                                    const isChecked = selectedHosts.includes(dev.hostname);
                                    return (
                                        <label
                                            key={dev.hostname}
                                            className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition ${
                                                isChecked 
                                                    ? 'bg-sky-500/10 border-sky-500/30 text-white' 
                                                    : 'bg-transparent border-transparent text-slate-400 hover:bg-slate-800/40'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleHost(dev.hostname)}
                                                    className="w-3.5 h-3.5 rounded accent-sky-500"
                                                />
                                                <span className="font-mono font-bold truncate">{dev.hostname}</span>
                                                {dev.ipAddress && (
                                                    <span className="text-[10px] text-slate-500 font-mono">({dev.ipAddress})</span>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                                {dev.role || "Switch"}
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Status Alerts */}
                    {error && (
                        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {success && (
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{success}</span>
                        </div>
                    )}
                </div>

                {/* Footer Buttons */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || selectedHosts.length === 0}
                        className="px-4 py-2 text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl transition flex items-center gap-1.5 shadow-md disabled:opacity-50 cursor-pointer"
                    >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? "Updating Closet..." : "Save Closet Changes"}
                    </button>
                </div>
            </div>
        </div>
    );
}
