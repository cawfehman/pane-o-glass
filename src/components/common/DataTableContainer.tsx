"use client";

import React from "react";
import { Search, SearchX, AlertCircle } from "lucide-react";
import { PaginationControls, PaginationControlsProps } from "./PaginationControls";

export interface DataTableContainerProps {
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    
    // Search Toolbar
    searchValue?: string;
    searchPlaceholder?: string;
    onSearchChange?: (val: string) => void;
    onSearchSubmit?: (e: React.FormEvent) => void;
    onSearchClear?: () => void;
    
    // Actions on the top right
    actions?: React.ReactNode;

    // Pagination
    pagination?: PaginationControlsProps;
    showTopPagination?: boolean;
    showBottomPagination?: boolean;

    // Status
    loading?: boolean;
    error?: string;
    empty?: boolean;
    emptyTitle?: string;
    emptyMessage?: string;

    // Children: The <table> element
    children: React.ReactNode;

    // Class overrides
    className?: string;
}

export function DataTableContainer({
    title,
    subtitle,
    searchValue,
    searchPlaceholder = "Search records...",
    onSearchChange,
    onSearchSubmit,
    onSearchClear,
    actions,
    pagination,
    showTopPagination = true,
    showBottomPagination = true,
    loading = false,
    error,
    empty = false,
    emptyTitle = "No records found",
    emptyMessage = "Try adjusting your search query or filters.",
    children,
    className = "",
}: DataTableContainerProps) {
    return (
        <div className={`glass-card flex-1 flex flex-col min-h-0 bg-bg-surface border border-border-color rounded-xl overflow-hidden shadow-sm ${className}`}>
            {/* Top Pinned Section */}
            <div className="p-4 border-b border-border-color flex flex-col gap-3 shrink-0 bg-bg-surface/60 backdrop-blur-md">
                {(title || subtitle || actions || onSearchChange) && (
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                        {/* Title and Subtitle */}
                        {(title || subtitle) && (
                            <div className="min-w-0">
                                {title && typeof title === "string" ? (
                                    <h3 className="text-base font-bold text-text-primary m-0 tracking-tight">{title}</h3>
                                ) : (
                                    title
                                )}
                                {subtitle && (
                                    <p className="text-xs text-text-muted mt-0.5 m-0 leading-normal">{subtitle}</p>
                                )}
                            </div>
                        )}

                        {/* Search and Action Tools */}
                        <div className="flex flex-wrap items-center gap-2.5 ml-auto w-full lg:w-auto justify-end">
                            {onSearchChange && (
                                <form
                                    onSubmit={(e) => {
                                        if (onSearchSubmit) onSearchSubmit(e);
                                        else e.preventDefault();
                                    }}
                                    className="relative flex-1 sm:w-72 lg:w-80"
                                >
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder={searchPlaceholder}
                                        value={searchValue || ""}
                                        onChange={(e) => onSearchChange(e.target.value)}
                                        className="w-full pl-9 pr-8 py-1.5 bg-bg-dark border border-border-color rounded-lg text-text-primary text-xs outline-none focus:border-accent-primary focus:shadow-glow transition-all"
                                    />
                                    {searchValue && onSearchClear && (
                                        <button
                                            type="button"
                                            onClick={onSearchClear}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary bg-transparent border-none cursor-pointer text-sm"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </form>
                            )}

                            {actions}
                        </div>
                    </div>
                )}

                {/* Top Pagination Toolbar */}
                {pagination && showTopPagination && (
                    <div className="pt-2 border-t border-border-color/60">
                        <PaginationControls {...pagination} />
                    </div>
                )}
            </div>

            {/* Middle Section: Internally Scrollable Table Body */}
            <div className="flex-1 overflow-auto custom-scrollbar relative min-h-0">
                {error ? (
                    <div className="p-8 text-center text-red-400">
                        <AlertCircle size={36} className="mx-auto mb-3 opacity-60" />
                        <h4 className="font-semibold mb-1">Failed to load data</h4>
                        <p className="text-xs text-text-muted max-w-md mx-auto">{error}</p>
                    </div>
                ) : empty && !loading ? (
                    <div className="p-12 text-center text-text-muted">
                        <SearchX size={40} className="mx-auto mb-3 opacity-40 text-text-muted" />
                        <h4 className="font-semibold text-text-primary mb-1">{emptyTitle}</h4>
                        <p className="text-xs text-text-secondary max-w-sm mx-auto">{emptyMessage}</p>
                    </div>
                ) : (
                    children
                )}
            </div>

            {/* Bottom Pinned Pagination Footer */}
            {pagination && showBottomPagination && (
                <div className="p-3 border-t border-border-color bg-bg-surface/80 backdrop-blur-md shrink-0">
                    <PaginationControls {...pagination} showLimitSelector={false} />
                </div>
            )}
        </div>
    );
}
