"use client";

import React, { useState } from "react";
import { 
    AlertTriangle, 
    ShieldAlert, 
    Server, 
    Search, 
    ExternalLink, 
    Copy, 
    Check, 
    Info, 
    Wrench,
    ArrowUpRight
} from "lucide-react";

interface FailureInvestigationTableProps {
    unreachableDevices: any[];
    onSelectDevice: (hostname: string) => void;
}

export default function FailureInvestigationTable({
    unreachableDevices,
    onSelectDevice
}: FailureInvestigationTableProps) {
    const [search, setSearch] = useState("");
    const [copiedHost, setCopiedHost] = useState<string | null>(null);

    const filtered = unreachableDevices.filter(d => {
        const query = search.toLowerCase();
        const disc = (d.discoveredVia || d.discovered_by || "").toLowerCase();
        const err = (d.failureReason || d.error || "").toLowerCase();
        const ip = (d.ipAddress || d.ip_address || "").toLowerCase();
        const host = (d.hostname || "").toLowerCase();
        return host.includes(query) || disc.includes(query) || err.includes(query) || ip.includes(query);
    });

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedHost(text);
        setTimeout(() => setCopiedHost(null), 2000);
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                            Failure Investigation Center
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/30">
                                {unreachableDevices.length} Unreachable Nodes
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            Switches detected via CDP peer advertisements that failed automated SSH crawl ingestion.
                        </p>
                    </div>
                </div>

                <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Filter failures..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-red-500 transition"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="py-12 text-center space-y-2 border border-dashed border-slate-800 rounded-xl bg-slate-950/40">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                        <Wrench className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-semibold text-slate-300">
                        {unreachableDevices.length === 0 ? "Zero Unreachable Devices Detected!" : "No devices match your search filter."}
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        {unreachableDevices.length === 0 
                            ? "All discovered network elements were successfully contacted, authenticated, and cataloged."
                            : "Try searching with a different hostname or error keyword."}
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/70">
                    <table className="w-full text-xs text-left">
                        <thead className="text-[11px] text-slate-400 bg-slate-900 border-b border-slate-800 uppercase font-semibold">
                            <tr>
                                <th className="py-3 px-4">Switch Hostname</th>
                                <th className="py-3 px-4">Discovered By (CDP)</th>
                                <th className="py-3 px-4">Port / Link</th>
                                <th className="py-3 px-4">Failure Reason</th>
                                <th className="py-3 px-4">Recommended Remediation</th>
                                <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 font-mono">
                            {filtered.map((item, idx) => {
                                const reason = item.failureReason || item.error || "Connection timed out on TCP/22";
                                const isAuth = reason.toLowerCase().includes("auth") || reason.toLowerCase().includes("tacacs");
                                const isTimeout = reason.toLowerCase().includes("timeout") || reason.toLowerCase().includes("timed out");
                                const discHost = item.discoveredVia || item.discovered_by;
                                const discPort = item.discoveredPort || item.discovered_port || "GigabitEthernet1/0/24";
                                const ipAddr = item.ipAddress || item.ip_address;

                                return (
                                    <tr key={idx} className="hover:bg-slate-900/60 transition group">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-red-300 group-hover:text-red-200">
                                                    {item.hostname}
                                                </span>
                                                <button
                                                    onClick={() => handleCopy(item.hostname)}
                                                    className="text-slate-500 hover:text-slate-300 transition"
                                                    title="Copy Hostname"
                                                >
                                                    {copiedHost === item.hostname ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                            <span className="text-[11px] text-slate-500 font-sans block">
                                                {ipAddr || "No IP in CDP payload"}
                                            </span>
                                        </td>

                                        <td className="py-3 px-4 text-slate-300 font-medium font-sans">
                                            {discHost ? (
                                                <button
                                                    onClick={() => onSelectDevice(discHost)}
                                                    className="text-blue-400 hover:underline flex items-center gap-1"
                                                >
                                                    {discHost}
                                                    <ArrowUpRight className="w-3 h-3" />
                                                </button>
                                            ) : (
                                                <span className="text-slate-500">Seed Switch</span>
                                            )}
                                        </td>

                                        <td className="py-3 px-4 text-slate-400">
                                            {discPort}
                                        </td>

                                        <td className="py-3 px-4">
                                            <div className="max-w-[280px]">
                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase mb-1 bg-red-950 text-red-400 border border-red-800/60">
                                                    {isAuth ? "Auth Failure" : isTimeout ? "SSH Timeout" : "Unreachable"}
                                                </span>
                                                <p className="text-[11px] text-slate-300 truncate" title={reason}>
                                                    {reason}
                                                </p>
                                            </div>
                                        </td>

                                        <td className="py-3 px-4 font-sans text-[11px] text-slate-400">
                                            {isAuth ? (
                                                <span className="text-amber-300/90 flex items-center gap-1">
                                                    <Info className="w-3.5 h-3.5 shrink-0" />
                                                    Check TACACS+/AAA privileges or crawler service account creds
                                                </span>
                                            ) : (
                                                <span className="text-slate-300 flex items-center gap-1">
                                                    <Info className="w-3.5 h-3.5 shrink-0" />
                                                    Verify switch VTY line ACL, management VLAN SVI, or firewall rules
                                                </span>
                                            )}
                                        </td>

                                        <td className="py-3 px-4 text-right font-sans">
                                            {item.discovered_by && (
                                                <button
                                                    onClick={() => onSelectDevice(item.discovered_by)}
                                                    className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition"
                                                >
                                                    Inspect Neighbor
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
