'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';

export default function VectraTimeline({ data }: { data: any[] }) {
    
    const chartData = useMemo(() => {
        if (!data || data.length === 0) return [];

        return data.map((evt, idx) => {
            const time = new Date(evt.timestamp || evt.session_start_time).getTime();
            const dur = Math.max((evt.duration || 1), 1);
            const bytes = (evt.orig_ip_bytes || 0) + (evt.resp_ip_bytes || 0);

            return {
                id: idx,
                time: time,
                yAxisHost: evt.id_orig_h,
                targetHost: evt.id_resp_h,
                duration: dur,
                bytes: bytes,
                proto: evt.proto_name || 'TCP'
            };
        }).sort((a, b) => a.time - b.time);
    }, [data]);

    if (!data || data.length === 0) return null;

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] shadow-xl p-3 rounded-md text-xs font-mono">
                    <p className="text-[var(--text-primary)] font-bold mb-1">{new Date(d.time).toLocaleString()}</p>
                    <p className="text-[var(--text-muted)]"><span className="text-blue-400">Src:</span> {d.yAxisHost}</p>
                    <p className="text-[var(--text-muted)]"><span className="text-green-400">Dst:</span> {d.targetHost}</p>
                    <p className="text-[var(--text-muted)] mt-1">Proto: {d.proto}</p>
                    <p className="text-[var(--text-muted)]">Bytes: {d.bytes.toLocaleString()}</p>
                    <p className="text-[var(--text-muted)]">Duration: {d.duration}s</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full p-6 flex flex-col bg-[var(--bg-default)]">
            <h2 className="text-lg font-bold text-[var(--text-primary)] mb-6">Connection Chronology</h2>
            
            <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        
                        <XAxis 
                            dataKey="time" 
                            type="number" 
                            domain={['auto', 'auto']}
                            tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString()}
                            stroke="var(--text-muted)"
                            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                            name="Time"
                        />
                        
                        <YAxis 
                            dataKey="yAxisHost" 
                            type="category" 
                            allowDuplicatedCategory={false}
                            stroke="var(--text-muted)"
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            name="Source Host"
                            width={120}
                        />

                        {/* ZAxis handles the size of the bubble based on Byte transfer */}
                        <ZAxis dataKey="bytes" type="number" range={[50, 400]} name="Bytes" />
                        
                        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

                        <Scatter name="Connections" data={chartData}>
                            {chartData.map((entry, index) => (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.proto === 'UDP' ? '#f59e0b' : '#3b82f6'} 
                                    opacity={0.7}
                                />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-6 text-sm text-[var(--text-muted)]">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500 opacity-70"></div> TCP Traffic</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 opacity-70"></div> UDP Traffic</div>
                <div className="ml-4 italic">Bubble size indicates Total Bytes transferred.</div>
            </div>
        </div>
    );
}
