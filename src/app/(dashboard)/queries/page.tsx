"use client";

import Link from "next/link";

export default function QueriesPage() {
    return (
        <div>
            <h1 style={{ marginBottom: '24px' }}>System Tools & Queries</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
                Interface with your external services safely from this centralized dashboard.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                <Link href="/queries/hibp" style={{ textDecoration: 'none' }}>
                    <div className="glass-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ background: 'var(--bg-surface-hover)', padding: '12px', borderRadius: '50%', color: 'var(--accent-primary)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            </div>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Have I Been Pwned</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                            Query the world's largest secure database of breached emails and passwords to verify account safety.
                        </p>
                    </div>
                </Link>

                <div className="glass-card" style={{ opacity: 0.5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div style={{ background: 'var(--bg-surface-hover)', padding: '12px', borderRadius: '50%', color: 'var(--text-muted)' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        </div>
                        <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>More Tools (Coming Soon)</h3>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                        Placeholder for additional system queries and integrations.
                    </p>
                </div>
            </div>
        </div>
    );
}
