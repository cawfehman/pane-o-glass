import Link from "next/link";

export default function HIBPQueryPage() {
    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1>Have I Been Pwned Utilities</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Check if your accounts, passwords, or company domains have been compromised in data breaches.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                <Link href="/queries/hibp/account" style={{ textDecoration: 'none' }}>
                    <div className="glass-card" style={{ height: '100%', cursor: 'pointer', transition: 'border-color 0.2s', border: '1px solid transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '50%' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                    <polyline points="22,6 12,13 2,6"></polyline>
                                </svg>
                            </div>
                            <h3 style={{ margin: 0 }}>Account Security</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Contains the Email & Account Check as well as the Secure Password Risk Check (using k-Anonymity privacy protocols) for individual monitoring.
                        </p>
                    </div>
                </Link>

                <Link href="/queries/hibp/domain" style={{ textDecoration: 'none' }}>
                    <div className="glass-card" style={{ height: '100%', cursor: 'pointer', transition: 'border-color 0.2s', border: '1px solid transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '50%' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                    <line x1="8" y1="21" x2="16" y2="21"></line>
                                    <line x1="12" y1="17" x2="12" y2="21"></line>
                                </svg>
                            </div>
                            <h3 style={{ margin: 0 }}>Domain Security</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Aggregate tools for corporate domains. Features the complete Domain Breach Check and a targeted Breach Name reverse search.
                        </p>
                    </div>
                </Link>
            </div>
        </div>
    );
}
