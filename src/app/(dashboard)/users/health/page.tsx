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
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
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

            {/* Utilization Dials */}
            <div className="glass-card" style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', marginBottom: '24px' }}>
                <Gauge value={metrics.cpuUsage || 0} label="CPU Usage" />
                <Gauge value={memPercent || 0} label={`RAM (${memUsedGB}GB / ${memTotalGB}GB)`} color="var(--accent-secondary)" />
                <Gauge value={parseInt(metrics.diskUsage) || 0} label={`Disk Space (Root)`} color="var(--accent-tertiary)" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>

                {/* Top Probes */}
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top API Probe Sources</h3>
                    {metrics.topProbes.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No probes recorded.</p> : (
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
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
                    )}
                </div>

                {/* Top CPU Processes */}
                <div className="glass-card" style={{ overflowX: 'auto' }}>
                    <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top CPU Processes</h3>
                    {metrics.processesCpu.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Linux strictly required for process tracking.</p> : (
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '8px 0' }}>PID</th>
                                    <th style={{ padding: '8px 0' }}>Command</th>
                                    <th style={{ padding: '8px 0', textAlign: 'right' }}>%CPU</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.processesCpu.map((p: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 0' }}>{p.pid}</td>
                                        <td style={{ padding: '8px 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cmd}>{p.cmd}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--accent-primary)' }}>{p.cpu}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Top RAM Processes */}
                <div className="glass-card" style={{ overflowX: 'auto' }}>
                    <h3 style={{ marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>Top RAM Processes</h3>
                    {metrics.processesMem.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Linux strictly required for process tracking.</p> : (
                        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '8px 0' }}>PID</th>
                                    <th style={{ padding: '8px 0' }}>Command</th>
                                    <th style={{ padding: '8px 0', textAlign: 'right' }}>%MEM</th>
                                </tr>
                            </thead>
                            <tbody>
                                {metrics.processesMem.map((p: any, i: number) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '8px 0' }}>{p.pid}</td>
                                        <td style={{ padding: '8px 0', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cmd}>{p.cmd}</td>
                                        <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--accent-secondary)' }}>{p.mem}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

            </div>
        </div>
    );
}
