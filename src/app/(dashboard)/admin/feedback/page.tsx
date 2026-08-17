"use client";

import { useState, useEffect, useMemo } from "react";
import { DataTableContainer } from "@/components/common/DataTableContainer";
import { MessageSquare } from "lucide-react";

export default function AdminFeedbackPage() {
    const [feedbackList, setFeedbackList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(25);

    const fetchFeedback = async () => {
        try {
            const res = await fetch("/api/feedback");
            if (res.ok) {
                const data = await res.json();
                setFeedbackList(data);
            } else {
                setError("Failed to fetch feedback. Ensure you have Admin privileges.");
            }
        } catch (e) {
            setError("An error occurred while fetching feedback.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFeedback();
    }, []);

    const filteredFeedback = useMemo(() => {
        if (!searchQuery.trim()) return feedbackList;
        const q = searchQuery.toLowerCase();
        return feedbackList.filter((item) => {
            const user = (item.user?.username || "").toLowerCase();
            const subject = (item.subject || "").toLowerCase();
            const tool = (item.tool || "").toLowerCase();
            const body = (item.body || "").toLowerCase();
            return user.includes(q) || subject.includes(q) || tool.includes(q) || body.includes(q);
        });
    }, [feedbackList, searchQuery]);

    const paginatedFeedback = useMemo(() => {
        const start = (page - 1) * limit;
        return filteredFeedback.slice(start, start + limit);
    }, [filteredFeedback, page, limit]);

    return (
        <div className="internal-scroll-layout flex flex-col h-full">
            <div className="shrink-0 mb-4">
                <h1 className="flex items-center gap-2">
                    <MessageSquare className="text-accent-primary" size={28} />
                    User Feedback Management
                </h1>
                <p className="text-text-secondary text-sm">
                    Review and track feedback submitted by members across the utility suite.
                </p>
            </div>

            <DataTableContainer
                title="Submitted Feedback"
                subtitle={`Showing ${filteredFeedback.length} total submissions`}
                searchValue={searchQuery}
                searchPlaceholder="Search feedback by user, tool, or keyword..."
                onSearchChange={(q) => {
                    setSearchQuery(q);
                    setPage(1);
                }}
                onSearchClear={() => {
                    setSearchQuery("");
                    setPage(1);
                }}
                pagination={{
                    totalRecords: filteredFeedback.length,
                    page,
                    limit,
                    limitOptions: [25, 50, 100],
                    onPageChange: setPage,
                    onLimitChange: (l) => {
                        setLimit(l);
                        setPage(1);
                    },
                    showLimitSelector: true,
                }}
                loading={loading}
                error={error}
                empty={filteredFeedback.length === 0}
                emptyTitle="No feedback found"
                emptyMessage="No user feedback matching your filter criteria."
            >
                <table className="w-full border-collapse text-left text-sm">
                    <thead className="sticky top-0 bg-bg-surface z-10">
                        <tr className="border-b border-border-color text-text-secondary text-xs uppercase">
                            <th className="py-3 px-4">Timestamp</th>
                            <th className="py-3 px-4">User</th>
                            <th className="py-3 px-4">Tool / Page</th>
                            <th className="py-3 px-4">Subject</th>
                            <th className="py-3 px-4">Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedFeedback.map((item) => (
                            <tr key={item.id} className="border-b border-border-color hover:bg-bg-surface-hover/40 transition-colors">
                                <td className="py-3 px-4 text-text-muted text-xs whitespace-nowrap">
                                    {new Date(item.createdAt).toLocaleString()}
                                </td>
                                <td className="py-3 px-4 font-semibold text-text-primary whitespace-nowrap">
                                    {item.user?.username || "Unknown"}
                                    {item.user?.firstName && ` (${item.user.firstName})`}
                                </td>
                                <td className="py-3 px-4 text-accent-primary text-xs">
                                    <span className="px-2 py-0.5 rounded bg-accent-glow border border-accent-primary/20 font-mono">
                                        {item.tool}
                                    </span>
                                </td>
                                <td className="py-3 px-4 font-semibold text-text-primary">
                                    {item.subject}
                                </td>
                                <td className="py-3 px-4 text-text-secondary text-xs max-w-md leading-relaxed">
                                    {item.body}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </DataTableContainer>
        </div>
    );
}
