"use client";

import { useState, useEffect } from "react";
import { 
    Database, 
    Zap, 
    HardDrive, 
    CheckCircle2, 
    AlertTriangle, 
    AlertCircle, 
    Clock, 
    Layers, 
    Activity, 
    RefreshCw,
    TrendingUp,
    ShieldAlert,
    Lock
} from "lucide-react";
import { 
    AreaChart, 
    Area, 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Legend
} from "recharts";

export default function SystemHealthPage() {
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshing, setRefreshing] = useState(false);

    // Historical Telemetry State
    const [timeframe, setTimeframe] = useState<string>("24h");
    const [historyData, setHistoryData] = useState<any>(null);
    const [historyLoading, setHistoryLoading] = useState<boolean>(false);

    const fetchMetrics = () => {
        setRefreshing(true);
        fetch(`/api/system-health?t=${Date.now()}`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to load metrics");
                return res.json();
            })
            .then(data => {
                setMetrics(data);
                setLoading(false);
                setRefreshing(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
                setRefreshing(false);
            });
    };

    const fetchHistory = (tf = timeframe) => {
        setHistoryLoading(true);
        fetch(`/api/system-health/history?timeframe=${tf}&t=${Date.now()}`)
            .then(res => {
                if (!res.ok) throw new Error("Failed to load historical telemetry");
                return res.json();
            })
            .then(data => {
                setHistoryData(data);
                setHistoryLoading(false);
            })
            .catch(err => {
                console.error("History fetch error:", err);
                setHistoryLoading(false);
            });
    };

    useEffect(() => {
        fetchMetrics();
        fetchHistory("24h");
    }, []);

    const handleTimeframeChange = (newTf: string) => {
        setTimeframe(newTf);
        fetchHistory(newTf);
    };

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

    const sqlite = metrics.sqlite;

    // Format chart date labels
    const formatTimestamp = (ts: string) => {
        const d = new Date(ts);
        if (timeframe === "1h" || timeframe === "6h" || timeframe === "12h") {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`;
    };

    // Custom Tooltip for Latency Chart
    const CustomLatencyTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="p-3 bg-bg-surface/95 border border-border-color rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono">
                    <p className="font-sans font-bold text-text-primary text-[0.8rem] border-b border-border-color pb-1 mb-2">
                        {new Date(data.timestamp).toLocaleString()}
                    </p>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between gap-4 text-sky-400">
                            <span>Range Scan:</span>
                            <span className="font-bold">{data.rangeScanMs} ms</span>
                        </div>
                        <div className="flex justify-between gap-4 text-amber-400">
                            <span>WAL Write / Commit:</span>
                            <span className="font-bold">{data.walWriteMs} ms</span>
                        </div>
                        <div className="flex justify-between gap-4 text-emerald-400">
                            <span>Point Read:</span>
                            <span className="font-bold">{data.pointReadMs} ms</span>
                        </div>
                        {data.healthStatus && data.healthStatus !== "HEALTHY" && (
                            <div className="mt-1 pt-1 border-t border-amber-500/30 text-amber-300 font-sans text-[0.7rem] flex items-center gap-1 font-bold">
                                {data.healthStatus === "CRITICAL" ? "🔴 CRITICAL" : "🟡 DEGRADED"}: {data.degradedReasons || "Elevated latency"}
                            </div>
                        )}
                        {data.activeCron && (
                            <div className="mt-1 pt-1 border-t border-purple-500/30 text-purple-300 font-sans text-[0.7rem]">
                                ⚙️ Running: <span className="font-bold">{data.activeCron}</span>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    // Custom Tooltip for Storage Chart
    const CustomStorageTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="p-3 bg-bg-surface/95 border border-border-color rounded-xl shadow-2xl backdrop-blur-md text-xs font-mono">
                    <p className="font-sans font-bold text-text-primary text-[0.8rem] border-b border-border-color pb-1 mb-2">
                        {new Date(data.timestamp).toLocaleString()}
                    </p>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between gap-4 text-blue-400">
                            <span>Database Size:</span>
                            <span className="font-bold">{data.dbSizeMB} MB</span>
                        </div>
                        <div className="flex justify-between gap-4 text-amber-400">
                            <span>WAL Journal:</span>
                            <span className="font-bold">{data.walSizeMB} MB</span>
                        </div>
                        <div className="flex justify-between gap-4 text-purple-400">
                            <span>Total Rows:</span>
                            <span className="font-bold">{data.totalRows.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="internal-scroll-layout">
             <div className="shrink-0 flex justify-between items-center mb-6 flex-wrap gap-4">
                <div className="flex items-center gap-5 flex-wrap">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="m-0">System Health</h1>
                            <button
                                onClick={() => {
                                    fetchMetrics();
                                    fetchHistory(timeframe);
                                }}
                                disabled={refreshing || historyLoading}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-text-secondary hover:text-text-primary border border-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
                                title="Refresh all system diagnostics"
                            >
                                <RefreshCw size={14} className={refreshing || historyLoading ? "animate-spin" : ""} />
                                {refreshing || historyLoading ? "Testing..." : "Refresh"}
                            </button>
                        </div>
                        <p className="text-text-muted mt-1">{metrics.osType} {metrics.osRelease} | Uptime: {hours}h {minutes}m</p>
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

            <div className="flex-1 overflow-y-auto min-h-0 pr-1 flex flex-col gap-6">
                {/* Utilization Dials */}
                <div className="glass-card flex justify-around flex-wrap">
                    <Gauge value={metrics.cpuUsage || 0} label="CPU Usage" />
                    <Gauge value={memPercent || 0} label={`RAM (${memUsedGB}GB / ${memTotalGB}GB)`} color="var(--accent-secondary)" />
                    <Gauge value={parseInt(metrics.diskUsage) || 0} label={`Disk Space (Root)`} color="var(--accent-tertiary)" />
                </div>

                {/* ========================================================================= */}
                {/* SQLite Database Engine & Telemetry Suite */}
                {/* ========================================================================= */}
                {sqlite && (
                    <div className="glass-card flex flex-col gap-6 p-6 border border-border-color rounded-2xl bg-gradient-to-b from-white/[0.03] to-transparent">
                        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-border-color pb-4">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    <Database size={22} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h2 className="text-xl font-extrabold m-0 text-text-primary">
                                            {sqlite.storage.journalMode.includes("postgresql") ? "PostgreSQL Engine & Storage Telemetry" : "SQLite Engine & Storage Telemetry"}
                                        </h2>
                                        <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-text-secondary">
                                            {sqlite.storage.journalMode.toUpperCase()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-text-muted m-0 mt-0.5">
                                        Active instance: <span className="font-mono text-text-secondary">{sqlite.storage.dbPath.split(/[/\\]/).pop()}</span> • Integrity: <span className="text-emerald-400 font-bold uppercase">{sqlite.storage.integrity}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-lg text-xs font-extrabold tracking-wide uppercase border flex items-center gap-1.5 ${
                                    sqlite.healthStatus === "EXCELLENT" 
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                        : sqlite.healthStatus === "GOOD"
                                        ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                                        : sqlite.healthStatus === "DEGRADED"
                                        ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                        : "bg-red-500/10 border-red-500/30 text-red-400"
                                }`}>
                                    {sqlite.healthStatus === "EXCELLENT" && <CheckCircle2 size={13} />}
                                    {sqlite.healthStatus === "GOOD" && <CheckCircle2 size={13} />}
                                    {sqlite.healthStatus === "DEGRADED" && <AlertTriangle size={13} />}
                                    {sqlite.healthStatus === "ATTENTION_NEEDED" && <AlertCircle size={13} />}
                                    {sqlite.healthStatus.replace("_", " ")}
                                </span>

                                <span className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
                                    sqlite.benchmarks.contentionDetected
                                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                                        : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                }`}>
                                    {sqlite.benchmarks.contentionDetected ? "⚠️ LOCK CONTENTION" : "✓ ZERO CONTENTION"}
                                </span>
                            </div>
                        </div>

                        {/* Health Recommendations Banner (if any) */}
                        {sqlite.healthRecommendations && sqlite.healthRecommendations.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col gap-1.5 text-xs text-amber-200">
                                <span className="font-bold flex items-center gap-1.5 uppercase tracking-wide text-amber-400">
                                    <AlertTriangle size={14} /> Operational Recommendations
                                </span>
                                <ul className="m-0 pl-4 list-disc space-y-1">
                                    {sqlite.healthRecommendations.map((rec: string, idx: number) => (
                                        <li key={idx} className="leading-relaxed">{rec}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Storage & Engine Metrics 4-Tile Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-2">
                                    <span>Main Database File</span>
                                    <HardDrive size={16} className="text-blue-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-text-primary font-mono">
                                    {sqlite.storage.dbSizeFormatted}
                                </div>
                                <div className="text-[0.72rem] text-text-muted mt-1.5">
                                    {sqlite.storage.pageCount.toLocaleString()} pages × {sqlite.storage.pageSizeBytes} B
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-2">
                                    <span>{sqlite.storage.journalMode.includes("postgresql") ? "Active DB Connections" : "WAL Journal Log"}</span>
                                    <Zap size={16} className="text-amber-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-text-primary font-mono">
                                    {sqlite.storage.journalMode.includes("postgresql") ? `${sqlite.storage.activeConnections || 1} Sessions` : sqlite.storage.walSizeFormatted}
                                </div>
                                <div className="text-[0.72rem] text-text-muted mt-1.5">
                                    {sqlite.storage.journalMode.includes("postgresql") ? "PostgreSQL Pool: MVCC Active" : `Busy Timeout: ${sqlite.storage.busyTimeoutMs}ms`}
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-2">
                                    <span>Total Live Rows</span>
                                    <Layers size={16} className="text-purple-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-text-primary font-mono">
                                    {sqlite.totalRows.toLocaleString()}
                                </div>
                                <div className="text-[0.72rem] text-text-muted mt-1.5">
                                    Fragmentation: <span className={sqlite.storage.fragmentationPct > 15 ? "text-amber-400 font-bold" : "text-emerald-400"}>{sqlite.storage.fragmentationPct}%</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-2">
                                    <span>VPN Event Volume</span>
                                    <Activity size={16} className="text-emerald-400" />
                                </div>
                                <div className="text-2xl font-extrabold text-text-primary font-mono">
                                    {sqlite.ingestion.vpnEventsTotal.toLocaleString()}
                                </div>
                                <div className="text-[0.72rem] text-text-muted mt-1.5">
                                    Audit Logs: <span className="text-text-secondary font-mono">{sqlite.ingestion.auditLogsTotal.toLocaleString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Benchmark & Latency Percentile Performance Matrix */}
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-2">
                                    <Clock size={15} className="text-accent-primary" /> Real-Time Latency & Percentiles
                                </h3>
                                <span className="text-[0.7rem] text-text-muted font-mono">
                                    Diagnostic run: {sqlite.benchmarks.benchmarkDurationMs}ms
                                </span>
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-border-color bg-black/20">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-border-color bg-white/[0.02] text-text-secondary uppercase text-[0.7rem] tracking-wider">
                                            <th className="py-2.5 px-3.5">Operation / Target</th>
                                            <th className="py-2.5 px-3.5 text-right">Average</th>
                                            <th className="py-2.5 px-3.5 text-right font-bold text-blue-400">95th Percentile (p95)</th>
                                            <th className="py-2.5 px-3.5 text-right text-rose-400">Peak (Max)</th>
                                            <th className="py-2.5 px-3.5 text-right">Min</th>
                                            <th className="py-2.5 px-3.5 text-right">Samples</th>
                                            <th className="py-2.5 px-3.5 text-center">Performance Rating</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5 font-mono">
                                        <tr>
                                            <td className="py-2.5 px-3.5 font-sans font-medium text-text-primary">
                                                <div>Primary Key Point Read</div>
                                                <div className="text-[0.68rem] text-text-muted font-mono">prisma.user.findFirst(id)</div>
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right">{sqlite.benchmarks.pointRead.avg} ms</td>
                                            <td className="py-2.5 px-3.5 text-right font-bold text-blue-400">{sqlite.benchmarks.pointRead.p95} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-rose-400">{sqlite.benchmarks.pointRead.peak} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.pointRead.min} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.pointRead.samples}</td>
                                            <td className="py-2.5 px-3.5 text-center font-sans font-bold text-[0.75rem] text-emerald-400">
                                                {sqlite.benchmarks.pointRead.p95 < 10 ? "⚡ SUB-MILLISECOND" : "FAST"}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2.5 px-3.5 font-sans font-medium text-text-primary">
                                                <div>Time-Series Index Range Scan</div>
                                                <div className="text-[0.68rem] text-text-muted font-mono">prisma.vpnEvent.findMany(take: 25, order: desc)</div>
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right">{sqlite.benchmarks.indexRangeScan.avg} ms</td>
                                            <td className="py-2.5 px-3.5 text-right font-bold text-blue-400">{sqlite.benchmarks.indexRangeScan.p95} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-rose-400">{sqlite.benchmarks.indexRangeScan.peak} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.indexRangeScan.min} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.indexRangeScan.samples}</td>
                                            <td className="py-2.5 px-3.5 text-center font-sans font-bold text-[0.75rem]">
                                                <span className={sqlite.benchmarks.indexRangeScan.p95 < 25 ? "text-emerald-400" : "text-amber-400"}>
                                                    {sqlite.benchmarks.indexRangeScan.p95 < 25 ? "✓ HEALTHY B-TREE" : "ELEVATED"}
                                                </span>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="py-2.5 px-3.5 font-sans font-medium text-text-primary">
                                                <div>{sqlite.storage.journalMode.includes("postgresql") ? "PostgreSQL Transaction Commit" : "WAL Write & Commit"}</div>
                                                <div className="text-[0.68rem] text-text-muted font-mono">prisma.healthProbe.create() transaction</div>
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right">{sqlite.benchmarks.walWriteCommit.avg} ms</td>
                                            <td className="py-2.5 px-3.5 text-right font-bold text-blue-400">{sqlite.benchmarks.walWriteCommit.p95} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-rose-400">{sqlite.benchmarks.walWriteCommit.peak} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.walWriteCommit.min} ms</td>
                                            <td className="py-2.5 px-3.5 text-right text-text-muted">{sqlite.benchmarks.walWriteCommit.samples}</td>
                                            <td className="py-2.5 px-3.5 text-center font-sans font-bold text-[0.75rem]">
                                                <span className={sqlite.benchmarks.walWriteCommit.p95 < 50 ? "text-emerald-400" : "text-amber-400"}>
                                                    {sqlite.benchmarks.walWriteCommit.p95 < 50 ? "⚡ LOW JITTER" : "LOCK DELAY"}
                                                </span>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* ========================================================================= */}
                        {/* Historical Telemetry Time-Series & SLA Incident Suite */}
                        {/* ========================================================================= */}
                        <div className="flex flex-col gap-5 border-t border-border-color pt-5">
                            <div className="flex justify-between items-center flex-wrap gap-3">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={18} className="text-accent-primary" />
                                    <h3 className="text-base font-bold text-text-primary m-0">Historical Telemetry & Health SLA Tracking</h3>
                                </div>

                                {/* Timeframe Selector */}
                                <div className="flex items-center gap-1.5 bg-black/30 p-1 rounded-xl border border-white/5 text-xs font-semibold">
                                    {["1h", "6h", "24h", "7d", "14d"].map((tf) => (
                                        <button
                                            key={tf}
                                            onClick={() => handleTimeframeChange(tf)}
                                            className={`px-3 py-1 rounded-lg transition-all ${
                                                timeframe === tf 
                                                    ? "bg-accent-primary text-white font-bold shadow-md" 
                                                    : "text-text-secondary hover:text-text-primary hover:bg-white/5"
                                            }`}
                                        >
                                            {tf.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Health SLA & Incident Counters (4-Card Row) */}
                            {historyData?.summary && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                                    <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-1">
                                            <span>Database Health SLA</span>
                                            <CheckCircle2 size={15} className="text-emerald-400" />
                                        </div>
                                        <div className="text-xl font-extrabold font-mono text-emerald-400">
                                            {historyData.summary.healthPercentage}% Healthy
                                        </div>
                                        <div className="text-[0.7rem] text-text-muted mt-1">
                                            {historyData.summary.healthyCount} of {historyData.summary.totalSnapshots} snapshots nominal
                                        </div>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-1">
                                            <span>Degraded Occurrences</span>
                                            <AlertTriangle size={15} className="text-amber-400" />
                                        </div>
                                        <div className={`text-xl font-extrabold font-mono ${historyData.summary.degradedCount > 0 ? "text-amber-400" : "text-text-primary"}`}>
                                            {historyData.summary.degradedCount} <span className="text-xs font-sans text-text-muted font-normal">events</span>
                                        </div>
                                        <div className="text-[0.7rem] text-text-muted mt-1">
                                            Write &gt;100ms or Scan &gt;50ms
                                        </div>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-1">
                                            <span>Critical Incidents</span>
                                            <ShieldAlert size={15} className={historyData.summary.criticalCount > 0 ? "text-rose-400" : "text-text-muted"} />
                                        </div>
                                        <div className={`text-xl font-extrabold font-mono ${historyData.summary.criticalCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                            {historyData.summary.criticalCount} <span className="text-xs font-sans text-text-muted font-normal">incidents</span>
                                        </div>
                                        <div className="text-[0.7rem] text-text-muted mt-1">
                                            Lock wait &gt;1s or Write &gt;1s
                                        </div>
                                    </div>

                                    <div className="p-3.5 rounded-xl bg-black/20 border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-center text-text-secondary text-xs font-bold uppercase tracking-wider mb-1">
                                            <span>{sqlite?.storage?.journalMode?.includes("postgresql") ? "PostgreSQL DB Size" : "Peak WAL Size"}</span>
                                            <Zap size={15} className="text-purple-400" />
                                        </div>
                                        <div className="text-xl font-extrabold font-mono text-text-primary">
                                            {sqlite?.storage?.journalMode?.includes("postgresql") ? sqlite.storage.dbSizeFormatted : `${historyData.summary.maxWalSizeMB} MB`}
                                        </div>
                                        <div className="text-[0.7rem] text-text-muted mt-1">
                                            Lock Wait Events: <span className="font-mono text-emerald-400 font-bold">{sqlite?.storage?.journalMode?.includes("postgresql") ? "0 (MVCC Active)" : historyData.summary.contentionIncidents}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Incident Root-Cause Drilldown Table (Only rendered if incidents occurred) */}
                            {historyData?.incidents && historyData.incidents.length > 0 && (
                                <div className="p-4 rounded-xl bg-rose-500/[0.04] border border-rose-500/20 flex flex-col gap-2.5">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-xs uppercase tracking-wide text-rose-400 flex items-center gap-1.5">
                                            <ShieldAlert size={14} /> Degraded & Critical Incident Triage Log ({historyData.incidents.length})
                                        </span>
                                        <span className="text-[0.68rem] text-text-muted">Threshold breaches in selected timeframe</span>
                                    </div>

                                    <div className="overflow-x-auto max-h-[160px] rounded-lg border border-white/5 bg-black/20">
                                        <table className="w-full text-left text-xs border-collapse font-mono">
                                            <thead>
                                                <tr className="border-b border-border-color bg-white/[0.02] text-text-secondary uppercase text-[0.68rem]">
                                                    <th className="py-2 px-3">Timestamp</th>
                                                    <th className="py-2 px-3">Severity</th>
                                                    <th className="py-2 px-3">Trigger / Root Cause</th>
                                                    <th className="py-2 px-3 text-right">Write Latency</th>
                                                    <th className="py-2 px-3 text-right">Scan Latency</th>
                                                    <th className="py-2 px-3">Active Cron</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5 text-[0.75rem]">
                                                {historyData.incidents.map((inc: any, i: number) => (
                                                    <tr key={i}>
                                                        <td className="py-2 px-3 text-text-muted whitespace-nowrap">
                                                            {new Date(inc.timestamp).toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <span className={`px-2 py-0.5 rounded text-[0.65rem] font-bold ${
                                                                inc.healthStatus === "CRITICAL"
                                                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                                                                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                                            }`}>
                                                                {inc.healthStatus}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-3 font-sans text-text-primary">
                                                            {inc.reasons}
                                                        </td>
                                                        <td className="py-2 px-3 text-right text-amber-400 font-bold">
                                                            {inc.walWriteMs} ms
                                                        </td>
                                                        <td className="py-2 px-3 text-right text-sky-400">
                                                            {inc.rangeScanMs} ms
                                                        </td>
                                                        <td className="py-2 px-3 text-purple-300 font-sans">
                                                            {inc.activeCron || "Ad-hoc / Web"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Chart 1: Latency Trends Over Time */}
                            <div className="p-4 rounded-xl bg-black/25 border border-white/5 flex flex-col gap-3">
                                <div className="flex justify-between items-center flex-wrap gap-2">
                                    <div>
                                        <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider m-0">
                                            {sqlite?.storage?.journalMode?.includes("postgresql") ? "Query Latency & Transaction Commit Timeline" : "Query Latency & WAL Commit Timeline"}
                                        </h4>
                                        <p className="text-[0.7rem] text-text-muted m-0 mt-0.5">
                                            Correlate write latency spikes with background cron executions
                                        </p>
                                    </div>
                                    {historyData?.summary && (
                                        <div className="flex items-center gap-4 text-xs font-mono">
                                            <span className="text-sky-400">p95 Scan: <strong className="text-text-primary">{historyData.summary.p95RangeScanMs}ms</strong></span>
                                            <span className="text-amber-400">p95 Write: <strong className="text-text-primary">{historyData.summary.p95WalWriteMs}ms</strong></span>
                                            <span className="text-emerald-400">p95 Read: <strong className="text-text-primary">{historyData.summary.p95PointReadMs}ms</strong></span>
                                        </div>
                                    )}
                                </div>

                                <div className="h-[220px] w-full">
                                    {historyData && historyData.snapshots && historyData.snapshots.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={historyData.snapshots} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                <defs>
                                                    <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                                    </linearGradient>
                                                    <linearGradient id="writeGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                <XAxis 
                                                    dataKey="timestamp" 
                                                    tickFormatter={formatTimestamp} 
                                                    stroke="#64748b" 
                                                    fontSize={10} 
                                                    tickLine={false}
                                                />
                                                <YAxis 
                                                    stroke="#64748b" 
                                                    fontSize={10} 
                                                    tickLine={false}
                                                    unit="ms"
                                                />
                                                <Tooltip content={<CustomLatencyTooltip />} />
                                                <Legend 
                                                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                                                    iconType="circle"
                                                />
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="rangeScanMs" 
                                                    name="Range Scan (ms)" 
                                                    stroke="#38bdf8" 
                                                    fillOpacity={1} 
                                                    fill="url(#scanGrad)" 
                                                    strokeWidth={2}
                                                />
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="walWriteMs" 
                                                    name={sqlite?.storage?.journalMode?.includes("postgresql") ? "Transaction Commit (ms)" : "WAL Write / Commit (ms)"} 
                                                    stroke="#f59e0b" 
                                                    fillOpacity={1} 
                                                    fill="url(#writeGrad)" 
                                                    strokeWidth={2}
                                                />
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="pointReadMs" 
                                                    name="Point Read (ms)" 
                                                    stroke="#34d399" 
                                                    dot={false}
                                                    strokeWidth={1.5}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-xs text-text-muted">
                                            No historical telemetry recorded yet. Click Refresh to capture a snapshot.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Chart 2 & Cron Correlation Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Storage & WAL Growth Chart */}
                                <div className="p-4 rounded-xl bg-black/25 border border-white/5 flex flex-col gap-3">
                                    <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider m-0">
                                        Database & WAL Storage Growth
                                    </h4>
                                    <div className="h-[180px] w-full">
                                        {historyData && historyData.snapshots && historyData.snapshots.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={historyData.snapshots} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <defs>
                                                        <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                                                        </linearGradient>
                                                        <linearGradient id="walGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                                                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                                    <XAxis 
                                                        dataKey="timestamp" 
                                                        tickFormatter={formatTimestamp} 
                                                        stroke="#64748b" 
                                                        fontSize={10} 
                                                        tickLine={false}
                                                    />
                                                    <YAxis 
                                                        stroke="#64748b" 
                                                        fontSize={10} 
                                                        tickLine={false}
                                                        unit="MB"
                                                    />
                                                    <Tooltip content={<CustomStorageTooltip />} />
                                                    <Legend 
                                                        wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }}
                                                        iconType="circle"
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="dbSizeMB" 
                                                        name="Main DB (MB)" 
                                                        stroke="#818cf8" 
                                                        fillOpacity={1} 
                                                        fill="url(#dbGrad)" 
                                                        strokeWidth={2}
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="walSizeMB" 
                                                        name="WAL Journal (MB)" 
                                                        stroke="#f43f5e" 
                                                        fillOpacity={1} 
                                                        fill="url(#walGrad)" 
                                                        strokeWidth={2}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-xs text-text-muted">
                                                No storage history recorded yet.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Active Background Cron Events Table */}
                                <div className="p-4 rounded-xl bg-black/25 border border-white/5 flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-xs font-bold text-text-secondary uppercase tracking-wider m-0">
                                            Recent Background Job Execution Markers
                                        </h4>
                                        <span className="text-[0.7rem] text-text-muted">Last executions</span>
                                    </div>

                                    <div className="overflow-y-auto max-h-[180px] flex flex-col gap-2">
                                        {historyData?.cronEvents && historyData.cronEvents.length > 0 ? (
                                            historyData.cronEvents.map((job: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className={job.status === "SUCCESS" ? "text-emerald-400" : "text-rose-400"}>
                                                            {job.status === "SUCCESS" ? "🟢" : "🔴"}
                                                        </span>
                                                        <span className="font-bold text-text-primary">{job.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 font-mono text-[0.72rem] text-text-muted">
                                                        <span>{new Date(job.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                                        <span className="px-1.5 py-0.5 rounded bg-white/5 text-text-secondary text-[0.68rem]">{job.status}</span>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-xs text-text-muted text-center py-6">
                                                No recent cron runs in this timeframe.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Table Row Breakdown & Storage Distribution */}
                        <div className="flex flex-col gap-3">
                            <h3 className="text-sm font-bold text-text-secondary uppercase tracking-wider m-0 flex items-center gap-2">
                                <Layers size={15} className="text-purple-400" /> Database Table Scale & Row Distribution
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                {sqlite.tables.map((t: any, idx: number) => (
                                    <div key={idx} className="p-3 rounded-lg bg-black/15 border border-white/5 flex flex-col justify-between">
                                        <div className="flex justify-between items-center text-xs mb-1">
                                            <span className="text-text-secondary font-medium truncate" title={t.name}>{t.name.split(" ")[0]}</span>
                                            <span className="font-mono text-[0.68rem] text-text-muted">{t.sharePct}%</span>
                                        </div>
                                        <div className="text-base font-extrabold text-text-primary font-mono">
                                            {t.count.toLocaleString()}
                                        </div>
                                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                                            <div 
                                                className="bg-accent-primary h-full rounded-full transition-all duration-300"
                                                style={{ width: `${Math.max(t.sharePct, 2)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

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
                                    const expectedIntervals: Record<string, number> = {
                                        "Firewall Guardian": 2 * 60 * 1000,
                                        "Graylog VPN Sync": 30 * 60 * 1000,
                                        "Audit Log Cleanup": 24 * 60 * 60 * 1000,
                                        "Telemetry Collector": 5 * 60 * 1000
                                    };
                                    
                                    const lastRunTime = new Date(job.lastRun).getTime();
                                    const timeSinceLastRun = Date.now() - lastRunTime;
                                    const expectedInterval = expectedIntervals[job.name] || (24 * 60 * 60 * 1000);
                                    const isStale = timeSinceLastRun > expectedInterval * 2.5;

                                    let displayStatus = job.status;
                                    let statusColor = "var(--text-primary)";
                                    let statusBg = "transparent";
                                    let statusBorder = "transparent";
                                    let icon = "⚪";

                                    if (isStale) {
                                        displayStatus = "STALE";
                                        statusColor = "#eab308";
                                        statusBg = "rgba(234, 179, 8, 0.12)";
                                        statusBorder = "1px solid rgba(234, 179, 8, 0.3)";
                                        icon = "🟡";
                                    } else if (job.status === "SUCCESS") {
                                        statusColor = "#22c55e";
                                        statusBg = "rgba(34, 197, 94, 0.12)";
                                        statusBorder = "1px solid rgba(34, 197, 94, 0.3)";
                                        icon = "🟢";
                                    } else {
                                        statusColor = "#ef4444";
                                        statusBg = "rgba(239, 68, 68, 0.12)";
                                        statusBorder = "1px solid rgba(239, 68, 68, 0.3)";
                                        icon = "🔴";
                                    }

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
