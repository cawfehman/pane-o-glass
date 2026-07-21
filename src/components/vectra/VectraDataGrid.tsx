'use client';

import React from 'react';

export default function VectraDataGrid({ data }: { data: any[] }) {
    if (!data || data.length === 0) return null;

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex-1 min-h-0 custom-scrollbar overflow-auto">
                <table className="w-full text-left border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-[var(--bg-surface)] shadow-[0_1px_0_var(--border-color)]">
                        <tr>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Timestamp</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Proto</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Source</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Destination</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)]">Port</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)] text-right">Bytes Out</th>
                            <th className="px-4 py-3 font-semibold text-[var(--text-muted)] text-right">Bytes In</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                        {data.map((evt, idx) => (
                            <tr key={idx} className="hover:bg-[var(--bg-surface-hover)] transition-colors group">
                                <td className="px-4 py-2 text-[var(--text-primary)] font-mono whitespace-nowrap">
                                    {new Date(evt.timestamp || evt.session_start_time).toLocaleString()}
                                </td>
                                <td className="px-4 py-2">
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-500/20 text-gray-300">
                                        {evt.proto_name || evt.proto || 'TCP'}
                                    </span>
                                </td>
                                <td className="px-4 py-2 font-mono text-[var(--text-primary)]">
                                    {evt.id_orig_h}
                                </td>
                                <td className="px-4 py-2 font-mono text-[var(--text-primary)]">
                                    {evt.id_resp_h}
                                </td>
                                <td className="px-4 py-2 text-[var(--text-muted)] font-mono">
                                    {evt.id_resp_p}
                                </td>
                                <td className="px-4 py-2 text-right text-[var(--text-primary)] font-mono">
                                    {(evt.orig_ip_bytes || 0).toLocaleString()}
                                </td>
                                <td className="px-4 py-2 text-right text-[var(--text-primary)] font-mono">
                                    {(evt.resp_ip_bytes || 0).toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
