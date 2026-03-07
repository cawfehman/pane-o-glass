import Link from "next/link";

export default function NetworkToolsPage() {
    return (
        <div>
            <div style={{ marginBottom: '32px' }}>
                <h1>Network Tools</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Centralized utilities for interacting with your network infrastructure.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                <Link href="/queries/firewall" style={{ textDecoration: 'none' }}>
                    <div className="glass-card" style={{ height: '100%', cursor: 'pointer', transition: 'border-color 0.2s', border: '1px solid transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px', gap: '12px' }}>
                            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '50%' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                                    <line x1="6" y1="6" x2="6" y2="6"></line>
                                    <line x1="6" y1="18" x2="6" y2="18"></line>
                                </svg>
                            </div>
                            <h3 style={{ margin: 0 }}>Cisco Firewall Utilities</h3>
                        </div>
                        <p style={{ color: 'var(--text-muted)' }}>
                            Securely query and remove IPv4 shuns across your configured Cisco Adaptive Security Appliances (ASA) directly from the dashboard.
                        </p>
                    </div>
                </Link>
            </div>
        </div>
    );
}
