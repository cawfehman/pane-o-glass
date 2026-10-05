"use client";

import React, { useState, useEffect, useRef, useTransition } from "react";
import { 
    DownloadCloud, Play, AlertTriangle, CheckCircle2, Clock, 
    FileArchive, HardDrive, RefreshCw, Trash2, X, FileText, 
    Layers, Server, Shield, FileSpreadsheet, ChevronDown, ChevronRight, 
    Calendar, ArrowRight, Info, AlertCircle, Ban, Search, Check, Globe
} from "lucide-react";

interface ClusterConfig {
    id: "OG_GRAYLOG" | "NEW_GRAYLOG";
    name: string;
    description: string;
    streams: { id: string; title: string; description?: string }[];
}

interface ExportSlice {
    sliceIndex: number;
    from: string;
    to: string;
    estimatedHits: number;
    durationMinutes: number;
}

interface PreflightPlan {
    cluster: string;
    query: string;
    streamId?: string;
    totalEvents: number;
    sliceCount: number;
    slices: ExportSlice[];
    projectedUncompressedBytes: number;
    projectedCompressedBytes: number;
    freeDiskBytes: number;
    totalDiskBytes: number;
    diskWarning?: string;
    isDiskSpaceSufficient: boolean;
}

interface ExportJob {
    id: string;
    title: string;
    query: string;
    cluster: string;
    streamId?: string;
    streamName?: string;
    from: string;
    to: string;
    format: string;
    status: "PLANNING" | "RUNNING" | "COMPLETED" | "FAILED" | "EXPIRED" | "CANCELLED";
    progress: number;
    processedSlices: number;
    totalSlices: number;
    totalEvents: number;
    uncompressedBytes: number;
    compressedBytes: number;
    zipFileName?: string;
    retentionHours: number;
    retentionReason?: string;
    expiresAt: string;
    hoursRemaining: number;
    errorMessage?: string;
    createdBy: string;
    createdAt: string;
    completedAt?: string;
    hasFiles: boolean;
}

const FIELD_PRESETS: { name: string; description: string; fields: string[] }[] = [
    {
        name: "Syslog Standard",
        description: "Standard timestamp, host/source, message, facility, level",
        fields: ["timestamp", "source", "message", "facility", "level"]
    },
    {
        name: "Email / IronPort",
        description: "Email MID, sender, recipient, subject, headers, and logs",
        fields: ["timestamp", "mid", "mail_sender", "mail_recipient", "mail_subject", "source", "message"]
    },
    {
        name: "Firewall / FTD",
        description: "Perimeter connections: src_ip, dst_ip, ports, action",
        fields: ["timestamp", "source", "src_ip", "dst_ip", "src_port", "dst_port", "action", "message"]
    },
    {
        name: "NetScaler / ADC",
        description: "Citrix Gateway connections: client IP, user, vserver",
        fields: ["timestamp", "client_ip", "username", "vserver_ip", "vserver_port", "event_type", "message"]
    },
    {
        name: "Raw Syslog Only",
        description: "Minimalist timestamp, source, message",
        fields: ["timestamp", "source", "message"]
    }
];

