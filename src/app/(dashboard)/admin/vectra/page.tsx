import React from 'react';
import VectraClient from './VectraClient';

export default function VectraTimeMachinePage() {
    return (
        <div className="flex flex-col h-full bg-[var(--bg-default)]">
            <header className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-surface)] shrink-0">
                <div>
                    <h1 className="text-xl font-bold text-[var(--text-primary)] m-0">Vectra Network Time Machine</h1>
                    <p className="text-sm text-[var(--text-muted)] m-0">Live metadata topology and chronological connection analysis</p>
                </div>
            </header>

            {/* Main Application Area */}
            <main className="flex-1 min-h-0 flex flex-col relative">
                <VectraClient />
            </main>
        </div>
    );
}
