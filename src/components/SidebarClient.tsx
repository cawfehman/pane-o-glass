"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import appVersion from "../version.json";

export default function SidebarClient({ isAdmin }: { isAdmin: boolean }) {
    const pathname = usePathname();

    // Auto-expand menus based on current path
    const [networkOpen, setNetworkOpen] = useState(false);
    const [hibpOpen, setHibpOpen] = useState(false);

    useEffect(() => {
        if (pathname?.startsWith("/queries/network") || pathname?.startsWith("/queries/firewall")) {
            setNetworkOpen(true);
        }
        if (pathname?.startsWith("/queries/hibp")) {
            setHibpOpen(true);
        }
    }, [pathname]);

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

                <div className="nav-section" style={{ marginTop: '1rem' }}>Modules</div>

                {/* Network Tools Collapsible */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Link
                            href="/queries/network"
                            className={`nav-link ${pathname === "/queries/network" ? "active" : ""}`}
                            style={{ flex: 1, paddingLeft: '1.5rem' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Network Tools
                        </Link>
                        <button
                            onClick={(e) => { e.preventDefault(); setNetworkOpen(!networkOpen); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: networkOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    </div>
                    {networkOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                            <Link href="/queries/firewall" className={`nav-link ${pathname === "/queries/firewall" ? "active" : ""}`} style={{ paddingLeft: '3.5rem', fontSize: '0.875rem' }}>
                                Cisco Firewall
                            </Link>
                        </div>
                    )}
                </div>

                {/* HIBP Collapsible */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Link
                            href="/queries/hibp"
                            className={`nav-link ${pathname === "/queries/hibp" ? "active" : ""}`}
                            style={{ flex: 1, paddingLeft: '1.5rem' }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            Have I Been Pwned
                        </Link>
                        <button
                            onClick={(e) => { e.preventDefault(); setHibpOpen(!hibpOpen); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px' }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: hibpOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    </div>
                    {hibpOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
                            <Link href="/queries/hibp/account" className={`nav-link ${pathname === "/queries/hibp/account" ? "active" : ""}`} style={{ paddingLeft: '3.5rem', fontSize: '0.875rem' }}>
                                Account Security
                            </Link>
                            <Link href="/queries/hibp/domain" className={`nav-link ${pathname === "/queries/hibp/domain" ? "active" : ""}`} style={{ paddingLeft: '3.5rem', fontSize: '0.875rem' }}>
                                Domain Security
                            </Link>
                        </div>
                    )}
                </div>

                {isAdmin && (
                    <>
                        <div className="nav-section" style={{ marginTop: '1rem' }}>Settings</div>
                        <Link href="/users" className={`nav-link ${pathname === "/users" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            Local Accounts
                        </Link>
                        <Link href="/users/audit" className={`nav-link ${pathname === "/users/audit" ? "active" : ""}`}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Audit Logs
                        </Link>
                    </>
                )}
            </nav>

            {/* Version Footer */}
            <div style={{ marginTop: 'auto', paddingTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                v{appVersion.version}
            </div>
        </aside>
    );
}
