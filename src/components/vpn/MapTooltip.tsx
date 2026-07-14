export interface MapTooltipProps {
    hoveredPoint: any;
    tooltipPos: { x: number; y: number };
    mapFilter: string;
}

export function MapTooltip({ hoveredPoint, tooltipPos, mapFilter }: MapTooltipProps) {
    if (!hoveredPoint) return null;

    const formatDuration = (sec: number | null | undefined) => {
        if (!sec) return "N/A";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m} min`;
    };

    const formatBytes = (bytes: number | null | undefined) => {
        if (bytes == null) return "0 B";
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    return (
        <div
            style={{
                position: 'absolute',
                left: `${tooltipPos.x}px`,
                top: `${tooltipPos.y}px`,
                width: '310px',
                background: 'rgba(10, 11, 20, 0.96)',
                backdropFilter: 'blur(10px)',
                border: `1px solid ${mapFilter.startsWith('failed') ? 'rgba(239, 68, 68, 0.45)' : 'rgba(99, 102, 241, 0.45)'}`,
                borderRadius: '8px',
                padding: '14px',
                color: 'var(--text-primary)',
                boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
                pointerEvents: 'none',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}
            className="animate-fadeIn"
        >
            {/* Failed Aggregations: IP-based Header */}
            {hoveredPoint.ip ? (
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div className="flex justify-between items-center">
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', fontFamily: 'monospace' }}>{hoveredPoint.ip}</span>
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 'bold', border: '1px solid rgba(239,68,68,0.3)' }}>
                            {hoveredPoint.count} Failures
                        </span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>
                        📍 {hoveredPoint.cityName && hoveredPoint.stateName ? `${hoveredPoint.cityName}, ${hoveredPoint.stateName}, ${hoveredPoint.countryCode}` : `${hoveredPoint.countryName} (${hoveredPoint.countryCode})`}
                    </span>
                </div>
            ) : (
                /* Country-based Header (Active / Completed) */
                <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div className="flex justify-between items-center">
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{hoveredPoint.name}</span>
                        <span style={{ fontSize: '0.75rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(99,102,241,0.2)' }}>
                            {hoveredPoint.count} Node{hoveredPoint.count === 1 ? "" : "s"}
                        </span>
                    </div>
                    {hoveredPoint.org && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2.5px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hoveredPoint.org}>
                            🏢 {hoveredPoint.org}
                        </span>
                    )}
                </div>
            )}

            {/* Metrics for Failed IPs */}
            {hoveredPoint.ip && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                    <div className="flex justify-between">
                        <span className="text-text-muted">ISP/Org:</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hoveredPoint.asnName}>
                            {hoveredPoint.asnName}
                        </span>
                    </div>
                    {hoveredPoint.timezone && (
                        <div className="flex justify-between">
                            <span className="text-text-muted">Timezone:</span>
                            <span className="text-text-secondary font-semibold">
                                {hoveredPoint.timezone}
                            </span>
                        </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Targeted Accounts:</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {Array.from(hoveredPoint.usernames).slice(0, 3).map((uname: any, i) => (
                                <span key={i} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                    {uname}
                                </span>
                            ))}
                            {hoveredPoint.usernames.size > 3 && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>+{hoveredPoint.usernames.size - 3} more</span>
                            )}
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '4px' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>Reasons:</span>
                        {Array.from(hoveredPoint.reasons).slice(0, 2).map((reason: any, i) => (
                            <span key={i} style={{ color: '#f87171', fontSize: '0.75rem' }}>• {reason}</span>
                        ))}
                    </div>
                </div>
            )}

            {/* Metrics for Active / Completed connections */}
            {!hoveredPoint.ip && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {hoveredPoint.events.map((evt: any, index: number) => (
                        <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex justify-between text-xs">
                                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{evt.username}</span>
                                <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>{evt.sourceIp}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                {mapFilter === "active" ? (
                                    <>
                                        <span>Time: {new Date(evt.createdAt).toLocaleTimeString()}</span>
                                        <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Connected</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Duration: {formatDuration(evt.duration)}</span>
                                        <span style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>
                                            {formatBytes((evt.bytesSent || 0) + (evt.bytesReceived || 0))}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
