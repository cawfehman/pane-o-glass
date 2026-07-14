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
            <header className="mb-10">
                <h1 className="text-4xl font-extrabold mb-2 tracking-tight">
                    System Tools & Queries
                </h1>
                <p className="text-text-secondary text-lg">
                    Centralized forensic control center for network infrastructure and security intelligence.
                </p>
            </header>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-6">
                {visibleTools.map((tool) => (
                    <div 
                        key={tool.id} 
                        className="glass-card relative transition-all duration-200 ease-in-out h-full bg-bg-surface flex flex-col border border-border-color p-6"
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

                        <Link href={tool.href} className="no-underline flex flex-col h-full w-full">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="bg-accent-glow p-3 rounded-xl text-accent-primary flex items-center justify-center">
                                    {tool.icon}
                                </div>
                                <h3 className="m-0 text-text-primary text-xl font-semibold pr-6">
                                    {tool.title}
                                </h3>
                            </div>
                            <p className="text-text-secondary m-0 text-[0.95rem] leading-[1.6] grow">
                                {tool.description}
                            </p>
                        </Link>
                    </div>
                ))}

                {/* If no tools are available */}
                {visibleTools.length === 0 && (
                    <div className="glass-card col-[1/-1] p-12 text-center">
                        <ShieldAlert size={48} className="text-text-muted mb-4 mx-auto" />
                        <h2 className="text-text-primary mb-2.5">No Tools Accessible</h2>
                        <p className="text-text-secondary max-w-[400px] mx-auto">
                            Your current role ({role}) does not have permission to access any system queries. 
                            Please contact an administrator to request access.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
