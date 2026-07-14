"use client";

import { useState, useEffect } from "react";

export default function AdminFeedbackPage() {
    const [feedbackList, setFeedbackList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

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

    return (
        <div className="internal-scroll-layout">
            <div className="shrink-0 mb-8">
                <h1>User Feedback Management</h1>
                <p className="text-text-secondary">Review and track feedback submitted by members across the utility suite.</p>
            </div>

            <div className="glass-card flex-1 flex flex-col min-h-0 pb-0">
                {loading ? (
                    <p className="text-text-muted p-6">Loading feedback...</p>
                ) : error ? (
                    <div className="m-6 p-4 bg-red-500/10 text-red-500 rounded-md border border-red-500">
                        {error}
                    </div>
                ) : feedbackList.length === 0 ? (
                    <p className="text-text-muted p-6">No feedback has been submitted yet.</p>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full border-collapse text-left">
                            <thead className="sticky-header">
                                <tr className="border-b border-border-color text-text-secondary">
                                    <th className="py-3 pl-6 pr-0">Timestamp</th>
                                    <th className="py-3 px-2">User</th>
                                    <th className="py-3 px-2">Tool/Page</th>
                                    <th className="py-3 px-2">Subject</th>
                                    <th className="py-3 pr-2 pl-0">Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {feedbackList.map((item) => (
                                    <tr key={item.id} className="border-b border-border-color">
                                        <td className="py-3 pl-6 pr-0 text-text-muted text-sm whitespace-nowrap">
                                            {new Date(item.createdAt).toLocaleString()}
                                        </td>
                                        <td className="py-3 px-2 font-medium text-text-primary whitespace-nowrap">
                                            {item.user?.username || "Unknown"}
                                            {item.user?.firstName && ` (${item.user.firstName})`}
                                        </td>
                                        <td className="py-3 px-2 text-accent-primary text-sm">
                                            <code>{item.tool}</code>
                                        </td>
                                        <td className="py-3 px-2 font-semibold text-text-primary">
                                            {item.subject}
                                        </td>
                                        <td className="py-3 pr-2 pl-0 text-text-secondary text-[0.9rem] max-w-[400px]">
                                            {item.body}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
