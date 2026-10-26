"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
    Archive, ShieldAlert, AlertTriangle, CheckCircle2, Clock, 
    Search, Filter, Plus, FileText, ChevronRight, ArrowLeft, 
    ExternalLink, Download, ShieldCheck, Eye, Trash2, Calendar, 
    User, Network, Server, Layers, Cpu, CheckSquare, Sparkles, RefreshCw
} from "lucide-react";
import Link from "next/link";
import { IncidentWizardModal } from "./IncidentWizardModal";

interface IncidentItem {
    id: string;
    incidentNumber: string;
    title: string;
    severity: string;
    category: string;
    status: string;
    leadInvestigator?: string;
    threatActor?: string;
    attackVector?: string;
    impactedSystems: string[];
    startedAt: string;
    containedAt?: string | null;
    closedAt?: string | null;
    executiveSummary: string;
    rootCause?: string | null;
    impactAssessment?: string | null;
    metricsSummary?: any;
    indicators?: any[];
    sanitized: boolean;
    createdAt: string;
    _count?: {
        timeline: number;
        evidence: number;
        actions: number;
    };
    timeline?: any[];
    evidence?: any[];
    actions?: any[];
}

export function IncidentArchiveClient() {
    const [incidents, setIncidents] = useState<IncidentItem[]>([]);
    const [metrics, setMetrics] = useState<any>({
        total: 0,
        criticalHigh: 0,
        contained: 0,
        closed: 0,
        investigating: 0
    });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [severityFilter, setSeverityFilter] = useState("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [selectedIncident, setSelectedIncident] = useState<IncidentItem | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    // Fetch list of incidents
    const fetchIncidents = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append("search", search);
            if (severityFilter !== "ALL") params.append("severity", severityFilter);
            if (statusFilter !== "ALL") params.append("status", statusFilter);

            const res = await fetch(`/api/admin/incidents?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                setIncidents(data.incidents || []);
                if (data.metrics) setMetrics(data.metrics);
            }
        } catch (e) {
            console.error("Failed to load incidents:", e);
        } finally {
            setLoading(false);
        }
    }, [search, severityFilter, statusFilter]);

    useEffect(() => {
        fetchIncidents();
    }, [fetchIncidents]);

    // Load full detail of an incident
    const handleSelectIncident = async (id: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/admin/incidents/${id}`);
            if (res.ok) {
                const data = await res.json();
                setSelectedIncident(data.incident);
            }
        } catch (e) {
            console.error("Failed to fetch incident details:", e);
        } finally {
            setLoadingDetail(false);
        }
    };

    // Severity Badge Helper
    const renderSeverityBadge = (severity: string) => {
        switch (severity.toUpperCase()) {
            case "CRITICAL":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                        CRITICAL
                    </span>
                );
            case "HIGH":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/20 text-orange-300 border border-orange-500/40">
                        HIGH
                    </span>
                );
            case "MEDIUM":
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        MEDIUM
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-500/20 text-slate-300 border border-slate-500/30">
                        LOW
                    </span>
                );
        }
    };

    // Status Badge Helper
    const renderStatusBadge = (status: string) => {
        switch (status.toUpperCase()) {
            case "CONTAINED":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        CONTAINED
                    </span>
                );
            case "INVESTIGATING":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        <Clock className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                        INVESTIGATING
                    </span>
                );
            case "CLOSED":
            case "ARCHIVED":
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        <Archive className="w-3.5 h-3.5 text-purple-400" />
                        ARCHIVED
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-light pb-4">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                            <Archive className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-text-primary">
                                Enterprise Incident Archive & Post-Mortem Repository
                            </h1>
                            <p className="text-xs text-text-muted">
                                Historical security incident recounts, forensic timelines, and threat intelligence case files. Strict Sanitization & ADMIN Gated.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        New Incident Wizard
                    </button>
                    <button
                        onClick={fetchIncidents}
                        title="Refresh Repository"
                        className="p-2 rounded-lg bg-surface border border-border-light hover:bg-surface-elevated text-text-secondary transition-colors cursor-pointer"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-accent-primary" : ""}`} />
                    </button>
                </div>
            </div>

            {/* KPI Cards Banner */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl border border-border-light bg-surface flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Archived Cases</span>
                    <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-text-primary">{metrics.total}</span>
                        <Archive className="w-4 h-4 text-text-muted" />
                    </div>
                </div>

                <div className="p-3.5 rounded-xl border border-red-500/20 bg-red-500/5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-red-300 uppercase tracking-wider">Critical & High</span>
                    <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-red-400">{metrics.criticalHigh}</span>
                        <ShieldAlert className="w-4 h-4 text-red-400" />
                    </div>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">Contained</span>
                    <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-emerald-400">{metrics.contained}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </div>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-blue-300 uppercase tracking-wider">Active Investigations</span>
                    <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-blue-400">{metrics.investigating}</span>
                        <Clock className="w-4 h-4 text-blue-400" />
                    </div>
                </div>

                <div className="p-3.5 rounded-xl border border-border-light bg-surface flex flex-col justify-between">
                    <span className="text-[11px] font-medium text-text-muted uppercase tracking-wider">Closed / Resolved</span>
                    <div className="flex items-baseline justify-between mt-1">
                        <span className="text-2xl font-bold text-text-primary">{metrics.closed}</span>
                        <CheckSquare className="w-4 h-4 text-purple-400" />
                    </div>
                </div>
            </div>

            {/* DETAIL VIEW OR LIST VIEW */}
            {selectedIncident ? (
                /* INCIDENT CASE FILE DETAIL VIEW */
                <div className="space-y-6">
                    {/* Back Button & Actions */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setSelectedIncident(null)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border-light hover:bg-surface-elevated text-xs font-semibold text-text-secondary transition-colors cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            Back to Case Repository
                        </button>

                        <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-medium text-emerald-300">
                                <ShieldCheck className="w-3.5 h-3.5" />
                                SANITIZED GUARDRAIL SEALED
                            </span>
                        </div>
                    </div>

                    {/* Case Header Card */}
                    <div className="p-6 rounded-xl border border-border-light bg-surface space-y-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border-light pb-4">
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-elevated text-accent-primary border border-border-light">
                                        {selectedIncident.incidentNumber}
                                    </span>
                                    {renderSeverityBadge(selectedIncident.severity)}
                                    {renderStatusBadge(selectedIncident.status)}
                                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                                        {selectedIncident.category.replace(/_/g, " ")}
                                    </span>
                                </div>
                                <h2 className="text-xl font-bold text-text-primary mt-2">
                                    {selectedIncident.title}
                                </h2>
                            </div>

                            <div className="text-right text-xs text-text-muted space-y-1">
                                <div><strong>Lead:</strong> {selectedIncident.leadInvestigator || "Robert Rivera"}</div>
                                <div><strong>Started:</strong> {new Date(selectedIncident.startedAt).toLocaleDateString()} {new Date(selectedIncident.startedAt).toLocaleTimeString()}</div>
                                {selectedIncident.containedAt && (
                                    <div><strong>Contained:</strong> {new Date(selectedIncident.containedAt).toLocaleDateString()} {new Date(selectedIncident.containedAt).toLocaleTimeString()}</div>
                                )}
                            </div>
                        </div>

                        {/* High-Level Threat Metrics Grid */}
                        {selectedIncident.metricsSummary && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                                {selectedIncident.metricsSummary.totalFailedAttempts !== undefined && (
                                    <div className="p-3 rounded-lg bg-surface-elevated border border-border-light">
                                        <span className="text-[10px] text-text-muted uppercase font-semibold">Total Auth Failures</span>
                                        <div className="text-lg font-bold font-mono text-red-400 mt-0.5">
                                            {Number(selectedIncident.metricsSummary.totalFailedAttempts).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                {selectedIncident.metricsSummary.uniqueAttackerIps !== undefined && (
                                    <div className="p-3 rounded-lg bg-surface-elevated border border-border-light">
                                        <span className="text-[10px] text-text-muted uppercase font-semibold">Unique Attacker IPs</span>
                                        <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                                            {Number(selectedIncident.metricsSummary.uniqueAttackerIps).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                {selectedIncident.metricsSummary.targetedAccounts !== undefined && (
                                    <div className="p-3 rounded-lg bg-surface-elevated border border-border-light">
                                        <span className="text-[10px] text-text-muted uppercase font-semibold">Targeted Staff Accounts</span>
                                        <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                                            {Number(selectedIncident.metricsSummary.targetedAccounts).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                {selectedIncident.metricsSummary.unauthorizedBreaches !== undefined && (
                                    <div className="p-3 rounded-lg bg-surface-elevated border border-border-light">
                                        <span className="text-[10px] text-text-muted uppercase font-semibold">Compromises / Breaches</span>
                                        <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                                            {selectedIncident.metricsSummary.unauthorizedBreaches} (Zero)
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Impacted Systems */}
                        {selectedIncident.impactedSystems?.length > 0 && (
                            <div className="pt-2">
                                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Impacted Assets & Gateways:</span>
                                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                    {selectedIncident.impactedSystems.map((sys, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated text-text-primary text-xs border border-border-light font-mono">
                                            <Server className="w-3 h-3 text-accent-primary" />
                                            {sys}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Threat Narrative & Root Cause */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            {/* Executive Summary Narrative */}
                            <div className="p-6 rounded-xl border border-border-light bg-surface space-y-3">
                                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-accent-primary" />
                                    Executive Threat Narrative & Recount
                                </h3>
                                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
                                    {selectedIncident.executiveSummary}
                                </div>
                            </div>

                            {/* Attack Timeline */}
                            <div className="p-6 rounded-xl border border-border-light bg-surface space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-blue-400" />
                                        Forensic Attack Timeline ({selectedIncident.timeline?.length || 0} events)
                                    </h3>
                                    <span className="text-[11px] text-text-muted">Chronological order</span>
                                </div>

                                <div className="relative border-l-2 border-border-light ml-3 pl-4 space-y-6 my-2">
                                    {selectedIncident.timeline?.map((event: any, idx: number) => (
                                        <div key={idx} className="relative group">
                                            {/* Milestone Node */}
                                            <div className={`absolute -left-[23px] top-1 w-3.5 h-3.5 rounded-full border-2 ${
                                                event.isMilestone ? "bg-red-500 border-red-300" : "bg-surface border-text-muted"
                                            }`} />

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-xs font-semibold text-text-primary">
                                                        {new Date(event.timestamp).toLocaleDateString()} {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {event.source && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-elevated text-accent-primary border border-border-light">
                                                            {event.source}
                                                        </span>
                                                    )}
                                                    {event.isMilestone && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30">
                                                            KEY MILESTONE
                                                        </span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-bold text-text-primary">
                                                    {event.title}
                                                </h4>
                                                <p className="text-xs text-text-secondary leading-normal">
                                                    {event.description}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Containment & Remediation Checklist */}
                            <div className="p-6 rounded-xl border border-border-light bg-surface space-y-4">
                                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                                    <CheckSquare className="w-4 h-4 text-emerald-400" />
                                    Containment & Remediation Actions Taken
                                </h3>
                                <div className="space-y-2">
                                    {selectedIncident.actions?.map((act: any, idx: number) => (
                                        <div key={idx} className="p-3 rounded-lg border border-border-light bg-surface-elevated flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-2">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="text-xs text-text-primary font-medium">{act.action}</p>
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-text-muted">
                                                        <span>Owner: <strong>{act.owner || "Robert Rivera"}</strong></span>
                                                        <span>•</span>
                                                        <span>Category: {act.category}</span>
                                                        {act.completedAt && (
                                                            <>
                                                                <span>•</span>
                                                                <span>Completed: {new Date(act.completedAt).toLocaleDateString()}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 shrink-0">
                                                {act.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Sidebar: Threat Intel, Root Cause & IOC Matrix */}
                        <div className="space-y-6">
                            {/* Threat Actor & Attack Profile */}
                            <div className="p-5 rounded-xl border border-border-light bg-surface space-y-3">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Threat Profile</h4>
                                <div>
                                    <span className="text-[11px] text-text-muted">Threat Actor / Campaign:</span>
                                    <p className="text-xs font-semibold text-text-primary mt-0.5">{selectedIncident.threatActor || "Unknown"}</p>
                                </div>
                                <div className="pt-2">
                                    <span className="text-[11px] text-text-muted">Attack Vector:</span>
                                    <p className="text-xs text-text-secondary mt-0.5">{selectedIncident.attackVector || "N/A"}</p>
                                </div>
                            </div>

                            {/* Technical Root Cause */}
                            {selectedIncident.rootCause && (
                                <div className="p-5 rounded-xl border border-border-light bg-surface space-y-2">
                                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Root Cause Analysis</h4>
                                    <p className="text-xs text-text-secondary leading-relaxed">{selectedIncident.rootCause}</p>
                                </div>
                            )}

                            {/* Indicators of Compromise (IOC) Matrix */}
                            <div className="p-5 rounded-xl border border-border-light bg-surface space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Key Indicators (IOCs)</h4>
                                    <Link
                                        href="/queries/firewall"
                                        className="text-[11px] text-accent-primary hover:underline flex items-center gap-0.5"
                                    >
                                        Threat Hub <ExternalLink className="w-3 h-3" />
                                    </Link>
                                </div>

                                <div className="space-y-2">
                                    {selectedIncident.indicators?.map((ioc: any, idx: number) => (
                                        <div key={idx} className="p-2.5 rounded-lg border border-border-light bg-surface-elevated text-xs space-y-1">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono font-bold text-text-primary">{ioc.value}</span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                                    {ioc.type}
                                                </span>
                                            </div>
                                            {ioc.notes && (
                                                <p className="text-[11px] text-text-muted">{ioc.notes}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Evidence & Forensic Artifacts */}
                            {selectedIncident.evidence && selectedIncident.evidence.length > 0 && (
                                <div className="p-5 rounded-xl border border-border-light bg-surface space-y-3">
                                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Evidence Vault ({selectedIncident.evidence.length})</h4>
                                    <div className="space-y-2">
                                        {selectedIncident.evidence.map((ev: any, idx: number) => (
                                            <div key={idx} className="p-2.5 rounded-lg border border-border-light bg-surface-elevated flex items-start gap-2.5">
                                                <div className="p-1.5 rounded bg-surface border border-border-light text-accent-primary shrink-0">
                                                    <FileText className="w-4 h-4" />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-xs font-bold text-text-primary truncate">{ev.title}</p>
                                                    <p className="text-[11px] text-text-muted truncate">{ev.fileName || ev.sourceVendor || "Evidence Artifact"}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                /* INCIDENTS LIST VIEW */
                <div className="space-y-4">
                    {/* Filter & Search Bar */}
                    <div className="p-4 rounded-xl border border-border-light bg-surface flex flex-col md:flex-row gap-3 items-center justify-between">
                        <div className="relative flex-1 w-full">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-text-muted" />
                            <input
                                type="text"
                                placeholder="Search by Case ID, incident title, threat actor, or vector..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            <select
                                value={severityFilter}
                                onChange={(e) => setSeverityFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                            >
                                <option value="ALL">All Severities</option>
                                <option value="CRITICAL">Critical</option>
                                <option value="HIGH">High</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="LOW">Low</option>
                            </select>

                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="CONTAINED">Contained</option>
                                <option value="INVESTIGATING">Investigating</option>
                                <option value="CLOSED">Closed / Archived</option>
                            </select>
                        </div>
                    </div>

                    {/* Incidents Table / Cards */}
                    {loading ? (
                        <div className="p-12 text-center text-text-muted space-y-2">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent-primary" />
                            <p className="text-xs">Loading incident case repository...</p>
                        </div>
                    ) : incidents.length === 0 ? (
                        <div className="p-12 text-center rounded-xl border border-dashed border-border-light bg-surface space-y-3">
                            <Archive className="w-8 h-8 text-text-muted mx-auto" />
                            <h3 className="text-sm font-bold text-text-primary">No Incident Cases Found</h3>
                            <p className="text-xs text-text-muted max-w-md mx-auto">
                                No security incidents matched your search criteria. Create a new case file using the 7-step Incident Wizard.
                            </p>
                            <button
                                onClick={() => setIsWizardOpen(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                Launch Incident Wizard
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {incidents.map((incident) => (
                                <div
                                    key={incident.id}
                                    onClick={() => handleSelectIncident(incident.id)}
                                    className="p-5 rounded-xl border border-border-light bg-surface hover:bg-surface-elevated/70 transition-all cursor-pointer group space-y-3"
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-elevated text-accent-primary border border-border-light">
                                                {incident.incidentNumber}
                                            </span>
                                            {renderSeverityBadge(incident.severity)}
                                            {renderStatusBadge(incident.status)}
                                            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                                                {incident.category.replace(/_/g, " ")}
                                            </span>
                                        </div>

                                        <div className="text-xs text-text-muted font-mono flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {new Date(incident.startedAt).toLocaleDateString()}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-base font-bold text-text-primary group-hover:text-accent-primary transition-colors">
                                            {incident.title}
                                        </h3>
                                        <p className="text-xs text-text-secondary line-clamp-2 mt-1">
                                            {incident.executiveSummary}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-border-light text-xs text-text-muted flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <span>Lead: <strong className="text-text-primary font-medium">{incident.leadInvestigator || "Robert Rivera"}</strong></span>
                                            {incident._count && (
                                                <>
                                                    <span>•</span>
                                                    <span>Timeline: <strong>{incident._count.timeline}</strong></span>
                                                    <span>•</span>
                                                    <span>Actions: <strong>{incident._count.actions}</strong></span>
                                                </>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 text-accent-primary font-semibold group-hover:translate-x-1 transition-transform">
                                            <span>Open Case File</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 7-Step Incident Wizard Modal */}
            {isWizardOpen && (
                <IncidentWizardModal
                    isOpen={isWizardOpen}
                    onClose={() => setIsWizardOpen(false)}
                    onCreated={() => {
                        setIsWizardOpen(false);
                        fetchIncidents();
                    }}
                />
            )}
        </div>
    );
}
