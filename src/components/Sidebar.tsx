import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function Sidebar() {
    const session = await auth();
    const isAdmin = (session?.user as any)?.role === 'ADMIN';

    return (
        <aside className="sidebar">
            <div className="brand">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                LinuxDash
            </div>
            <nav>
                <div className="nav-section">Main</div>
                <Link href="/" className="nav-link active">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    Dashboard
                </Link>
                <Link href="/queries" className="nav-link">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                    System Tools
                </Link>
                <div className="nav-link" style={{ paddingLeft: '2.5rem', fontSize: '0.875rem', cursor: 'default', color: 'var(--text-secondary)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                    Have I Been Pwned
                </div>
                <Link href="/queries/hibp/account" className="nav-link" style={{ paddingLeft: '4rem', fontSize: '0.8rem' }}>
                    Account Security
                </Link>
                <Link href="/queries/hibp/domain" className="nav-link" style={{ paddingLeft: '4rem', fontSize: '0.8rem' }}>
                    Domain Security
                </Link>

                {isAdmin && (
                    <>
                        <div className="nav-section">Settings</div>
                        <Link href="/users" className="nav-link">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Local Accounts
                        </Link>
                    </>
                )}
            </nav>
        </aside>
    );
}
