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
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1>User Feedback Management</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Review and track feedback submitted by members across the utility suite.</p>
            </div>

            <div className="glass-card">
                {loading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Loading feedback...</p>
                ) : error ? (
                    <div style={{ padding: '1rem', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 'var(--radius-md)', border: '1px solid #ef4444' }}>
                        {error}
                    </div>
                ) : feedbackList.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No feedback has been submitted yet.</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '12px 8px' }}>Timestamp</th>
                                    <th style={{ padding: '12px 8px' }}>User</th>
                                    <th style={{ padding: '12px 8px' }}>Tool/Page</th>
                                    <th style={{ padding: '12px 8px' }}>Subject</th>
                                    <th style={{ padding: '12px 8px' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {feedbackList.map((item) => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                                            {new Date(item.createdAt).toLocaleString()}
                                        </td>
                                        <td style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                            {item.user?.username || "Unknown"}
                                            {item.user?.firstName && ` (${item.user.firstName})`}
                                        </td>
                                        <td style={{ padding: '12px 8px', color: 'var(--accent-primary)', fontSize: '0.875rem' }}>
                                            <code>{item.tool}</code>
                                        </td>
                                        <td style={{ padding: '12px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                            {item.subject}
                                        </td>
                                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '400px' }}>
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
