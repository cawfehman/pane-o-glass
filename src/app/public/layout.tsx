import Link from "next/link";

export default function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg-dark)' }}>
            <header style={{ 
                padding: '1.5rem 2rem', 
                borderBottom: '1px solid var(--border-color)', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                background: 'var(--bg-surface)'
            }}>
                <div className="brand" style={{ fontSize: '1.5rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="9" y1="21" x2="9" y2="9"></line>
                    </svg>
                    InfoSec Tools <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginLeft: '8px' }}>Security Tools</span>
                </div>
                <Link href="/login" className="btn-secondary" style={{ textDecoration: 'none' }}>
                    Return to Login
                </Link>
            </header>
            
            <main style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '3rem 1rem' }}>
                <div style={{ width: '100%', maxWidth: '1000px' }}>
                    {children}
                </div>
            </main>

            <footer style={{ 
                padding: '2rem', 
                textAlign: 'center', 
                color: 'var(--text-muted)', 
                fontSize: '0.875rem',
                borderTop: '1px solid var(--border-color)'
            }}>
                &copy; {new Date().getFullYear()} Information Security Secure Utilities
            </footer>
        </div>
    );
}
