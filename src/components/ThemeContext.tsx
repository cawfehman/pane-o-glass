"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "default" | "midnight" | "forest" | "sunset" | "slate" | "light";

interface ThemeContextType {
    theme: Theme;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("default");

    useEffect(() => {
        const savedTheme = localStorage.getItem("app-theme") as Theme;
        if (savedTheme) {
            setThemeState(savedTheme);
            document.documentElement.className = savedTheme === "default" ? "" : `theme-${savedTheme}`;
        }
    }, []);

    const setTheme = (newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem("app-theme", newTheme);
        document.documentElement.className = newTheme === "default" ? "" : `theme-${newTheme}`;
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return context;
}
