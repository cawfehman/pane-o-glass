"use client";

import { useState, useEffect } from "react";

export default function SystemHealthPage() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetch("/api/system-health")
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
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1>System Health</h1>
                    <p style={{ color: 'var(--text-muted)' }}>{metrics.osType} {metrics.osRelease} | Uptime: {hours}h {minutes}m</p>
                </div>
                <div className="glass-card" style={{ display: 'flex', gap: '24px', padding: '12px 24px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-tertiary)' }}>{metrics.totalProbes}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lifetime Health Probes</p>
                    </div>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '4px' }}>
                {/* Utilization Dials */}
                <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <Gauge value={metrics.cpuUsage || 0} label="CPU Usage" />
                    <Gauge value={memPercent || 0} label={`RAM (${memUsedGB}GB / ${memTotalGB}GB)`} color="var(--accent-secondary)" />
                    <Gauge value={parseInt(metrics.diskUsage) || 0} label={`Disk Space (Root)`} color="var(--accent-tertiary)" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '24px' }}>

                    {/* Graylog Connection Monitor */}
                    {metrics.graylogHealth && (
                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px' }}>
                            <h3 style={{ flexShrink: 0, marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Graylog Connection Monitor</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '0.875rem', padding: '8px 0' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Node Link Status</span>
                                    <span style={{ 
                                        padding: '4px 10px', 
                                        borderRadius: '6px', 
                                        fontSize: '0.75rem', 
                                        fontWeight: 'bold',
                                        background: metrics.graylogHealth.status === "ONLINE" ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                                        color: metrics.graylogHealth.status === "ONLINE" ? "#22c55e" : "#ef4444",
                                        border: metrics.graylogHealth.status === "ONLINE" ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)"
                                    }}>
                                        {metrics.graylogHealth.status}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>API Request Latency</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{metrics.graylogHealth.latency || "N/A"}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Graylog Version</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{metrics.graylogHealth.version || "N/A"}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>SIEM Host Destination</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
                                        {metrics.graylogHealth.url}
                                    </span>
                                </div>

                                {metrics.graylogHealth.journal && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disk Journal Status</span>
                                        
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Uncommitted Entries</span>
                                            <span style={{ 
                                                fontWeight: 'bold', 
                                                color: metrics.graylogHealth.journal.uncommittedEntries > 1000 ? '#f87171' : 'var(--text-primary)',
                                                fontSize: '0.85rem'
                                            }}>
                                                {metrics.graylogHealth.journal.uncommittedEntries.toLocaleString()}
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Journal Size</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {(metrics.graylogHealth.journal.sizeBytes / (1024 * 1024)).toFixed(1)} MB / {(metrics.graylogHealth.journal.sizeLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB limit
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Write/Read Rates</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                                                {metrics.graylogHealth.journal.appendPerSec}/s (in) | {metrics.graylogHealth.journal.readPerSec}/s (out)
                                            </span>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Oldest Journal Segment</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                                                {metrics.graylogHealth.journal.oldestSegment 
                                                    ? new Date(metrics.graylogHealth.journal.oldestSegment).toLocaleString() 
                                                    : "N/A"}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {metrics.graylogHealth.error && (
                                    <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', fontSize: '0.75rem', color: '#f87171', wordBreak: 'break-all', marginTop: '4px' }}>
                                        <strong>Connection Error:</strong> {metrics.graylogHealth.error}
                                    </div>
                                )}
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
