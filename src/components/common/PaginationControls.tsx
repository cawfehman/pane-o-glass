"use client";

import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface PaginationControlsProps {
    totalRecords: number;
    page: number;
    limit: number;
    limitOptions?: number[];
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
    showLimitSelector?: boolean;
    compact?: boolean;
}

export function PaginationControls({
    totalRecords,
    page,
    limit,
    limitOptions = [25, 50, 100, 200],
    onPageChange,
    onLimitChange,
    showLimitSelector = true,
    compact = false,
}: PaginationControlsProps) {
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));
    const startRecord = totalRecords > 0 ? (page - 1) * limit + 1 : 0;
    const endRecord = Math.min(page * limit, totalRecords);

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-text-secondary select-none">
            {/* Record range & page size */}
            <div className="flex items-center gap-3">
                <span>
                    Showing <strong className="text-text-primary font-semibold">{startRecord}</strong> to{" "}
                    <strong className="text-text-primary font-semibold">{endRecord}</strong> of{" "}
                    <strong className="text-text-primary font-semibold">{totalRecords.toLocaleString()}</strong> entries
                </span>

                {showLimitSelector && onLimitChange && (
                    <div className="flex items-center gap-1.5 ml-2 border-l border-border-color pl-3">
                        <span className="text-text-muted">Rows:</span>
                        <select
                            value={limit}
                            onChange={(e) => onLimitChange(Number(e.target.value))}
                            className="bg-bg-dark border border-border-color text-text-primary rounded px-2 py-1 text-xs outline-none focus:border-accent-primary cursor-pointer"
                        >
                            {limitOptions.map((opt) => (
                                <option key={opt} value={opt} className="bg-bg-surface text-text-primary">
                                    {opt}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Prev / Page X of Y / Next Buttons */}
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border-color bg-bg-dark text-text-primary hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
                    aria-label="Previous Page"
                >
                    <ChevronLeft size={14} />
                    {!compact && <span>Prev</span>}
                </button>

                <span className="px-2 font-medium text-text-primary whitespace-nowrap">
                    Page <span className="text-accent-primary font-bold">{page}</span> of {totalPages}
                </span>

                <button
                    type="button"
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || totalRecords === 0}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border-color bg-bg-dark text-text-primary hover:bg-bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer font-medium"
                    aria-label="Next Page"
                >
                    {!compact && <span>Next</span>}
                    <ChevronRight size={14} />
                </button>
            </div>
        </div>
    );
}
