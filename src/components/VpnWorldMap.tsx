"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Globe } from "lucide-react";
import { VpnEvent, GeoJsonFeature } from "./vpn/types";
import { MapFilters } from "./vpn/MapFilters";
import { MapControls } from "./vpn/MapControls";
import { MapCanvas, project, projectUS, projectWorld } from "./vpn/MapCanvas";

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

const HQ_COORDS = { lat: 39.9526, lng: -75.1652, name: "Corporate Gateways" };

export interface VpnWorldMapProps {
    successfulIps: VpnEvent[];
    failedIps: VpnEvent[];
    recentEvents: VpnEvent[];
    securityScope: string;
    setSecurityScope: (val: string) => void;
    ipCache?: Record<string, any>;
    onRefreshData?: () => Promise<void> | void;
}

export function VpnWorldMap({ successfulIps = [], failedIps = [], recentEvents = [], securityScope, setSecurityScope, ipCache = {}, onRefreshData }: VpnWorldMapProps) {
    const [zoom, setZoom] = useState<number>(1);
    const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    
    // Geometry States
    const [geoJson, setGeoJson] = useState<any>(null);
    const [loadingMap, setLoadingMap] = useState<boolean>(true);
    const [usStatesGeoJson, setUsStatesGeoJson] = useState<any>(null);
    const [loadingStates, setLoadingStates] = useState<boolean>(false);
    const [showUsStates, setShowUsStates] = useState<boolean>(false);

    // Map filters state: active | failed | failed-valid | completed
    const [mapFilter, setMapFilter] = useState<"active" | "failed" | "failed-valid" | "completed">("active");
    const [isEnriching, setIsEnriching] = useState<boolean>(false);
    const [selectedState, setSelectedState] = useState<string | null>(null);

    const isUsView = showUsStates;

    const svgRef = useRef<SVGSVGElement | null>(null);
    const hqPos = useMemo(() => project(HQ_COORDS.lat, HQ_COORDS.lng, isUsView), [isUsView]);

    const zoomToStateBounds = (stateName: string) => {
        if (!usStatesGeoJson) return;
        const feature = usStatesGeoJson.features.find((f: any) => f.properties.name === stateName);
        if (!feature) return;

        let minLat = 90, maxLat = -90;
        let minLng = 180, maxLng = -180;

        const processCoord = (c: [number, number]) => {
            const lng = c[0];
            const lat = c[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
        };

        const geom = feature.geometry;
        if (geom.type === "Polygon") {
            geom.coordinates.forEach((ring: any) => ring.forEach(processCoord));
        } else if (geom.type === "MultiPolygon") {
            geom.coordinates.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach(processCoord)));
        }

        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;
        const latSpan = maxLat - minLat;
        const lngSpan = maxLng - minLng;
        const maxSpan = Math.max(latSpan, lngSpan) || 1;

        // Auto zoom dynamically based on state boundary dimensions
        const targetZoom = Math.max(1.8, Math.min(6, 12 / maxSpan));
        const stateCenter = projectUS(centerLat, centerLng);

        setSelectedState(stateName);
        setZoom(targetZoom);
        setPan({
            x: 450 - stateCenter.x * targetZoom,
            y: 250 - stateCenter.y * targetZoom
        });
    };

    useEffect(() => {
        const checkAndEnrich = async () => {
            if (!showUsStates || isEnriching) return;

            // Collect all active US IPs (including null country codes — those are likely domestic)
            const activeTunnels = successfulIps.filter(evt => {
                return evt.status === "SUCCESS" && (evt.ipCountryCode === "US" || !evt.ipCountryCode);
            });
            
            // Collect failed valid US IPs
            const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
            const failedValidTunnels = failedIps.filter(evt => {
                const clean = evt.username?.toLowerCase().endsWith("@cooperhealth.edu") ? evt.username.slice(0, -17) : evt.username;
                return evt.status === "FAILURE" && (evt.ipCountryCode === "US" || !evt.ipCountryCode) && nameNameRegex.test(clean);
            });

            const allUsIps = Array.from(new Set([
                ...activeTunnels.map(e => e.sourceIp),
                ...failedValidTunnels.map(e => e.sourceIp)
            ])).filter(Boolean);

            const uncached = allUsIps.filter(ip => !ipCache[ip]);

            if (uncached.length > 0) {
                setIsEnriching(true);
                console.log(`[Enrichment] US view active. Resolving ${uncached.length} uncached IPs in bulk...`);
                
                try {
                    const response = await fetch("/api/vpn/enrich-batch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ips: uncached })
                    });
                    
                    if (response.ok) {
                        console.log("[Enrichment] Batch enrichment complete. Reloading map coordinates.");
                        if (onRefreshData) {
                            await onRefreshData();
                        }
                    } else {
                        console.error("[Enrichment] Batch query returned error:", response.status);
                    }
                } catch (e) {
                    console.error("[Enrichment] Network error during batch geocoding:", e);
                }
                
                setIsEnriching(false);
            }
        };

        checkAndEnrich();
    }, [showUsStates, ipCache, successfulIps, failedIps, onRefreshData]);

    // Fetch simplified world geometry on mount
    useEffect(() => {
        let active = true;
        fetch("/world.geojson")
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => {
                if (active) {
                    setGeoJson(data);
                    setLoadingMap(false);
                }
            })
            .catch(() => {
                if (active) setLoadingMap(false);
            });
        return () => { active = false; };
    }, []);

    // Lazy load US state borders when US view is activated
    useEffect(() => {
        if (showUsStates && !usStatesGeoJson && !loadingStates) {
            setLoadingStates(true);
            fetch("/us-states.json")
                .then(res => res.ok ? res.json() : Promise.reject())
                .then(data => {
                    setUsStatesGeoJson(data);
                    setLoadingStates(false);
                })
                .catch(() => {
                    setLoadingStates(false);
                });
        }
    }, [showUsStates, usStatesGeoJson, loadingStates]);

    const applyRadialSpidering = (points: any[]) => {
        const coordGroups: Record<string, any[]> = {};
        points.forEach(pt => {
            if (pt.countryCode !== "US") return;
            const key = `${pt.coords.x.toFixed(1)},${pt.coords.y.toFixed(1)}`;
            if (!coordGroups[key]) coordGroups[key] = [];
            coordGroups[key].push(pt);
        });

        Object.keys(coordGroups).forEach(key => {
            const group = coordGroups[key];
            if (group.length > 1) {
                const cx = group[0].coords.x;
                const cy = group[0].coords.y;
                
                // Dynamically scale spacing radius if there is a massive cluster (e.g. Kansas default)
                const radius = group.length > 8 ? Math.min(80, 22 + group.length * 1.8) : 22;

                group.forEach((pt, i) => {
                    const angle = (i / group.length) * 2 * Math.PI;
                    pt.coords = {
                        x: cx + Math.cos(angle) * radius,
                        y: cy + Math.sin(angle) * radius
                    };
                    pt.parentCoords = { x: cx, y: cy }; // save city center reference
                });
            }
        });
        return points;
    };

    const mapPoints = useMemo(() => {
        const list: any[] = [];
        const allEvents = [...recentEvents, ...successfulIps, ...failedIps];

        // Sort events chronologically to evaluate state transitions correctly
        const sortedEvents = [...allEvents].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (mapFilter === "active") {
            const activeTunnels = new Map<string, VpnEvent>();
            for (const evt of sortedEvents) {
                const key = `${evt.username}-${evt.sourceIp}`;
                if (evt.status === "SUCCESS") {
                    activeTunnels.set(key, evt);
                } else if (evt.status === "DISCONNECT") {
                    activeTunnels.delete(key);
                }
            }

            const grouped: Record<string, any> = {};
            activeTunnels.forEach(evt => {
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const ip = evt.sourceIp;
                const cacheEntry = ipCache && ipCache[ip];
                const groupKey = cacheEntry ? ip : code;

                if (!grouped[groupKey]) {
                    const coords = cacheEntry && cacheEntry.latitude != null
                        ? project(cacheEntry.latitude, cacheEntry.longitude, isUsView)
                        : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng, isUsView) : project(37.0902, -95.7129, isUsView));
                    
                    const cityName = cacheEntry?.city || null;
                    const stateName = cacheEntry?.subdivision || null;
                    const org = cacheEntry?.details?.org || evt.ipAsName || "N/A";

                    grouped[groupKey] = {
                        key: groupKey,
                        countryCode: code,
                        name: cityName && stateName ? `${cityName}, ${stateName}` : (evt.ipCountry || countryCoordinates[code]?.name || "Unknown Location"),
                        coords,
                        count: 0,
                        events: [],
                        cityName,
                        stateName,
                        org
                    };
                }
                grouped[groupKey].count++;
                if (grouped[groupKey].events.length < 5) grouped[groupKey].events.push(evt);
            });
            return Object.values(grouped);

        } else if (mapFilter === "completed") {
            const completedEvents = sortedEvents.filter(e => e.status === "DISCONNECT");
            const grouped: Record<string, any> = {};
            
            for (const evt of completedEvents) {
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const ip = evt.sourceIp;
                const cacheEntry = ipCache && ipCache[ip];
                const groupKey = cacheEntry ? ip : code;

                if (!grouped[groupKey]) {
                    const coords = cacheEntry && cacheEntry.latitude != null
                        ? project(cacheEntry.latitude, cacheEntry.longitude, isUsView)
                        : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng, isUsView) : project(37.0902, -95.7129, isUsView));
                    
                    const cityName = cacheEntry?.city || null;
                    const stateName = cacheEntry?.subdivision || null;
                    const org = cacheEntry?.details?.org || evt.ipAsName || "N/A";

                    grouped[groupKey] = {
                        key: groupKey,
                        countryCode: code,
                        name: cityName && stateName ? `${cityName}, ${stateName}` : (evt.ipCountry || countryCoordinates[code]?.name || "Unknown Location"),
                        coords,
                        count: 0,
                        events: [],
                        cityName,
                        stateName,
                        org
                    };
                }
                grouped[groupKey].count++;
                if (grouped[groupKey].events.length < 5) grouped[groupKey].events.push(evt);
            }
            return Object.values(grouped);

        } else {
            const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
            const failures = sortedEvents.filter(evt => {
                if (evt.status !== "FAILURE") return false;
                if (mapFilter === "failed-valid") {
                    const clean = evt.username?.toLowerCase().endsWith("@cooperhealth.edu") ? evt.username.slice(0, -17) : evt.username;
                    return nameNameRegex.test(clean);
                }
                return true;
            });

            const ipGrouped: Record<string, any> = {};

            for (const evt of failures) {
                const ip = evt.sourceIp;
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const cacheEntry = ipCache && ipCache[ip];

                const coords = cacheEntry && cacheEntry.latitude != null
                    ? project(cacheEntry.latitude, cacheEntry.longitude, isUsView)
                    : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng, isUsView) : project(37.0902, -95.7129, isUsView));

                if (!ipGrouped[ip]) {
                    const cityName = cacheEntry?.city || null;
                    const stateName = cacheEntry?.subdivision || null;
                    const org = cacheEntry?.details?.org || evt.ipAsName || "N/A";
                    const timezone = cacheEntry?.details?.time_zone || null;

                    ipGrouped[ip] = {
                        ip,
                        countryCode: code,
                        countryName: cityName && stateName ? `${cityName}, ${stateName}` : (evt.ipCountry || countryCoordinates[code]?.name || "Unknown Location"),
                        coords,
                        count: 0,
                        reasons: new Set(),
                        usernames: new Set(),
                        asnName: org,
                        lastEvent: evt,
                        cityName,
                        stateName,
                        org,
                        timezone
                    };
                }
                ipGrouped[ip].count++;
                if (evt.failureReason) ipGrouped[ip].reasons.add(evt.failureReason);
                if (evt.username) ipGrouped[ip].usernames.add(evt.username);
            }

            const points = Object.values(ipGrouped);
            return applyRadialSpidering(points);
        }
    }, [recentEvents, successfulIps, failedIps, mapFilter, ipCache, isUsView]);

    const handleFocusUS = () => {
        setShowUsStates(true);
        setSelectedState(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const handleReset = () => {
        setShowUsStates(false);
        setSelectedState(null);
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    return (
        <div className="flex flex-col gap-5 flex-1 min-h-0 animate-fadeIn">
            
            <MapFilters
                mapFilter={mapFilter as any}
                setMapFilter={setMapFilter as any}
                securityScope={securityScope}
                setSecurityScope={setSecurityScope}
            />

            <div className="glass-card p-6 flex flex-col flex-1 relative min-h-[520px] overflow-hidden">
                
                {/* Subtitle details */}
                <div className="flex justify-between items-center mb-4 z-10">
                    <div>
                        <h3 className="text-[1.1rem] font-bold flex items-center gap-2">
                            <Globe size={18} color="var(--accent-primary)" /> Geographic Connection Forensics
                        </h3>
                        <p className="text-[0.85rem] text-text-muted mt-1">
                            {mapFilter === "active" && "Showing live tunnels that are currently established."}
                            {mapFilter === "failed" && "Aggregated failure maps displaying connection attempt frequencies by IP."}
                            {mapFilter === "failed-valid" && "Targeted failure vectors matching valid active directory account patterns."}
                            {mapFilter === "completed" && "Recently terminated tunnels displaying duration and data sizes."}
                        </p>
                    </div>

                    <div className="flex gap-5">
                        <span className="text-[0.85rem] font-semibold">Total Vectors: {mapPoints.length}</span>
                    </div>
                </div>

                {/* Map Panel Wrap */}
                <div className="flex gap-5 flex-1 min-h-[520px]">
                    
                    <div className="flex-1 relative overflow-hidden bg-[#090a0f] rounded-lg border border-border-color flex flex-col">
                        <MapControls
                            onZoomIn={() => setZoom(prev => Math.min(prev + 0.3, 6))}
                            onZoomOut={() => setZoom(prev => Math.max(prev - 0.3, 0.8))}
                            onFocusUS={handleFocusUS}
                            onReset={handleReset}
                        />

                        {loadingMap ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
                                <div className="w-6 h-6 border-2 border-white/10 border-t-accent-primary rounded-full animate-spin"></div>
                                <span className="text-[0.85rem]">LOADING CARTOGRAPHY...</span>
                            </div>
                        ) : (
                            <MapCanvas
                                svgRef={svgRef}
                                zoom={zoom}
                                setZoom={setZoom}
                                pan={pan}
                                setPan={setPan}
                                isDragging={isDragging}
                                setIsDragging={setIsDragging}
                                dragStart={dragStart}
                                setDragStart={setDragStart}
                                hoveredPoint={hoveredPoint}
                                setHoveredPoint={setHoveredPoint}
                                tooltipPos={tooltipPos}
                                setTooltipPos={setTooltipPos}
                                isUsView={isUsView}
                                geoJson={geoJson}
                                usStatesGeoJson={usStatesGeoJson}
                                selectedState={selectedState}
                                zoomToStateBounds={zoomToStateBounds}
                                handleFocusUS={handleFocusUS}
                                mapPoints={mapPoints}
                                mapFilter={mapFilter}
                                hqPos={hqPos}
                            />
                        )}
                    </div>

                    {/* State Detail Telemetry Panel */}
                    {isUsView && selectedState && (
                        <div className="glass-card animate-fadeIn" style={{ width: '320px', display: 'flex', flexDirection: 'column', padding: '20px', border: '1px solid var(--border-color)', background: 'rgba(9, 10, 15, 0.65)', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px' }}>
                                <div>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedState} Activity</h4>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Zoomed state logs</span>
                                </div>
                                <button
                                    onClick={() => {
                                        setSelectedState(null);
                                        setZoom(1);
                                        setPan({ x: 0, y: 0 });
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600 }}
                                >
                                    Zoom Out
                                </button>
                            </div>

                            {/* Aggregated session logs inside selected state */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                                    CHANNELS FOUND: {mapPoints.filter(pt => pt.stateName === selectedState).length}
                                </span>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '380px', paddingRight: '4px' }}>
                                    {mapPoints
                                        .filter(pt => pt.stateName === selectedState)
                                        .map((pt, i) => (
                                            <div key={i} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '10px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <div className="flex justify-between items-center">
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                                        {pt.cityName || "Unknown City"}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent-primary)' }}>
                                                        {pt.count} log{pt.count > 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                
                                                <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                    {pt.ip || "Aggregated State IPs"}
                                                </span>
                                                
                                                {pt.events && pt.events.length > 0 && (
                                                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.03)', marginTop: '4px', paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {pt.events.map((evt: VpnEvent, idx: number) => (
                                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                                <span>• {evt.username}</span>
                                                                <span style={{ color: evt.status === "SUCCESS" ? "#22c55e" : "#ef4444" }}>
                                                                    {evt.status}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes pulseFlow {
                    0% { stroke-dashoffset: 200; }
                    100% { stroke-dashoffset: -200; }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            ` }} />
        </div>
    );
}
