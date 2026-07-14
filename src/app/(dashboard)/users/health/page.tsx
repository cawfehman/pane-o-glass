"use client";

import { useState, useEffect } from "react";

export default function SystemHealthPage() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/system-health?t=${Date.now()}`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to load metrics");
                return res.json();
            })
            .then(data => {
                setMetrics(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="p-6 text-center">Loading live system metrics...</div>;
    if (error) return <div className="p-6 text-accent-secondary">Error: {error}</div>;

    // Calculate RAM usage
    const memTotalGB = (metrics.memTotal / (1024 ** 3)).toFixed(2);
    const memUsedGB = ((metrics.memTotal - metrics.memFree) / (1024 ** 3)).toFixed(2);
    const memPercent = Math.round(((metrics.memTotal - metrics.memFree) / metrics.memTotal) * 100);

    // Format uptime
    const hours = Math.floor(metrics.uptime / 3600);
    const minutes = Math.floor((metrics.uptime % 3600) / 60);

    const Gauge = ({ value, label, color = "var(--accent-primary)" }: { value: number, label: string, color?: string }) => (
        <div className="flex flex-col items-center p-4">
            <div className="w-[120px] h-[120px] rounded-full flex items-center justify-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]" style={{
                background: `conic-gradient(${color} ${value}%, var(--bg-card) ${value}%)`
            }}>
                <div className="w-[90px] h-[90px] rounded-full bg-bg-surface flex items-center justify-center text-2xl font-bold">
                    {value}%
                </div>
            </div>
            <p className="mt-3 text-sm text-text-secondary font-bold">{label}</p>
        </div>
    );

    return (
        <div className="internal-scroll-layout">
             <div className="shrink-0 flex justify-between items-center mb-6 flex-wrap gap-4">
                <div className="flex items-center gap-5 flex-wrap">
                    <div>
                        <h1>System Health</h1>
                        <p className="text-text-muted">{metrics.osType} {metrics.osRelease} | Uptime: {hours}h {minutes}m</p>
                    </div>
                    {metrics.rotatingPassword && (
                        <div className="glass-card flex items-center gap-3 px-4 py-2.5 bg-blue-500/10 border border-blue-500/25 rounded-xl">
                            <span className="text-[0.72rem] text-text-secondary font-bold uppercase tracking-widest">🔐 ROTATING OTP</span>
                            <span className="font-mono text-[1.1rem] font-extrabold text-accent-primary tracking-widest">
                                {metrics.rotatingPassword}
                            </span>
                            <span className="text-[0.62rem] text-text-muted">(Rotates every 2m)</span>
                        </div>
                    )}
                </div>
                <div className="glass-card flex gap-6 px-6 py-3">
                    <div className="text-center">
                        <p className="text-3xl font-bold text-accent-tertiary">{metrics.totalProbes}</p>
                        <p className="text-xs text-text-muted">Lifetime Health Probes</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                {/* Utilization Dials */}
                <div className="glass-card flex justify-around flex-wrap mb-6">
                    <Gauge value={metrics.cpuUsage || 0} label="CPU Usage" />
                    <Gauge value={memPercent || 0} label={`RAM (${memUsedGB}GB / ${memTotalGB}GB)`} color="var(--accent-secondary)" />
                    <Gauge value={parseInt(metrics.diskUsage) || 0} label={`Disk Space (Root)`} color="var(--accent-tertiary)" />
                </div>

                <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 mb-6">

                    {/* Graylog Connection Monitor */}
                    {metrics.graylogHealth && Array.isArray(metrics.graylogHealth) && metrics.graylogHealth.length > 0 && (
                        <div className="glass-card flex flex-col min-h-[300px]">
                            <h3 className="shrink-0 mb-4 border-b border-border-color pb-2">Graylog Cluster Monitor</h3>
                            <div className="flex flex-col gap-5">
                                {metrics.graylogHealth.map((node: any, idx: number) => {
                                    const nodeName = node.url.includes("graylog-01") ? "graylog-01" 
                                        : node.url.includes("graylog-02") ? "graylog-02" 
                                        : node.url.includes("graylog-03") ? "graylog-03" 
                                        : "graylog-node";
                                    
                                    return (
                                        <div key={idx} className="flex flex-col gap-2.5 bg-black/15 py-3 px-3.5 rounded-lg border border-white/5">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-text-primary flex items-center gap-1.5">
                                                    🟢 {nodeName.toUpperCase()}
                                                </span>
                                                <span className="py-1 px-2 rounded-md text-[0.7rem] font-bold" style={{ 
                                                    background: node.status === "ONLINE" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                                                    color: node.status === "ONLINE" ? "#22c55e" : "#ef4444",
                                                    border: node.status === "ONLINE" ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                                                }}>
                                                    {node.status}
                                                </span>
                                            </div>

                                            {node.status === "ONLINE" ? (
                                                <div className="flex flex-col gap-2 text-[0.8rem] mt-1">
                                                    <div className="flex justify-between">
                                                        <span className="text-text-secondary">Latency / Version</span>
                                                        <span className="font-semibold text-text-primary">{node.latency} | v{node.version}</span>
                                                    </div>
                                                    
                                                    {node.journal && (
                                                        <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2 mt-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-text-secondary text-xs">Uncommitted Entries</span>
                                                                <span style={{ 
                                                                    fontWeight: 'bold', 
                                                                    color: node.journal.uncommittedEntries > 1000 ? '#f87171' : 'var(--text-primary)'
                                                                }}>
                                                                    {node.journal.uncommittedEntries.toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-text-secondary text-xs">Journal Size / Limit</span>
                                                                <span className="font-semibold text-text-primary">
                                                                    {(node.journal.sizeBytes / (1024 * 1024)).toFixed(1)} MB / {(node.journal.sizeLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-text-secondary text-xs">Write/Read Rates</span>
                                                                <span className="font-semibold text-text-primary">
                                                                    {node.journal.appendPerSec}/s (in) | {node.journal.readPerSec}/s (out)
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col gap-0.5 mt-0.5">
                                                                <span className="text-text-secondary text-[0.7rem]">Oldest Segment Age</span>
                                                                <span className="text-text-muted text-[0.72rem] font-mono">
                                                                    {node.journal.oldestSegment ? new Date(node.journal.oldestSegment).toLocaleString() : "N/A"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-[0.8rem] text-text-secondary mt-1">
                                                    <span className="block text-[0.72rem] text-text-muted break-all font-mono mb-1">{node.url}</span>
                                                    {node.error && (
                                                        <div className="py-1.5 px-2.5 bg-red-500/5 border border-red-500/15 rounded-md text-[0.72rem] text-red-400">
                                                            {node.error}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Scheduled Jobs Monitor */}
                    {metrics.cronJobs && metrics.cronJobs.length > 0 && (
                        <div className="glass-card flex flex-col min-h-[300px]">
                            <h3 className="shrink-0 mb-4 border-b border-border-color pb-2">Scheduled Jobs Monitor</h3>
                            <div className="flex flex-col gap-5">
                                {metrics.cronJobs.map((job: any, idx: number) => {
                                    // Staleness Logic
                                    const expectedIntervals: Record<string, number> = {
                                        "Firewall Guardian": 2 * 60 * 1000, // 2 minutes
                                        "Graylog VPN Sync": 30 * 60 * 1000, // 30 minutes
                                        "Audit Log Cleanup": 24 * 60 * 60 * 1000 // 24 hours
                                    };
                                    
                                    const lastRunTime = new Date(job.lastRun).getTime();
                                    const timeSinceLastRun = Date.now() - lastRunTime;
                                    const expectedInterval = expectedIntervals[job.name] || (24 * 60 * 60 * 1000); // default 24h
                                    const isStale = timeSinceLastRun > expectedInterval * 2.5;

                                    let displayStatus = job.status;
                                    let statusColor = "var(--text-primary)";
                                    let statusBg = "transparent";
                                    let statusBorder = "transparent";
                                    let icon = "⚪";

                                    if (isStale) {
                                        displayStatus = "STALE";
                                        statusColor = "#eab308"; // yellow
                                        statusBg = "rgba(234, 179, 8, 0.12)";
                                        statusBorder = "1px solid rgba(234, 179, 8, 0.3)";
                                        icon = "🟡";
                                    } else if (job.status === "SUCCESS") {
                                        statusColor = "#22c55e"; // green
                                        statusBg = "rgba(34, 197, 94, 0.12)";
                                        statusBorder = "1px solid rgba(34, 197, 94, 0.3)";
                                        icon = "🟢";
                                    } else {
                                        statusColor = "#ef4444"; // red
                                        statusBg = "rgba(239, 68, 68, 0.12)";
                                        statusBorder = "1px solid rgba(239, 68, 68, 0.3)";
                                        icon = "🔴";
                                    }

                                    // Format time ago
                                    const minsAgo = Math.floor(timeSinceLastRun / 60000);
                                    let timeAgoStr = minsAgo < 1 ? "Just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.floor(minsAgo/60)}h ${minsAgo%60}m ago`;

                                    return (
                                        <div key={idx} className="flex flex-col gap-2 bg-black/15 py-3 px-3.5 rounded-lg border border-white/5">
                                            <div className="flex justify-between items-center">
                                                <span className="font-bold text-text-primary flex items-center gap-1.5">
                                                    {icon} {job.name.toUpperCase()}
                                                </span>
                                                <span style={{ 
                                                    padding: '3px 8px', 
                                                    borderRadius: '6px', 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: 'bold',
                                                    background: statusBg,
                                                    color: statusColor,
                                                    border: statusBorder
                                                }}>
                                                    {displayStatus}
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-[0.8rem] mt-1">
                                                <span className="text-text-secondary">Last Run</span>
                                                <span className="font-semibold" style={{ color: isStale ? '#eab308' : 'var(--text-primary)' }}>{timeAgoStr}</span>
                                            </div>
                                            {job.message && (
                                                <div className="text-[0.72rem] text-text-muted font-mono bg-black/20 py-1.5 px-2 rounded mt-1 break-words">
                                                    {job.message}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Top Probes */}
                    <div className="glass-card flex flex-col max-h-[400px]">
                        <h3 className="shrink-0 mb-4 border-b border-border-color pb-2">Top API Probe Sources</h3>
                        {metrics.topProbes.length === 0 ? <p className="text-text-muted">No probes recorded.</p> : (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky-header">
                                        <tr className="border-b border-border-color text-text-secondary text-sm bg-bg-card">
                                            <th className="py-2">Client IP</th>
                                            <th className="py-2 text-right">Hits</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.topProbes.map((p: any, i: number) => (
                                            <tr key={i} className="border-b border-border-color">
                                                <td className="py-2 font-mono">{p.ip}</td>
                                                <td className="py-2 text-right font-bold">{p.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top CPU Processes */}
                    <div className="glass-card flex flex-col max-h-[400px]">
                        <h3 className="shrink-0 mb-4 border-b border-border-color pb-2">Top CPU Processes</h3>
                        {metrics.processesCpu.length === 0 ? <p className="text-text-muted">Linux strictly required for process tracking.</p> : (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead className="sticky-header">
                                        <tr className="border-b border-border-color text-text-secondary bg-bg-card">
                                            <th className="py-2">PID</th>
                                            <th className="py-2">Command</th>
                                            <th className="py-2 text-right">%CPU</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.processesCpu.map((p: any, i: number) => (
                                            <tr key={i} className="border-b border-border-color">
                                                <td className="py-2">{p.pid}</td>
                                                <td className="py-2 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.cmd}>{p.cmd}</td>
                                                <td className="py-2 text-right text-accent-primary">{p.cpu}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top RAM Processes */}
                    <div className="glass-card flex flex-col max-h-[400px]">
                        <h3 className="shrink-0 mb-4 border-b border-border-color pb-2">Top RAM Processes</h3>
                        {metrics.processesMem.length === 0 ? <p className="text-text-muted">Linux strictly required for process tracking.</p> : (
                            <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse text-sm">
                                    <thead className="sticky-header">
                                        <tr className="border-b border-border-color text-text-secondary bg-bg-card">
                                            <th className="py-2">PID</th>
                                            <th className="py-2">Command</th>
                                            <th className="py-2 text-right">%MEM</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.processesMem.map((p: any, i: number) => (
                                            <tr key={i} className="border-b border-border-color">
                                                <td className="py-2">{p.pid}</td>
                                                <td className="py-2 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap" title={p.cmd}>{p.cmd}</td>
                                                <td className="py-2 text-right text-accent-secondary">{p.mem}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
