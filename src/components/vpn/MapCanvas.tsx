import React, { MouseEvent, WheelEvent } from "react";
import { MapTooltip } from "./MapTooltip";

export const projectWorld = (lat: number, lng: number) => {
    const x = 450 + (lng * 400) / 180;
    const y = 250 - (lat * 200) / 90;
    return { x, y };
};

export const projectUS = (lat: number, lng: number) => {
    const minLat = 24.0, maxLat = 50.0;
    const minLng = -126.0, maxLng = -65.0;
    const padX = 40, padY = 30;
    const w = 900 - padX * 2;
    const h = 500 - padY * 2;
    const x = padX + ((lng - minLng) / (maxLng - minLng)) * w;
    const y = padY + ((maxLat - lat) / (maxLat - minLat)) * h;
    return { x, y };
};

export const project = (lat: number, lng: number, isUsView: boolean) => {
    return isUsView ? projectUS(lat, lng) : projectWorld(lat, lng);
};

export const getFeaturePath = (feature: any, isUsView: boolean) => {
    const proj = isUsView ? projectUS : projectWorld;
    const { type, coordinates } = feature.geometry;
    const formatCoord = (coord: [number, number]) => {
        const pt = proj(coord[1], coord[0]);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    };

    if (type === "Polygon") {
        return coordinates.map((ring: any) => "M " + ring.map(formatCoord).join(" L ") + " Z").join(" ");
    } else if (type === "MultiPolygon") {
        return coordinates.map((poly: any) => poly.map((ring: any[]) => "M " + ring.map(formatCoord).join(" L ") + " Z").join(" ")).join(" ");
    }
    return "";
};

export interface MapCanvasProps {
    svgRef: React.RefObject<SVGSVGElement | null>;
    zoom: number;
    setZoom: (z: number) => void;
    pan: { x: number; y: number };
    setPan: (p: { x: number; y: number }) => void;
    isDragging: boolean;
    setIsDragging: (d: boolean) => void;
    dragStart: { x: number; y: number };
    setDragStart: (d: { x: number; y: number }) => void;
    hoveredPoint: any;
    setHoveredPoint: (p: any) => void;
    tooltipPos: { x: number; y: number };
    setTooltipPos: (p: { x: number; y: number }) => void;
    isUsView: boolean;
    geoJson: any;
    usStatesGeoJson: any;
    selectedState: string | null;
    zoomToStateBounds: (stateName: string) => void;
    handleFocusUS: () => void;
    mapPoints: any[];
    mapFilter: string;
    hqPos: { x: number; y: number };
}

