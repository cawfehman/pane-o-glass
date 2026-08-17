"use client";

import React from "react";

export function TableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
    return (
        <tbody className="divide-y divide-border-color">
            {Array.from({ length: rows }).map((_, rIdx) => (
                <tr key={rIdx} className="animate-pulse">
                    {Array.from({ length: columns }).map((_, cIdx) => (
                        <td key={cIdx} className="p-4">
                            <div
                                className="h-4 bg-white/5 rounded"
                                style={{
                                    width: cIdx === 0 ? "70%" : cIdx === 1 ? "90%" : cIdx === 2 ? "50%" : "60%",
                                }}
                            />
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}
