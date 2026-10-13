"use client";

import { useState, useMemo } from "react";
import { 
    Search, UserX, AlertCircle, Shield, Wifi, Laptop, Clock, 
    Calendar, CheckCircle2, AlertTriangle, Terminal, ChevronDown, 
    ChevronUp, Copy, Check, Download, RefreshCw, Radio, HardDrive, 
    Info, ArrowRight, UserCheck, Layers, ExternalLink
} from "lucide-react";
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
    Tooltip, CartesianGrid, Legend 
} from "recharts";

interface AdSecurityEvent {
    id: string;
    timestamp: string;
    eventId: string;
    eventTitle: string;
    targetUser: string;
    callerDevice: string;
    sourceIp: string;
    domainController: string;
    logonType?: number;
    logonTypeDesc?: string;
    subStatus?: string;
    subStatusDesc?: string;
    failureReason?: string;
    rawMessage: string;
}

interface IseWirelessDetails {
    source: "ISE_MNT" | "GRAYLOG_ISE";
    endpointMac: string;
    ssid: string;
    apName: string;
    siteCode: string;
    deviceProfile?: string;
    failureReason?: string;
    failureCode?: string;
    nasIp?: string;
    nasPortId?: string;
    callingStationId?: string;
    calledStationId?: string;
    authTimestamp?: string;
}

interface WorkstationDetails {
    hostname: string;
    ipAddress?: string;
    resolvedHostname?: string;
    logonType?: number;
    logonTypeDesc?: string;
    likelyCause?: string;
}

interface FailureTimelineBucket {
    time: string;
    timestamp: number;
    lockouts: number;
    failedLogons: number;
    kerberosFailures: number;
    ntlmFailures: number;
    total: number;
}

interface LockoutInvestigationResult {
    searchedUser: string;
    rangeHours: number;
    hasLockout: boolean;
    lockoutCount: number;
    latestLockoutTimestamp: string | null;
    totalFailureEvents: number;
    rootCauseCategory: string;
    executiveSummary: string;
    recommendation: string;
    primaryCulprit: {
        type: "ISE_WIRELESS" | "WORKSTATION" | "UNKNOWN";
        callerName: string;
        isIsePsn: boolean;
        iseDetails?: IseWirelessDetails | null;
        workstationDetails?: WorkstationDetails | null;
    };
    uniqueCallers: string[];
    timeline: FailureTimelineBucket[];
    events: AdSecurityEvent[];
    queriedSources: {
        adGraylogStream: string;
        iseQueryMode: "ISE_MNT" | "GRAYLOG_ISE" | "SKIPPED";
        adEventsCount: number;
        iseEventsCount: number;
    };
}

