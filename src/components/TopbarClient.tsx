"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { useSidebar } from "./SidebarContext";
import UserMenu from "./UserMenu";

export default function TopbarClient({ userName }: { userName: string }) {
    const { isCollapsed, toggleCollapsed, toggleMobileOpen } = useSidebar();
    const pathname = usePathname();

    // Friendly breadcrumb mapper
    const getBreadcrumb = (path: string) => {
        if (path === "/") return "Command Center";
        if (path === "/queries") return "System Tools";
        if (path.startsWith("/queries/firewall")) return "Forensics / Cisco Firewalls";
        if (path.startsWith("/queries/ise")) return "Forensics / Cisco ISE";
        if (path.startsWith("/queries/vpn")) return "Forensics / VPN Troubleshooting";
        if (path.startsWith("/queries/tacacs")) return "Administration / TACACS+";
        if (path.startsWith("/queries/hibp/account")) return "Security / HIBP Accounts";
        if (path.startsWith("/queries/hibp/domain")) return "Security / HIBP Domains";
        if (path.startsWith("/queries/threat-intel")) return "Threat Intel / Reputation";
        if (path.startsWith("/queries/ironport")) return "Forensics / IronPort";
        if (path.startsWith("/settings/sites")) return "Settings / Site Mapping";
        if (path.startsWith("/users/permissions")) return "Admin / Permissions";
        if (path.startsWith("/users/audit")) return "Admin / Audit Logs";
        if (path.startsWith("/users/health")) return "Admin / System Health";
        if (path.startsWith("/users")) return "Admin / Local Accounts";
        if (path.startsWith("/admin/feedback")) return "Admin / User Feedback";
        if (path.startsWith("/admin/vectra")) return "Admin / Vectra Time Machine";
        if (path.startsWith("/profile")) return "Settings / My Profile";
        return "InfoSec Tools";
    };

    return (
        <header className="topbar">
            {/* Left section: Sidebar toggles & Breadcrumb */}
            <div className="flex items-center gap-3">
                {/* Desktop Collapse Toggle */}
                <button
                    onClick={toggleCollapsed}
                    className="hidden lg:flex p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors border border-border-color bg-transparent cursor-pointer"
                    title={isCollapsed ? "Expand Sidebar (250px)" : "Collapse Sidebar (68px)"}
                    aria-label="Toggle Sidebar"
                >
                    {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
                </button>

                {/* Mobile Drawer Toggle */}
                <button
                    onClick={toggleMobileOpen}
                    className="flex lg:hidden p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover transition-colors border border-border-color bg-transparent cursor-pointer"
                    title="Open Navigation Drawer"
                    aria-label="Open Navigation Drawer"
                >
                    <Menu size={18} />
                </button>

                {/* Context Breadcrumb */}
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
                    <span className="hidden sm:inline text-accent-primary">Pane-o-Glass</span>
                    <span className="hidden sm:inline text-border-color">/</span>
                    <span className="text-text-secondary font-medium lowercase first-letter:uppercase">{getBreadcrumb(pathname)}</span>
                </div>
            </div>

            {/* Right section: User Menu */}
            <div className="flex items-center gap-4">
                <UserMenu userName={userName} />
            </div>
        </header>
    );
}