export function MapCanvas({
    svgRef,
    zoom,
    setZoom,
    pan,
    setPan,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    hoveredPoint,
    setHoveredPoint,
    tooltipPos,
    setTooltipPos,
    isUsView,
    geoJson,
    usStatesGeoJson,
    selectedState,
    zoomToStateBounds,
    handleFocusUS,
    mapPoints,
    mapFilter,
    hqPos,
}: MapCanvasProps) {
    const handleWheel = (e: WheelEvent<SVGSVGElement>) => {
        e.preventDefault();
        const zoomFactor = 0.1;
        const newZoom = e.deltaY < 0 ? Math.min(zoom + zoomFactor, 6) : Math.max(zoom - zoomFactor, 0.8);
        setZoom(newZoom);
    };

    const handleMouseDown = (e: MouseEvent<SVGSVGElement>) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        if (!isDragging) return;
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => { setIsDragging(false); };

    const calculateArcPath = (startX: number, startY: number, endX: number, endY: number) => {
        const dx = endX - startX;
        const dy = endY - startY;
        const dr = Math.sqrt(dx * dx + dy * dy);
        
        const midX = (startX + endX) / 2;
        const midY = (startY + endY) / 2;
        
        const angle = Math.atan2(dy, dx);
        const perpAngle = angle - Math.PI / 2;
        const offset = Math.min(dr * 0.25, 120);
        
        const ctrlX = midX + Math.cos(perpAngle) * offset;
        const ctrlY = midY + Math.sin(perpAngle) * offset;

        return `M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`;
    };

    const getArcColor = (c: any) => {
        if (mapFilter === "failed" || mapFilter === "failed-valid") return "rgba(239, 68, 68, 0.35)";
        if (mapFilter === "completed") return "rgba(156, 163, 175, 0.4)";
        return "rgba(34, 197, 94, 0.4)"; // active
    };

    const getGlowColor = (c: any) => {
        if (mapFilter === "failed" || mapFilter === "failed-valid") return "#ef4444";
        if (mapFilter === "completed") return "#9ca3af";
        return "#22c55e"; // active
    };

    return (
        <>
            <svg
                ref={svgRef}
                width="100%"
                height="100%"
                viewBox="0 0 900 500"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                style={{ cursor: isDragging ? 'grabbing' : 'grab', flex: 1 }}
            >
                <g transform={isUsView ? `translate(${pan.x}, ${pan.y}) scale(${zoom})` : `translate(${450 + pan.x}, ${250 + pan.y}) scale(${zoom}) translate(-450, -250)`} style={{ transition: isDragging ? 'none' : 'transform 0.15s ease-out' }}>
                    
                    <rect width="900" height="500" fill="#090a0f" />

                    {/* Render US states borders if US view active, else render world countries */}
                    {isUsView ? (
                        usStatesGeoJson && (
                            <g fill="rgba(99, 102, 241, 0.03)" stroke="rgba(99, 102, 241, 0.25)" strokeWidth="0.6" className="animate-fadeIn">
                                {usStatesGeoJson?.features?.map((feat: any, i: number) => {
                                    const stateName = feat.properties.name;
                                    const isSelected = selectedState === stateName;
                                    return (
                                        <path 
                                            key={`us-state-${i}`} 
                                            d={getFeaturePath(feat, isUsView)}
                                            fill={isSelected ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.03)"}
                                            stroke={isSelected ? "var(--accent-primary)" : "rgba(99, 102, 241, 0.25)"}
                                            strokeWidth={isSelected ? "1.2" : "0.6"}
                                            style={{ transition: 'all 0.25s', cursor: 'pointer' }}
                                            onClick={() => zoomToStateBounds(stateName)}
                                            onMouseEnter={(e) => {
                                                if (!isSelected) {
                                                    (e.target as SVGPathElement).setAttribute("fill", "rgba(99, 102, 241, 0.08)");
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isSelected) {
                                                    (e.target as SVGPathElement).setAttribute("fill", "rgba(99, 102, 241, 0.03)");
                                                }
                                            }}
                                        />
                                    );
                                })}
                            </g>
                        )
                    ) : (
                        <g fill="rgba(255, 255, 255, 0.02)" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="0.8">
                            {geoJson?.features?.map((feat: any, i: number) => {
                                const isUS = feat.properties.name === "United States of America" || feat.properties.name === "United States" || feat.properties.name === "USA";
                                return (
                                    <path 
                                        key={`world-country-${i}`} 
                                        d={getFeaturePath(feat, isUsView)} 
                                        style={{ 
                                            transition: 'fill 0.2s',
                                            cursor: isUS ? 'pointer' : 'default'
                                        }}
                                        onClick={() => {
                                            if (isUS) {
                                                handleFocusUS();
                                            }
                                        }}
                                        onMouseEnter={(e) => {
                                            (e.target as SVGPathElement).setAttribute("fill", isUS ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.06)");
                                        }}
                                        onMouseLeave={(e) => {
                                            (e.target as SVGPathElement).setAttribute("fill", "rgba(255, 255, 255, 0.02)");
                                        }}
                                    />
                                );
                            })}
                        </g>
                    )}

                    {/* Render spider offset lines linking offset beacons to city centers */}
                    {isUsView && mapPoints.map((pt, idx) => {
                        if (pt.parentCoords && (!selectedState || pt.stateName === selectedState)) {
                            return (
                                <line
                                    key={`spider-leg-${idx}`}
                                    x1={pt.parentCoords.x}
                                    y1={pt.parentCoords.y}
                                    x2={pt.coords.x}
                                    y2={pt.coords.y}
                                    stroke="rgba(99, 102, 241, 0.4)"
                                    strokeWidth="0.8"
                                    strokeDasharray="2,2"
                                />
                            );
                        }
                        return null;
                    })}

                    {/* Connection Bezier curves */}
                    {mapPoints.map((pt, idx) => {
                        if (isUsView && pt.countryCode !== "US") return null;
                        if (isUsView && selectedState && pt.stateName !== selectedState) return null;
                        return (
                            <g key={`arc-${idx}`}>
                                <path
                                    d={calculateArcPath(hqPos.x, hqPos.y, pt.coords.x, pt.coords.y)}
                                    fill="none"
                                    stroke={getArcColor(pt)}
                                    strokeWidth={Math.min(1.5 + (pt.count * 0.4), 4)}
                                    opacity="0.85"
                                    strokeDasharray="4,4"
                                    style={{ animation: 'pulseFlow 4s linear infinite', pointerEvents: 'none' }}
                                />
                            </g>
                        );
                    })}

                    {/* Aggregated Beacons */}
                    {mapPoints.map((pt, idx) => {
                        if (isUsView && pt.countryCode !== "US") return null;
                        if (isUsView && selectedState && pt.stateName !== selectedState) return null;

                        const isFail = mapFilter === "failed" || mapFilter === "failed-valid";
                        const pointColor = getGlowColor(pt);
                        
                        return (
                            <g
                                key={`point-${idx}`}
                                transform={`translate(${pt.coords.x}, ${pt.coords.y})`}
                                onMouseEnter={(e) => {
                                    const projectedX = pt.coords.x * zoom + pan.x;
                                    const projectedY = pt.coords.y * zoom + pan.y;
                                    
                                    // Tooltip width is 310px. Offset position cleanly based on screen location
                                    let tx = projectedX + 15;
                                    if (projectedX > 550) {
                                        tx = projectedX - 325; // render to the left
                                    }
                                    
                                    let ty = projectedY - 80;
                                    if (projectedY > 350) {
                                        ty = projectedY - 220; // render higher up to avoid bottom overflow
                                    } else if (projectedY < 100) {
                                        ty = projectedY + 15; // render lower down
                                    }

                                    setHoveredPoint(pt);
                                    setTooltipPos({
                                        x: tx,
                                        y: ty
                                    });
                                }}
                                onMouseLeave={() => setHoveredPoint(null)}
                                onClick={() => {
                                    if (!selectedState && pt.stateName) {
                                        zoomToStateBounds(pt.stateName);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                <circle r={isFail ? 11 : 9} fill={pointColor} opacity="0.08" style={{ pointerEvents: 'none' }} />
                                <circle r={isFail ? 7 : 5} fill={pointColor} opacity="0.25" style={{ pointerEvents: 'none' }} />
                                <circle r={isFail ? 4 : 3} fill={pointColor} />
                            </g>
                        );
                    })}
                    {/* Core Corporate Gateways Landmark Beacon */}
                    <g transform={`translate(${hqPos.x}, ${hqPos.y})`}>
                        <circle r="12" fill="var(--accent-primary)" opacity="0.1" />
                        <circle r="8" fill="var(--accent-primary)" opacity="0.3" />
                        <circle r="4.5" fill="var(--accent-primary)" />
                    </g>
                </g>
            </svg>

            <MapTooltip hoveredPoint={hoveredPoint} tooltipPos={tooltipPos} mapFilter={mapFilter} />
        </>
    );
}
