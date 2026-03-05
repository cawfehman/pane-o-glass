"use client";

import { useState } from "react";

export default function QueriesPage() {
    const [results, setResults] = useState<{ id: number, name: string, status: string }[] | null>(null);
    const [loading, setLoading] = useState(false);

    const handleQuery = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        // Simulate an external system query delay
        await new Promise(resolve => setTimeout(resolve, 800));

        setResults([
            { id: 101, name: "System Process Alpha", status: "Running" },
            { id: 102, name: "System Process Beta", status: "Stopped" },
            { id: 103, name: "Database Sync Job", status: "Pending" },
        ]);

        setLoading(false);
    };

    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>System Tools & Queries</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                Interface with your internal services safely from this centralized dashboard.
            </p>

            <div className="glass-card" style={{ marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px' }}>Query Process Status</h3>
                <form onSubmit={handleQuery} style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="input-group" style={{ flexGrow: 1, maxWidth: '400px' }}>
                        <label htmlFor="search">Search Term (e.g. process name or ID)</label>
                        <input type="text" id="search" name="search" placeholder="Enter process name..." />
                    </div>
                    <button type="submit" className="btn-primary" disabled={loading} style={{ minWidth: '120px' }}>
                        {loading ? "querying..." : "Execute Query"}
                    </button>
                </form>
            </div>

            {results && (
                <div className="glass-card">
                    <h3 style={{ marginBottom: '16px' }}>Query Results</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '12px 8px' }}>Process ID</th>
                                <th style={{ padding: '12px 8px' }}>Name</th>
                                <th style={{ padding: '12px 8px', textAlign: 'right' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.map((res) => (
                                <tr key={res.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '12px 8px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{res.id}</td>
                                    <td style={{ padding: '12px 8px', fontWeight: 500 }}>{res.name}</td>
                                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            backgroundColor: res.status === 'Running' ? 'rgba(34, 197, 94, 0.2)' : 'var(--bg-surface-hover)',
                                            color: res.status === 'Running' ? '#22c55e' : 'var(--text-secondary)'
                                        }}>
                                            {res.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
