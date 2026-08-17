"use client";

import React, { useState, useEffect } from "react";
import { 
    BellRing, Mail, Send, Plus, Sparkles, FileSpreadsheet, 
    CheckCircle2, AlertTriangle, Play, RefreshCw, Trash2, 
    Edit, Eye, Clock, Check, Users, ArrowRight, ShieldCheck, 
    ExternalLink, Layers, Search, Filter, KeyRound, AlertCircle, Copy, Lock, ShieldAlert
} from "lucide-react";
import { QueryHeader } from "@/components/queries/QueryHeader";
import RichTemplateEditor, { TemplateData } from "@/components/notifications/RichTemplateEditor";
import CsvUploadValidator from "@/components/notifications/CsvUploadValidator";
import { renderMergedText, TemplateVariables } from "@/lib/templateParser";

export default function NotificationCenterPage() {
    const [activeTab, setActiveTab] = useState<"campaigns" | "wizard" | "templates" | "history">("campaigns");
    
    // Campaigns state
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loadingCampaigns, setLoadingCampaigns] = useState(true);
    const [campaignFilter, setCampaignFilter] = useState<string>("ALL");

    // Templates state
    const [templates, setTemplates] = useState<TemplateData[]>([]);
    const [loadingTemplates, setLoadingTemplates] = useState(true);
    const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(null);
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);

    // Wizard state (for creating / editing a campaign)
    const [wizardData, setWizardData] = useState<{
        id?: string;
        name: string;
        breachName: string;
        templateId: string;
        sourceType: string;
        sourceQuery?: string;
        recipients: any[];
    }>({
        name: "",
        breachName: "",
        templateId: "",
        sourceType: "CSV_UPLOAD",
        sourceQuery: "",
        recipients: [],
    });

    // Test send modal / state
    const [testModalCampaign, setTestModalCampaign] = useState<any | null>(null);
    const [targetAdminEmail, setTargetAdminEmail] = useState("");
    const [selectedTestRecipientId, setSelectedTestRecipientId] = useState<string>("");
    const [sendingTest, setSendingTest] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; error?: string } | null>(null);

    // Dispatching state
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);
    const [actionNotice, setActionNotice] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // Inspect recipient list / delivery log modal
    const [viewingRecipientsCampaign, setViewingRecipientsCampaign] = useState<any | null>(null);
    const [loadingRecipientsLog, setLoadingRecipientsLog] = useState(false);
    const [recipientSearch, setRecipientSearch] = useState("");

    // Fetch initial campaigns & templates
    useEffect(() => {
        fetchCampaigns();
        fetchTemplates();
        checkStagedHandoff();
    }, []);

    // Check if user came directly from HIBP Domain with staged data in sessionStorage
    const checkStagedHandoff = () => {
        try {
            const stagedJson = sessionStorage.getItem("pane_staged_notification");
            if (stagedJson) {
                const parsed = JSON.parse(stagedJson);
                sessionStorage.removeItem("pane_staged_notification");
                if (parsed && Array.isArray(parsed.recipients) && parsed.recipients.length > 0) {
                    const extractedBreach = parsed.breachName || parsed.sourceQuery || parsed.recipients[0]?.breachName || "Data Breach Incident";
                    setWizardData({
                        name: parsed.name || `${extractedBreach} - Staff Notification`,
                        breachName: extractedBreach,
                        templateId: "",
                        sourceType: "HIBP_DOMAIN",
                        sourceQuery: parsed.sourceQuery || extractedBreach,
                        recipients: parsed.recipients,
                    });
                    setActiveTab("wizard");
                    setActionNotice({
                        type: "success",
                        message: `Successfully loaded ${parsed.recipients.length} impacted recipients for breach "${extractedBreach}"!`
                    });
                }
            }
        } catch (e) {
            console.error("Failed to check staged handoff", e);
        }
    };

    const fetchCampaigns = async () => {
        try {
            setLoadingCampaigns(true);
            const res = await fetch("/api/notifications/campaigns");
            if (res.ok) {
                const data = await res.json();
                setCampaigns(data);
            }
        } catch (e) {
            console.error("Failed to fetch campaigns", e);
        } finally {
            setLoadingCampaigns(false);
        }
    };

    const fetchTemplates = async () => {
        try {
            setLoadingTemplates(true);
            const res = await fetch("/api/notifications/templates");
            if (res.ok) {
                const data = await res.json();
                setTemplates(data);
                if (data.length > 0 && !wizardData.templateId) {
                    const activeFirst = data.find((t: any) => t.isEnabled !== false) || data[0];
                    setWizardData(prev => ({ ...prev, templateId: activeFirst.id }));
                }
            }
        } catch (e) {
            console.error("Failed to fetch templates", e);
        } finally {
            setLoadingTemplates(false);
        }
    };

    const handleSaveTemplate = async (tmpl: TemplateData) => {
        const method = tmpl.id ? "PUT" : "POST";
        const res = await fetch("/api/notifications/templates", {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tmpl),
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(err || "Failed to save template");
        }

        await fetchTemplates();
        setIsCreatingTemplate(false);
        setEditingTemplate(null);
    };

    const handleDeleteTemplate = async (id: string) => {
        if (!confirm("Are you sure you want to delete this template?")) return;
        try {
            const res = await fetch(`/api/notifications/templates?id=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchTemplates();
                setActionNotice({ type: "success", message: "Template deleted." });
            }
        } catch (e) {
            setActionNotice({ type: "error", message: "Failed to delete template." });
        }
    };

    const handleSaveWizardDraft = async () => {
        if (!wizardData.name.trim()) {
            setActionNotice({ type: "error", message: "Please provide a Campaign Name." });
            return;
        }
        if (wizardData.recipients.length === 0) {
            setActionNotice({ type: "error", message: "No recipients staged in this campaign." });
            return;
        }

        try {
            const res = await fetch("/api/notifications/campaigns", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...wizardData,
                    breachName: wizardData.breachName.trim() || wizardData.recipients[0]?.breachName || wizardData.sourceQuery || "Data Breach Incident",
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to save campaign draft.");
            }

            await fetchCampaigns();
            setActiveTab("campaigns");
            setActionNotice({ type: "success", message: "Campaign draft saved successfully!" });
        } catch (err: any) {
            setActionNotice({ type: "error", message: err.message || "Failed to save campaign." });
        }
    };

    const handleResumeCampaign = async (campaign: any) => {
        try {
            const res = await fetch(`/api/notifications/campaigns/${campaign.id}`);
            if (res.ok) {
                const full = await res.json();
                setWizardData({
                    id: full.id,
                    name: full.name,
                    breachName: full.breachName || full.sourceQuery || full.recipients?.[0]?.breachName || "",
                    templateId: full.templateId || (templates[0]?.id || ""),
                    sourceType: full.sourceType,
                    sourceQuery: full.sourceQuery || "",
                    recipients: full.recipients || [],
                });
                setActiveTab("wizard");
            }
        } catch (e) {
            setActionNotice({ type: "error", message: "Failed to resume campaign." });
        }
    };

    const handleDeleteCampaign = async (id: string) => {
        if (!confirm("Are you sure you want to delete this notification campaign?")) return;
        try {
            const res = await fetch(`/api/notifications/campaigns/${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchCampaigns();
                setActionNotice({ type: "success", message: "Campaign deleted." });
            }
        } catch (e) {
            setActionNotice({ type: "error", message: "Failed to delete campaign." });
        }
    };

    const handleOpenTestModal = async (campaign: any) => {
        try {
            const res = await fetch(`/api/notifications/campaigns/${campaign.id}`);
            if (res.ok) {
                const full = await res.json();
                setTestModalCampaign(full);
                setSelectedTestRecipientId(full.recipients?.[0]?.id || "");
                setTestResult(null);
            }
        } catch (e) {
            console.error("Failed to load campaign for test", e);
        }
    };

    const handleOpenDeliveryLog = async (campaign: any) => {
        try {
            setLoadingRecipientsLog(true);
            setViewingRecipientsCampaign(campaign); // Set temporary to open modal immediately
            const res = await fetch(`/api/notifications/campaigns/${campaign.id}`);
            if (res.ok) {
                const full = await res.json();
                setViewingRecipientsCampaign(full);
            }
        } catch (e) {
            console.error("Failed to fetch full campaign log", e);
        } finally {
            setLoadingRecipientsLog(false);
        }
    };

    const handleExecuteTestSend = async () => {
        if (!testModalCampaign) return;
        setSendingTest(true);
        setTestResult(null);

        try {
            const res = await fetch(`/api/notifications/campaigns/${testModalCampaign.id}/test-send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientId: selectedTestRecipientId || undefined,
                    targetAdminEmail: targetAdminEmail || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "Failed to send test email.");
            }

            setTestResult({
                success: true,
                message: data.message || "Test email sent successfully!",
            });
            fetchCampaigns();
        } catch (err: any) {
            setTestResult({
                success: false,
                message: err.message || "Failed to send test email.",
                error: err.message,
            });
        } finally {
            setSendingTest(false);
        }
    };

    const handleDispatchCampaign = async (campaign: any) => {
        if (!confirm(`Are you sure you want to APPROVE and DISPATCH this campaign to ${campaign.totalCount} recipients? This will send real corporate notification emails.`)) {
            return;
        }

        setDispatchingId(campaign.id);
        try {
            const res = await fetch(`/api/notifications/campaigns/${campaign.id}/dispatch`, {
                method: "POST",
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to dispatch campaign.");
            }

            setActionNotice({
                type: "success",
                message: `Campaign approved & dispatch started for ${campaign.totalCount} recipients.`
            });
            fetchCampaigns();
        } catch (err: any) {
            setActionNotice({
                type: "error",
                message: err.message || "Failed to start campaign dispatch."
            });
        } finally {
            setDispatchingId(null);
        }
    };

    // Filter campaigns based on view
    const filteredCampaigns = campaigns.filter(c => {
        if (campaignFilter === "ALL") return true;
        if (campaignFilter === "DRAFTS") return c.status === "DRAFT" || c.status === "TEST_SENT";
        if (campaignFilter === "ACTIVE") return c.status === "SENDING" || c.status === "APPROVED";
        if (campaignFilter === "COMPLETED") return c.status.startsWith("COMPLETED");
        return true;
    });

    return (
        <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1, minHeight: 0 }}>
            <QueryHeader 
                title="Corporate Breach Notification Center"
                description="Stage, test, approve, and dispatch personalized mail-merge alerts to employees impacted by data breaches"
                toolId="notification-center"
                icon={<BellRing className="text-amber-400" />}
                actions={
                    <button
                        type="button"
                        onClick={() => {
                            setWizardData({
                                name: "",
                                breachName: "",
                                templateId: templates.find(t => t.isEnabled !== false)?.id || templates[0]?.id || "",
                                sourceType: "CSV_UPLOAD",
                                sourceQuery: "",
                                recipients: [],
                            });
                            setActiveTab("wizard");
                        }}
                        className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold cursor-pointer shadow-md"
                    >
                        <Plus size={16} />
                        <span>New Notification Campaign</span>
                    </button>
                }
            />

            {/* Global Action Banner */}
            {actionNotice && (
                <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-sm animate-[fadeIn_0.2s_ease-out] ${
                    actionNotice.type === "success" 
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                        : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                }`}>
                    <div className="flex items-center gap-2.5">
                        {actionNotice.type === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span>{actionNotice.message}</span>
                    </div>
                    <button 
                        type="button" 
                        onClick={() => setActionNotice(null)}
                        className="text-text-muted hover:text-text-primary p-1 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex items-center justify-between border-b border-border-color pb-1 gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { setActiveTab("campaigns"); setIsCreatingTemplate(false); setEditingTemplate(null); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2 ${
                            activeTab === "campaigns" 
                                ? "bg-accent-primary text-white shadow-md" 
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                        }`}
                    >
                        <Layers size={15} />
                        <span>Active Campaigns ({campaigns.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => { setActiveTab("wizard"); setIsCreatingTemplate(false); setEditingTemplate(null); }}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2 ${
                            activeTab === "wizard" 
                                ? "bg-accent-primary text-white shadow-md" 
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                        }`}
                    >
                        <Send size={15} />
                        <span>Campaign Wizard {wizardData.recipients.length > 0 && `(${wizardData.recipients.length} staged)`}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab("templates")}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-2 ${
                            activeTab === "templates" 
                                ? "bg-accent-primary text-white shadow-md" 
                                : "text-text-secondary hover:text-text-primary hover:bg-bg-surface"
                        }`}
                    >
                        <Sparkles size={15} />
                        <span>Template Hub ({templates.length})</span>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { fetchCampaigns(); fetchTemplates(); }}
                        className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                        title="Refresh data"
                    >
                        <RefreshCw size={13} />
                        <span>Refresh</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: CAMPAIGNS DASHBOARD */}
            {activeTab === "campaigns" && (
                <div className="flex flex-col gap-5 flex-1 min-h-0">
                    {/* Filters bar */}
                    <div className="flex items-center justify-between gap-3 flex-wrap bg-bg-surface p-3 rounded-xl border border-border-color">
                        <div className="flex items-center gap-1.5">
                            {["ALL", "DRAFTS", "ACTIVE", "COMPLETED"].map((f) => (
                                <button
                                    key={f}
                                    type="button"
                                    onClick={() => setCampaignFilter(f)}
                                    className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                                        campaignFilter === f
                                            ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/40"
                                            : "text-text-secondary hover:text-text-primary hover:bg-bg-dark"
                                    }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-text-muted">
                            Showing {filteredCampaigns.length} of {campaigns.length} campaigns
                        </span>
                    </div>

                    {/* Campaigns Grid */}
                    {loadingCampaigns ? (
                        <div className="flex items-center justify-center p-12 text-text-muted text-sm gap-2">
                            <RefreshCw size={16} className="animate-spin" />
                            <span>Loading notification campaigns...</span>
                        </div>
                    ) : filteredCampaigns.length === 0 ? (
                        <div className="p-12 text-center bg-bg-surface rounded-2xl border border-border-color flex flex-col items-center justify-center gap-3">
                            <BellRing size={36} className="text-text-muted" />
                            <strong className="text-text-primary text-base">No Notification Campaigns Found</strong>
                            <p className="text-text-muted text-xs max-w-md">
                                You can stage a new notification campaign by uploading a CSV mail merge file, or directly from HIBP Domain Security results.
                            </p>
                            <button
                                type="button"
                                onClick={() => setActiveTab("wizard")}
                                className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold cursor-pointer mt-2"
                            >
                                <Plus size={15} />
                                <span>Create First Campaign</span>
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto pr-1">
                            {filteredCampaigns.map((c) => {
                                const isDraft = c.status === "DRAFT" || c.status === "TEST_SENT";
                                const isSending = c.status === "SENDING";
                                const isCompleted = c.status.startsWith("COMPLETED");
                                const breachLabel = c.breachName || c.sourceQuery || "Data Breach Incident";

                                return (
                                    <div 
                                        key={c.id}
                                        className="bg-bg-surface rounded-xl border border-border-color p-5 flex flex-col justify-between gap-4 transition-all hover:border-border-color-hover shadow-sm"
                                    >
                                        <div>
                                            {/* Status and Date */}
                                            <div className="flex items-center justify-between gap-2 mb-2.5">
                                                <span className={`text-[0.7rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                                                    c.status === "DRAFT" ? "bg-amber-500/15 text-amber-400 border-amber-500/30" :
                                                    c.status === "TEST_SENT" ? "bg-purple-500/15 text-purple-400 border-purple-500/30" :
                                                    c.status === "SENDING" ? "bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse" :
                                                    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                }`}>
                                                    {c.status.replace("_", " ")}
                                                </span>
                                                <span className="text-[0.75rem] text-text-muted">
                                                    {new Date(c.createdAt).toLocaleDateString()}
                                                </span>
                                            </div>

                                            {/* Campaign Title */}
                                            <h3 className="text-base font-bold text-text-primary mb-2 line-clamp-1">
                                                {c.name}
                                            </h3>

                                            {/* Explicit Breach Name Badge Row */}
                                            <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2.5">
                                                <span className="font-bold text-text-secondary text-[0.7rem] uppercase tracking-wider">Breach:</span>
                                                <span className="px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500 dark:text-rose-400 border border-rose-500/25 font-bold text-xs truncate max-w-[200px]" title={breachLabel}>
                                                    {breachLabel}
                                                </span>
                                            </div>

                                            <p className="text-xs text-text-muted mb-3 line-clamp-1">
                                                Template: <span className="text-text-secondary font-medium">{c.template?.name || "None assigned"}</span>
                                            </p>

                                            <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-bg-dark border border-border-color text-center mb-3">
                                                <div>
                                                    <span className="block text-[0.65rem] text-text-muted uppercase font-semibold">Total</span>
                                                    <strong className="text-sm text-text-primary font-bold">{c.totalCount}</strong>
                                                </div>
                                                <div>
                                                    <span className="block text-[0.65rem] text-text-muted uppercase font-semibold">Sent</span>
                                                    <strong className="text-sm text-emerald-400 font-bold">{c.sentCount}</strong>
                                                </div>
                                                <div>
                                                    <span className="block text-[0.65rem] text-text-muted uppercase font-semibold">Failed</span>
                                                    <strong className="text-sm text-rose-400 font-bold">{c.failedCount}</strong>
                                                </div>
                                            </div>

                                            {c.testSentTo && (
                                                <div className="text-[0.7rem] text-purple-300 bg-purple-500/10 p-2 rounded border border-purple-500/20 mb-2">
                                                    ✓ Sandbox Tested to: <strong>{c.testSentTo}</strong>
                                                </div>
                                            )}
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-color flex-wrap">
                                            {isDraft ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResumeCampaign(c)}
                                                        className="btn-secondary px-2.5 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
                                                        title="Resume / Edit Staging"
                                                    >
                                                        <Edit size={13} />
                                                        <span>Edit</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenTestModal(c)}
                                                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 cursor-pointer inline-flex items-center gap-1"
                                                        title="Send Sandbox Test Email to Admin"
                                                    >
                                                        <Eye size={13} />
                                                        <span>Test (Sandbox)</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDeliveryLog(c)}
                                                        className="btn-secondary px-2.5 py-1.5 text-xs inline-flex items-center gap-1 cursor-pointer"
                                                        title="View Staged Recipient List & Test Status"
                                                    >
                                                        <Users size={13} />
                                                        <span>Log</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDispatchCampaign(c)}
                                                        disabled={dispatchingId === c.id}
                                                        className="btn-primary px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1 cursor-pointer shadow-sm ml-auto"
                                                        title="Approve & Send to All Recipients"
                                                    >
                                                        <Play size={13} />
                                                        <span>Approve & Send</span>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenDeliveryLog(c)}
                                                        className="btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer"
                                                    >
                                                        <Users size={13} />
                                                        <span>View Delivery Log</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteCampaign(c.id)}
                                                        className="p-1.5 text-text-muted hover:text-rose-400 cursor-pointer ml-auto"
                                                        title="Delete campaign"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: CAMPAIGN WIZARD (STAGING / EDITING) */}
            {activeTab === "wizard" && (
                <div className="flex flex-col gap-6 max-w-5xl bg-bg-surface p-6 rounded-2xl border border-border-color shadow-sm">
                    <div className="flex items-center justify-between border-b border-border-color pb-4">
                        <div>
                            <h2 className="text-lg font-bold text-text-primary m-0">
                                {wizardData.id ? "Edit & Resume Campaign" : "Stage New Notification Campaign"}
                            </h2>
                            <p className="text-xs text-text-muted m-0 mt-1">
                                Configure campaign parameters, breach name, select a mail merge template, and review recipient list.
                            </p>
                        </div>
                        {wizardData.recipients.length > 0 && (
                            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                                {wizardData.recipients.length} Recipient{wizardData.recipients.length === 1 ? "" : "s"} Staged
                            </span>
                        )}
                    </div>

                    {/* Step 1: Campaign Metadata (Campaign Name, Breach Name, Template) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                                Campaign Name <span className="text-rose-400">*</span>
                            </label>
                            <input 
                                type="text"
                                value={wizardData.name}
                                onChange={(e) => setWizardData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g. LinkedIn Staff Security Notice - March 2026"
                                className="w-full px-3.5 py-2.5 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-medium focus:outline-none focus:border-accent-primary"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                                Breach / Incident Name <span className="text-rose-400">*</span>
                            </label>
                            <input 
                                type="text"
                                value={wizardData.breachName}
                                onChange={(e) => setWizardData(prev => ({ ...prev, breachName: e.target.value }))}
                                placeholder="e.g. LinkedIn, Adobe, 2026 Credential Leak"
                                className="w-full px-3.5 py-2.5 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-medium focus:outline-none focus:border-accent-primary"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                                Assigned Email Template <span className="text-rose-400">*</span>
                            </label>
                            <select
                                value={wizardData.templateId}
                                onChange={(e) => setWizardData(prev => ({ ...prev, templateId: e.target.value }))}
                                className="w-full px-3.5 py-2.5 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-medium focus:outline-none focus:border-accent-primary"
                            >
                                <option value="" disabled>-- Select an active template --</option>
                                <optgroup label="Active Templates">
                                    {templates.filter(t => t.isEnabled !== false).map(t => (
                                        <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
                                    ))}
                                </optgroup>
                                {templates.some(t => t.isEnabled === false) && (
                                    <optgroup label="Disabled / Archived Templates">
                                        {templates.filter(t => t.isEnabled === false).map(t => (
                                            <option key={t.id} value={t.id}>[Disabled] {t.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>

                    {/* Step 2: Upload CSV if not populated */}
                    {wizardData.recipients.length === 0 ? (
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
                                Stage Recipients via CSV Upload
                            </label>
                            <CsvUploadValidator 
                                onStaged={(recs, sum) => {
                                    const extractedBreach = recs[0]?.breachName || sum.filename.replace(".csv", "");
                                    setWizardData(prev => ({
                                        ...prev,
                                        name: prev.name || `${extractedBreach} Notification Campaign`,
                                        breachName: prev.breachName || extractedBreach,
                                        recipients: recs,
                                    }));
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary">
                                    Staged Recipients ({wizardData.recipients.length})
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setWizardData(prev => ({ ...prev, recipients: [] }))}
                                    className="text-xs text-rose-400 hover:underline cursor-pointer"
                                >
                                    Clear & Re-upload CSV
                                </button>
                            </div>

                            {/* Recipient Preview Table */}
                            <div className="overflow-x-auto rounded-lg border border-border-color bg-bg-dark max-h-64">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="sticky top-0 bg-bg-surface text-text-secondary">
                                        <tr className="border-b border-border-color">
                                            <th className="p-2.5">Email</th>
                                            <th className="p-2.5">Name</th>
                                            <th className="p-2.5">Breach Name</th>
                                            <th className="p-2.5">Breach Date</th>
                                            <th className="p-2.5">Account Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {wizardData.recipients.slice(0, 15).map((r, idx) => (
                                            <tr key={idx} className="border-b border-border-color/50">
                                                <td className="p-2.5 font-mono text-accent-primary">{r.email}</td>
                                                <td className="p-2.5 text-text-primary">{r.name || "—"}</td>
                                                <td className="p-2.5 text-text-secondary">{r.breachName || wizardData.breachName || "—"}</td>
                                                <td className="p-2.5 text-text-muted">{r.breachDate || "—"}</td>
                                                <td className="p-2.5">
                                                    <span className="px-2 py-0.5 rounded-full text-[0.65rem] bg-yellow-400 text-black font-black">
                                                        {r.accountStatus || "Active"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {wizardData.recipients.length > 15 && (
                                    <div className="p-2 text-center text-xs text-text-muted bg-bg-surface/50">
                                        ... and {wizardData.recipients.length - 15} more records staged.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Wizard Action Footer */}
                    <div className="flex items-center justify-between gap-3 pt-4 border-t border-border-color">
                        <button
                            type="button"
                            onClick={() => setActiveTab("campaigns")}
                            className="btn-secondary px-4 py-2 text-sm font-semibold cursor-pointer"
                        >
                            Cancel
                        </button>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleSaveWizardDraft}
                                disabled={wizardData.recipients.length === 0}
                                className="btn-primary inline-flex items-center gap-2 px-6 py-2 text-sm font-bold cursor-pointer shadow-md"
                            >
                                <Check size={16} />
                                <span>Save Staged Campaign Draft</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: TEMPLATE HUB */}
            {activeTab === "templates" && (
                <div className="flex flex-col gap-6">
                    {isCreatingTemplate || editingTemplate ? (
                        <div className="bg-bg-surface p-6 rounded-2xl border border-border-color">
                            <div className="flex items-center justify-between border-b border-border-color pb-4 mb-6">
                                <h2 className="text-lg font-bold text-text-primary m-0">
                                    {editingTemplate ? `Edit Template: ${editingTemplate.name}` : "Create New Email Template"}
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => { setIsCreatingTemplate(false); setEditingTemplate(null); }}
                                    className="btn-secondary px-3 py-1.5 text-xs font-semibold cursor-pointer"
                                >
                                    Back to Templates
                                </button>
                            </div>
                            <RichTemplateEditor 
                                key={editingTemplate?.id || (editingTemplate ? 'clone' : 'new')}
                                initialTemplate={editingTemplate}
                                onSave={handleSaveTemplate}
                                onCancel={() => { setIsCreatingTemplate(false); setEditingTemplate(null); }}
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div>
                                    <h3 className="text-base font-bold text-text-primary m-0">Stored Mail Merge Templates</h3>
                                    <p className="text-xs text-text-muted m-0 mt-0.5">Manage and preview reusable email templates populated with employee and breach variables.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingTemplate(true)}
                                    className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold cursor-pointer shadow-md"
                                >
                                    <Plus size={16} />
                                    <span>Create New Template</span>
                                </button>
                            </div>

                            {/* Template Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {templates.map(t => {
                                    const isActive = t.isEnabled !== false;

                                    return (
                                        <div 
                                            key={t.id} 
                                            className={`bg-bg-surface rounded-xl border p-5 flex flex-col justify-between gap-4 transition-all shadow-sm ${
                                                isActive ? "border-border-color hover:border-accent-primary/50" : "border-border-color/50 opacity-75"
                                            }`}
                                        >
                                            <div>
                                                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[0.7rem] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-accent-primary/15 text-accent-primary border border-accent-primary/30">
                                                            {t.category}
                                                        </span>
                                                        <span className={`text-[0.65rem] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                                                            isActive 
                                                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" 
                                                                : "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                                        }`}>
                                                            {isActive ? "Active" : "Disabled"}
                                                        </span>
                                                    </div>

                                                    {t.createdBy && (
                                                        <span className="text-[0.7rem] text-text-muted">
                                                            By: <strong>{t.createdBy}</strong>
                                                        </span>
                                                    )}
                                                </div>

                                                <h4 className="text-base font-bold text-text-primary mb-1">{t.name}</h4>
                                                <p className="text-xs text-text-muted line-clamp-2 mb-3">{t.description || "No description provided."}</p>
                                                <div className="text-xs text-text-secondary bg-bg-dark p-2.5 rounded-lg border border-border-color font-mono line-clamp-1">
                                                    <strong>Subj:</strong> {t.subject}
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-color flex-wrap">
                                                {/* Duplicate / Clone Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditingTemplate({
                                                            ...t,
                                                            id: undefined,
                                                            name: `${t.name} (Custom Copy)`,
                                                            isEnabled: true,
                                                        });
                                                    }}
                                                    className="btn-secondary px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                                    title="Clone this template to make a customized copy"
                                                >
                                                    <Copy size={13} />
                                                    <span>Clone</span>
                                                </button>

                                                {/* Edit Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingTemplate(t)}
                                                    className="btn-secondary px-2.5 py-1.5 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                                    title="Edit this template (Authors / Admins)"
                                                >
                                                    <Edit size={13} />
                                                    <span>Edit</span>
                                                </button>

                                                {t.id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteTemplate(t.id!)}
                                                        className="p-1.5 text-text-muted hover:text-rose-400 cursor-pointer ml-auto"
                                                        title="Delete template"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* MODAL: SANDBOX TEST EMAIL (SEND TO ADMIN) */}
            {testModalCampaign && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                    onClick={() => setTestModalCampaign(null)}
                >
                    <div 
                        className="bg-bg-surface border border-border-color rounded-2xl w-full max-w-xl p-6 shadow-2xl flex flex-col gap-5 animate-[fadeIn_0.2s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border-color pb-3">
                            <div className="flex items-center gap-2">
                                <Eye className="text-purple-400" size={20} />
                                <h3 className="text-base font-bold text-text-primary m-0">
                                    Sandbox Test Email Simulator
                                </h3>
                            </div>
                            <button 
                                onClick={() => setTestModalCampaign(null)}
                                className="text-text-muted hover:text-text-primary cursor-pointer p-1"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs leading-relaxed">
                            <strong>Safe Testing Mode:</strong> This merges real recipient variables for breach <strong>{testModalCampaign.breachName || testModalCampaign.sourceQuery || "Incident"}</strong> into template <em>&quot;{testModalCampaign.template?.name}&quot;</em>, but safely routes the actual email to <strong>your address</strong> so you can inspect Outlook formatting before sending to staff.
                        </div>

                        {testResult && (
                            <div className={`p-3.5 rounded-xl text-xs flex items-center gap-2 border ${
                                testResult.success 
                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" 
                                    : "bg-rose-500/15 border-rose-500/30 text-rose-400"
                            }`}>
                                {testResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                                <span>{testResult.message}</span>
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                                    Sample Recipient to Simulate
                                </label>
                                <select
                                    value={selectedTestRecipientId}
                                    onChange={(e) => setSelectedTestRecipientId(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                                >
                                    {testModalCampaign.recipients?.map((r: any, idx: number) => (
                                        <option key={r.id} value={r.id}>
                                            #{idx + 1}: {r.name ? `${r.name} (${r.email})` : r.email} — {r.breachName || testModalCampaign.breachName || "Incident"}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                                    Destination Admin Email (Override)
                                </label>
                                <input 
                                    type="email"
                                    value={targetAdminEmail}
                                    onChange={(e) => setTargetAdminEmail(e.target.value)}
                                    placeholder="Leave empty to use logged-in corporate user email"
                                    className="w-full px-3 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-xs focus:outline-none focus:border-accent-primary"
                                />
                                <span className="text-[0.7rem] text-text-muted mt-1 block">
                                    Defaults to your Active Directory email session.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-color">
                            <button
                                type="button"
                                onClick={() => setTestModalCampaign(null)}
                                className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
                            >
                                Close
                            </button>

                            <button
                                type="button"
                                onClick={handleExecuteTestSend}
                                disabled={sendingTest}
                                className="px-5 py-2 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-md cursor-pointer inline-flex items-center gap-2"
                            >
                                <Send size={14} />
                                <span>{sendingTest ? "Sending Test Email..." : "Send Test to My Inbox"}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: VIEW FULL RECIPIENT STAGING & DELIVERY LOG */}
            {viewingRecipientsCampaign && (
                <div 
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
                    onClick={() => setViewingRecipientsCampaign(null)}
                >
                    <div 
                        className="bg-bg-surface border border-border-color rounded-2xl w-full max-w-4xl p-6 shadow-2xl flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out] max-h-[88vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-border-color pb-3">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="text-base font-bold text-text-primary m-0">
                                        {viewingRecipientsCampaign.name}
                                    </h3>
                                    <span className="px-2 py-0.5 rounded text-[0.7rem] bg-rose-500/15 text-rose-400 font-bold border border-rose-500/30">
                                        Breach: {viewingRecipientsCampaign.breachName || viewingRecipientsCampaign.sourceQuery || "Incident"}
                                    </span>
                                </div>
                                <p className="text-xs text-text-muted m-0">
                                    Total Staged: <strong>{viewingRecipientsCampaign.totalCount || viewingRecipientsCampaign.recipients?.length || 0}</strong> | Sent: <strong className="text-emerald-400">{viewingRecipientsCampaign.sentCount || 0}</strong> | Failed: <strong className="text-rose-400">{viewingRecipientsCampaign.failedCount || 0}</strong>
                                </p>
                            </div>
                            <button 
                                onClick={() => setViewingRecipientsCampaign(null)}
                                className="text-text-muted hover:text-text-primary cursor-pointer p-1"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Sandbox Test Sent Banner */}
                        {viewingRecipientsCampaign.testSentTo && (
                            <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs flex items-center justify-between">
                                <span>✓ Sandbox Test Email dispatched to: <strong>{viewingRecipientsCampaign.testSentTo}</strong></span>
                                {viewingRecipientsCampaign.testSentAt && (
                                    <span className="text-purple-400/80 font-mono text-[0.7rem]">
                                        {new Date(viewingRecipientsCampaign.testSentAt).toLocaleTimeString()}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Search in log */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-3 text-text-muted" />
                            <input 
                                type="text"
                                value={recipientSearch}
                                onChange={(e) => setRecipientSearch(e.target.value)}
                                placeholder="Search by email, name, or status..."
                                className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-dark border border-border-color text-xs text-text-primary focus:outline-none focus:border-accent-primary"
                            />
                        </div>

                        {/* Recipients Table */}
                        <div className="overflow-y-auto flex-1 rounded-lg border border-border-color bg-bg-dark min-h-[220px]">
                            {loadingRecipientsLog ? (
                                <div className="flex items-center justify-center p-12 text-text-muted text-xs gap-2">
                                    <RefreshCw size={14} className="animate-spin" />
                                    <span>Loading recipients delivery log...</span>
                                </div>
                            ) : (
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead className="sticky top-0 bg-bg-surface text-text-secondary">
                                        <tr className="border-b border-border-color">
                                            <th className="p-2.5">Email</th>
                                            <th className="p-2.5">Name</th>
                                            <th className="p-2.5">Breach Name</th>
                                            <th className="p-2.5">Delivery Status</th>
                                            <th className="p-2.5">Timestamp</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(viewingRecipientsCampaign.recipients || [])
                                            .filter((r: any) => 
                                                !recipientSearch || 
                                                r.email.toLowerCase().includes(recipientSearch.toLowerCase()) || 
                                                (r.name && r.name.toLowerCase().includes(recipientSearch.toLowerCase())) ||
                                                (r.status && r.status.toLowerCase().includes(recipientSearch.toLowerCase()))
                                            )
                                            .map((r: any) => (
                                                <tr key={r.id} className="border-b border-border-color/50 hover:bg-bg-surface/40">
                                                    <td className="p-2.5 font-mono text-accent-primary">{r.email}</td>
                                                    <td className="p-2.5 text-text-primary">{r.name || "—"}</td>
                                                    <td className="p-2.5 text-text-secondary">{r.breachName || viewingRecipientsCampaign.breachName || "—"}</td>
                                                    <td className="p-2.5">
                                                        <span className={`px-2 py-0.5 rounded-full text-[0.65rem] font-bold ${
                                                            r.status === "SENT" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                                                            r.status === "TEST_SENT" ? "bg-purple-500/20 text-purple-300 border border-purple-500/30" :
                                                            r.status === "FAILED" ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                                                            "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                                        }`}>
                                                            {r.status === "TEST_SENT" ? "Sandbox Tested" : r.status}
                                                        </span>
                                                        {r.error && (
                                                            <div className="text-[0.65rem] text-rose-400 mt-0.5 line-clamp-1" title={r.error}>
                                                                {r.error}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-2.5 text-text-muted">
                                                        {r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : "—"}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-border-color">
                            <button
                                type="button"
                                onClick={() => setViewingRecipientsCampaign(null)}
                                className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
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
