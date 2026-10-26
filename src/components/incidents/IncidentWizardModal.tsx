"use client";

import React, { useState } from "react";
import { 
    X, ShieldAlert, CheckCircle2, ChevronRight, ChevronLeft, 
    Calendar, User, Server, FileText, Clock, Plus, Trash2, 
    ShieldCheck, AlertTriangle, Sparkles, RefreshCw, Upload, Lock
} from "lucide-react";

interface IncidentWizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
}

export function IncidentWizardModal({ isOpen, onClose, onCreated }: IncidentWizardModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");

    // Form Data State
    const [formData, setFormData] = useState({
        incidentNumber: "",
        title: "",
        severity: "HIGH",
        category: "BOTNET_BRUTE_FORCE",
        status: "CONTAINED",
        leadInvestigator: "Robert Rivera",
        startedAt: new Date().toISOString().slice(0, 16),
        containedAt: new Date().toISOString().slice(0, 16),
        threatActor: "",
        attackVector: "",
        impactedSystems: ["Cisco AnyConnect VPN", "Citrix NetScaler ADC"],
        executiveSummary: "",
        rootCause: "",
        impactAssessment: "",
        metricsSummary: {
            totalFailedAttempts: "",
            uniqueAttackerIps: "",
            targetedAccounts: "",
            blacklistedAsns: ""
        },
        timeline: [
            {
                timestamp: new Date().toISOString().slice(0, 16),
                title: "Initial Alert Triggered",
                description: "Spike in failed authentication requests detected on perimeter ingress gateway.",
                source: "Graylog",
                isMilestone: true,
                severity: "HIGH"
            }
        ],
        indicators: [
            { type: "ASN", value: "", notes: "" }
        ],
        actions: [
            {
                action: "Enforce dynamic Layer 3/4 edge shun on malicious ingress nodes",
                owner: "Robert Rivera",
                status: "COMPLETED",
                category: "CONTAINMENT"
            }
        ],
        sanitizationChecks: {
            noPasswords: false,
            noHashes: false,
            noPhiOrPatientData: false,
            corporateFormatVerified: false,
            leadSignoff: false
        }
    });

    if (!isOpen) return null;

    const steps = [
        { num: 1, title: "Identification" },
        { num: 2, title: "Attack Profile" },
        { num: 3, title: "Narrative" },
        { num: 4, title: "Timeline" },
        { num: 5, title: "Indicators" },
        { num: 6, title: "Remediation" },
        { num: 7, title: "Sanitization" }
    ];

    // Helper to add timeline item
    const handleAddTimelineItem = () => {
        setFormData({
            ...formData,
            timeline: [
                ...formData.timeline,
                {
                    timestamp: new Date().toISOString().slice(0, 16),
                    title: "",
                    description: "",
                    source: "Internal Telemetry",
                    isMilestone: false,
                    severity: "INFO"
                }
            ]
        });
    };

    // Helper to remove timeline item
    const handleRemoveTimelineItem = (idx: number) => {
        setFormData({
            ...formData,
            timeline: formData.timeline.filter((_, i) => i !== idx)
        });
    };

    // Helper to add indicator item
    const handleAddIndicator = () => {
        setFormData({
            ...formData,
            indicators: [...formData.indicators, { type: "IP", value: "", notes: "" }]
        });
    };

    // Helper to remove indicator item
    const handleRemoveIndicator = (idx: number) => {
        setFormData({
            ...formData,
            indicators: formData.indicators.filter((_, i) => i !== idx)
        });
    };

    // Helper to add action item
    const handleAddAction = () => {
        setFormData({
            ...formData,
            actions: [
                ...formData.actions,
                {
                    action: "",
                    owner: formData.leadInvestigator || "Robert Rivera",
                    status: "COMPLETED",
                    category: "CONTAINMENT"
                }
            ]
        });
    };

    // Helper to remove action item
    const handleRemoveAction = (idx: number) => {
        setFormData({
            ...formData,
            actions: formData.actions.filter((_, i) => i !== idx)
        });
    };

    // All sanitization checks passed?
    const isSanitizationComplete = 
        formData.sanitizationChecks.noPasswords &&
        formData.sanitizationChecks.noHashes &&
        formData.sanitizationChecks.noPhiOrPatientData &&
        formData.sanitizationChecks.corporateFormatVerified &&
        formData.sanitizationChecks.leadSignoff;

    // Submit handler
    const handleSubmit = async () => {
        if (!isSanitizationComplete) {
            setErrorMessage("All 5 Sanitization Guardrail criteria must be certified clean before logging this incident.");
            return;
        }

        setSubmitting(true);
        setErrorMessage("");

        try {
            const payload = {
                incidentNumber: formData.incidentNumber.trim() || undefined,
                title: formData.title.trim(),
                severity: formData.severity,
                category: formData.category,
                status: formData.status,
                leadInvestigator: formData.leadInvestigator.trim(),
                startedAt: formData.startedAt,
                containedAt: formData.containedAt || null,
                threatActor: formData.threatActor.trim() || null,
                attackVector: formData.attackVector.trim() || null,
                impactedSystems: formData.impactedSystems,
                executiveSummary: formData.executiveSummary.trim(),
                rootCause: formData.rootCause.trim() || null,
                impactAssessment: formData.impactAssessment.trim() || null,
                metricsSummary: {
                    totalFailedAttempts: Number(formData.metricsSummary.totalFailedAttempts) || undefined,
                    uniqueAttackerIps: Number(formData.metricsSummary.uniqueAttackerIps) || undefined,
                    targetedAccounts: Number(formData.metricsSummary.targetedAccounts) || undefined,
                    blacklistedAsns: Number(formData.metricsSummary.blacklistedAsns) || undefined,
                    unauthorizedBreaches: 0
                },
                timeline: formData.timeline.filter(t => t.title.trim()),
                indicators: formData.indicators.filter(i => i.value.trim()),
                actions: formData.actions.filter(a => a.action.trim()),
                sanitized: true
            };

            const res = await fetch("/api/admin/incidents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                setErrorMessage(data.error || "Failed to save incident case.");
            } else {
                onCreated();
            }
        } catch (e: any) {
            setErrorMessage(e.message || "Failed to submit incident.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-surface border border-border-light rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between bg-surface-elevated">
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-text-primary">
                                Incident Post-Mortem Wizard (7-Step Guided Process)
                            </h2>
                            <p className="text-[11px] text-text-muted">
                                Step {currentStep} of 7: {steps[currentStep - 1].title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Stepper Progress Bar */}
                <div className="px-6 py-3 border-b border-border-light bg-surface flex items-center justify-between gap-1 overflow-x-auto">
                    {steps.map((s) => (
                        <button
                            key={s.num}
                            onClick={() => setCurrentStep(s.num)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded transition-colors whitespace-nowrap cursor-pointer ${
                                currentStep === s.num
                                    ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40"
                                    : currentStep > s.num
                                    ? "text-emerald-400 hover:bg-surface-elevated"
                                    : "text-text-muted hover:bg-surface-elevated"
                            }`}
                        >
                            <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                currentStep === s.num
                                    ? "bg-accent-primary text-black"
                                    : currentStep > s.num
                                    ? "bg-emerald-500 text-black"
                                    : "bg-surface-elevated text-text-muted border border-border-light"
                            }`}>
                                {s.num}
                            </span>
                            <span>{s.title}</span>
                        </button>
                    ))}
                </div>

                {/* Form Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {errorMessage && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* STEP 1: IDENTIFICATION */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-accent-primary" /> Case Identification & Classification
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Incident Title *</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Distributed Residential Proxy Botnet & Credential Spray"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Case ID / Incident Number</label>
                                    <input
                                        type="text"
                                        placeholder="Leave blank to auto-generate (e.g. INC-2026-1026-XXXX)"
                                        value={formData.incidentNumber}
                                        onChange={(e) => setFormData({ ...formData, incidentNumber: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Severity Level</label>
                                    <select
                                        value={formData.severity}
                                        onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    >
                                        <option value="CRITICAL">CRITICAL (Enterprise Perimeter / Outage Risk)</option>
                                        <option value="HIGH">HIGH (Targeted Campaign / High Volume)</option>
                                        <option value="MEDIUM">MEDIUM (Localized Probe / Moderate Friction)</option>
                                        <option value="LOW">LOW (Informational / Baseline Noise)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Incident Category</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    >
                                        <option value="BOTNET_BRUTE_FORCE">BOTNET BRUTE FORCE</option>
                                        <option value="CREDENTIAL_STUFFING">CREDENTIAL STUFFING</option>
                                        <option value="RANSOMWARE">RANSOMWARE / MALWARE</option>
                                        <option value="PHISHING">PHISHING / BEC</option>
                                        <option value="UNAUTHORIZED_ACCESS">UNAUTHORIZED ACCESS ATTEMPT</option>
                                        <option value="DATA_EXFILTRATION">DATA EXFILTRATION</option>
                                        <option value="DDoS">DISTRIBUTED DENIAL OF SERVICE (DDoS)</option>
                                        <option value="OTHER">OTHER</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Lead Security Investigator</label>
                                    <input
                                        type="text"
                                        value={formData.leadInvestigator}
                                        onChange={(e) => setFormData({ ...formData, leadInvestigator: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Current Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    >
                                        <option value="CONTAINED">CONTAINED (Mitigations Active)</option>
                                        <option value="INVESTIGATING">INVESTIGATING (Active Triage)</option>
                                        <option value="CLOSED">CLOSED (Resolved & Lessons Documented)</option>
                                        <option value="ARCHIVED">ARCHIVED (Historical Record)</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: ATTACK PROFILE & ASSETS */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                <Server className="w-4 h-4 text-accent-primary" /> Attack Profile & Impacted Gateways
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Attack Started Timestamp *</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.startedAt}
                                        onChange={(e) => setFormData({ ...formData, startedAt: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Contained Timestamp</label>
                                    <input
                                        type="datetime-local"
                                        value={formData.containedAt}
                                        onChange={(e) => setFormData({ ...formData, containedAt: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary font-mono focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Threat Actor / Campaign</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Distributed Residential Proxy Syndicate"
                                        value={formData.threatActor}
                                        onChange={(e) => setFormData({ ...formData, threatActor: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-semibold text-text-muted">Attack Vector</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Low-and-slow rotating residential proxy spray"
                                        value={formData.attackVector}
                                        onChange={(e) => setFormData({ ...formData, attackVector: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                                    />
                                </div>
                            </div>

                            <div className="pt-2">
                                <label className="text-xs font-semibold text-text-muted">Impacted Systems (Comma-separated)</label>
                                <input
                                    type="text"
                                    value={formData.impactedSystems.join(", ")}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        impactedSystems: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                                    })}
                                    placeholder="Cisco AnyConnect VPN, Citrix NetScaler ADC, Active Directory"
                                    className="w-full mt-1 px-3 py-2 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary font-mono"
                                />
                            </div>

                            {/* Estimated Metrics Summary */}
                            <div className="pt-2">
                                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2">Metrics Snapshot</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div>
                                        <label className="text-[11px] text-text-muted">Total Auth Failures</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 150000"
                                            value={formData.metricsSummary.totalFailedAttempts}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                metricsSummary: { ...formData.metricsSummary, totalFailedAttempts: e.target.value }
                                            })}
                                            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-xs text-red-400 font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-text-muted">Attacker IPs</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 80000"
                                            value={formData.metricsSummary.uniqueAttackerIps}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                metricsSummary: { ...formData.metricsSummary, uniqueAttackerIps: e.target.value }
                                            })}
                                            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-xs text-amber-400 font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-text-muted">Targeted Accounts</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 1240"
                                            value={formData.metricsSummary.targetedAccounts}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                metricsSummary: { ...formData.metricsSummary, targetedAccounts: e.target.value }
                                            })}
                                            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-xs text-cyan-400 font-mono font-bold"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] text-text-muted">Blacklisted ASNs</label>
                                        <input
                                            type="number"
                                            placeholder="e.g. 12"
                                            value={formData.metricsSummary.blacklistedAsns}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                metricsSummary: { ...formData.metricsSummary, blacklistedAsns: e.target.value }
                                            })}
                                            className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-surface-elevated border border-border-light text-xs text-purple-400 font-mono font-bold"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: EXECUTIVE NARRATIVE */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-accent-primary" /> Executive Threat Narrative & Impact
                            </h3>

                            <div>
                                <label className="text-xs font-semibold text-text-muted">Executive Summary Narrative *</label>
                                <textarea
                                    rows={6}
                                    placeholder="Write a clear, non-technical executive narrative summarizing what happened, how it was identified, and the defense outcome..."
                                    value={formData.executiveSummary}
                                    onChange={(e) => setFormData({ ...formData, executiveSummary: e.target.value })}
                                    className="w-full mt-1 p-3 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary leading-relaxed font-sans"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-text-muted">Technical Root Cause</label>
                                <textarea
                                    rows={3}
                                    placeholder="Describe the underlying technical gap, misconfiguration, or vulnerability..."
                                    value={formData.rootCause}
                                    onChange={(e) => setFormData({ ...formData, rootCause: e.target.value })}
                                    className="w-full mt-1 p-3 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary font-sans"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-text-muted">Impact Assessment</label>
                                <textarea
                                    rows={3}
                                    placeholder="Describe the organizational impact, staff lockouts, operational noise, or confirm zero data exfiltration..."
                                    value={formData.impactAssessment}
                                    onChange={(e) => setFormData({ ...formData, impactAssessment: e.target.value })}
                                    className="w-full mt-1 p-3 rounded-lg bg-surface-elevated border border-border-light text-xs text-text-primary focus:outline-none focus:border-accent-primary font-sans"
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 4: TIMELINE BUILDER */}
                    {currentStep === 4 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-blue-400" /> Chronological Forensic Timeline
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddTimelineItem}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated border border-border-light hover:bg-surface text-xs font-semibold text-accent-primary transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Timeline Event
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formData.timeline.map((item, idx) => (
                                    <div key={idx} className="p-3.5 rounded-lg border border-border-light bg-surface-elevated space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-1">
                                                <input
                                                    type="datetime-local"
                                                    value={item.timestamp}
                                                    onChange={(e) => {
                                                        const updated = [...formData.timeline];
                                                        updated[idx].timestamp = e.target.value;
                                                        setFormData({ ...formData, timeline: updated });
                                                    }}
                                                    className="px-2 py-1 rounded bg-surface border border-border-light text-xs font-mono text-text-primary"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Event Title (e.g. Ingress Velocity Anomaly Detected)"
                                                    value={item.title}
                                                    onChange={(e) => {
                                                        const updated = [...formData.timeline];
                                                        updated[idx].title = e.target.value;
                                                        setFormData({ ...formData, timeline: updated });
                                                    }}
                                                    className="flex-1 px-2.5 py-1 rounded bg-surface border border-border-light text-xs font-bold text-text-primary"
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => handleRemoveTimelineItem(idx)}
                                                className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-surface transition-colors cursor-pointer"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                placeholder="Source (e.g. Graylog, Cisco FMC, NetScaler ADC)"
                                                value={item.source}
                                                onChange={(e) => {
                                                    const updated = [...formData.timeline];
                                                    updated[idx].source = e.target.value;
                                                    setFormData({ ...formData, timeline: updated });
                                                }}
                                                className="w-48 px-2 py-1 rounded bg-surface border border-border-light text-xs font-mono text-text-primary"
                                            />
                                            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={item.isMilestone}
                                                    onChange={(e) => {
                                                        const updated = [...formData.timeline];
                                                        updated[idx].isMilestone = e.target.checked;
                                                        setFormData({ ...formData, timeline: updated });
                                                    }}
                                                    className="rounded border-border-light text-red-500 focus:ring-0"
                                                />
                                                <span>Key Milestone</span>
                                            </label>
                                        </div>

                                        <textarea
                                            rows={2}
                                            placeholder="Detailed description of forensic observations..."
                                            value={item.description}
                                            onChange={(e) => {
                                                const updated = [...formData.timeline];
                                                updated[idx].description = e.target.value;
                                                setFormData({ ...formData, timeline: updated });
                                            }}
                                            className="w-full p-2 rounded bg-surface border border-border-light text-xs text-text-primary leading-normal"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 5: INDICATORS (IOCs) */}
                    {currentStep === 5 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                    <Lock className="w-4 h-4 text-purple-400" /> Key Indicators of Compromise (IOCs)
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddIndicator}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated border border-border-light hover:bg-surface text-xs font-semibold text-accent-primary transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Indicator
                                </button>
                            </div>

                            <div className="space-y-2">
                                {formData.indicators.map((ioc, idx) => (
                                    <div key={idx} className="p-3 rounded-lg border border-border-light bg-surface-elevated flex items-center gap-3">
                                        <select
                                            value={ioc.type}
                                            onChange={(e) => {
                                                const updated = [...formData.indicators];
                                                updated[idx].type = e.target.value;
                                                setFormData({ ...formData, indicators: updated });
                                            }}
                                            className="px-2 py-1.5 rounded bg-surface border border-border-light text-xs font-mono font-bold text-text-primary"
                                        >
                                            <option value="ASN">ASN</option>
                                            <option value="IP">IP Address</option>
                                            <option value="CIDR">CIDR Subnet</option>
                                            <option value="DOMAIN">Domain</option>
                                        </select>

                                        <input
                                            type="text"
                                            placeholder="Value (e.g. AS7922 or 73.0.0.0/8)"
                                            value={ioc.value}
                                            onChange={(e) => {
                                                const updated = [...formData.indicators];
                                                updated[idx].value = e.target.value;
                                                setFormData({ ...formData, indicators: updated });
                                            }}
                                            className="flex-1 px-2.5 py-1.5 rounded bg-surface border border-border-light text-xs font-mono text-text-primary"
                                        />

                                        <input
                                            type="text"
                                            placeholder="Contextual Notes (e.g. Comcast residential pool)"
                                            value={ioc.notes}
                                            onChange={(e) => {
                                                const updated = [...formData.indicators];
                                                updated[idx].notes = e.target.value;
                                                setFormData({ ...formData, indicators: updated });
                                            }}
                                            className="flex-1 px-2.5 py-1.5 rounded bg-surface border border-border-light text-xs text-text-primary"
                                        />

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveIndicator(idx)}
                                            className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-surface transition-colors cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 6: REMEDIATION ACTIONS */}
                    {currentStep === 6 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Containment & Remediation Actions
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddAction}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-elevated border border-border-light hover:bg-surface text-xs font-semibold text-accent-primary transition-colors cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add Action Item
                                </button>
                            </div>

                            <div className="space-y-2">
                                {formData.actions.map((act, idx) => (
                                    <div key={idx} className="p-3 rounded-lg border border-border-light bg-surface-elevated flex items-start gap-3">
                                        <div className="flex-1 space-y-2">
                                            <input
                                                type="text"
                                                placeholder="Action taken (e.g. Deployed 3-strike residential reputation ledger to Cisco FMC)"
                                                value={act.action}
                                                onChange={(e) => {
                                                    const updated = [...formData.actions];
                                                    updated[idx].action = e.target.value;
                                                    setFormData({ ...formData, actions: updated });
                                                }}
                                                className="w-full px-2.5 py-1.5 rounded bg-surface border border-border-light text-xs font-medium text-text-primary"
                                            />
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Owner (e.g. Robert Rivera)"
                                                    value={act.owner}
                                                    onChange={(e) => {
                                                        const updated = [...formData.actions];
                                                        updated[idx].owner = e.target.value;
                                                        setFormData({ ...formData, actions: updated });
                                                    }}
                                                    className="px-2 py-1 rounded bg-surface border border-border-light text-xs text-text-primary"
                                                />
                                                <select
                                                    value={act.category}
                                                    onChange={(e) => {
                                                        const updated = [...formData.actions];
                                                        updated[idx].category = e.target.value;
                                                        setFormData({ ...formData, actions: updated });
                                                    }}
                                                    className="px-2 py-1 rounded bg-surface border border-border-light text-xs font-semibold text-text-primary"
                                                >
                                                    <option value="CONTAINMENT">CONTAINMENT</option>
                                                    <option value="ERADICATION">ERADICATION</option>
                                                    <option value="RECOVERY">RECOVERY</option>
                                                    <option value="LESSONS_LEARNED">LESSONS LEARNED</option>
                                                </select>
                                                <select
                                                    value={act.status}
                                                    onChange={(e) => {
                                                        const updated = [...formData.actions];
                                                        updated[idx].status = e.target.value;
                                                        setFormData({ ...formData, actions: updated });
                                                    }}
                                                    className="px-2 py-1 rounded bg-surface border border-border-light text-xs font-semibold text-emerald-400"
                                                >
                                                    <option value="COMPLETED">COMPLETED</option>
                                                    <option value="IN_PROGRESS">IN PROGRESS</option>
                                                    <option value="PENDING">PENDING</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleRemoveAction(idx)}
                                            className="p-1 rounded text-text-muted hover:text-red-400 hover:bg-surface transition-colors cursor-pointer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 7: SANITIZATION & GUARDRAILS */}
                    {currentStep === 7 && (
                        <div className="space-y-5">
                            <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2">
                                <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
                                    <ShieldCheck className="w-5 h-5 text-red-400" />
                                    Mandatory Information Security Sanitization Review
                                </div>
                                <p className="text-xs text-red-200/80 leading-relaxed">
                                    Before an incident is permanently committed into the Post-Mortem Archive, you must verify that all sensitive data is sanitized. Zero passwords, password hashes, Patient Health Information (PHI), or unnecessary personally identifiable information (PII) are permitted.
                                </p>
                            </div>

                            <div className="space-y-3 pt-2">
                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.sanitizationChecks.noPasswords}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            sanitizationChecks: { ...formData.sanitizationChecks, noPasswords: e.target.checked }
                                        })}
                                        className="mt-0.5 rounded border-border-light text-emerald-500 focus:ring-0"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-text-primary">Zero Plaintext Passwords or Credentials</p>
                                        <p className="text-[11px] text-text-muted">I certify that no passwords, API tokens, or session secrets are contained in the narratives, logs, or evidence.</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.sanitizationChecks.noHashes}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            sanitizationChecks: { ...formData.sanitizationChecks, noHashes: e.target.checked }
                                        })}
                                        className="mt-0.5 rounded border-border-light text-emerald-500 focus:ring-0"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-text-primary">Zero Password Hashes or NT Hashes</p>
                                        <p className="text-[11px] text-text-muted">I certify that no Kerberos tickets, NTLM hashes, or shadow password representations are included.</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.sanitizationChecks.noPhiOrPatientData}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            sanitizationChecks: { ...formData.sanitizationChecks, noPhiOrPatientData: e.target.checked }
                                        })}
                                        className="mt-0.5 rounded border-border-light text-emerald-500 focus:ring-0"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-text-primary">Zero Patient Health Information (PHI / HIPAA Compliance)</p>
                                        <p className="text-[11px] text-text-muted">I certify that no Medical Record Numbers (MRN), patient names, diagnosis codes, or clinical records are present.</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.sanitizationChecks.corporateFormatVerified}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            sanitizationChecks: { ...formData.sanitizationChecks, corporateFormatVerified: e.target.checked }
                                        })}
                                        className="mt-0.5 rounded border-border-light text-emerald-500 focus:ring-0"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-text-primary">Targeted Account De-identification or Sanitized Formats</p>
                                        <p className="text-[11px] text-text-muted">Employee identities are logged strictly in standard sanitized corporate username format or aggregated numbers.</p>
                                    </div>
                                </label>

                                <label className="flex items-start gap-3 p-3 rounded-lg border border-border-light bg-surface-elevated cursor-pointer hover:bg-surface transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.sanitizationChecks.leadSignoff}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            sanitizationChecks: { ...formData.sanitizationChecks, leadSignoff: e.target.checked }
                                        })}
                                        className="mt-0.5 rounded border-border-light text-emerald-500 focus:ring-0"
                                    />
                                    <div>
                                        <p className="text-xs font-bold text-text-primary">Lead Investigator Sign-off ({formData.leadInvestigator || "Robert Rivera"})</p>
                                        <p className="text-[11px] text-text-muted">I authorize this incident record for archive preservation in Pane-o-Glass Enterprise Repository.</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-border-light bg-surface-elevated flex items-center justify-between">
                    <div>
                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={() => setCurrentStep(currentStep - 1)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border-light hover:bg-surface-elevated text-xs font-semibold text-text-secondary transition-colors cursor-pointer"
                            >
                                <ChevronLeft className="w-4 h-4" /> Previous Step
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {currentStep < 7 ? (
                            <button
                                type="button"
                                onClick={() => setCurrentStep(currentStep + 1)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-black font-bold text-xs transition-colors cursor-pointer shadow-sm"
                            >
                                Next Step <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={submitting || !isSanitizationComplete}
                                className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-lg font-bold text-xs transition-colors shadow-sm cursor-pointer ${
                                    isSanitizationComplete && !submitting
                                        ? "bg-red-600 hover:bg-red-500 text-white"
                                        : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                                }`}
                            >
                                {submitting ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                        <span>Archiving Incident...</span>
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-4 h-4" />
                                        <span>Commit to Incident Archive</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
