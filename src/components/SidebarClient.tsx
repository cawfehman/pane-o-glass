"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
    LayoutDashboard, Wrench, Shield, Server, Network, Lock, 
    ShieldAlert, ShieldCheck, Globe, Map, Users, Key, 
    ClipboardList, Activity, MessageSquare, Mail 
} from "lucide-react";
import packageJson from "../../package.json";
import FeedbackModal from "./FeedbackModal";
import Clock from "./Clock";
import { useSidebar } from "./SidebarContext";

export default function SidebarClient({ role, permissions = [] }: { role: string, permissions?: string[] }) {
    const pathname = usePathname();
    const { isCollapsed, isMobileOpen, closeMobile } = useSidebar();
    const isAdmin = role === "ADMIN";
    const isAnalyst = role === "ANALYST" || isAdmin;

    const hasPermission = (toolId: string) => isAdmin || permissions.includes(toolId);

    return (
        <>
            {isMobileOpen && (
                <div 
                    className="sidebar-backdrop" 
                    onClick={closeMobile}
                    aria-hidden="true"
                />
            )}
            <aside className={`sidebar ${isCollapsed ? "collapsed" : ""} ${isMobileOpen ? "mobile-open" : ""}`}>
                <div className="brand mb-2">
                    <Shield size={24} color="var(--accent-primary)" className="shrink-0" />
                    <span className="brand-text">InfoSec Tools</span>
                </div>

                <div className="pl-4 clock-container">
                    <Clock />
                </div>

                <nav className="flex flex-col gap-1">
                    <div className="nav-section">Main</div>
                    <Link 
                        href="/" 
                        onClick={closeMobile} 
                        title={isCollapsed ? "Dashboard" : undefined}
                        className={`nav-link ${pathname === "/" ? "active" : ""}`}
                    >
                        <LayoutDashboard size={20} className="shrink-0" />
                        <span className="nav-text">Dashboard</span>
                    </Link>

                    <Link 
                        href="/queries" 
                        onClick={closeMobile} 
                        title={isCollapsed ? "System Tools" : undefined}
                        className={`nav-link ${pathname === "/queries" ? "active" : ""}`}
                    >
                        <Wrench size={20} className="shrink-0" />
                        <span className="nav-text">System Tools</span>
                    </Link>

                    {/* Consolidated Tool Links */}
                    {(isAnalyst || permissions.length > 0) && (
                        <div className={isCollapsed ? "flex flex-col gap-1" : "ml-4 flex flex-col gap-1"}>
                            {hasPermission('firewall') && (
                                <Link 
                                    href="/queries/firewall" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "Cisco Firewall Utilities" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/firewall") ? "active" : ""}`}
                                >
                                    <Shield size={18} className="shrink-0" />
                                    <span className="nav-text">Cisco Firewall Utilities</span>
                                </Link>
                            )}
                            {hasPermission('ise') && (
                                <Link 
                                    href="/queries/ise" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "Cisco ISE Center" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/ise") ? "active" : ""}`}
                                >
                                    <Server size={18} className="shrink-0" />
                                    <span className="nav-text">Cisco ISE Center</span>
                                </Link>
                            )}
                            {hasPermission('vpn') && (
                                <Link 
                                    href="/queries/vpn" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "VPN Troubleshooting" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/vpn") ? "active" : ""}`}
                                >
                                    <Network size={18} className="shrink-0" />
                                    <span className="nav-text">VPN Troubleshooting</span>
                                </Link>
                            )}
                            {hasPermission('ise-tacacs') && (
                                <Link 
                                    href="/queries/tacacs" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "TACACS+ Administration" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/tacacs") ? "active" : ""}`}
                                >
                                    <Lock size={18} className="shrink-0" />
                                    <span className="nav-text">TACACS+ Administration</span>
                                </Link>
                            )}
                            {hasPermission('hibp-account') && (
                                <Link 
                                    href="/queries/hibp/account" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "HIBP Account Security" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/account") ? "active" : ""}`}
                                >
                                    <ShieldAlert size={18} className="shrink-0" />
                                    <span className="nav-text">HIBP Account Security</span>
                                </Link>
                            )}
                            {hasPermission('hibp-domain') && (
                                <Link 
                                    href="/queries/hibp/domain" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "HIBP Domain Security" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/hibp/domain") ? "active" : ""}`}
                                >
                                    <ShieldCheck size={18} className="shrink-0" />
                                    <span className="nav-text">HIBP Domain Security</span>
                                </Link>
                            )}
                            {hasPermission('threat-intel') && (
                                <Link 
                                    href="/queries/threat-intel" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "Threat Intelligence" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/threat-intel") ? "active" : ""}`}
                                >
                                    <Globe size={18} className="shrink-0" />
                                    <span className="nav-text">Threat Intelligence</span>
                                </Link>
                            )}
                            {hasPermission('ironport') && (
                                <Link 
                                    href="/queries/ironport" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "IronPort Telemetry" : undefined}
                                    className={`nav-link text-[0.9rem] ${pathname.startsWith("/queries/ironport") ? "active" : ""}`}
                                >
                                    <Mail size={18} className="shrink-0" />
                                    <span className="nav-text">IronPort Telemetry</span>
                                </Link>
                            )}
                        </div>
                    )}

                    {(isAdmin || hasPermission('site-management')) && (
                        <>
                            <div className="nav-section mt-4">Settings & Admin</div>
                            {hasPermission('site-management') && (
                                <Link 
                                    href="/settings/sites" 
                                    onClick={closeMobile}
                                    title={isCollapsed ? "Site Mapping" : undefined}
                                    className={`nav-link ${pathname === "/settings/sites" ? "active" : ""}`}
                                >
                                    <Map size={20} className="shrink-0" />
                                    <span className="nav-text">Site Mapping</span>
                                </Link>
                            )}
                            {isAdmin && (
                                <>
                                    <Link 
                                        href="/users" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "Account Management" : undefined}
                                        className={`nav-link ${pathname === "/users" ? "active" : ""}`}
                                    >
                                        <Users size={20} className="shrink-0" />
                                        <span className="nav-text">Account Management</span>
                                    </Link>
                                    <Link 
                                        href="/users/permissions" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "Tool Permissions" : undefined}
                                        className={`nav-link ${pathname === "/users/permissions" ? "active" : ""}`}
                                    >
                                        <Key size={20} className="shrink-0" />
                                        <span className="nav-text">Tool Permissions</span>
                                    </Link>
                                    <Link 
                                        href="/users/audit" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "Audit Logs" : undefined}
                                        className={`nav-link ${pathname === "/users/audit" ? "active" : ""}`}
                                    >
                                        <ClipboardList size={20} className="shrink-0" />
                                        <span className="nav-text">Audit Logs</span>
                                    </Link>
                                    <Link 
                                        href="/users/health" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "System Health" : undefined}
                                        className={`nav-link ${pathname === "/users/health" ? "active" : ""}`}
                                    >
                                        <Activity size={20} className="shrink-0" />
                                        <span className="nav-text">System Health</span>
                                    </Link>
                                    <Link 
                                        href="/admin/feedback" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "User Feedback" : undefined}
                                        className={`nav-link ${pathname === "/admin/feedback" ? "active" : ""}`}
                                    >
                                        <MessageSquare size={20} className="shrink-0" />
                                        <span className="nav-text">User Feedback</span>
                                    </Link>
                                    <Link 
                                        href="/admin/vectra" 
                                        onClick={closeMobile}
                                        title={isCollapsed ? "Vectra Time Machine" : undefined}
                                        className={`nav-link ${pathname === "/admin/vectra" ? "active" : ""}`}
                                    >
                                        <Network size={20} className="shrink-0" />
                                        <span className="nav-text">Vectra Time Machine</span>
                                    </Link>
                                </>
                            )}
                        </>
                    )}
                </nav>

                {/* Feedback & Version Footer */}
                <div className="mt-auto pt-4 flex flex-col gap-3">
                    <FeedbackModal />
                    <div 
                        className="text-center text-xs text-text-muted version-text select-none"
                        title={`InfoSec Tools v${packageJson.version}`}
                    >
                        v{packageJson.version}
                    </div>
                </div>
            </aside>
        </>
    );
}

