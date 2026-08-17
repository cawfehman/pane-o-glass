"use client";

import React, { useState, useEffect, useRef } from "react";
import { Lock, AlertCircle } from "lucide-react";

export interface PromptDialogProps {
    isOpen: boolean;
    title?: string;
    description?: string;
    placeholder?: string;
    isPassword?: boolean;
    confirmText?: string;
    cancelText?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
    loading?: boolean;
    errorMessage?: string;
}

export function PromptDialog({
    isOpen,
    title = "Authentication Required",
    description = "Please enter your authorization credential to proceed.",
    placeholder = "Enter password...",
    isPassword = true,
    confirmText = "Verify & Proceed",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
    loading = false,
    errorMessage = "",
}: PromptDialogProps) {
    const [inputValue, setInputValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setInputValue("");
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !loading) onCancel();
        };
        if (isOpen) document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, loading, onCancel]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim()) return;
        onConfirm(inputValue.trim());
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-bg-surface border border-border-color rounded-xl max-w-md w-full p-6 shadow-2xl animate-in slide-in-from-top-4 duration-200"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start gap-4 mb-4">
                    <div className="p-3 rounded-xl border border-accent-primary/20 bg-accent-glow text-accent-primary shrink-0">
                        <Lock size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-text-primary mb-1">{title}</h3>
                        <p className="text-sm text-text-secondary leading-relaxed">{description}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
                    <div className="input-group">
                        <input
                            ref={inputRef}
                            type={isPassword ? "password" : "text"}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder={placeholder}
                            disabled={loading}
                            className="w-full px-4 py-2.5 bg-bg-dark border border-border-color rounded-lg text-text-primary text-sm focus:border-accent-primary focus:shadow-glow outline-none transition-all"
                            required
                        />
                    </div>

                    {errorMessage && (
                        <div className="flex items-center gap-2 p-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertCircle size={14} className="shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border-color">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary bg-transparent hover:bg-bg-surface-hover border border-border-color rounded-lg transition-colors cursor-pointer"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !inputValue.trim()}
                            className="btn-primary px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading && <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />}
                            {confirmText}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
