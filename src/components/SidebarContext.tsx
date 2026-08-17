"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface SidebarContextType {
    isCollapsed: boolean;
    toggleCollapsed: () => void;
    isMobileOpen: boolean;
    toggleMobileOpen: () => void;
    closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isMobileOpen, setIsMobileOpen] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem("app-sidebar-collapsed");
        if (saved !== null) {
            setIsCollapsed(saved === "true");
        }
    }, []);

    const toggleCollapsed = () => {
        setIsCollapsed((prev) => {
            const next = !prev;
            localStorage.setItem("app-sidebar-collapsed", String(next));
            return next;
        });
    };

    const toggleMobileOpen = () => {
        setIsMobileOpen((prev) => !prev);
    };

    const closeMobile = () => {
        setIsMobileOpen(false);
    };

    return (
        <SidebarContext.Provider
            value={{
                isCollapsed,
                toggleCollapsed,
                isMobileOpen,
                toggleMobileOpen,
                closeMobile,
            }}
        >
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error("useSidebar must be used within a SidebarProvider");
    }
    return context;
}