function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function GraylogExporterClient() {
    const [activeTab, setActiveTab] = useState<"new" | "history">("new");
    const [clusters, setClusters] = useState<ClusterConfig[]>([]);
    const [loadingConfig, setLoadingConfig] = useState(true);

    // Form State
    const [selectedCluster, setSelectedCluster] = useState<"OG_GRAYLOG" | "NEW_GRAYLOG">("OG_GRAYLOG");
    const [selectedStreamId, setSelectedStreamId] = useState<string>("all");
    const [isStreamDropdownOpen, setIsStreamDropdownOpen] = useState(false);
    const [streamSearchQuery, setStreamSearchQuery] = useState("");
    const streamDropdownRef = useRef<HTMLDivElement>(null);

    const [query, setQuery] = useState<string>("*");
    const [timePreset, setTimePreset] = useState<string>("24h");
    const [fromTime, setFromTime] = useState<string>("");
    const [toTime, setToTime] = useState<string>("");
    const [selectedPreset, setSelectedPreset] = useState<string>("Syslog Standard");
    const [fields, setFields] = useState<string[]>(FIELD_PRESETS[0].fields);
    const [customFieldInput, setCustomFieldInput] = useState<string>("");
    const [exportFormat, setExportFormat] = useState<"csv" | "ndjson">("csv");
    const [jobTitle, setJobTitle] = useState<string>("");

    // Pre-Flight State
    const [planning, setPlanning] = useState(false);
    const [planResult, setPlanResult] = useState<PreflightPlan | null>(null);
    const [showPreflightModal, setShowPreflightModal] = useState(false);
    const [planError, setPlanError] = useState<string | null>(null);

    // Retention State
    const [retentionHours, setRetentionHours] = useState<number>(24);
    const [retentionReason, setRetentionReason] = useState<string>("");

    // Active Jobs & Execution State
    const [activeJobId, setActiveJobId] = useState<string | null>(null);
    const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
    const [jobs, setJobs] = useState<ExportJob[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [executing, setExecuting] = useState(false);

    // Completed Job Modal / Inspection
    const [inspectJob, setInspectJob] = useState<ExportJob | null>(null);
    const [jobFiles, setJobFiles] = useState<{ name: string; sizeBytes: number; isZip: boolean; isMaster: boolean; isManifest: boolean }[]>([]);
    const [loadingJobDetails, setLoadingJobDetails] = useState(false);

    // Initialize default time range
    useEffect(() => {
        applyTimePreset("24h");
    }, []);

    // Close stream dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (streamDropdownRef.current && !streamDropdownRef.current.contains(event.target as Node)) {
                setIsStreamDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Load Cluster & Stream Configurations
    useEffect(() => {
        async function fetchConfig() {
            setLoadingConfig(true);
            try {
                const res = await fetch("/api/graylog/export/config");
                if (res.ok) {
                    const data = await res.json();
                    setClusters(data.clusters || []);
                }
            } catch (err) {
                console.error("Failed to fetch Graylog exporter config:", err);
            } finally {
                setLoadingConfig(false);
            }
        }
        fetchConfig();
    }, []);

    // Poll active jobs or refresh history
    useEffect(() => {
        loadJobs();
        const interval = setInterval(() => {
            if (activeJobId || activeTab === "history") {
                loadJobs();
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [activeJobId, activeTab]);

    async function loadJobs() {
        try {
            const res = await fetch("/api/graylog/export/jobs");
            if (res.ok) {
                const data = await res.json();
                const jobList: ExportJob[] = data.jobs || [];
                setJobs(jobList);

                if (activeJobId) {
                    const current = jobList.find(j => j.id === activeJobId);
                    if (current) {
                        setActiveJob(current);
                        if (current.status === "COMPLETED" || current.status === "FAILED" || current.status === "CANCELLED") {
                            setActiveJobId(null);
                        }
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load export jobs:", err);
        }
    }

    function applyTimePreset(preset: string) {
        setTimePreset(preset);
        const now = new Date();
        let past = new Date();

        switch (preset) {
            case "1h":
                past = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case "6h":
                past = new Date(now.getTime() - 6 * 60 * 60 * 1000);
                break;
            case "24h":
                past = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case "3d":
                past = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
                break;
            case "7d":
                past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                return;
        }

        // Format to local ISO without trailing Z for datetime-local input
        const toLocalIso = (d: Date) => {
            const pad = (n: number) => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        setFromTime(toLocalIso(past));
        setToTime(toLocalIso(now));
    }

    function handleFieldPresetChange(presetName: string) {
        setSelectedPreset(presetName);
        const found = FIELD_PRESETS.find(p => p.name === presetName);
        if (found) {
            setFields([...found.fields]);
        }
    }

    function addCustomField() {
        if (!customFieldInput.trim()) return;
        const newField = customFieldInput.trim().toLowerCase();
        if (!fields.includes(newField)) {
            setFields([...fields, newField]);
        }
        setCustomFieldInput("");
    }

    function removeField(fieldToRemove: string) {
        setFields(fields.filter(f => f !== fieldToRemove));
    }

    // Mandatory Pre-Flight Analysis
    async function runPreflightAnalysis() {
        setPlanning(true);
        setPlanError(null);
        setPlanResult(null);

        try {
            if (!fromTime || !toTime) {
                throw new Error("Please specify both start and end timestamps.");
            }

            const fromDate = new Date(fromTime);
            const toDate = new Date(toTime);

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                throw new Error("Invalid date input. Please check the time fields.");
            }

            if (fromDate >= toDate) {
                throw new Error("Start time must be before end time.");
            }

            const res = await fetch("/api/graylog/export/plan", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cluster: selectedCluster,
                    query: query || "*",
                    from: fromDate.toISOString(),
                    to: toDate.toISOString(),
                    streamId: selectedStreamId,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Preflight check failed.");
            }

            setPlanResult(data.plan);
            setShowPreflightModal(true);
        } catch (err: any) {
            setPlanError(err.message || "Failed to run preflight check.");
        } finally {
            setPlanning(false);
        }
    }

    // Launch Bulk Export Execution
    async function confirmAndLaunchExport() {
        if (!planResult) return;
        if (retentionHours > 24 && (!retentionReason || !retentionReason.trim())) {
            alert("A business justification reason is mandatory when extending retention beyond 24 hours.");
            return;
        }

        setExecuting(true);
        try {
            const currentCluster = clusters.find(c => c.id === selectedCluster);
            const currentStream = currentCluster?.streams.find(s => s.id === selectedStreamId);

            const titleToUse = jobTitle.trim() || `${currentCluster?.name.split(" ")[0]} Export (${new Date().toLocaleDateString()} - ${planResult.totalEvents.toLocaleString()} events)`;

            const res = await fetch("/api/graylog/export/execute", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: titleToUse,
                    cluster: selectedCluster,
                    query: query || "*",
                    from: new Date(fromTime).toISOString(),
                    to: new Date(toTime).toISOString(),
                    streamId: selectedStreamId,
                    streamName: currentStream?.title || (selectedStreamId === "all" ? "All Streams" : undefined),
                    fields,
                    format: exportFormat,
                    retentionHours,
                    retentionReason,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to launch export job.");
            }

            setActiveJobId(data.jobId);
            setShowPreflightModal(false);
            loadJobs();
        } catch (err: any) {
            alert(`Launch Error: ${err.message}`);
        } finally {
            setExecuting(false);
        }
    }

    async function cancelJob(jobId: string) {
        if (!confirm("Are you sure you want to cancel this export?")) return;
        try {
            await fetch(`/api/graylog/export/jobs/${jobId}/cancel`, { method: "POST" });
            loadJobs();
        } catch (err) {
            console.error("Failed to cancel job:", err);
        }
    }

    async function deleteJob(jobId: string) {
        if (!confirm("Are you sure you want to delete this export? All files on disk will be immediately purged.")) return;
        try {
            await fetch(`/api/graylog/export/jobs/${jobId}`, { method: "DELETE" });
            if (inspectJob?.id === jobId) setInspectJob(null);
            loadJobs();
        } catch (err) {
            console.error("Failed to delete job:", err);
        }
    }

    async function openJobDetails(job: ExportJob) {
        setInspectJob(job);
        setLoadingJobDetails(true);
        try {
            const res = await fetch(`/api/graylog/export/jobs/${job.id}`);
            if (res.ok) {
                const data = await res.json();
                setJobFiles(data.files || []);
            }
        } catch (err) {
            console.error("Failed to load job files:", err);
        } finally {
            setLoadingJobDetails(false);
        }
    }

    const currentClusterObj = clusters.find(c => c.id === selectedCluster);
    const availableStreams = currentClusterObj?.streams || [];
    const filteredStreams = availableStreams.filter(s => 
        s.title.toLowerCase().includes(streamSearchQuery.toLowerCase()) || 
        (s.description && s.description.toLowerCase().includes(streamSearchQuery.toLowerCase()))
    );
    const selectedStreamObj = availableStreams.find(s => s.id === selectedStreamId);

    return (
        <div className="flex flex-col gap-6">
            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-border/40 pb-3 flex-wrap gap-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab("new")}
                        className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all ${
                            activeTab === "new"
                                ? "bg-accent-primary text-black font-semibold shadow-md shadow-accent-primary/20"
                                : "text-text-muted hover:text-text-primary hover:bg-card/60"
                        }`}
                    >
                        <Play size={16} />
                        New Bulk Export
                    </button>
                    <button
                        onClick={() => { setActiveTab("history"); loadJobs(); }}
                        className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-all relative ${
                            activeTab === "history"
                                ? "bg-accent-primary text-black font-semibold shadow-md shadow-accent-primary/20"
                                : "text-text-muted hover:text-text-primary hover:bg-card/60"
                        }`}
                    >
                        <HardDrive size={16} />
                        Export History & Storage
                        {jobs.filter(j => j.status === "COMPLETED" && j.hasFiles).length > 0 && (
                            <span className="ml-1 px-1.5 py-0.2 text-[10px] bg-emerald-500/20 text-emerald-300 rounded-full border border-emerald-500/40">
                                {jobs.filter(j => j.status === "COMPLETED" && j.hasFiles).length}
                            </span>
                        )}
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>10k Limit Auto-Bisection Engine Active</span>
                </div>
            </div>

            {/* Active Export In-Progress Banner */}
            {activeJob && (activeJob.status === "RUNNING" || activeJob.status === "PLANNING") && (
                <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur flex flex-col gap-3 animate-pulse-subtle">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                            <div>
                                <h4 className="font-semibold text-sm text-text-primary">
                                    Bulk Export In Progress: {activeJob.title}
                                </h4>
                                <p className="text-xs text-text-muted">
                                    Status: <span className="text-amber-300 font-medium">{activeJob.status}</span> &bull; 
                                    Processed {activeJob.processedSlices} of {activeJob.totalSlices} slices ({activeJob.totalEvents.toLocaleString()} events)
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => cancelJob(activeJob.id)}
                            className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:bg-red-500/20 text-xs font-medium flex items-center gap-1.5 transition-all"
                        >
                            <Ban size={14} />
                            Cancel Export
                        </button>
                    </div>

                    <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
                        <div 
                            className="bg-amber-400 h-full transition-all duration-300"
                            style={{ width: `${Math.max(5, activeJob.progress)}%` }}
                        />
                    </div>
                </div>
            )}

            {/* TAB 1: NEW BULK EXPORT */}
            {activeTab === "new" && (
                <div className="flex flex-col gap-6">
                    {/* Step 1: Cluster & Stream Selection */}
                    <div className="p-5 rounded-xl border border-border/40 bg-card/40 flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                            <span className="w-6 h-6 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-xs">1</span>
                            Target Graylog Cluster & Stream Scope
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {clusters.map((c) => (
                                <div
                                    key={c.id}
                                    onClick={() => { setSelectedCluster(c.id); setSelectedStreamId("all"); }}
                                    className={`p-4 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                        selectedCluster === c.id
                                            ? "border-accent-primary bg-accent-primary/5 shadow-md shadow-accent-primary/10"
                                            : "border-border/40 bg-card/20 hover:border-border"
                                    }`}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2">
                                            <Server className={`w-5 h-5 ${selectedCluster === c.id ? "text-accent-primary" : "text-text-muted"}`} />
                                            <span className="font-semibold text-sm text-text-primary">{c.name}</span>
                                        </div>
                                        <input
                                            type="radio"
                                            checked={selectedCluster === c.id}
                                            onChange={() => { setSelectedCluster(c.id); setSelectedStreamId("all"); }}
                                            className="text-accent-primary focus:ring-0"
                                        />
                                    </div>
                                    <p className="text-xs text-text-muted mt-2">{c.description}</p>
                                    <div className="mt-3 text-[11px] text-text-secondary flex items-center gap-1 font-mono">
                                        <Layers size={13} />
                                        {c.streams?.length || 0} streams available
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Stream Picker (Custom Dark Searchable Dropdown) */}
                        <div className="flex flex-col gap-1.5 mt-2 relative" ref={streamDropdownRef}>
                            <label className="text-xs font-medium text-text-secondary flex items-center justify-between">
                                <span>Stream Filter</span>
                                {availableStreams.length > 0 && (
                                    <span className="text-[11px] text-text-muted">{availableStreams.length} streams in cluster</span>
                                )}
                            </label>
                            
                            {/* Trigger Button */}
                            <button
                                type="button"
                                onClick={() => setIsStreamDropdownOpen(!isStreamDropdownOpen)}
                                className="w-full bg-[#14171f] border border-border/60 hover:border-accent-primary/60 rounded-lg p-2.5 text-sm text-text-primary flex items-center justify-between transition-all text-left shadow-sm focus:outline-none focus:border-accent-primary"
                            >
                                <div className="flex items-center gap-2.5 truncate">
                                    {selectedStreamId === "all" ? (
                                        <>
                                            <Globe size={16} className="text-accent-primary shrink-0" />
                                            <span className="font-medium text-text-primary">All Streams (Cluster-Wide Index Search)</span>
                                        </>
                                    ) : (
                                        <>
                                            <Layers size={16} className="text-cyan-400 shrink-0" />
                                            <div className="truncate">
                                                <span className="font-medium text-text-primary">{selectedStreamObj?.title || selectedStreamId}</span>
                                                {selectedStreamObj?.description && (
                                                    <span className="text-xs text-text-muted ml-2 truncate">({selectedStreamObj.description})</span>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                                <ChevronDown size={16} className={`text-text-muted shrink-0 transition-transform ${isStreamDropdownOpen ? "rotate-180" : ""}`} />
                            </button>

                            {/* Custom Dark Dropdown Popover */}
                            {isStreamDropdownOpen && (
                                <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-30 bg-[#161a23] border border-border/80 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
                                    {/* Search Input */}
                                    <div className="p-2 border-b border-border/40 bg-[#12141a]">
                                        <div className="relative flex items-center">
                                            <Search size={14} className="absolute left-3 text-text-muted" />
                                            <input
                                                type="text"
                                                value={streamSearchQuery}
                                                onChange={(e) => setStreamSearchQuery(e.target.value)}
                                                placeholder="Search streams by name or description..."
                                                autoFocus
                                                className="w-full bg-[#1a1d26] border border-border/40 rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary font-sans"
                                            />
                                            {streamSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setStreamSearchQuery("")}
                                                    className="absolute right-2.5 text-text-muted hover:text-text-primary"
                                                >
                                                    <X size={12} />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Options List */}
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-0.5 text-xs">
                                        {/* All Streams Option */}
                                        <button
                                            type="button"
                                            onClick={() => { setSelectedStreamId("all"); setIsStreamDropdownOpen(false); setStreamSearchQuery(""); }}
                                            className={`w-full p-2.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                                                selectedStreamId === "all"
                                                    ? "bg-accent-primary/15 text-accent-primary font-semibold"
                                                    : "hover:bg-white/5 text-text-secondary hover:text-text-primary"
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Globe size={15} className="shrink-0 text-accent-primary" />
                                                <div>
                                                    <div className="font-medium text-text-primary">All Streams (Cluster-Wide Index Search)</div>
                                                    <div className="text-[11px] text-text-muted">Searches across all streams within cluster</div>
                                                </div>
                                            </div>
                                            {selectedStreamId === "all" && <Check size={14} className="text-accent-primary shrink-0" />}
                                        </button>

                                        {/* Filtered Streams */}
                                        {filteredStreams.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => { setSelectedStreamId(s.id); setIsStreamDropdownOpen(false); setStreamSearchQuery(""); }}
                                                className={`w-full p-2.5 rounded-lg text-left flex items-center justify-between transition-colors ${
                                                    selectedStreamId === s.id
                                                        ? "bg-accent-primary/15 text-accent-primary font-semibold"
                                                        : "hover:bg-white/5 text-text-secondary hover:text-text-primary"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <Layers size={14} className="shrink-0 text-cyan-400" />
                                                    <div className="truncate">
                                                        <div className="font-medium text-text-primary truncate">{s.title}</div>
                                                        {s.description && (
                                                            <div className="text-[11px] text-text-muted truncate">{s.description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                                {selectedStreamId === s.id && <Check size={14} className="text-accent-primary shrink-0" />}
                                            </button>
                                        ))}

                                        {filteredStreams.length === 0 && streamSearchQuery && (
                                            <div className="p-4 text-center text-text-muted text-xs">
                                                No streams matching "{streamSearchQuery}"
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Step 2: Query & Time Range */}
                    <div className="p-5 rounded-xl border border-border/40 bg-card/40 flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                            <span className="w-6 h-6 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-xs">2</span>
                            Search Query & Time Window
                        </div>

                        {/* Query Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-medium text-text-secondary flex items-center justify-between">
                                <span>Graylog Query (Lucene syntax)</span>
                                <span className="text-[11px] text-text-muted">Use '*' to match all records in stream</span>
                            </label>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="e.g. action:DROP OR client_ip:10.10.* OR mail_sender:*@domain.com"
                                className="w-full bg-card/60 border border-border/40 rounded-lg p-3 text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary transition-all"
                            />
                            <div className="flex flex-wrap gap-2 mt-1">
                                <span className="text-[11px] text-text-muted">Quick filters:</span>
                                {["*", 'level:3 OR level:2', 'action:DROP', 'facility:local0', 'client_ip:*'].map((qExample) => (
                                    <button
                                        key={qExample}
                                        type="button"
                                        onClick={() => setQuery(qExample)}
                                        className="text-[11px] px-2 py-0.5 rounded bg-card border border-border/40 text-text-secondary hover:text-text-primary hover:border-accent-primary/50 font-mono transition-all"
                                    >
                                        {qExample}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Time Range Quick Presets */}
                        <div className="flex flex-col gap-2 mt-2">
                            <label className="text-xs font-medium text-text-secondary">Time Window Presets</label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { id: "1h", label: "Past 1 Hour" },
                                    { id: "6h", label: "Past 6 Hours" },
                                    { id: "24h", label: "Past 24 Hours" },
                                    { id: "3d", label: "Past 3 Days" },
                                    { id: "7d", label: "Past 7 Days" },
                                    { id: "custom", label: "Custom Range" },
                                ].map((p) => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => applyTimePreset(p.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                            timePreset === p.id
                                                ? "bg-accent-primary text-black font-semibold"
                                                : "bg-card/60 border border-border/40 text-text-secondary hover:text-text-primary"
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Time Pickers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                                    <Calendar size={14} className="text-accent-primary" />
                                    From (Start Timestamp)
                                </label>
                                <input
                                    type="datetime-local"
                                    value={fromTime}
                                    style={{ colorScheme: "dark" }}
                                    onChange={(e) => { setFromTime(e.target.value); setTimePreset("custom"); }}
                                    className="bg-[#14171f] border border-border/60 rounded-lg p-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-all font-mono"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-text-secondary flex items-center gap-1.5">
                                    <Calendar size={14} className="text-accent-primary" />
                                    To (End Timestamp)
                                </label>
                                <input
                                    type="datetime-local"
                                    value={toTime}
                                    style={{ colorScheme: "dark" }}
                                    onChange={(e) => { setToTime(e.target.value); setTimePreset("custom"); }}
                                    className="bg-[#14171f] border border-border/60 rounded-lg p-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-all font-mono"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Fields & Format */}
                    <div className="p-5 rounded-xl border border-border/40 bg-card/40 flex flex-col gap-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                            <span className="w-6 h-6 rounded-full bg-accent-primary/20 text-accent-primary flex items-center justify-center text-xs">3</span>
                            Export Fields & File Format
                        </div>

                        {/* Field Presets */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-text-secondary">Field Presets</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {FIELD_PRESETS.map((fp) => (
                                    <button
                                        key={fp.name}
                                        type="button"
                                        onClick={() => handleFieldPresetChange(fp.name)}
                                        className={`p-2.5 rounded-lg border text-left transition-all ${
                                            selectedPreset === fp.name
                                                ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                                                : "border-border/40 bg-card/20 text-text-secondary hover:border-border"
                                        }`}
                                    >
                                        <div className="text-xs font-semibold">{fp.name}</div>
                                        <div className="text-[11px] text-text-muted truncate">{fp.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Selected Field Chips */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium text-text-secondary">Active Columns ({fields.length})</label>
                            <div className="flex flex-wrap gap-1.5 p-3 rounded-lg border border-border/40 bg-card/20 min-h-[48px]">
                                {fields.map((f) => (
                                    <span
                                        key={f}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-card border border-border/60 text-text-primary font-mono"
                                    >
                                        {f}
                                        <button
                                            type="button"
                                            onClick={() => removeField(f)}
                                            className="text-text-muted hover:text-red-400 transition-colors"
                                        >
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>

                            {/* Add Custom Field */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customFieldInput}
                                    onChange={(e) => setCustomFieldInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomField(); } }}
                                    placeholder="Add custom field (e.g. user_agent, duration)"
                                    className="flex-1 bg-card/60 border border-border/40 rounded-lg p-2 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                                />
                                <button
                                    type="button"
                                    onClick={addCustomField}
                                    className="px-3 py-2 bg-card border border-border/40 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:border-accent-primary transition-all"
                                >
                                    Add Field
                                </button>
                            </div>
                        </div>

                        {/* Format & Optional Export Title */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-text-secondary">Export Format</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setExportFormat("csv")}
                                        className={`p-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-medium transition-all ${
                                            exportFormat === "csv"
                                                ? "border-accent-primary bg-accent-primary/10 text-accent-primary font-semibold"
                                                : "border-border/40 bg-card/20 text-text-secondary"
                                        }`}
                                    >
                                        <FileSpreadsheet size={16} />
                                        CSV (Excel DDE Protected)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setExportFormat("ndjson")}
                                        className={`p-3 rounded-lg border flex items-center justify-center gap-2 text-xs font-medium transition-all ${
                                            exportFormat === "ndjson"
                                                ? "border-accent-primary bg-accent-primary/10 text-accent-primary font-semibold"
                                                : "border-border/40 bg-card/20 text-text-secondary"
                                        }`}
                                    >
                                        <FileText size={16} />
                                        NDJSON (Newline JSON)
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-medium text-text-secondary">Export Title (Optional)</label>
                                <input
                                    type="text"
                                    value={jobTitle}
                                    onChange={(e) => setJobTitle(e.target.value)}
                                    placeholder="e.g. IronPort Drop Logs - Incident #4910"
                                    className="bg-card/60 border border-border/40 rounded-lg p-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Step 4: Mandatory Pre-Flight Action */}
                    {planError && (
                        <div className="p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
                            <span>{planError}</span>
                        </div>
                    )}

                    <div className="p-5 rounded-xl border border-accent-primary/30 bg-accent-primary/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <Shield className="w-8 h-8 text-accent-primary shrink-0" />
                            <div>
                                <h4 className="text-sm font-semibold text-text-primary">
                                    Mandatory Pre-Flight Check & Size Estimation
                                </h4>
                                <p className="text-xs text-text-muted">
                                    Before executing, the system tests Graylog, calculates required 10k bisection slices, and ensures adequate server disk space on infosecutil02.
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={runPreflightAnalysis}
                            disabled={planning || executing}
                            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-accent-primary text-black font-bold text-sm shadow-lg shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {planning ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Analyzing Cluster & Slices...
                                </>
                            ) : (
                                <>
                                    <Play size={16} />
                                    Run Pre-Flight Analysis
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* TAB 2: EXPORT HISTORY & STORAGE MANAGEMENT */}
            {activeTab === "history" && (
                <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                            <h3 className="font-semibold text-base text-text-primary">Past Exports & Storage Lifecycle</h3>
                            <p className="text-xs text-text-muted">
                                Storage path: <code className="text-accent-primary">/opt/linux-dash/exports/graylog/</code> &bull; Default retention is 24h with automated nightly disk purge.
                            </p>
                        </div>
                        <button
                            onClick={loadJobs}
                            className="px-3 py-1.5 rounded-lg border border-border/40 text-xs text-text-secondary hover:text-text-primary hover:border-accent-primary/40 flex items-center gap-1.5 transition-all"
                        >
                            <RefreshCw size={14} />
                            Refresh
                        </button>
                    </div>

                    {jobs.length === 0 ? (
                        <div className="p-12 text-center rounded-xl border border-border/40 bg-card/20 text-text-muted flex flex-col items-center gap-3">
                            <HardDrive size={36} className="text-text-muted/60" />
                            <p className="text-sm font-medium">No export jobs recorded yet.</p>
                            <button
                                onClick={() => setActiveTab("new")}
                                className="px-4 py-2 bg-accent-primary text-black font-semibold rounded-lg text-xs"
                            >
                                Create First Bulk Export
                            </button>
                        </div>
                    ) : (
                        <div className="border border-border/40 rounded-xl overflow-hidden bg-card/20">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="border-b border-border/40 bg-card/60 text-text-muted">
                                            <th className="p-3 font-medium">Export / Query</th>
                                            <th className="p-3 font-medium">Cluster & Scope</th>
                                            <th className="p-3 font-medium">Records & Slices</th>
                                            <th className="p-3 font-medium">Archive Size</th>
                                            <th className="p-3 font-medium">Status & Retention</th>
                                            <th className="p-3 font-medium">Created By</th>
                                            <th className="p-3 font-medium text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20 text-text-secondary">
                                        {jobs.map((job) => {
                                            const isRunning = job.status === "RUNNING" || job.status === "PLANNING";
                                            const isCompleted = job.status === "COMPLETED";
                                            const isExpired = job.status === "EXPIRED";

                                            return (
                                                <tr key={job.id} className="hover:bg-card/40 transition-colors">
                                                    <td className="p-3">
                                                        <div className="font-semibold text-text-primary text-sm">{job.title}</div>
                                                        <div className="font-mono text-[11px] text-text-muted truncate max-w-[220px]" title={job.query}>
                                                            {job.query}
                                                        </div>
                                                        <div className="text-[10px] text-text-muted mt-0.5">
                                                            {new Date(job.from).toLocaleDateString()} &rarr; {new Date(job.to).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-medium text-text-primary">{job.cluster === "OG_GRAYLOG" ? "Legacy (4.2)" : "Modern (7.1)"}</div>
                                                        <div className="text-[11px] text-text-muted">{job.streamName || "All Streams"}</div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-mono font-medium text-text-primary">{job.totalEvents.toLocaleString()} events</div>
                                                        <div className="text-[11px] text-text-muted">{job.totalSlices} time slices</div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="font-medium text-emerald-400">{formatBytes(job.compressedBytes)} (ZIP)</div>
                                                        <div className="text-[11px] text-text-muted">{formatBytes(job.uncompressedBytes)} raw</div>
                                                    </td>
                                                    <td className="p-3">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            {isRunning && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                                                                    <RefreshCw size={10} className="animate-spin" />
                                                                    {job.progress}%
                                                                </span>
                                                            )}
                                                            {isCompleted && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                                                                    <CheckCircle2 size={10} />
                                                                    Ready
                                                                </span>
                                                            )}
                                                            {isExpired && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700">
                                                                    Purged
                                                                </span>
                                                            )}
                                                            {job.status === "FAILED" && (
                                                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-300 border border-red-500/40">
                                                                    Failed
                                                                </span>
                                                            )}
                                                        </div>

                                                        {isCompleted && job.hasFiles && (
                                                            <div className="text-[10px] text-amber-300/90 flex items-center gap-1">
                                                                <Clock size={11} />
                                                                Expires in {job.hoursRemaining}h
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-[11px]">
                                                        <div>{job.createdBy}</div>
                                                        <div className="text-[10px] text-text-muted">{new Date(job.createdAt).toLocaleTimeString()}</div>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            {isCompleted && job.hasFiles && (
                                                                <>
                                                                    <a
                                                                        href={`/api/graylog/export/download/${job.id}/${job.zipFileName || `all_in_one_${job.id}.zip`}`}
                                                                        download
                                                                        title="Download Master All-in-One ZIP Package"
                                                                        className="px-2.5 py-1.5 rounded-lg bg-accent-primary text-black font-semibold text-xs flex items-center gap-1 hover:scale-105 transition-all shadow-sm"
                                                                    >
                                                                        <DownloadCloud size={14} />
                                                                        ZIP
                                                                    </a>
                                                                    <button
                                                                        onClick={() => openJobDetails(job)}
                                                                        title="Inspect Files & Slices"
                                                                        className="p-1.5 rounded-lg border border-border/40 hover:border-accent-primary text-text-secondary hover:text-text-primary transition-all"
                                                                    >
                                                                        <FileArchive size={14} />
                                                                    </button>
                                                                </>
                                                            )}
                                                            {isRunning && (
                                                                <button
                                                                    onClick={() => cancelJob(job.id)}
                                                                    className="px-2 py-1 rounded bg-red-500/20 text-red-300 hover:bg-red-500/30 text-xs font-medium transition-all"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => deleteJob(job.id)}
                                                                title="Purge From Disk Immediately"
                                                                className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MANDATORY PRE-FLIGHT ANALYSIS MODAL */}
            {showPreflightModal && planResult && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#12141a] border border-border/60 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
                        {/* Modal Header */}
                        <div className="p-5 border-b border-border/40 flex items-center justify-between bg-card/40">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-accent-primary/20 text-accent-primary">
                                    <HardDrive size={22} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-base text-text-primary">Pre-Flight Sizing & Packaging Guarantee</h3>
                                    <p className="text-xs text-text-muted">Review projected slices, disk headroom, and confirm retention period</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPreflightModal(false)}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-card"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex flex-col gap-5">
                            {/* Key Metrics Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3.5 rounded-xl border border-border/40 bg-card/20 flex flex-col">
                                    <span className="text-[11px] text-text-muted font-medium">Total Event Hits</span>
                                    <span className="text-xl font-extrabold text-accent-primary mt-1">
                                        {planResult.totalEvents.toLocaleString()}
                                    </span>
                                    <span className="text-[10px] text-text-muted mt-0.5">Across full query scope</span>
                                </div>
                                <div className="p-3.5 rounded-xl border border-border/40 bg-card/20 flex flex-col">
                                    <span className="text-[11px] text-text-muted font-medium">10k Bisection Slices</span>
                                    <span className="text-xl font-extrabold text-cyan-400 mt-1">
                                        {planResult.sliceCount} {planResult.sliceCount === 1 ? "slice" : "slices"}
                                    </span>
                                    <span className="text-[10px] text-text-muted mt-0.5">&le; 9,800 records / slice</span>
                                </div>
                                <div className="p-3.5 rounded-xl border border-border/40 bg-card/20 flex flex-col">
                                    <span className="text-[11px] text-text-muted font-medium">Raw Uncompressed</span>
                                    <span className="text-xl font-extrabold text-text-primary mt-1">
                                        {formatBytes(planResult.projectedUncompressedBytes)}
                                    </span>
                                    <span className="text-[10px] text-text-muted mt-0.5">Estimated CSV stream</span>
                                </div>
                                <div className="p-3.5 rounded-xl border border-border/40 bg-card/20 flex flex-col">
                                    <span className="text-[11px] text-text-muted font-medium">All-in-One ZIP</span>
                                    <span className="text-xl font-extrabold text-emerald-400 mt-1">
                                        {formatBytes(planResult.projectedCompressedBytes)}
                                    </span>
                                    <span className="text-[10px] text-text-muted mt-0.5">~18% compression ratio</span>
                                </div>
                            </div>

                            {/* Server Disk Space Safeguard */}
                            <div className="p-4 rounded-xl border border-border/40 bg-card/30 flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                    <HardDrive className={`w-5 h-5 ${planResult.isDiskSpaceSufficient ? "text-emerald-400" : "text-red-400"}`} />
                                    <div>
                                        <div className="text-xs font-semibold text-text-primary">
                                            infosecutil02 Storage Headroom: {formatBytes(planResult.freeDiskBytes)} Available
                                        </div>
                                        <div className="text-[11px] text-text-muted">
                                            Base directory: <code className="font-mono">/opt/linux-dash/exports/graylog/</code>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-xs">
                                    {planResult.isDiskSpaceSufficient ? (
                                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-medium border border-emerald-500/40">
                                            ✓ Storage Verified Safe
                                        </span>
                                    ) : (
                                        <span className="px-2.5 py-1 rounded-full bg-red-500/20 text-red-300 font-medium border border-red-500/40">
                                            ✗ Insufficient Disk Space
                                        </span>
                                    )}
                                </div>
                            </div>

                            {planResult.diskWarning && (
                                <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-amber-400 shrink-0" />
                                    <span>{planResult.diskWarning}</span>
                                </div>
                            )}

                            {/* Slice Timeline Preview */}
                            <div className="flex flex-col gap-2">
                                <div className="text-xs font-semibold text-text-primary flex items-center justify-between">
                                    <span>Calculated Time Slices Breakdown</span>
                                    <span className="text-[11px] text-text-muted">Bypasses Graylog Elasticsearch 10k window limit</span>
                                </div>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar border border-border/40 rounded-xl bg-card/20 divide-y divide-border/20 text-xs font-mono">
                                    {planResult.slices.map((slice) => (
                                        <div key={slice.sliceIndex} className="p-2.5 flex items-center justify-between hover:bg-card/40">
                                            <div className="flex items-center gap-2">
                                                <span className="px-1.5 py-0.5 rounded bg-card border border-border text-text-secondary text-[10px]">
                                                    #{slice.sliceIndex}
                                                </span>
                                                <span className="text-text-primary">
                                                    {new Date(slice.from).toLocaleTimeString()} &rarr; {new Date(slice.to).toLocaleTimeString()}
                                                </span>
                                                <span className="text-[10px] text-text-muted">({slice.durationMinutes} min)</span>
                                            </div>
                                            <div className="font-semibold text-accent-primary">
                                                ~{slice.estimatedHits.toLocaleString()} events
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Mandatory Retention Period Selection */}
                            <div className="p-4 rounded-xl border border-border/60 bg-card/40 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                                        <Clock size={15} className="text-amber-400" />
                                        Data Retention & Auto-Purge Policy
                                    </label>
                                    <span className="text-[11px] text-text-muted">Max 7 days allowed</span>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {[
                                        { hours: 24, label: "24 Hours (Default)" },
                                        { hours: 48, label: "48 Hours (2 Days)" },
                                        { hours: 72, label: "72 Hours (3 Days)" },
                                        { hours: 168, label: "7 Days (Maximum)" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.hours}
                                            type="button"
                                            onClick={() => setRetentionHours(opt.hours)}
                                            className={`p-2 rounded-lg border text-xs font-medium transition-all ${
                                                retentionHours === opt.hours
                                                    ? "border-accent-primary bg-accent-primary/10 text-accent-primary font-bold"
                                                    : "border-border/40 bg-card/20 text-text-secondary hover:border-border"
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Mandatory Business Justification if > 24 Hours */}
                                {retentionHours > 24 && (
                                    <div className="flex flex-col gap-1.5 pt-2 border-t border-border/30 animate-fade-in">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                                            <AlertTriangle size={14} className="text-amber-400" />
                                            Business Justification Mandatory (Audit Logged)
                                        </div>
                                        <p className="text-[11px] text-text-muted">
                                            To prevent server disk exhaustion, selecting retention longer than 24 hours requires a recorded operational justification.
                                        </p>
                                        <textarea
                                            value={retentionReason}
                                            onChange={(e) => setRetentionReason(e.target.value)}
                                            placeholder="Provide audit reason (e.g. Legal hold, ongoing ransomware forensic investigation, IR incident ticket #9821)..."
                                            rows={2}
                                            className="w-full bg-card/80 border border-amber-500/40 rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:border-amber-400 transition-all"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Packaging & Excel Protection Notice */}
                            <div className="p-3.5 rounded-xl border border-border/30 bg-card/20 text-[11px] text-text-muted flex items-start gap-2.5">
                                <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                                <div>
                                    <span className="font-semibold text-text-secondary">Packaging & Protection Guarantee:</span>{" "}
                                    All slices will be automatically compiled into a primary All-in-One Compressed ZIP package containing a master concatenated file, individual slice logs, and an integrity manifest. CSV exports are automatically sanitized against Excel DDE formula injection.
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-5 border-t border-border/40 flex items-center justify-between bg-card/40 flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => setShowPreflightModal(false)}
                                className="px-4 py-2.5 rounded-xl border border-border/40 text-text-secondary hover:text-text-primary text-xs font-medium"
                            >
                                Modify Parameters
                            </button>

                            <button
                                type="button"
                                onClick={confirmAndLaunchExport}
                                disabled={
                                    executing || 
                                    !planResult.isDiskSpaceSufficient || 
                                    (retentionHours > 24 && (!retentionReason || !retentionReason.trim()))
                                }
                                className="px-6 py-2.5 rounded-xl bg-accent-primary text-black font-bold text-xs shadow-lg shadow-accent-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                            >
                                {executing ? (
                                    <>
                                        <RefreshCw size={14} className="animate-spin" />
                                        Initiating Job...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={14} />
                                        Confirm & Launch Bulk Export
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* JOB DETAILS & DOWNLOAD MODAL */}
            {inspectJob && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-[#12141a] border border-border/60 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in">
                        <div className="p-5 border-b border-border/40 flex items-center justify-between bg-card/40">
                            <div className="flex items-center gap-2.5">
                                <FileArchive className="w-5 h-5 text-accent-primary" />
                                <div>
                                    <h3 className="font-bold text-sm text-text-primary">{inspectJob.title}</h3>
                                    <p className="text-[11px] text-text-muted">
                                        {inspectJob.totalEvents.toLocaleString()} events &bull; {inspectJob.totalSlices} slices
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setInspectJob(null)}
                                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5 overflow-y-auto custom-scrollbar flex flex-col gap-4">
                            {/* Primary ZIP Download Button */}
                            <div className="p-4 rounded-xl border border-accent-primary/40 bg-accent-primary/10 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs font-bold text-text-primary">
                                        All-in-One Compressed ZIP Package
                                    </div>
                                    <div className="text-[11px] text-text-muted">
                                        Contains all individual slices + merged master file + manifest
                                    </div>
                                    <div className="text-xs font-semibold text-emerald-400 mt-1">
                                        {formatBytes(inspectJob.compressedBytes)}
                                    </div>
                                </div>

                                <a
                                    href={`/api/graylog/export/download/${inspectJob.id}/${inspectJob.zipFileName || `all_in_one_${inspectJob.id}.zip`}`}
                                    download
                                    className="px-4 py-2.5 rounded-xl bg-accent-primary text-black font-bold text-xs flex items-center gap-2 shadow-md hover:scale-105 transition-all"
                                >
                                    <DownloadCloud size={16} />
                                    Download ZIP
                                </a>
                            </div>

                            {/* Individual Files List */}
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold text-text-primary">Available Individual Files</span>
                                {loadingJobDetails ? (
                                    <div className="p-6 text-center text-xs text-text-muted">
                                        <RefreshCw size={16} className="animate-spin inline mr-2" />
                                        Loading file list...
                                    </div>
                                ) : (
                                    <div className="border border-border/40 rounded-xl bg-card/20 divide-y divide-border/20 text-xs font-mono max-h-60 overflow-y-auto custom-scrollbar">
                                        {jobFiles.map((file) => (
                                            <div key={file.name} className="p-2.5 flex items-center justify-between hover:bg-card/40">
                                                <div className="flex items-center gap-2 truncate max-w-[340px]">
                                                    {file.isZip && <FileArchive size={14} className="text-accent-primary shrink-0" />}
                                                    {file.isMaster && <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />}
                                                    {file.isManifest && <FileText size={14} className="text-cyan-400 shrink-0" />}
                                                    {!file.isZip && !file.isMaster && !file.isManifest && (
                                                        <FileText size={14} className="text-text-muted shrink-0" />
                                                    )}
                                                    <span className="truncate text-text-secondary" title={file.name}>
                                                        {file.name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-text-muted text-[11px]">{formatBytes(file.sizeBytes)}</span>
                                                    <a
                                                        href={`/api/graylog/export/download/${inspectJob.id}/${file.name}`}
                                                        download
                                                        className="p-1 rounded hover:bg-card text-accent-primary hover:text-white transition-colors"
                                                        title="Download File"
                                                    >
                                                        <DownloadCloud size={14} />
                                                    </a>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 border-t border-border/40 flex justify-end bg-card/40">
                            <button
                                onClick={() => setInspectJob(null)}
                                className="px-4 py-2 rounded-xl bg-card border border-border/40 text-xs text-text-secondary hover:text-text-primary"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
