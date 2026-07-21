"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Wrench, Shield, Server, Network, Lock, ShieldAlert, ShieldCheck, Globe, Map, Users, Key, ClipboardList, Activity, MessageSquare } from "lucide-react";
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
                <Shield size={24} color="var(--accent-primary)" />
                InfoSec Tools
            </div>

            <div className="pl-4">
                <Clock />
            </div>

            <nav className="flex flex-col gap-1">
                <div className="nav-section">Main</div>
                <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
                    <LayoutDashboard size={20} />
                    Dashboard
                </Link>

                <Link href="/queries" className={`nav-link ${pathname === "/queries" ? "active" : ""}`}>
                    <Wrench size={20} />
                    System Tools
                </Link>

                {/* Consolidated Tool Links */}
                {(isAnalyst || permissions.length > 0) && (
                    <div className="ml-4 flex flex-col gap-1">
                        {hasPermission('firewall') && (
                            <Link href="/queries/firewall" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/firewall") ? "active" : ""}`}>
                                <Shield size={18} />
                                Cisco Firewall Utilities
                            </Link>
                        )}
                        {hasPermission('ise') && (
                            <Link href="/queries/ise" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/ise") ? "active" : ""}`}>
                                <Server size={18} />
                                Cisco ISE Center
                            </Link>
                        )}
                        {hasPermission('vpn') && (
                            <Link href="/queries/vpn" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/vpn") ? "active" : ""}`}>
                                <Network size={18} />
                                VPN Troubleshooting
                            </Link>
                        )}
                        {hasPermission('ise-tacacs') && (
                            <Link href="/queries/tacacs" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/tacacs") ? "active" : ""}`}>
                                <Lock size={18} />
                                TACACS+ Administration
                            </Link>
                        )}
                        {hasPermission('hibp-account') && (
                            <Link href="/queries/hibp/account" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/account") ? "active" : ""}`}>
                                <ShieldAlert size={18} />
                                HIBP Account Security
                            </Link>
                        )}
                        {hasPermission('hibp-domain') && (
                            <Link href="/queries/hibp/domain" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/domain") ? "active" : ""}`}>
                                <ShieldCheck size={18} />
                                HIBP Domain Security
                            </Link>
                        )}
                        {hasPermission('threat-intel') && (
                            <Link href="/queries/threat-intel" className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/threat-intel") ? "active" : ""}`}>
                                <Globe size={18} />
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
                                <Map size={20} />
                                Site Mapping
                            </Link>
                        )}
                        {isAdmin && (
                            <>
                                <Link href="/users" className={`nav-link ${pathname === "/users" ? "active" : ""}`}>
                                    <Users size={20} />
                                    Account Management
                                </Link>
                                <Link href="/users/permissions" className={`nav-link ${pathname === "/users/permissions" ? "active" : ""}`}>
                                    <Key size={20} />
                                    Tool Permissions
                                </Link>
                                <Link href="/users/audit" className={`nav-link ${pathname === "/users/audit" ? "active" : ""}`}>
                                    <ClipboardList size={20} />
                                    Audit Logs
                                </Link>
                                <Link href="/users/health" className={`nav-link ${pathname === "/users/health" ? "active" : ""}`}>
                                    <Activity size={20} />
                                    System Health
                                </Link>
                                <Link href="/admin/feedback" className={`nav-link ${pathname === "/admin/feedback" ? "active" : ""}`}>
                                    <MessageSquare size={20} />
                                    User Feedback
                                </Link>
                                <Link href="/admin/vectra" className={`nav-link ${pathname === "/admin/vectra" ? "active" : ""}`}>
                                    <Network size={20} />
                                    Vectra Time Machine
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
