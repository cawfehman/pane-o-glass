"use client";

import React, { useState, useEffect } from "react";
import { 
    Save, Sparkles, Code, Eye, Tag, AlertCircle, 
    RotateCcw, Check, Copy, ExternalLink, HelpCircle
} from "lucide-react";
import { DEFAULT_PLACEHOLDERS, renderMergedText, TemplateVariables } from "@/lib/templateParser";

export interface TemplateData {
    id?: string;
    name: string;
    description?: string;
    category: string;
    subject: string;
    bodyHtml: string;
    bodyText?: string;
}

interface RichTemplateEditorProps {
    initialTemplate?: TemplateData | null;
    onSave: (template: TemplateData) => Promise<void>;
    onCancel?: () => void;
}

const SAMPLE_SIMULATION_VARS: TemplateVariables = {
    Name: "Jane Doe",
    Email: "jdoe@cooperhealth.edu",
    BreachName: "LinkedIn",
    BreachDate: "May 18, 2016",
    BreachDetails: "In May 2016, LinkedIn experienced a major data spill exposing over 164 million employee passwords and email addresses.",
    ExposedCategories: "Passwords, Email addresses",
    AccountStatus: "Active",
};

export default function RichTemplateEditor({
    initialTemplate,
    onSave,
    onCancel
}: RichTemplateEditorProps) {
    const [name, setName] = useState(initialTemplate?.name || "");
    const [description, setDescription] = useState(initialTemplate?.description || "");
    const [category, setCategory] = useState(initialTemplate?.category || "BREACH");
    const [subject, setSubject] = useState(initialTemplate?.subject || "");
    const [bodyHtml, setBodyHtml] = useState(initialTemplate?.bodyHtml || "");
    const [activeTab, setActiveTab] = useState<"visual" | "html">("visual");
    const [saving, setSaving] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (initialTemplate) {
            setName(initialTemplate.name || "");
            setDescription(initialTemplate.description || "");
            setCategory(initialTemplate.category || "BREACH");
            setSubject(initialTemplate.subject || "");
            setBodyHtml(initialTemplate.bodyHtml || "");
        }
    }, [initialTemplate]);

    const insertVariable = (varKey: string, target: "subject" | "body") => {
        if (target === "subject") {
            setSubject(prev => prev + ` ${varKey}`);
        } else {
            setBodyHtml(prev => prev + ` ${varKey}`);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!name.trim()) {
            setError("Template Name is required.");
            return;
        }
        if (!subject.trim()) {
            setError("Email Subject line is required.");
            return;
        }
        if (!bodyHtml.trim()) {
            setError("Email Body HTML content is required.");
            return;
        }

        try {
            setSaving(true);
            await onSave({
                id: initialTemplate?.id,
                name: name.trim(),
                description: description.trim(),
                category,
                subject: subject.trim(),
                bodyHtml,
            });
            setSavedNotice(true);
            setTimeout(() => setSavedNotice(false), 3000);
        } catch (err: any) {
            setError(err.message || "Failed to save template.");
        } finally {
            setSaving(false);
        }
    };

    const previewSubject = renderMergedText(subject, SAMPLE_SIMULATION_VARS);
    const previewHtml = renderMergedText(bodyHtml, SAMPLE_SIMULATION_VARS);

    return (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
            {error && (
                <div className="p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-sm flex items-center gap-2">
                    <AlertCircle size={18} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {savedNotice && (
                <div className="p-3.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm flex items-center gap-2">
                    <Check size={18} className="shrink-0" />
                    <span>Template saved successfully!</span>
                </div>
            )}

            {/* Template Header Form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-bg-surface p-5 rounded-xl border border-border-color">
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Template Name <span className="text-rose-400">*</span>
                    </label>
                    <input 
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Standard Credential Spill Notice"
                        className="w-full px-3.5 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Category
                    </label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                    >
                        <option value="BREACH">Data Breach Incident</option>
                        <option value="SECURITY_ALERT">Urgent Security Alert</option>
                        <option value="GENERAL">General Notice</option>
                    </select>
                </div>

                <div className="md:col-span-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Description / Purpose
                    </label>
                    <input 
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Sent to active corporate staff whose accounts appeared in external credential dumps"
                        className="w-full px-3.5 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm focus:outline-none focus:border-accent-primary"
                    />
                </div>
            </div>

            {/* 1-Click Dynamic Placeholders Bar */}
            <div className="bg-bg-surface p-4 rounded-xl border border-border-color">
                <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2">
                        <Tag size={16} className="text-accent-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-text-primary">1-Click Dynamic Placeholders</span>
                    </div>
                    <span className="text-xs text-text-muted">Click any tag to insert into Subject or Body</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {DEFAULT_PLACEHOLDERS.map((p) => (
                        <div key={p.key} className="inline-flex items-center rounded-lg bg-bg-dark border border-border-color overflow-hidden shadow-sm">
                            <span className="px-2.5 py-1 text-xs font-mono font-semibold text-accent-primary">
                                {p.key}
                            </span>
                            <button
                                type="button"
                                onClick={() => insertVariable(p.key, "subject")}
                                title={`Insert ${p.key} into Subject line`}
                                className="px-2 py-1 text-[0.7rem] bg-bg-surface hover:bg-accent-primary/20 text-text-secondary border-l border-border-color cursor-pointer transition-colors"
                            >
                                + Subj
                            </button>
                            <button
                                type="button"
                                onClick={() => insertVariable(p.key, "body")}
                                title={`Insert ${p.key} into Email Body`}
                                className="px-2 py-1 text-[0.7rem] bg-bg-surface hover:bg-accent-primary/20 text-text-secondary border-l border-border-color cursor-pointer transition-colors"
                            >
                                + Body
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Subject Line */}
            <div className="bg-bg-surface p-5 rounded-xl border border-border-color">
                <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                    Email Subject Line <span className="text-rose-400">*</span>
                </label>
                <input 
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Information Security Notice: Action Required Regarding {{BreachName}}"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-medium focus:outline-none focus:border-accent-primary"
                    required
                />
            </div>

            {/* Side-by-Side Editor & Live Simulation Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Editor Column */}
                <div className="bg-bg-surface rounded-xl border border-border-color overflow-hidden flex flex-col h-[580px]">
                    <div className="p-3 bg-bg-dark/60 border-b border-border-color flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Code size={16} className="text-accent-primary" />
                            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">HTML Template Code</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-text-muted">Supports inline HTML styles & tables</span>
                        </div>
                    </div>
                    <textarea 
                        value={bodyHtml}
                        onChange={(e) => setBodyHtml(e.target.value)}
                        placeholder="Enter HTML template here..."
                        className="flex-1 w-full p-4 bg-bg-dark text-text-primary font-mono text-xs leading-relaxed focus:outline-none resize-none overflow-y-auto"
                        required
                    />
                </div>

                {/* Live Preview Column */}
                <div className="bg-bg-surface rounded-xl border border-border-color overflow-hidden flex flex-col h-[580px]">
                    <div className="p-3 bg-bg-dark/60 border-b border-border-color flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye size={16} className="text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">Live Simulated Preview</span>
                        </div>
                        <span className="text-xs text-text-muted">Simulated with: {SAMPLE_SIMULATION_VARS.Email}</span>
                    </div>

                    <div className="p-3 bg-bg-surface-hover/30 border-b border-border-color text-xs text-text-secondary flex flex-col gap-1">
                        <div>
                            <strong className="text-text-primary">Subject:</strong> {previewSubject || <span className="italic text-text-muted">(No subject)</span>}
                        </div>
                        <div>
                            <strong className="text-text-primary">To:</strong> {SAMPLE_SIMULATION_VARS.Name} &lt;{SAMPLE_SIMULATION_VARS.Email}&gt;
                        </div>
                    </div>

                    <div className="flex-1 p-4 overflow-y-auto bg-[#ffffff] text-[#000000] rounded-b-xl">
                        {previewHtml ? (
                            <div 
                                dangerouslySetInnerHTML={{ __html: previewHtml }} 
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
                                Start typing or paste HTML to view simulated rendering...
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center justify-between gap-3 p-4 bg-bg-surface rounded-xl border border-border-color">
                {onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="btn-secondary px-4 py-2 text-sm font-semibold cursor-pointer"
                    >
                        Cancel
                    </button>
                )}
                <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary inline-flex items-center gap-2 px-6 py-2 text-sm font-bold cursor-pointer shadow-md ml-auto"
                >
                    <Save size={16} />
                    <span>{saving ? "Saving..." : initialTemplate?.id ? "Update Template" : "Create Template"}</span>
                </button>
            </div>
        </form>
    );
}
