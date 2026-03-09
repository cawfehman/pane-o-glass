import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPermissionsForRole } from "@/app/actions/permissions";

export default async function QueriesPage() {
    const session = await auth();
    const role = (session?.user as any)?.role || "USER";
    const normalizedRole = String(role).toUpperCase();
    const isAdmin = normalizedRole === "ADMIN";
    
    // Fetch dynamic permissions from DB
    const permissions = await getPermissionsForRole(normalizedRole);
    const hasPermission = (toolId: string) => permissions.includes(toolId) || isAdmin;

    return (
        <div className="page-container">
            <header style={{ marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>System Tools & Queries</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Centralized interface for external services and security queries.
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
                {/* HIBP - Dynamic Permission */}
                {hasPermission('hibp-account') && (
                    <Link href="/queries/hibp/account" style={{ textDecoration: 'none' }}>
                        <div className="glass-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%', background: 'var(--bg-surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: 'var(--accent-glow)', padding: '12px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>HIBP Account Safety</h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                                Query breached databases to verify account safety.
                            </p>
                        </div>
                    </Link>
                )}

                {hasPermission('hibp-domain') && (
                    <Link href="/queries/hibp/domain" style={{ textDecoration: 'none' }}>
                        <div className="glass-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%', background: 'var(--bg-surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: 'var(--accent-glow)', padding: '12px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>HIBP Domain Safety</h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                                Monitor domain-wide breach data for organization safety.
                            </p>
                        </div>
                    </Link>
                )}

                {/* ISE - Dynamic Permission */}
                {hasPermission('ise') && (
                    <Link href="/queries/ise" style={{ textDecoration: 'none' }}>
                        <div className="glass-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%', background: 'var(--bg-surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: 'var(--accent-glow)', padding: '12px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Cisco ISE Sessions</h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                                Monitor live network authentication sessions and identity services.
                            </p>
                        </div>
                    </Link>
                )}

                {/* Firewall - Dynamic Permission */}
                {hasPermission('firewall') && (
                    <Link href="/queries/firewall" style={{ textDecoration: 'none' }}>
                        <div className="glass-card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%', background: 'var(--bg-surface)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{ background: 'var(--accent-glow)', padding: '12px', borderRadius: '12px', color: 'var(--accent-primary)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Cisco Firewall Tools</h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                                Analyze firewall logs and manage shun list histories.
                            </p>
                        </div>
                    </Link>
                )}

                {/* If no tools are available */}
                {!isAdmin && permissions.length === 0 && (
                    <div className="glass-card" style={{ background: 'var(--bg-surface)', padding: '2rem', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-secondary)' }}>You do not have access to any system tools yet. Contact an administrator if this is an error.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
