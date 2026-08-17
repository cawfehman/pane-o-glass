"use client";

import React, { useEffect } from "react";
import { AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export interface ConfirmDialogProps {
    isOpen: boolean;
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export function ConfirmDialog({
    isOpen,
    title = "Confirm Action",
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "danger",
    onConfirm,
    onCancel,
    loading = false,
}: ConfirmDialogProps) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !loading) onCancel();
        };
        if (isOpen) document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, loading, onCancel]);

    if (!isOpen) return null;

    const iconColor =
        variant === "danger"
            ? "text-red-400 bg-red-500/10 border-red-500/20"
            : variant === "warning"
            ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
            : "text-accent-primary bg-accent-glow border-accent-primary/20";

    const confirmButtonClass =
        variant === "danger"
            ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20"
            : variant === "warning"
            ? "bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20"
            : "bg-accent-primary hover:bg-accent-primary-hover text-white shadow-lg shadow-accent-primary/20";

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-bg-surface border border-border-color rounded-xl max-w-md w-full p-6 shadow-2xl animate-in slide-in-from-top-4 duration-200"
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-xl border shrink-0 ${iconColor}`}>
                        {variant === "danger" ? (
                            <AlertTriangle size={24} />
                        ) : variant === "warning" ? (
                            <AlertTriangle size={24} />
                        ) : (
                            <Info size={24} />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
                        <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border-color">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary bg-transparent hover:bg-bg-surface-hover border border-border-color rounded-lg transition-colors cursor-pointer"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${confirmButtonClass}`}
                    >
                        {loading && <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />}
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
