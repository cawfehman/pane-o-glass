"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import packageJson from "../../package.json";

export default function SidebarClient({ role, permissions = [] }: { role: string, permissions?: string[] }) {
    const pathname = usePathname();
    const isAdmin = role === "ADMIN";
    const isAnalyst = role === "ANALYST" || isAdmin;

    const hasPermission = (toolId: string) => permissions.includes(toolId);

    return (
        <aside className="sidebar">
            <div className="brand">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                InfoSec Tools
            </div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div className="nav-section">Main</div>
                <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                    Dashboard
                </Link>

                <Link href="/queries" className={`nav-link ${pathname === "/queries" ? "active" : ""}`}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
                    System Tools
                </Link>

                {/* Consolidated Tool Links */}
                {(isAnalyst || permissions.length > 0) && (
                    <div style={{ marginLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {hasPermission('firewall') && (
                            <Link href="/queries/firewall" className={`nav-link ${pathname === "/queries/firewall" ? "active" : ""}`} style={{ fontSize: '0.9rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                Cisco Firewall
                            </Link>
                        )}
                        {hasPermission('ise') && (
                            <Link href="/queries/ise" className={`nav-link ${pathname === "/queries/ise" ? "active" : ""}`} style={{ fontSize: '0.9rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                                Cisco ISE
                            </Link>
                        )}
                        {hasPermission('ise-failures') && (
                            <Link href="/queries/ise-failures" className={`nav-link ${pathname === "/queries/ise-failures" ? "active" : ""}`} style={{ fontSize: '0.9rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                ISE Auth Failures
                            </Link>
                        )}
                        {hasPermission('hibp-account') && (
                            <Link href="/queries/hibp/account" className={`nav-link ${pathname === "/queries/hibp/account" ? "active" : ""}`} style={{ fontSize: '0.9rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                HIBP Account Security
                            </Link>
                        )}
                        {hasPermission('hibp-domain') && (
                            <Link href="/queries/hibp/domain" className={`nav-link ${pathname === "/queries/hibp/domain" ? "active" : ""}`} style={{ fontSize: '0.9rem' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                HIBP Domain Security
                            </Link>
                        )}
                    </div>
                )}

                {isAdmin && (
                    <>
                        <div className="nav-section" style={{ marginTop: '1rem' }}>Settings</div>
                        <Link href="/users" className={`nav-link ${pathname === "/users" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Account Management
                        </Link>
                        <Link href="/users/permissions" className={`nav-link ${pathname === "/users/permissions" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            Tool Permissions
                        </Link>
                        <Link href="/users/audit" className={`nav-link ${pathname === "/users/audit" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Audit Logs
                        </Link>
                        <Link href="/users/health" className={`nav-link ${pathname === "/users/health" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                            System Health
                        </Link>
                    </>
                )}
            </nav>

            {/* Version Footer */}
            <div style={{ marginTop: 'auto', paddingTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                v{packageJson.version}
            </div>
        </aside>
    );
}
