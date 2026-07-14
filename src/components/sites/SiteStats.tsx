import React from 'react';
import { Database } from 'lucide-react';

interface SiteStatsProps {
    totalSites: number;
}

export function SiteStats({ totalSites }: SiteStatsProps) {
    return (
        <header className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent-primary/10 text-accent-primary border border-accent-primary/20">
                    <Database size={24} strokeWidth={2.5} />
                </div>
                <div>
                    <h1 className="text-xl font-black tracking-tight uppercase text-white">Site Operations</h1>
                    <p className="text-xs text-muted font-bold tracking-wide">Mapping Engine & Access Directives</p>
                </div>
            </div>

            <div className="flex items-center gap-3 text-right">
                <div>
                    <div className="text-2xl font-black tracking-tighter text-accent-primary leading-none">
                        {totalSites}
                    </div>
                    <span className="text-[10px] font-black text-muted uppercase tracking-widest block mt-0.5">
                        {totalSites === 1 ? 'Configured Site' : 'Configured Sites'}
                    </span>
                </div>
                <div className="h-8 w-1 rounded-full bg-accent-primary/20"></div>
            </div>
        </header>
    );
}
