"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
    Save, Sparkles, Code, Eye, Tag, AlertCircle, 
    RotateCcw, Check, Copy, ExternalLink, HelpCircle,
    Bold, Italic, Underline, List, ListOrdered, Link,
    Edit3, Type, Undo, Redo
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
    isEnabled?: boolean;
    createdBy?: string;
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
    BreachDetails: "In May 2016, an external service experienced a credential spill exposing passwords.",
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
    const [isEnabled, setIsEnabled] = useState(initialTemplate?.isEnabled !== false);
    const [editorMode, setEditorMode] = useState<"visual" | "html">("visual");
    const [saving, setSaving] = useState(false);
    const [savedNotice, setSavedNotice] = useState(false);
    const [error, setError] = useState("");

    const visualEditorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (initialTemplate) {
            setName(initialTemplate.name || "");
            setDescription(initialTemplate.description || "");
            setCategory(initialTemplate.category || "BREACH");
            setSubject(initialTemplate.subject || "");
            setBodyHtml(initialTemplate.bodyHtml || "");
            setIsEnabled(initialTemplate.isEnabled !== false);
        }
    }, [initialTemplate]);

    // Keep visual editor content in sync when switching modes or loading initial template
    useEffect(() => {
        if (editorMode === "visual" && visualEditorRef.current) {
            if (visualEditorRef.current.innerHTML !== bodyHtml) {
                visualEditorRef.current.innerHTML = bodyHtml;
            }
        }
    }, [editorMode, bodyHtml]);

    const handleVisualInput = () => {
        if (visualEditorRef.current) {
            setBodyHtml(visualEditorRef.current.innerHTML);
        }
    };

    const execCmd = (command: string, value: string | undefined = undefined) => {
        if (editorMode !== "visual") return;
        document.execCommand(command, false, value);
        if (visualEditorRef.current) {
            setBodyHtml(visualEditorRef.current.innerHTML);
        }
    };

    const handleInsertLink = () => {
        const url = prompt("Enter the destination URL:", "https://");
        if (url) {
            execCmd("createLink", url);
        }
    };

    const insertVariable = (varKey: string, target: "subject" | "body") => {
        if (target === "subject") {
            setSubject(prev => prev + ` ${varKey}`);
        } else {
            if (editorMode === "visual") {
                if (visualEditorRef.current) {
                    visualEditorRef.current.focus();
                    document.execCommand("insertText", false, ` ${varKey} `);
                    setBodyHtml(visualEditorRef.current.innerHTML);
                }
            } else {
                setBodyHtml(prev => prev + ` ${varKey}`);
            }
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
            setError("Email Body content is required.");
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
                isEnabled,
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-bg-surface p-5 rounded-xl border border-border-color">
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Template Name <span className="text-rose-400">*</span>
                    </label>
                    <input 
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Corporate Email Exposure Advisory"
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

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Status
                    </label>
                    <select
                        value={isEnabled ? "active" : "disabled"}
                        onChange={(e) => setIsEnabled(e.target.value === "active")}
                        className="w-full px-3.5 py-2 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-semibold focus:outline-none focus:border-accent-primary"
                    >
                        <option value="active" className="text-emerald-400">Active / Enabled</option>
                        <option value="disabled" className="text-rose-400">Disabled / Archived</option>
                    </select>
                </div>

                <div className="md:col-span-4">
                    <label className="block text-xs font-bold uppercase tracking-wider text-text-secondary mb-1.5">
                        Description / Purpose
                    </label>
                    <input 
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="e.g. Official Cooper security notification informing staff their corporate email was in an external breach"
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
                    placeholder="e.g. Notification Regarding Your Corporate Email Address"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-bg-dark border border-border-color text-text-primary text-sm font-medium focus:outline-none focus:border-accent-primary"
                    required
                />
            </div>

            {/* Side-by-Side Dual-Mode Editor & Live Simulation Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Left Column: Interactive Editor (Visual WYSIWYG vs Raw HTML) */}
                <div className="bg-bg-surface rounded-xl border border-border-color overflow-hidden flex flex-col h-[600px] shadow-sm">
                    {/* Mode Switcher & Formatting Bar */}
                    <div className="p-2.5 bg-bg-dark/80 border-b border-border-color flex items-center justify-between gap-2 flex-wrap">
                        {/* Mode Tabs */}
                        <div className="flex items-center gap-1 bg-bg-surface p-0.5 rounded-lg border border-border-color">
                            <button
                                type="button"
                                onClick={() => setEditorMode("visual")}
                                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                                    editorMode === "visual"
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                <Edit3 size={13} />
                                <span>Visual WYSIWYG</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setEditorMode("html")}
                                className={`px-3 py-1 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                                    editorMode === "html"
                                        ? "bg-accent-primary text-white shadow-sm"
                                        : "text-text-secondary hover:text-text-primary"
                                }`}
                            >
                                <Code size={13} />
                                <span>HTML Code</span>
                            </button>
                        </div>

                        {/* Rich Text Toolbar (Active when in Visual Mode) */}
                        {editorMode === "visual" && (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => execCmd("bold")}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Bold (Ctrl+B)"
                                >
                                    <Bold size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => execCmd("italic")}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Italic (Ctrl+I)"
                                >
                                    <Italic size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => execCmd("underline")}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Underline (Ctrl+U)"
                                >
                                    <Underline size={14} />
                                </button>
                                <span className="w-[1px] h-4 bg-border-color mx-1" />
                                <button
                                    type="button"
                                    onClick={() => execCmd("insertUnorderedList")}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Bullet List"
                                >
                                    <List size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => execCmd("insertOrderedList")}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Numbered List"
                                >
                                    <ListOrdered size={14} />
                                </button>
                                <button
                                    type="button"
                                    onClick={handleInsertLink}
                                    className="p-1.5 rounded hover:bg-bg-surface text-text-secondary hover:text-text-primary cursor-pointer"
                                    title="Insert Link"
                                >
                                    <Link size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Editor Content Area */}
                    {editorMode === "visual" ? (
                        <div className="flex-1 p-5 overflow-y-auto bg-[#ffffff] text-[#1e293b] focus:outline-none">
                            <div
                                ref={visualEditorRef}
                                contentEditable={true}
                                onInput={handleVisualInput}
                                onBlur={handleVisualInput}
                                className="min-h-full focus:outline-none leading-relaxed text-sm selection:bg-blue-100"
                                style={{ minHeight: "100%" }}
                            />
                        </div>
                    ) : (
                        <textarea 
                            value={bodyHtml}
                            onChange={(e) => setBodyHtml(e.target.value)}
                            placeholder="Enter HTML template here..."
                            className="flex-1 w-full p-4 bg-bg-dark text-text-primary font-mono text-xs leading-relaxed focus:outline-none resize-none overflow-y-auto"
                            required
                        />
                    )}

                    <div className="p-2 bg-bg-dark/40 border-t border-border-color text-[0.7rem] text-text-muted flex justify-between">
                        <span>{editorMode === "visual" ? "✏️ Visual Direct Editing Active (Edits update HTML automatically)" : "💻 Raw HTML Code Editor Active"}</span>
                        <span>{bodyHtml.length} characters</span>
                    </div>
                </div>

                {/* Right Column: Live Simulation Preview */}
                <div className="bg-bg-surface rounded-xl border border-border-color overflow-hidden flex flex-col h-[600px] shadow-sm">
                    <div className="p-3 bg-bg-dark/60 border-b border-border-color flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Eye size={16} className="text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">Live Simulated Preview</span>
                        </div>
                        <span className="text-xs text-text-muted">Merged with: {SAMPLE_SIMULATION_VARS.Email}</span>
                    </div>

                    <div className="p-3 bg-bg-surface-hover/30 border-b border-border-color text-xs text-text-secondary flex flex-col gap-1">
                        <div>
                            <strong className="text-text-primary">Subject:</strong> {previewSubject || <span className="italic text-text-muted">(No subject)</span>}
                        </div>
                        <div>
                            <strong className="text-text-primary">To:</strong> {SAMPLE_SIMULATION_VARS.Name} &lt;{SAMPLE_SIMULATION_VARS.Email}&gt;
                        </div>
                    </div>

                    <div className="flex-1 p-5 overflow-y-auto bg-[#ffffff] text-[#1e293b] rounded-b-xl">
                        {previewHtml ? (
                            <div 
                                dangerouslySetInnerHTML={{ __html: previewHtml }} 
                            />
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-400 text-sm italic">
                                Start typing or editing in the Visual Editor to preview simulated email...
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
