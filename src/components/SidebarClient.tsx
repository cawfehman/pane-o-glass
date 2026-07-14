"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import packageJson from "../../package.json";
import FeedbackModal from "./FeedbackModal";
import Clock from "./Clock";

export default function SidebarClient({ role, permissions = [] }: { role: string, permissions?: string[] }) {
    const pathname = usePathname();
    const isAdmin = role === "ADMIN";
    const isAnalyst = role === "ANALYST" || isAdmin;

    const hasPermission = (toolId: string) => isAdmin || permissions.includes(toolId);

    return (
        <aside className="sidebar">
            <div className="brand mb-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="3" y1="9" x2="21" y2="9"></line>
                    <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                InfoSec Tools
            </div>

            <div className="pl-4">
                <Clock />
            </div>

            <nav className="flex flex-col gap-1">
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
                    <div className="ml-4 flex flex-col gap-1">
                        {hasPermission('firewall') && (
                            <Link href="/queries/firewall" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/firewall") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                Cisco Firewall
                            </Link>
                        )}
                        {hasPermission('ise') && (
                            <Link href="/queries/ise" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/ise") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
                                Cisco ISE Center
                            </Link>
                        )}
                        {hasPermission('vpn') && (
                            <Link href="/queries/vpn" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/vpn") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.58 16.14a5 5 0 0 1 6.84 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
                                VPN Troubleshooting
                            </Link>
                        )}
                        {hasPermission('ise-tacacs') && (
                            <Link href="/queries/tacacs" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/tacacs") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                                TACACS+ Administration
                            </Link>
                        )}
                        {hasPermission('hibp-account') && (
                            <Link href="/queries/hibp/account" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/account") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                HIBP Account Security
                            </Link>
                        )}
                        {hasPermission('hibp-domain') && (
                            <Link href="/queries/hibp/domain" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/domain") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                                HIBP Domain Security
                            </Link>
                        )}
                        {hasPermission('threat-intel') && (
                            <Link href="/queries/threat-intel" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/threat-intel") ? "active" : ""}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                Threat Intelligence
                            </Link>
                        )}
                    </div>
                )}

                {(isAdmin || hasPermission('site-management')) && (
                    <>
                        <div className="nav-section mt-4">Settings & Admin</div>
                        {hasPermission('site-management') && (
                            <Link href="/settings/sites" className={`nav-link ${pathname === "/settings/sites" ? "active" : ""}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                Site Mapping
                            </Link>
                        )}
                        {isAdmin && (
                            <>
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
                                <Link href="/admin/feedback" className={`nav-link ${pathname === "/admin/feedback" ? "active" : ""}`}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                    User Feedback
                                </Link>
                            </>
                        )}
                    </>
                )}
            </nav>

            {/* Feedback & Version Footer */}
            <div className="mt-auto pt-4 flex flex-col gap-4">
                <FeedbackModal />
                <div className="text-center text-xs text-text-muted">
                    v{packageJson.version}
                </div>
            </div>
        </aside>
    );
}
