"use client";

import Link from "next/link";
import { ShieldAlert, Terminal, Activity, Wifi, Lock, ShieldCheck } from "lucide-react";
import { ToolHelp } from "@/components/ToolHelp";

export default function QueriesPageClient({ 
    visibleTools, 
    role 
}: { 
    visibleTools: { id: string; title: string; href: string; description: string; icon: React.ReactNode }[];
    role: string;
}) {
    return (
        <div className="page-container">
            <header style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2.25rem', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '-0.025em' }}>
                    System Tools & Queries
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
                    Centralized forensic control center for network infrastructure and security intelligence.
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                {visibleTools.map((tool) => (
                    <div 
                        key={tool.id} 
                        className="glass-card" 
                        style={{ 
                            position: 'relative',
                            transition: 'all 0.2s ease-in-out', 
                            height: '100%', 
                            background: 'var(--bg-surface)',
                            display: 'flex',
                            flexDirection: 'column',
                            border: '1px solid var(--border-color)',
                            padding: '24px'
                        }}
                    >
                        {/* Help Trigger Button */}
                        <ToolHelp 
                            toolId={tool.id === 'hibp-account' ? 'hibp-account' : tool.id === 'hibp-domain' ? 'hibp-domain' : tool.id}
                            iconSize={18}
                            triggerStyle={{
                                position: 'absolute',
                                top: '16px',
                                right: '16px',
                                zIndex: 10
                            }}
                        />

                        <Link href={tool.href} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                                <div style={{ 
                                    background: 'var(--accent-glow)', 
                                    padding: '12px', 
                                    borderRadius: '12px', 
                                    color: 'var(--accent-primary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {tool.icon}
                                </div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 600, paddingRight: '24px' }}>
                                    {tool.title}
                                </h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem', lineHeight: 1.6, flexGrow: 1 }}>
                                {tool.description}
                            </p>
                        </Link>
                    </div>
                ))}

                {/* If no tools are available */}
                {visibleTools.length === 0 && (
                    <div className="glass-card" style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center' }}>
                        <ShieldAlert size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
                        <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>No Tools Accessible</h2>
                        <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
                            Your current role ({role}) does not have permission to access any system queries. 
                            Please contact an administrator to request access.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
