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

    if (loading) return <div style={{ padding: '24px', textAlign: 'center' }}>Loading live system metrics...</div>;
    if (error) return <div style={{ padding: '24px', color: 'var(--accent-secondary)' }}>Error: {error}</div>;

    // Calculate RAM usage
    const memTotalGB = (metrics.memTotal / (1024 ** 3)).toFixed(2);
    const memUsedGB = ((metrics.memTotal - metrics.memFree) / (1024 ** 3)).toFixed(2);
    const memPercent = Math.round(((metrics.memTotal - metrics.memFree) / metrics.memTotal) * 100);

    // Format uptime
    const hours = Math.floor(metrics.uptime / 3600);
    const minutes = Math.floor((metrics.uptime % 3600) / 60);

    const Gauge = ({ value, label, color = "var(--accent-primary)" }: { value: number, label: string, color?: string }) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' }}>
            <div style={{
                width: '120px', height: '120px', borderRadius: '50%',
                background: `conic-gradient(${color} ${value}%, var(--bg-card) ${value}%)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)'
            }}>
                <div style={{
                    width: '90px', height: '90px', borderRadius: '50%', background: 'var(--bg-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold'
                }}>
                    {value}%
                </div>
            </div>
            <p style={{ marginTop: '12px', fontSize: '0.875rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>{label}</p>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>

                    {/* Graylog Connection Monitor */}
                    {metrics.graylogHealth && Array.isArray(metrics.graylogHealth) && metrics.graylogHealth.length > 0 && (
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                            <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Graylog Cluster Monitor</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {metrics.graylogHealth.map((node: any, idx: number) => {
                                    const nodeName = node.url.includes("graylog-01") ? "graylog-01" 
                                        : node.url.includes("graylog-02") ? "graylog-02" 
                                        : node.url.includes("graylog-03") ? "graylog-03" 
                                        : "graylog-node";
                                    
                                    return (
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0, 0, 0, 0.15)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    🟢 {nodeName.toUpperCase()}
                                                </span>
                                                <span style={{ 
                                                    padding: '3px 8px', 
                                                    borderRadius: '6px', 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: 'bold',
                                                    background: node.status === "ONLINE" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                                                    color: node.status === "ONLINE" ? "#22c55e" : "#ef4444",
                                                    border: node.status === "ONLINE" ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                                                }}>
                                                    {node.status}
                                                </span>
                                            </div>

                                            {node.status === "ONLINE" ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem', marginTop: '4px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: 'var(--text-secondary)' }}>Latency / Version</span>
                                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{node.latency} | v{node.version}</span>
                                                    </div>
                                                    
                                                    {node.journal && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Uncommitted Entries</span>
                                                                <span style={{ 
                                                                    fontWeight: 'bold', 
                                                                    color: node.journal.uncommittedEntries > 1000 ? '#f87171' : 'var(--text-primary)'
                                                                }}>
                                                                    {node.journal.uncommittedEntries.toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Journal Size / Limit</span>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {(node.journal.sizeBytes / (1024 * 1024)).toFixed(1)} MB / {(node.journal.sizeLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Write/Read Rates</span>
                                                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {node.journal.appendPerSec}/s (in) | {node.journal.readPerSec}/s (out)
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem' }}>Oldest Segment Age</span>
                                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                                                                    {node.journal.oldestSegment ? new Date(node.journal.oldestSegment).toLocaleString() : "N/A"}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                                    <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace', marginBottom: '4px' }}>{node.url}</span>
                                                    {node.error && (
                                                        <div style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', fontSize: '0.72rem', color: '#f87171' }}>
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
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                            <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Scheduled Jobs Monitor</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(0, 0, 0, 0.15)', padding: '12px 14px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.03)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginTop: '4px' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Last Run</span>
                                                <span style={{ fontWeight: 600, color: isStale ? '#eab308' : 'var(--text-primary)' }}>{timeAgoStr}</span>
                                            </div>
                                            {job.message && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px', marginTop: '4px', wordBreak: 'break-word' }}>
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
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
                        <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top API Probe Sources</h3>
                        {metrics.topProbes.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No probes recorded.</p> : (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                    <thead className="sticky-header">
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.875rem', background: 'var(--bg-card)' }}>
                                            <th style={{ padding: '8px 0' }}>Client IP</th>
                                            <th style={{ padding: '8px 0', textAlign: 'right' }}>Hits</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.topProbes.map((p: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '8px 0', fontFamily: 'monospace' }}>{p.ip}</td>
                                                <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 'bold' }}>{p.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top CPU Processes */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
                        <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top CPU Processes</h3>
                        {metrics.processesCpu.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Linux strictly required for process tracking.</p> : (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead className="sticky-header">
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                                            <th style={{ padding: '8px 0' }}>PID</th>
                                            <th style={{ padding: '8px 0' }}>Command</th>
                                            <th style={{ padding: '8px 0', textAlign: 'right' }}>%CPU</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.processesCpu.map((p: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '8px 0' }}>{p.pid}</td>
                                                <td style={{ padding: '8px 0', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cmd}>{p.cmd}</td>
                                                <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--accent-primary)' }}>{p.cpu}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Top RAM Processes */}
                    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', maxHeight: '400px' }}>
                        <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top RAM Processes</h3>
                        {metrics.processesMem.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Linux strictly required for process tracking.</p> : (
                            <div style={{ flex: 1, overflowY: 'auto' }}>
                                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                    <thead className="sticky-header">
                                        <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', background: 'var(--bg-card)' }}>
                                            <th style={{ padding: '8px 0' }}>PID</th>
                                            <th style={{ padding: '8px 0' }}>Command</th>
                                            <th style={{ padding: '8px 0', textAlign: 'right' }}>%MEM</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {metrics.processesMem.map((p: any, i: number) => (
                                            <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                <td style={{ padding: '8px 0' }}>{p.pid}</td>
                                                <td style={{ padding: '8px 0', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cmd}>{p.cmd}</td>
                                                <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--accent-secondary)' }}>{p.mem}%</td>
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