export default function AccountLockoutClient() {
    const [usernameInput, setUsernameInput] = useState("");
    const [rangeHours, setRangeHours] = useState<number>(24);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<LockoutInvestigationResult | null>(null);

    // Table state
    const [eventFilter, setEventFilter] = useState<"all" | "4740" | "4625" | "4771" | "4776">("all");
    const [tableSearch, setTableSearch] = useState("");
    const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleSearch = async (e?: React.FormEvent, overrideRange?: number) => {
        if (e) e.preventDefault();
        const user = usernameInput.trim();
        if (!user) return;

        const effectiveRange = overrideRange || rangeHours;
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                user,
                rangeHours: effectiveRange.toString()
            });

            const res = await fetch(`/api/account-lockout/investigate?${params.toString()}`);
            const json = await res.json();

            if (!res.ok) {
                throw new Error(json.error || `HTTP ${res.status}: Failed to investigate account`);
            }

            setData(json.data);
            setExpandedEventId(null);
        } catch (err: any) {
            setError(err.message || "Failed to execute investigation");
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleExportCsv = () => {
        if (!data || data.events.length === 0) return;

        const headers = ["Timestamp", "Event ID", "Event Title", "Target User", "Caller Device", "Source IP", "Domain Controller", "Logon Type", "SubStatus", "SubStatus Description"];
        const rows = data.events.map(ev => [
            `"${ev.timestamp}"`,
            `"${ev.eventId}"`,
            `"${ev.eventTitle}"`,
            `"${ev.targetUser}"`,
            `"${ev.callerDevice}"`,
            `"${ev.sourceIp}"`,
            `"${ev.domainController}"`,
            `"${ev.logonTypeDesc || (ev.logonType !== undefined ? `Type ${ev.logonType}` : '')}"`,
            `"${ev.subStatus || ''}"`,
            `"${ev.subStatusDesc || ''}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `account_lockout_${data.searchedUser}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Filtered events for the table
    const filteredEvents = useMemo(() => {
        if (!data) return [];
        return data.events.filter(ev => {
            if (eventFilter !== "all" && ev.eventId !== eventFilter) return false;
            if (tableSearch.trim()) {
                const q = tableSearch.toLowerCase();
                return (
                    ev.callerDevice.toLowerCase().includes(q) ||
                    ev.domainController.toLowerCase().includes(q) ||
                    ev.sourceIp.toLowerCase().includes(q) ||
                    ev.eventId.includes(q) ||
                    (ev.subStatusDesc && ev.subStatusDesc.toLowerCase().includes(q)) ||
                    (ev.logonTypeDesc && ev.logonTypeDesc.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [data, eventFilter, tableSearch]);

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 gap-4 w-full">
            {/* Locked Top Section: Header & Search Toolbar */}
            <div className="shrink-0 flex flex-col gap-3">
                {/* Header */}
                <div>
                    <div className="flex items-center gap-2.5">
                        <UserX size={24} className="text-amber-400" />
                        <h1 className="text-xl font-bold text-text-primary">
                            Account Lockout & Auth Failure Investigator
                        </h1>
                    </div>
                    <p className="text-xs text-text-secondary mt-1">
                        Correlates Domain Controller security logs (Events 4740, 4625, 4771, 4776) in Graylog with Cisco ISE Wireless telemetry to isolate lockout sources.
                    </p>
                </div>

                {/* Search Toolbar */}
                <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] shadow-sm space-y-3">
                <form onSubmit={(e) => handleSearch(e)} className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[240px]">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input
                            type="text"
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            placeholder="Enter username (e.g. jdoe or jdoe@cooperhealth.edu)..."
                            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-border-color bg-[var(--bg-background)] text-text-primary focus:outline-none focus:border-accent-primary"
                        />
                    </div>

                    {/* Time Window Buttons */}
                    <div className="flex items-center gap-1 bg-[var(--bg-background)] p-1 rounded-xl border border-border-color">
                        {[
                            { label: "1h", hours: 1 },
                            { label: "4h", hours: 4 },
                            { label: "12h", hours: 12 },
                            { label: "24h", hours: 24 },
                            { label: "7d", hours: 168 }
                        ].map((btn) => (
                            <button
                                key={btn.hours}
                                type="button"
                                onClick={() => {
                                    setRangeHours(btn.hours);
                                    if (data) handleSearch(undefined, btn.hours);
                                }}
                                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                    rangeHours === btn.hours
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-secondary hover:text-text-primary hover:bg-[var(--bg-surface-hover)]"
                                }`}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !usernameInput.trim()}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-accent-primary hover:bg-accent-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                        {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
                        <span>{loading ? "Investigating..." : "Investigate Account"}</span>
                    </button>
                </form>

                {/* Sub-label showing queried systems */}
                <div className="flex items-center justify-between text-[11px] text-text-muted font-mono pt-1">
                    <span className="flex items-center gap-1.5">
                        <HardDrive size={12} className="text-indigo-400" />
                        AD Security Stream: <strong className="text-text-secondary">5d72ac00b209026ab42decf9</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Radio size={12} className="text-cyan-400" />
                        ISE-PSN Detection: <strong className="text-text-secondary">ise-psn01 - 04 (Wireless EAP)</strong>
                    </span>
                </div>
            </div>
        </div>

        {/* Scrollable Content Stream */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-10 space-y-6">
            {/* Error Message */}
            {error && (
                <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-950/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                    <span>{error}</span>
                </div>
            )}

            {/* Loading Indicator */}
            {loading && (
                <div className="p-12 text-center rounded-xl border border-border-color bg-[var(--bg-surface)]/40 space-y-3">
                    <RefreshCw size={28} className="animate-spin mx-auto text-accent-primary opacity-80" />
                    <div className="text-xs font-semibold text-text-primary">
                        Scanning Active Directory domain controllers in Graylog...
                    </div>
                    <p className="text-[11px] text-text-muted max-w-md mx-auto">
                        Correlating Event 4740 lockouts with 4625/4771 failures and evaluating Cisco ISE PSN nodes for wireless EAP authentications.
                    </p>
                </div>
            )}

            {/* Pre-search Empty Slate */}
            {!loading && !data && !error && (
                <div className="p-12 text-center rounded-xl border border-border-color bg-[var(--bg-surface)]/30 space-y-4">
                    <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/20 flex items-center justify-center mx-auto text-accent-primary">
                        <Search size={22} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-text-primary">
                            Ready to Triage Account Lockouts
                        </h3>
                        <p className="text-xs text-text-secondary mt-1 max-w-lg mx-auto leading-relaxed">
                            Search for any username above to isolate the exact device, workstation, or wireless access point causing Active Directory account lockouts.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-2xl mx-auto pt-4 text-left">
                        <div className="p-3 rounded-xl border border-border-color bg-[var(--bg-background)]/50 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-indigo-400 flex items-center gap-1">
                                <HardDrive size={12} /> Step 1: AD Lockout (4740)
                            </span>
                            <p className="text-[11px] text-text-secondary leading-snug">
                                Extracts authoritative lockout timestamps and the originating caller computer name.
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border-color bg-[var(--bg-background)]/50 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center gap-1">
                                <Wifi size={12} /> Step 2: ISE PSN Pivot
                            </span>
                            <p className="text-[11px] text-text-secondary leading-snug">
                                Identifies wireless 802.1X EAP spam from mobile devices across ise-psn01 through 04.
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-border-color bg-[var(--bg-background)]/50 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                                <Laptop size={12} /> Step 3: Workstation Isolation
                            </span>
                            <p className="text-[11px] text-text-secondary leading-snug">
                                Pinpoints RDP sessions (Logon Type 10), mapped shares (Type 3), or scheduled tasks.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Investigation Results */}
            {!loading && data && (
                <div className="space-y-6 animate-in fade-in duration-150">
                    {/* Metrics Ribbon */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {/* Metric 1: Lockout Status */}
                        <div className={`p-4 rounded-xl border ${
                            data.hasLockout
                                ? "border-rose-500/40 bg-rose-950/20"
                                : "border-emerald-500/40 bg-emerald-950/20"
                        } flex flex-col justify-between`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Lockout State (4740)
                                </span>
                                {data.hasLockout ? (
                                    <AlertCircle size={16} className="text-rose-400" />
                                ) : (
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                )}
                            </div>
                            <div className="mt-2">
                                <div className={`text-xl font-bold font-mono ${data.hasLockout ? "text-rose-400" : "text-emerald-400"}`}>
                                    {data.hasLockout ? `${data.lockoutCount} LOCKOUT EVENT${data.lockoutCount > 1 ? 'S' : ''}` : "NO LOCKOUTS"}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    {data.latestLockoutTimestamp 
                                        ? `Last: ${new Date(data.latestLockoutTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                                        : `Within last ${data.rangeHours} hours`}
                                </div>
                            </div>
                        </div>

                        {/* Metric 2: Primary Culprit */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Identified Culprit
                                </span>
                                {data.primaryCulprit.isIsePsn ? (
                                    <Wifi size={16} className="text-cyan-400" />
                                ) : (
                                    <Laptop size={16} className="text-indigo-400" />
                                )}
                            </div>
                            <div className="mt-2">
                                <div className="text-lg font-bold font-mono text-cyan-300 truncate" title={data.primaryCulprit.callerName}>
                                    {data.primaryCulprit.callerName}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    {data.primaryCulprit.isIsePsn ? "Cisco ISE Wireless (EAP)" : "Windows Workstation / Host"}
                                </div>
                            </div>
                        </div>

                        {/* Metric 3: Total Failure Events */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Total Failures (4625/4771)
                                </span>
                                <Clock size={16} className="text-amber-400" />
                            </div>
                            <div className="mt-2">
                                <div className="text-xl font-bold font-mono text-amber-400">
                                    {data.totalFailureEvents.toLocaleString()}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    Across {data.uniqueCallers.length || 1} unique calling device(s)
                                </div>
                            </div>
                        </div>

                        {/* Metric 4: User & Action */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                                    Queried Target
                                </span>
                                <button
                                    onClick={handleExportCsv}
                                    title="Export full event audit stream to CSV"
                                    className="text-xs text-accent-primary hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <Download size={13} />
                                    <span>Export CSV</span>
                                </button>
                            </div>
                            <div className="mt-2">
                                <div className="text-lg font-bold font-mono text-text-primary truncate">
                                    {data.searchedUser}
                                </div>
                                <div className="text-[11px] text-text-secondary mt-0.5">
                                    Window: Last {data.rangeHours} hour{data.rangeHours > 1 ? "s" : ""}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Executive Verdict Banner */}
                    <div className={`p-4 rounded-xl border ${
                        data.hasLockout
                            ? "border-rose-500/40 bg-rose-950/15"
                            : data.totalFailureEvents > 0
                            ? "border-amber-500/40 bg-amber-950/15"
                            : "border-emerald-500/40 bg-emerald-950/15"
                    } space-y-3`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Shield size={16} className={data.hasLockout ? "text-rose-400" : "text-emerald-400"} />
                                    <h3 className="text-sm font-bold text-text-primary">
                                        Executive Root Cause Verdict
                                    </h3>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                        data.hasLockout
                                            ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                            : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                    }`}>
                                        {data.rootCauseCategory.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <p className="text-xs text-text-primary leading-relaxed">
                                    {data.executiveSummary}
                                </p>
                            </div>
                        </div>

                        {/* Remediation Callout */}
                        <div className="p-3 rounded-lg bg-[var(--bg-background)]/80 border border-border-color/80 flex items-start gap-2.5 text-xs text-text-secondary">
                            <Info size={14} className="text-accent-primary shrink-0 mt-0.5" />
                            <div>
                                <strong className="text-text-primary">Actionable Recommendation: </strong>
                                {data.recommendation}
                            </div>
                        </div>
                    </div>

                    {/* Deep-Dive Culprit Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Card 1: Wireless EAP / Cisco ISE Diagnostic */}
                        {data.primaryCulprit.isIsePsn && (
                            <div className="p-4 rounded-xl border border-cyan-500/30 bg-cyan-950/15 space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <Wifi size={14} className="text-cyan-400" />
                                        Cisco ISE Wireless Forensics ({data.primaryCulprit.callerName})
                                    </span>
                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                        Source: {data.primaryCulprit.iseDetails?.source === "ISE_MNT" ? "Live ISE MnT" : "Graylog ISE 3.0"}
                                    </span>
                                </div>

                                {data.primaryCulprit.iseDetails ? (
                                    <div className="space-y-3 text-xs">
                                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Client MAC Address</span>
                                                <div className="flex items-center justify-between mt-0.5">
                                                    <span className="text-cyan-300 font-bold">{data.primaryCulprit.iseDetails.endpointMac}</span>
                                                    <button
                                                        onClick={() => handleCopy(data.primaryCulprit.iseDetails!.endpointMac, "mac")}
                                                        className="text-text-muted hover:text-white"
                                                        title="Copy MAC"
                                                    >
                                                        {copiedId === "mac" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Connected SSID</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate">
                                                    {data.primaryCulprit.iseDetails.ssid}
                                                </span>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Access Point (AP)</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate" title={data.primaryCulprit.iseDetails.apName}>
                                                    {data.primaryCulprit.iseDetails.apName}
                                                </span>
                                            </div>

                                            <div className="p-2 rounded bg-black/40 border border-border-color">
                                                <span className="text-text-muted block text-[10px] uppercase">Device / Endpoint Profile</span>
                                                <span className="text-text-primary font-bold mt-0.5 block truncate">
                                                    {data.primaryCulprit.iseDetails.deviceProfile || "Standard 802.1X Client"}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-2.5 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">EAP Failure Reason</span>
                                            <span className="text-rose-400 font-mono text-[11px] mt-0.5 block">
                                                {data.primaryCulprit.iseDetails.failureReason}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-6 text-center text-text-muted text-xs">
                                        ISE PSN detected in AD events. Live auth record expired or rolling over in ISE MnT.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Card 2: Workstation Diagnostics */}
                        {!data.primaryCulprit.isIsePsn && data.primaryCulprit.workstationDetails && (
                            <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/15 space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                        <Laptop size={14} className="text-indigo-400" />
                                        Workstation / Host Diagnostics ({data.primaryCulprit.callerName})
                                    </span>
                                    {data.primaryCulprit.workstationDetails.logonTypeDesc && (
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                            {data.primaryCulprit.workstationDetails.logonTypeDesc}
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-3 text-xs">
                                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                        <div className="p-2 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">Computer Name</span>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-indigo-300 font-bold">{data.primaryCulprit.workstationDetails.hostname}</span>
                                                <button
                                                    onClick={() => handleCopy(data.primaryCulprit.workstationDetails!.hostname, "pc")}
                                                    className="text-text-muted hover:text-white"
                                                    title="Copy Hostname"
                                                >
                                                    {copiedId === "pc" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-2 rounded bg-black/40 border border-border-color">
                                            <span className="text-text-muted block text-[10px] uppercase">IP Address</span>
                                            <span className="text-text-primary font-bold mt-0.5 block">
                                                {data.primaryCulprit.workstationDetails.ipAddress || "Resolved via DC"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-2.5 rounded bg-black/40 border border-border-color">
                                        <span className="text-text-muted block text-[10px] uppercase">Probable Cause</span>
                                        <span className="text-text-primary text-[11px] mt-0.5 block">
                                            {data.primaryCulprit.workstationDetails.likelyCause}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Caller Distribution Card */}
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                            <span className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                                <Layers size={14} className="text-accent-primary" />
                                All Calling Devices Seen in Time Window ({data.uniqueCallers.length})
                            </span>
                            <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                                {data.uniqueCallers.map((caller, idx) => {
                                    const isIse = /ise-psn0[1-4]/i.test(caller);
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--bg-background)] border border-border-color text-xs">
                                            <div className="flex items-center gap-2">
                                                {isIse ? <Wifi size={13} className="text-cyan-400" /> : <Laptop size={13} className="text-indigo-400" />}
                                                <span className="font-mono font-bold text-text-primary">{caller}</span>
                                            </div>
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                                isIse ? "bg-cyan-500/20 text-cyan-300" : "bg-zinc-800 text-zinc-300"
                                            }`}>
                                                {isIse ? "ISE Wireless PSN" : "Workstation / DC"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Timeline Activity Chart */}
                    {data.timeline.length > 0 && (
                        <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-text-primary flex items-center gap-1.5 uppercase tracking-wider">
                                    <Clock size={14} className="text-accent-primary" />
                                    Failure Frequency & Lockout Timeline
                                </span>
                                <span className="text-[11px] text-text-muted">
                                    {data.timeline.length} interval data points
                                </span>
                            </div>

                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={data.timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="failedLogonsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="lockoutsGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.6} />
                                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" opacity={0.3} />
                                        <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                                        <YAxis stroke="var(--text-muted)" fontSize={10} allowDecimals={false} />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: "var(--bg-surface)",
                                                borderColor: "var(--border-color)",
                                                borderRadius: "8px",
                                                fontSize: "12px"
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                                        <Area
                                            type="monotone"
                                            dataKey="failedLogons"
                                            stroke="#f59e0b"
                                            strokeWidth={2}
                                            fillOpacity={1}
                                            fill="url(#failedLogonsGrad)"
                                            name="Logon Failures (4625/4771/4776)"
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="lockouts"
                                            stroke="#ef4444"
                                            strokeWidth={3}
                                            fillOpacity={1}
                                            fill="url(#lockoutsGrad)"
                                            name="Lockouts (4740)"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    )}

                    {/* Detailed Event Stream Table */}
                    <div className="p-4 rounded-xl border border-border-color bg-[var(--bg-surface)] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Terminal size={16} className="text-indigo-400" />
                                <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                                    Correlated Active Directory Event Stream ({filteredEvents.length})
                                </h3>
                            </div>

                            {/* Filters */}
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    type="text"
                                    value={tableSearch}
                                    onChange={(e) => setTableSearch(e.target.value)}
                                    placeholder="Filter by caller, DC, IP..."
                                    className="px-2.5 py-1 text-xs rounded-lg border border-border-color bg-[var(--bg-background)] text-text-primary focus:outline-none focus:border-accent-primary font-mono w-44"
                                />

                                <div className="flex items-center gap-1 bg-[var(--bg-background)] p-0.5 rounded-lg border border-border-color text-[11px] font-mono">
                                    {[
                                        { id: "all", label: "All" },
                                        { id: "4740", label: "4740 (Lockout)" },
                                        { id: "4625", label: "4625 (Fail)" },
                                        { id: "4771", label: "4771 (Kerb)" },
                                        { id: "4776", label: "4776 (NTLM)" }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setEventFilter(tab.id as any)}
                                            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                                                eventFilter === tab.id
                                                    ? "bg-accent-primary text-white font-bold"
                                                    : "text-text-secondary hover:text-text-primary"
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="border border-border-color rounded-xl overflow-hidden text-xs">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-[var(--bg-surface-hover)] border-b border-border-color text-text-secondary text-[11px] uppercase tracking-wider">
                                        <tr>
                                            <th className="p-2.5">Time</th>
                                            <th className="p-2.5">Event</th>
                                            <th className="p-2.5">Caller / Machine</th>
                                            <th className="p-2.5">Source IP</th>
                                            <th className="p-2.5">Domain Controller</th>
                                            <th className="p-2.5">Logon Type / Status</th>
                                            <th className="p-2.5 text-right">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-color/60 font-mono text-[11px]">
                                        {filteredEvents.map((ev) => {
                                            const isExpanded = expandedEventId === ev.id;
                                            const isLockout = ev.eventId === "4740";
                                            return (
                                                <tr 
                                                    key={ev.id} 
                                                    className={`hover:bg-[var(--bg-surface-hover)]/60 cursor-pointer transition-colors ${
                                                        isLockout ? "bg-rose-950/15" : ""
                                                    }`}
                                                    onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                                                >
                                                    <td className="p-2.5 text-text-secondary whitespace-nowrap">
                                                        {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                    </td>
                                                    <td className="p-2.5 whitespace-nowrap">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                            isLockout
                                                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                                                : ev.eventId === "4625"
                                                                ? "bg-amber-500/20 text-amber-300"
                                                                : "bg-indigo-500/20 text-indigo-300"
                                                        }`}>
                                                            {ev.eventId}
                                                        </span>
                                                    </td>
                                                    <td className="p-2.5 text-cyan-300 font-bold whitespace-nowrap">
                                                        {ev.callerDevice}
                                                    </td>
                                                    <td className="p-2.5 text-text-muted whitespace-nowrap">
                                                        {ev.sourceIp}
                                                    </td>
                                                    <td className="p-2.5 text-text-secondary whitespace-nowrap">
                                                        {ev.domainController}
                                                    </td>
                                                    <td className="p-2.5 text-text-secondary max-w-xs truncate" title={ev.subStatusDesc || ev.logonTypeDesc}>
                                                        {ev.subStatusDesc || ev.logonTypeDesc || (ev.subStatus ? `Code ${ev.subStatus}` : "-")}
                                                    </td>
                                                    <td className="p-2.5 text-right whitespace-nowrap text-text-muted">
                                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Collapsible Raw Message Drawer */}
                        {expandedEventId && (() => {
                            const selected = filteredEvents.find(e => e.id === expandedEventId);
                            if (!selected) return null;
                            return (
                                <div className="p-4 rounded-xl border border-indigo-500/30 bg-black/80 space-y-2 font-mono text-xs animate-in fade-in duration-100">
                                    <div className="flex items-center justify-between">
                                        <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                                            <Terminal size={13} />
                                            Raw Windows Security Event ({selected.eventId} - {selected.domainController})
                                        </span>
                                        <button
                                            onClick={() => handleCopy(selected.rawMessage, "raw")}
                                            className="text-text-muted hover:text-white flex items-center gap-1 text-[11px]"
                                        >
                                            {copiedId === "raw" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                            <span>{copiedId === "raw" ? "Copied" : "Copy Raw Log"}</span>
                                        </button>
                                    </div>
                                    <pre className="text-[11px] text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed p-3 bg-black/90 rounded-lg border border-white/5 max-h-72 overflow-y-auto">
                                        {selected.rawMessage}
                                    </pre>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
