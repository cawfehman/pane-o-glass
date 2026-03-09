"use client";

import React from "react";
import { useTheme } from "./ThemeContext";

const THEMES = [
    { id: "default", name: "Modern Dark", colors: ["#3b82f6", "#1a1d24", "#0f1115"] },
    { id: "midnight", name: "Midnight Purple", colors: ["#a855f7", "#131316", "#09090b"] },
    { id: "forest", name: "Emerald Forest", colors: ["#10b981", "#0a1f0a", "#050a05"] },
    { id: "sunset", name: "Deep Sunset", colors: ["#f97316", "#1f0a0a", "#0f0505"] },
    { id: "slate", name: "Pro Slate", colors: ["#06b6d4", "#1e293b", "#0f172a"] },
    { id: "light", name: "Professional Light", colors: ["#2563eb", "#ffffff", "#f8fafc"] },
] as const;

export default function ThemeSelector() {
    const { theme, setTheme } = useTheme();

    return (
        <section style={{ marginTop: '2rem' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 1 0 20z"></path></svg>
                UI Customization
            </h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Select a visual theme to personalize your dashboard experience.
            </p>

            <div className="theme-grid">
                {THEMES.map((t) => (
                    <div 
                        key={t.id}
                        className={`theme-card ${theme === t.id ? 'active' : ''}`}
                        onClick={() => setTheme(t.id)}
                    >
                        <div className="theme-preview">
                            {t.colors.map((color, i) => (
                                <div 
                                    key={i} 
                                    className="theme-preview-color" 
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.name}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}
