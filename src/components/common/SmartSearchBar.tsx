"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { Search, X, Loader2, Sparkles, Check, HelpCircle, AlertCircle } from "lucide-react";
import { isBooleanQuery, tokenizeQuery } from "@/lib/booleanQueryParser";

export interface SmartSearchBarProps {
    value: string;
    onChange: (value: string) => void;
    onSearch?: (cleanQuery: string, isBoolean: boolean) => void;
    onReset?: () => void;
    placeholder?: string;
    loading?: boolean;
    buttonLabel?: string;
    hideSubmitButton?: boolean;
    enableLiveFiltering?: boolean;
    showHelp?: boolean;
    supportedFields?: string[];
    examples?: string[];
    filterControls?: React.ReactNode;
    enableBooleanHelp?: boolean;
    autoTrimOnSearch?: boolean;
    typeDetector?: (term: string) => { label: string; colorClass?: string } | null;
    className?: string;
}

/**
 * Standard Unified Smart Search Bar Component
 * - Strips leading & trailing whitespace on execution
 * - Detects Boolean Query Syntax (AND, OR, NOT, parentheses)
 * - Provides live syntax pills, hints, keyboard shortcuts (Enter / Esc)
 * - Supports modular per-tool filter slots and custom type detectors
 */
export function SmartSearchBar({
    value,
    onChange,
    onSearch,
    onReset,
    placeholder = "Search...",
    loading = false,
    buttonLabel = "Search",
    hideSubmitButton = false,
    enableLiveFiltering = false,
    supportedFields = [],
    examples = [],
    filterControls,
    enableBooleanHelp = true,
    autoTrimOnSearch = true,
    typeDetector,
    className = ""
}: SmartSearchBarProps) {
    const [showHelp, setShowHelp] = useState<boolean>(false);
    const [openUpward, setOpenUpward] = useState<boolean>(false);
    const helpContainerRef = useRef<HTMLDivElement>(null);

    // Collision detection: dynamically determine if popover should flip upward or downward
    useEffect(() => {
        if (!showHelp || !helpContainerRef.current) return;
        const rect = helpContainerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;

        // Tooltip is ~200px tall. Default to downward unless viewport bottom is cramped and top has ample space.
        if (spaceBelow < 220 && spaceAbove > 220) {
            setOpenUpward(true);
        } else {
            setOpenUpward(false);
        }
    }, [showHelp]);

    // Dismiss help popover on click outside or Escape key
    useEffect(() => {
        if (!showHelp) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (helpContainerRef.current && !helpContainerRef.current.contains(e.target as Node)) {
                setShowHelp(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowHelp(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [showHelp]);

    // Live query analysis
    const cleanValue = value.trim();
    const hasValue = Boolean(value);
    const isBoolean = useMemo(() => isBooleanQuery(value), [value]);

    // Live syntax & type badge
    const detectedType = useMemo(() => {
        if (!cleanValue) return null;
        if (typeDetector) {
            const detected = typeDetector(cleanValue);
            if (detected) return detected;
        }
        if (isBoolean) {
            const tokens = tokenizeQuery(cleanValue);
            const operators = tokens.filter(t => ["AND", "OR", "NOT"].includes(t.toUpperCase())).length;
            return {
                label: `Boolean Query (${operators} op${operators === 1 ? '' : 's'})`,
                colorClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
            };
        }
        // Basic heuristics
        if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(cleanValue)) {
            return { label: "IPv4 Address", colorClass: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
        }
        const strippedMac = cleanValue.replace(/[:.\-\s]/g, "");
        if (strippedMac.length === 12 && /^[0-9A-Fa-f]{12}$/.test(strippedMac)) {
            return { label: "MAC Address", colorClass: "bg-purple-500/15 text-purple-300 border-purple-500/30" };
        }
        return null;
    }, [cleanValue, isBoolean, typeDetector]);

    // Parentheses balance check for boolean queries
    const parenthesesError = useMemo(() => {
        if (!isBoolean) return null;
        let balance = 0;
        for (const char of cleanValue) {
            if (char === "(") balance++;
            if (char === ")") balance--;
            if (balance < 0) return "Unbalanced closing parenthesis ')'";
        }
        if (balance > 0) return "Unclosed opening parenthesis '('";
        return null;
    }, [isBoolean, cleanValue]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const term = autoTrimOnSearch ? value.trim() : value;
        if (!term) return;
        if (onSearch) {
            onSearch(term, isBooleanQuery(term));
        }
    };

    const handleClear = () => {
        onChange("");
        if (onReset) onReset();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            handleClear();
        }
    };

    return (
        <div className={`glass-card flex flex-col gap-2.5 p-4 rounded-2xl border border-border-color bg-bg-surface/90 shadow-sm ${className}`}>
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                {/* Search Input Box */}
                <div className="relative flex-1">
                    <Search
                        size={18}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none"
                    />

                    <input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={placeholder}
                        disabled={loading}
                        className="w-full pl-10 pr-24 py-3 rounded-xl bg-bg-surface-hover/80 border border-border-color text-text-primary text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/30 transition-all font-normal placeholder:text-text-secondary/60 disabled:opacity-50"
                    />

                    {/* Right-aligned Badges & Clear Button */}
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        {detectedType && (
                            <span className={`hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border ${detectedType.colorClass || 'bg-bg-surface text-text-secondary border-border-color'}`}>
                                {detectedType.label}
                            </span>
                        )}

                        {hasValue && (
                            <button
                                type="button"
                                onClick={handleClear}
                                title="Clear search (Esc)"
                                className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Optional Tool-Specific Filter Slots */}
                {filterControls && (
                    <div className="flex items-center gap-2 shrink-0">
                        {filterControls}
                    </div>
                )}

                {/* Primary Action Button */}
                {onSearch && !hideSubmitButton && (
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="submit"
                            disabled={loading || !cleanValue}
                            className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-semibold tracking-wide uppercase shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed min-w-[120px]"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={15} className="animate-spin" />
                                    <span>Querying...</span>
                                </>
                            ) : (
                                <span>{buttonLabel}</span>
                            )}
                        </button>

                        {hasValue && onReset && (
                            <button
                                type="button"
                                onClick={handleClear}
                                disabled={loading}
                                className="px-3.5 py-3 rounded-xl border border-border-color bg-bg-surface-hover hover:bg-bg-surface text-text-secondary hover:text-text-primary text-xs font-medium transition-all"
                            >
                                Reset
                            </button>
                        )}
                    </div>
                )}
            </form>

            {/* Parentheses Syntax Warning Banner */}
            {parenthesesError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-950/20 border border-rose-500/30 px-3 py-1.5 rounded-lg animate-in fade-in duration-150">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>Syntax Alert: {parenthesesError}. Check boolean expression balance.</span>
                </div>
            )}

            {/* Contextual Hints & Boolean Assistance */}
            {(supportedFields.length > 0 || examples.length > 0 || enableBooleanHelp) && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-secondary pt-0.5 px-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        {supportedFields.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-text-primary">Supported:</span>
                                <span>{supportedFields.join(" · ")}</span>
                            </div>
                        )}

                        {examples.length > 0 && (
                            <>
                                <span className="text-border-color">•</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-text-primary">Examples:</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {examples.map((ex, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => {
                                                    onChange(ex);
                                                    if (onSearch) {
                                                        onSearch(ex.trim(), isBooleanQuery(ex.trim()));
                                                    }
                                                }}
                                                className="font-mono text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                                                title={`Click to search "${ex}"`}
                                            >
                                                {ex}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {enableBooleanHelp && (
                        <div className="relative" ref={helpContainerRef}>
                            <button
                                type="button"
                                onClick={() => setShowHelp(!showHelp)}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                    showHelp
                                        ? "text-accent-primary bg-accent-primary/10"
                                        : "text-text-secondary hover:text-accent-primary hover:bg-bg-surface-hover/60"
                                }`}
                                title="Toggle Boolean Search Syntax Reference"
                            >
                                <Sparkles size={12} className="text-indigo-400" />
                                <span>Boolean Syntax</span>
                            </button>

                            {/* Dropdown Syntax Reference Tip Sheet */}
                            {showHelp && (
                                <div
                                    className={`absolute right-0 ${
                                        openUpward ? "bottom-full mb-2" : "top-full mt-2"
                                    } w-72 sm:w-80 max-w-[calc(100vw-2rem)] p-3.5 rounded-xl border border-border-color bg-bg-surface shadow-2xl z-50 space-y-2.5 text-xs animate-in fade-in duration-150 backdrop-blur-md`}
                                >
                                    <div className="flex items-center justify-between border-b border-border-color/80 pb-2 font-bold text-text-primary">
                                        <div className="flex items-center gap-1.5">
                                            <Sparkles size={13} className="text-indigo-400" />
                                            <span>Boolean Search Syntax</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowHelp(false)}
                                            className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-white/10 transition-colors cursor-pointer"
                                            title="Close (Esc)"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <div className="space-y-2 text-[11px] text-text-secondary">
                                        <div className="flex items-start gap-1.5">
                                            <strong className="text-indigo-400 font-mono font-bold shrink-0 w-12">AND</strong>
                                            <span>Both conditions match (<code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">3CP AND failure</code>)</span>
                                        </div>
                                        <div className="flex items-start gap-1.5">
                                            <strong className="text-indigo-400 font-mono font-bold shrink-0 w-12">OR</strong>
                                            <span>Either condition matches (<code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">smith-jane OR doe-john</code>)</span>
                                        </div>
                                        <div className="flex items-start gap-1.5">
                                            <strong className="text-indigo-400 font-mono font-bold shrink-0 w-12">NOT / -</strong>
                                            <span>Exclude term (<code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">CUH NOT Android</code> or <code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">-Apple</code>)</span>
                                        </div>
                                        <div className="flex items-start gap-1.5">
                                            <strong className="text-indigo-400 font-mono font-bold shrink-0 w-12">()</strong>
                                            <span>Grouping (<code className="text-emerald-400 font-mono bg-emerald-500/10 px-1 py-0.5 rounded">(CUH OR 3CP) AND failure</code>)</span>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-border-color/60 text-[10px] text-text-secondary/70 flex items-center justify-between">
                                        <span>Click outside or press Esc to dismiss</span>
                                        <span className="font-mono text-[9px] bg-bg-surface-hover px-1.5 py-0.5 rounded border border-border-color">Esc</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SmartSearchBar;
