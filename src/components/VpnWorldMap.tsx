"use client";

import { useState, useRef, MouseEvent, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, AlertTriangle, CheckCircle, Info } from "lucide-react";

interface VpnEvent {
    id: string;
    username: string;
    sourceIp: string;
    assignedIp?: string | null;
    status: string;
    duration?: number | null;
    bytesSent?: number | null;
    bytesReceived?: number | null;
    bytesTotal?: number | null;
    failureReason?: string | null;
    vpnType?: string | null;
    vpnStream?: string | null;
    ipAsn?: string | null;
    ipAsName?: string | null;
    ipAsDomain?: string | null;
    ipCountry?: string | null;
    ipCountryCode?: string | null;
    createdAt: string | Date;
}

interface VpnWorldMapProps {
    successfulIps: VpnEvent[];
    failedIps: VpnEvent[];
    recentEvents: VpnEvent[];
}

// Center points mapping for common country codes (Equirectangular Projection)
const countryCoordinates: Record<string, { lat: number; lng: number; name: string }> = {
    US: { lat: 37.0902, lng: -95.7129, name: "United States" },
    CA: { lat: 56.1304, lng: -106.3468, name: "Canada" },
    MX: { lat: 23.6345, lng: -102.5528, name: "Mexico" },
    GB: { lat: 55.3781, lng: -3.4360, name: "United Kingdom" },
    FR: { lat: 46.2276, lng: 2.2137, name: "France" },
    DE: { lat: 51.1657, lng: 10.4515, name: "Germany" },
    IT: { lat: 41.8719, lng: 12.5674, name: "Italy" },
    ES: { lat: 40.4637, lng: -3.7492, name: "Spain" },
    NL: { lat: 52.1326, lng: 5.2913, name: "Netherlands" },
    RU: { lat: 61.5240, lng: 105.3188, name: "Russia" },
    CN: { lat: 35.8617, lng: 104.1954, name: "China" },
    IN: { lat: 20.5937, lng: 78.9629, name: "India" },
    JP: { lat: 36.2048, lng: 138.2529, name: "Japan" },
    KR: { lat: 35.9078, lng: 127.7669, name: "South Korea" },
    KP: { lat: 40.3399, lng: 127.5101, name: "North Korea" },
    AU: { lat: -25.2744, lng: 133.7751, name: "Australia" },
    NZ: { lat: -40.9006, lng: 174.8860, name: "New Zealand" },
    BR: { lat: -14.2350, lng: -51.9253, name: "Brazil" },
    AR: { lat: -38.4161, lng: -63.6167, name: "Argentina" },
    ZA: { lat: -30.5595, lng: 22.9375, name: "South Africa" },
    EG: { lat: 26.8206, lng: 30.8025, name: "Egypt" },
    NG: { lat: 9.0820, lng: 8.6753, name: "Nigeria" },
    IE: { lat: 53.4129, lng: -8.2439, name: "Ireland" },
    SG: { lat: 1.3521, lng: 103.8198, name: "Singapore" },
    UA: { lat: 48.3794, lng: 31.1656, name: "Ukraine" },
    PL: { lat: 51.9194, lng: 19.1451, name: "Poland" },
    SE: { lat: 60.1282, lng: 18.6435, name: "Sweden" },
    NO: { lat: 60.4720, lng: 8.4689, name: "Norway" },
    FI: { lat: 61.9241, lng: 25.7482, name: "Finland" },
    TR: { lat: 38.9637, lng: 35.2433, name: "Turkey" },
    SA: { lat: 23.8859, lng: 45.0792, name: "Saudi Arabia" },
    AE: { lat: 23.4241, lng: 53.8478, name: "United Arab Emirates" },
    IL: { lat: 31.0461, lng: 34.8516, name: "Israel" },
    IR: { lat: 32.4279, lng: 53.6880, name: "Iran" },
    IQ: { lat: 33.2232, lng: 43.6793, name: "Iraq" },
    PK: { lat: 30.3753, lng: 69.3451, name: "Pakistan" },
    CO: { lat: 4.5709, lng: -74.2973, name: "Colombia" },
    CL: { lat: -35.6751, lng: -71.5430, name: "Chile" },
    PE: { lat: -9.1900, lng: -75.0152, name: "Peru" },
    VE: { lat: 6.4238, lng: -66.5897, name: "Venezuela" },
    VN: { lat: 14.0583, lng: 108.2772, name: "Vietnam" },
    TH: { lat: 15.8700, lng: 100.9925, name: "Thailand" },
    MY: { lat: 4.2105, lng: 101.9758, name: "Malaysia" },
    PH: { lat: 12.8797, lng: 121.7740, name: "Philippines" },
    ID: { lat: -0.7893, lng: 113.9213, name: "Indonesia" },
    HK: { lat: 22.3964, lng: 114.1095, name: "Hong Kong" },
    TW: { lat: 23.6978, lng: 120.9605, name: "Taiwan" }
};

