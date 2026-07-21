'use client';

import React, { useMemo, useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export default function VectraNodeGraph({ data }: { data: any[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            if (entries[0]) {
                setDimensions({
                    width: entries[0].contentRect.width,
                    height: entries[0].contentRect.height
                });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    const graphData = useMemo(() => {
        const nodesMap = new Map();
        const links: any[] = [];

        data.forEach(evt => {
            const src = evt.id_orig_h;
            const dst = evt.id_resp_h;
            
            if (!src || !dst) return;

            if (!nodesMap.has(src)) nodesMap.set(src, { id: src, val: 1, color: '#3b82f6', isTarget: false });
            if (!nodesMap.has(dst)) nodesMap.set(dst, { id: dst, val: 1, color: '#22c55e', isTarget: true });

            nodesMap.get(src).val += 0.1;
            nodesMap.get(dst).val += 0.5;

            links.push({
                source: src,
                target: dst,
                proto: evt.proto_name || 'TCP',
                port: evt.id_resp_p
            });
        });

        return {
            nodes: Array.from(nodesMap.values()),
            links: links
        };
    }, [data]);

    if (!data || data.length === 0) return null;

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[var(--bg-default)]">
            <ForceGraph2D
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeRelSize={4}
                nodeColor={node => (node as any).color}
                nodeLabel={node => `${(node as any).id}`}
                linkColor={() => 'rgba(255,255,255,0.1)'}
                linkDirectionalParticles={2}
                linkDirectionalParticleSpeed={d => 0.005}
                backgroundColor="transparent"
            />
            
            <div className="absolute top-4 left-4 p-4 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl z-10 pointer-events-none">
                <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Topology Legend</h3>
                <div className="flex flex-col gap-2 text-xs text-[var(--text-muted)]">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Origin Hosts</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500"></div> Destinations</div>
                    <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
                        Nodes scale by connection volume.
                    </div>
                </div>
            </div>
        </div>
    );
}
