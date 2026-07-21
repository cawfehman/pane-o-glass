'use client';

import React, { useState } from 'react';
import { Search, Loader2, Network, Clock, Table2 } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic imports for heavy visualization components to keep initial bundle small
const VectraNodeGraph = dynamic(() => import('@/components/vectra/VectraNodeGraph'), { ssr: false });
const VectraTimeline = dynamic(() => import('@/components/vectra/VectraTimeline'), { ssr: false });
const VectraDataGrid = dynamic(() => import('@/components/vectra/VectraDataGrid'), { ssr: false });

export default function VectraClient() {
    const [query, setQuery] = useState('');
    const [timeRange, setTimeRange] = useState('24h');
    const [activeTab, setActiveTab] = useState<'graph' | 'timeline' | 'grid'>('graph');
    
    const [loading, setLoading] = useState(false);
    const [metadata, setMetadata] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/vectra', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, timeRange, limit: 1000 })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch Vectra metadata');
            
            // The Investigate API usually returns an array under 'events' or 'results'
            const events = data.events || data.results || data;
            setMetadata(Array.isArray(events) ? events : []);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 p-6 space-y-4">
            
            {/* Search Bar & Controls */}
            <form onSubmit={handleSearch} className="flex items-center gap-4 p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shrink-0">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] w-5 h-5" />
                    <input 
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Target Hostname, IP, or Lucene query..."
                        className="w-full pl-10 pr-4 py-2 bg-transparent border border-[var(--border-color)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-green-500"
                    />
                </div>
                
                <select 
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="py-2 px-4 bg-transparent border border-[var(--border-color)] rounded-md text-[var(--text-primary)] focus:outline-none focus:border-green-500"
                >
                    <option value="1h">Last 1 Hour</option>
                    <option value="4h">Last 4 Hours</option>
                    <option value="24h">Last 24 Hours</option>
                    <option value="7d">Last 7 Days</option>
                </select>

                <button 
                    type="submit" 
                    disabled={loading || !query.trim()}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Analyze
                </button>
            </form>

            {error && (
                <div className="p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 shrink-0">
                    <p className="font-semibold m-0">Vectra API Error</p>
                    <p className="text-sm m-0">{error}</p>
                </div>
            )}

            {/* Content Area */}
            {metadata.length === 0 && !loading && !error && (
                <div className="flex-1 flex flex-col items-center justify-center text-[var(--text-muted)] border-2 border-dashed border-[var(--border-color)] rounded-lg">
                    <Network className="w-16 h-16 mb-4 opacity-20" />
                    <h2 className="text-xl font-semibold mb-2">No Metadata Loaded</h2>
                    <p>Enter a target IP or hostname above to construct the network timeline.</p>
                </div>
            )}

            {metadata.length > 0 && (
                <div className="flex-1 min-h-0 flex flex-col glass-card">
                    {/* Tabs */}
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border-color)] shrink-0">
                        <button 
                            onClick={() => setActiveTab('graph')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'graph' ? 'bg-green-600/20 text-green-400' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]'}`}
                        >
                            <Network className="w-4 h-4" /> Topology Map
                        </button>
                        <button 
                            onClick={() => setActiveTab('timeline')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'timeline' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]'}`}
                        >
                            <Clock className="w-4 h-4" /> Chronological Timeline
                        </button>
                        <button 
                            onClick={() => setActiveTab('grid')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${activeTab === 'grid' ? 'bg-orange-600/20 text-orange-400' : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface-hover)]'}`}
                        >
                            <Table2 className="w-4 h-4" /> Raw Metadata Grid
                        </button>
                        
                        <div className="ml-auto text-sm text-[var(--text-muted)] font-mono">
                            {metadata.length} connections loaded
                        </div>
                    </div>

                    {/* Visualization Panes */}
                    <div className="flex-1 min-h-0 relative bg-black/20">
                        {loading && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm text-white">
                                <Loader2 className="w-12 h-12 animate-spin mb-4 text-green-500" />
                                <p className="font-semibold animate-pulse">Querying Vectra Investigate API...</p>
                            </div>
                        )}
                        
                        <div className="absolute inset-0 p-4">
                            {activeTab === 'graph' && (
                                <div className="h-full w-full flex items-center justify-center border border-dashed border-[var(--border-color)]">
                                    <VectraNodeGraph data={metadata} />
                                </div>
                            )}
                            {activeTab === 'timeline' && (
                                <div className="h-full w-full flex items-center justify-center border border-dashed border-[var(--border-color)]">
                                    <VectraTimeline data={metadata} />
                                </div>
                            )}
                            {activeTab === 'grid' && (
                                <div className="h-full w-full flex items-center justify-center border border-dashed border-[var(--border-color)]">
                                    <VectraDataGrid data={metadata} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