// Corporate HQ Location (Wilmington / Philadelphia corporate gateway area)
const HQ_COORDS = { lat: 39.9526, lng: -75.1652, name: "Corporate Gateways" };

export function VpnWorldMap({ successfulIps, failedIps, recentEvents }: VpnWorldMapProps) {
    const [zoom, setZoom] = useState<number>(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const svgRef = useRef<SVGSVGElement | null>(null);

    // Mercator/Equirectangular linear projection to canvas (width: 900, height: 500)
    const project = (lat: number, lng: number) => {
        const x = 450 + (lng * 400) / 180;
        const y = 250 - (lat * 200) / 90;
        return { x, y };
    };

    const hqPos = project(HQ_COORDS.lat, HQ_COORDS.lng);

    // Process connection events and match them to map locations
    const plotConnections = () => {
        const uniqueConnections: Record<string, {
            countryCode: string;
            countryName: string;
            coords: { x: number; y: number };
            successCount: number;
            failCount: number;
            recentEvents: VpnEvent[];
        }> = {};

        // Merge and process events from props
        const allEvents = [...recentEvents, ...successfulIps, ...failedIps];

        for (const evt of allEvents) {
            const countryCode = evt.ipCountryCode?.toUpperCase();
            if (!countryCode || countryCode === "N/A" || !countryCoordinates[countryCode]) {
                continue;
            }

            if (!uniqueConnections[countryCode]) {
                const coords = project(countryCoordinates[countryCode].lat, countryCoordinates[countryCode].lng);
                uniqueConnections[countryCode] = {
                    countryCode,
                    countryName: evt.ipCountry || countryCoordinates[countryCode].name,
                    coords,
                    successCount: 0,
                    failCount: 0,
                    recentEvents: []
                };
            }

            if (evt.status === "SUCCESS") {
                uniqueConnections[countryCode].successCount++;
            } else if (evt.status === "FAILURE") {
                uniqueConnections[countryCode].failCount++;
            }

            // Keep up to 3 recent events for tooltip
            if (uniqueConnections[countryCode].recentEvents.length < 3) {
                uniqueConnections[countryCode].recentEvents.push(evt);
            }
        }

        return Object.values(uniqueConnections);
    };

    const connections = plotConnections();

    // Map dragging controls
    const handleMouseDown = (e: MouseEvent<SVGSVGElement>) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        if (!isDragging) return;
        setPan({
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const handleZoomIn = () => {
        setZoom(prev => Math.min(prev + 0.3, 5));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(prev - 0.3, 0.8));
    };

    const handleReset = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    // Calculate dynamic bezier arc paths between HQ and destination
    const calculateArcPath = (startX: number, startY: number, endX: number, endY: number) => {
        const dx = endX - startX;
        const dy = endY - startY;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        // Midpoint and control offset for beautiful curvature
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        // Offset perpendicular to the chord
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle - Math.PI / 2;
        const offset = Math.min(dr * 0.25, 120); // curve height factor
        
        const ctrlX = midX + Math.cos(perpAngle) * offset;
        const ctrlY = midY + Math.sin(perpAngle) * offset;

        return `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0 }} className="animate-fadeIn">
            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', minHeight: '520px', overflow: 'hidden' }}>
                
                {/* Header Information Panel */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', zIndex: 10 }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Globe size={18} color="var(--accent-primary)" /> VPN Connection Map (Global Distribution)
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Interactive live tracking of VPN sessions resolved from Graylog. Drag to pan, scroll or click controls to zoom.
                        </p>
                    </div>

                    {/* Quick map statistics */}
                    <div style={{ display: 'flex', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Nodes: {connections.filter(c => c.successCount > 0).length}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 8px #ef4444' }}></span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Failed Vectors: {connections.filter(c => c.failCount > 0).length}</span>
                        </div>
                    </div>
                </div>

                {/* Viewport Control Panel */}
                <div style={{ position: 'absolute', right: '24px', top: '80px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 20 }}>
                    <button onClick={handleZoomIn} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Zoom In">
                        <ZoomIn size={16} />
                    </button>
                    <button onClick={handleZoomOut} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Zoom Out">
                        <ZoomOut size={16} />
                    </button>
                    <button onClick={handleReset} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Reset Viewport">
                        <RotateCcw size={16} />
                    </button>
                </div>

                {/* Map Canvas Wrapper */}
                <div style={{ flex: 1, width: '100%', position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.15)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <svg
                        ref={svgRef}
                        width="100%"
                        height="100%"
                        viewBox="0 0 900 500"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        style={{
                            cursor: isDragging ? 'grabbing' : 'grab',
                            background: '#090a0f',
                            userSelect: 'none'
                        }}
                    >
                        {/* Interactive Pannable/Zoomable Group */}
                        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} style={{ transformOrigin: '450px 250px', transition: isDragging ? 'none' : 'transform 0.15s ease-out' }}>
                            
                            {/* Grid Dots Pattern overlay (Tactical Threat map look) */}
                            <defs>
                                <pattern id="mapGrid" width="15" height="15" patternUnits="userSpaceOnUse">
                                    <circle cx="2.5" cy="2.5" r="0.8" fill="rgba(255,255,255,0.03)" />
                                </pattern>
                            </defs>
                            <rect width="900" height="500" fill="url(#mapGrid)" />

                            {/* Stylized Abstract Continent Outline Paths */}
                            <g fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                {/* North America */}
                                <path d="M 80,60 L 150,55 L 260,110 L 220,180 L 180,240 L 160,260 L 150,220 L 135,170 L 115,165 L 112,145 L 80,130 L 75,100 Z" />
                                {/* Greenland */}
                                <path d="M 250,30 L 300,40 L 280,85 L 240,65 Z" fill="rgba(255,255,255,0.02)" />
                                {/* South America */}
                                <path d="M 180,250 L 220,270 L 270,300 L 280,340 L 260,420 L 240,480 L 228,490 L 222,460 L 210,400 L 195,310 L 175,270 Z" />
                                {/* Eurasia (Europe & Asia) */}
                                <path d="M 330,80 L 460,50 L 580,50 L 720,60 L 800,100 L 850,140 L 800,200 L 750,250 L 720,270 L 680,250 L 640,280 L 590,290 L 570,250 L 520,230 L 490,270 L 440,270 L 420,290 L 390,260 L 340,240 L 320,160 Z" />
                                {/* Africa */}
                                <path d="M 425,275 L 485,255 L 535,295 L 545,340 L 515,440 L 475,490 L 465,470 L 465,410 L 450,360 L 415,310 Z" />
                                {/* Australia */}
                                <path d="M 740,380 L 790,370 L 830,400 L 820,440 L 760,445 L 735,410 Z" />
                                {/* Madagascar */}
                                <path d="M 550,420 L 565,430 L 555,465 L 540,450 Z" />
                                {/* Japan */}
                                <path d="M 810,170 L 820,195 L 810,215 L 805,185 Z" />
                                {/* UK & Ireland */}
                                <path d="M 360,110 L 370,120 L 365,130 L 355,120 Z" />
                            </g>

                            {/* Dynamic Connection Bezier Curves (Arcs) */}
                            {connections.map((c, idx) => {
                                const hasSuccess = c.successCount > 0;
                                const isFlagged = c.failCount > 0;
                                const arcColor = isFlagged && !hasSuccess ? 'rgba(239, 68, 68, 0.35)' : 'rgba(99, 102, 241, 0.4)';
                                const glowColor = isFlagged && !hasSuccess ? '#ef4444' : 'var(--accent-primary)';
                                
                                return (
                                    <g key={`arc-${idx}`}>
                                        {/* Underlying curved path */}
                                        <path
                                            d={calculateArcPath(hqPos.x, hqPos.y, c.coords.x, c.coords.y)}
                                            fill="none"
                                            stroke={arcColor}
                                            strokeWidth="1.5"
                                            strokeDasharray="4 4"
                                        />
                                        {/* Animated Neon Pulse flow */}
                                        <path
                                            d={calculateArcPath(hqPos.x, hqPos.y, c.coords.x, c.coords.y)}
                                            fill="none"
                                            stroke={glowColor}
                                            strokeWidth="2"
                                            strokeDasharray="20 180"
                                            strokeDashoffset="0"
                                            style={{
                                                animation: 'pulseFlow 5s linear infinite',
                                                animationDelay: `${idx * 0.4}s`
                                            }}
                                        />
                                    </g>
                                );
                            })}

                            {/* Corporate HQ Hub Pin */}
                            <g transform={`translate(${hqPos.x}, ${hqPos.y})`} style={{ cursor: 'pointer' }}>
                                {/* Pulse circles */}
                                <circle r="12" fill="rgba(99, 102, 241, 0.15)" stroke="var(--accent-primary)" strokeWidth="0.5">
                                    <animate attributeName="r" values="5;20;5" dur="4s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.8;0;0.8" dur="4s" repeatCount="indefinite" />
                                </circle>
                                <circle r="4" fill="var(--accent-primary)" stroke="#fff" strokeWidth="1" />
                            </g>

                            {/* Connection Nodes (Circles & Interactive pulsing beacons) */}
                            {connections.map((c, idx) => {
                                const isMalicious = c.failCount > 0 && c.successCount === 0;
                                const isSuspicious = c.failCount > 0 && c.successCount > 0;
                                const color = isMalicious ? '#ef4444' : isSuspicious ? '#eab308' : '#22c55e';
                                const glowFilter = isMalicious ? 'drop-shadow(0 0 6px #ef4444)' : isSuspicious ? 'drop-shadow(0 0 6px #eab308)' : 'drop-shadow(0 0 6px #22c55e)';

                                return (
                                    <g
                                        key={`point-${idx}`}
                                        transform={`translate(${c.coords.x}, ${c.coords.y})`}
                                        style={{ cursor: 'pointer' }}
                                        onMouseEnter={(e) => {
                                            const svgBox = svgRef.current?.getBoundingClientRect();
                                            if (svgBox) {
                                                // Position tooltip relatively to target SVG canvas element
                                                setHoveredPoint(c);
                                                setTooltipPos({
                                                    x: c.coords.x * zoom + pan.x + 10,
                                                    y: c.coords.y * zoom + pan.y - 120
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredPoint(null)}
                                    >
                                        {/* Outer pulse beacon */}
                                        <circle r="10" fill="none" stroke={color} strokeWidth="1" style={{ filter: glowFilter }}>
                                            <animate attributeName="r" values="3;12;3" dur="2.5s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.7;0;0.7" dur="2.5s" repeatCount="indefinite" />
                                        </circle>
                                        {/* Core center dot */}
                                        <circle r="3.5" fill={color} stroke="#000" strokeWidth="0.5" />
                                    </g>
                                );
                            })}
                        </g>
                    </svg>

                    {/* Interactive Tooltip Card overlay (renders above map canvas absolute position) */}
                    {hoveredPoint && (
                        <div
                            style={{
                                position: 'absolute',
                                left: `${tooltipPos.x}px`,
                                top: `${tooltipPos.y}px`,
                                width: '280px',
                                background: 'rgba(10, 11, 20, 0.95)',
                                backdropFilter: 'blur(8px)',
                                border: `1px solid ${hoveredPoint.failCount > 0 && hoveredPoint.successCount === 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
                                borderRadius: '8px',
                                padding: '12px',
                                color: 'var(--text-primary)',
                                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                                pointerEvents: 'none',
                                zIndex: 100,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}
                            className="animate-fadeIn"
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{hoveredPoint.countryName}</span>
                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', fontWeight: 'bold' }}>
                                    {hoveredPoint.countryCode}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Successful Tunnels:</span>
                                    <span style={{ color: '#22c55e', fontWeight: 600 }}>{hoveredPoint.successCount}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Failed Attempts:</span>
                                    <span style={{ color: '#ef4444', fontWeight: 600 }}>{hoveredPoint.failCount}</span>
                                </div>
                            </div>

                            {/* Recent Events logs overview */}
                            {hoveredPoint.recentEvents.length > 0 && (
                                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '2px' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Recent Attempts</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {hoveredPoint.recentEvents.map((evt: VpnEvent, index: number) => (
                                            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(255,255,255,0.02)', padding: '4px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{evt.username}</span>
                                                    <span style={{ color: evt.status === 'SUCCESS' ? '#22c55e' : '#ef4444', fontWeight: 'bold' }}>
                                                        {evt.status}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{evt.sourceIp}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Pulsing Arc Animations Stylesheet inject */}
            <style jsx global>{`
                @keyframes pulseFlow {
                    0% {
                        stroke-dashoffset: 200;
                    }
                    100% {
                        stroke-dashoffset: -200;
                    }
                }
            `}</style>
        </div>
    );
}
