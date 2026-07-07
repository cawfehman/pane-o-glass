"use client";

import { useState, useRef, MouseEvent, WheelEvent, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Globe, ShieldAlert, CheckCircle, Activity, Play } from "lucide-react";

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
    securityScope: string;
    setSecurityScope: (val: string) => void;
    ipCache?: Record<string, any>;
    onRefreshData?: () => Promise<void> | void;
}

interface GeoJsonFeature {
    type: "Feature";
    properties: {
        name: string;
        [key: string]: any;
    };
    geometry: {
        type: "Polygon" | "MultiPolygon";
        coordinates: any[];
    };
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

const HQ_COORDS = { lat: 39.9526, lng: -75.1652, name: "Corporate Gateways" };

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

    // Zoom to specific state bounds
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

    const svgRef = useRef<SVGSVGElement | null>(null);

    // World Equirectangular projection (900x500 viewport)
    const projectWorld = (lat: number, lng: number) => {
        const x = 450 + (lng * 400) / 180;
        const y = 250 - (lat * 200) / 90;
        return { x, y };
    };

    // US-dedicated projection: maps continental US bounding box to fill 900x500 viewport
    // Continental US bounds: lat 24.5..49.5, lng -125..-66.5
    const projectUS = (lat: number, lng: number) => {
        const minLat = 24.0, maxLat = 50.0;
        const minLng = -126.0, maxLng = -65.0;
        const padX = 40, padY = 30;
        const w = 900 - padX * 2;
        const h = 500 - padY * 2;
        const x = padX + ((lng - minLng) / (maxLng - minLng)) * w;
        const y = padY + ((maxLat - lat) / (maxLat - minLat)) * h;
        return { x, y };
    };

    // Active projection: switches based on current view
    const project = (lat: number, lng: number) => {
        return isUsView ? projectUS(lat, lng) : projectWorld(lat, lng);
    };

    const hqPos = project(HQ_COORDS.lat, HQ_COORDS.lng);

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

    // Path generators
    const getFeaturePath = (feature: GeoJsonFeature, useProjection?: (lat: number, lng: number) => { x: number; y: number }) => {
        const { type, coordinates } = feature.geometry;
        const proj = useProjection || project;
        const formatCoord = (coord: [number, number]) => {
            const pt = proj(coord[1], coord[0]);
            return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        };

        if (type === "Polygon") {
            return coordinates.map(ring => "M " + ring.map(formatCoord).join(" L ") + " Z").join(" ");
        } else if (type === "MultiPolygon") {
            return coordinates.map(poly => poly.map((ring: any[]) => "M " + ring.map(formatCoord).join(" L ") + " Z").join(" ")).join(" ");
        }
        return "";
    };

    // Advanced Data Filtering & Aggregation Logics
    const getAggregatedData = () => {
        const list: any[] = [];
        const allEvents = [...recentEvents, ...successfulIps, ...failedIps];

        // Sort events chronologically to evaluate state transitions correctly
        const sortedEvents = [...allEvents].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (mapFilter === "active") {
            // Track active successful tunnels (SUCCESS without matching subsequent DISCONNECT)
            const activeTunnels = new Map<string, VpnEvent>();
            for (const evt of sortedEvents) {
                const key = `${evt.username}-${evt.sourceIp}`;
                if (evt.status === "SUCCESS") {
                    activeTunnels.set(key, evt);
                } else if (evt.status === "DISCONNECT") {
                    activeTunnels.delete(key);
                }
            }

            // Group active connections by location (IP/City-level)
            const grouped: Record<string, { key: string; countryCode: string; name: string; coords: { x: number; y: number }; count: number; events: VpnEvent[]; cityName?: string | null; stateName?: string | null; org?: string }> = {};
            activeTunnels.forEach(evt => {
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const ip = evt.sourceIp;
                const cacheEntry = ipCache && ipCache[ip];
                
                // Group key is the IP if cached (to show city beacon), or country code if not cached
                const groupKey = cacheEntry ? ip : code;

                if (!grouped[groupKey]) {
                    const coords = cacheEntry && cacheEntry.latitude != null
                        ? project(cacheEntry.latitude, cacheEntry.longitude)
                        : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng) : project(37.0902, -95.7129));
                    
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
            // Completed connections = DISCONNECT events in current window
            const completedEvents = sortedEvents.filter(e => e.status === "DISCONNECT");
            const grouped: Record<string, { key: string; countryCode: string; name: string; coords: { x: number; y: number }; count: number; events: VpnEvent[]; cityName?: string | null; stateName?: string | null; org?: string }> = {};
            
            for (const evt of completedEvents) {
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const ip = evt.sourceIp;
                const cacheEntry = ipCache && ipCache[ip];
                
                // Group key is the IP if cached (to show city beacon), or country code if not cached
                const groupKey = cacheEntry ? ip : code;

                if (!grouped[groupKey]) {
                    const coords = cacheEntry && cacheEntry.latitude != null
                        ? project(cacheEntry.latitude, cacheEntry.longitude)
                        : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng) : project(37.0902, -95.7129));
                    
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
            // FAILED / FAILED-VALID: Aggregate by Source IP
            const nameNameRegex = /^[a-zA-Z0-9]+-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
            const failures = sortedEvents.filter(evt => {
                if (evt.status !== "FAILURE") return false;
                if (mapFilter === "failed-valid") {
                    const clean = evt.username?.toLowerCase().endsWith("@cooperhealth.edu") ? evt.username.slice(0, -17) : evt.username;
                    return nameNameRegex.test(clean);
                }
                return true;
            });

            const ipGrouped: Record<string, {
                ip: string;
                countryCode: string;
                countryName: string;
                coords: { x: number; y: number };
                count: number;
                reasons: Set<string>;
                usernames: Set<string>;
                asnName: string;
                lastEvent: VpnEvent;
                cityName?: string | null;
                stateName?: string | null;
                org?: string;
                timezone?: string | null;
            }> = {};

            for (const evt of failures) {
                const ip = evt.sourceIp;
                const code = evt.ipCountryCode?.toUpperCase() || "US";
                const cacheEntry = ipCache && ipCache[ip];

                const coords = cacheEntry && cacheEntry.latitude != null
                    ? project(cacheEntry.latitude, cacheEntry.longitude)
                    : (countryCoordinates[code] ? project(countryCoordinates[code].lat, countryCoordinates[code].lng) : project(37.0902, -95.7129));

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
    };

    // Apply radial spidering offset to collision nodes (same city/coord) to prevent overlapping circles
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

    const mapPoints = getAggregatedData();

    // Mouse scroll wheel zooming
    const handleWheel = (e: WheelEvent<SVGSVGElement>) => {
        e.preventDefault();
        const zoomFactor = 0.1;
        const newZoom = e.deltaY < 0 ? Math.min(zoom + zoomFactor, 6) : Math.max(zoom - zoomFactor, 0.8);
        setZoom(newZoom);
    };

    // Dragging viewport handlers
    const handleMouseDown = (e: MouseEvent<SVGSVGElement>) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
        if (!isDragging) return;
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => { setIsDragging(false); };

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

    // format session duration helper
    const formatDuration = (sec: number | null | undefined) => {
        if (!sec) return "N/A";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m} min`;
    };

    // format bytes helper
    const formatBytes = (bytes: number | null | undefined) => {
        if (bytes == null) return "0 B";
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0 }} className="animate-fadeIn">
            
            {/* Tab Filter & Period Header Configuration Bar */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--bg-surface)',
                padding: '12px 18px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                {/* Visualizer Filters */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setMapFilter("active")}
                        className={mapFilter === "active" ? "btn-primary" : "btn-secondary"}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                    >
                        <Activity size={14} /> Active Connections
                    </button>
                    <button
                        onClick={() => setMapFilter("failed")}
                        className={mapFilter === "failed" ? "btn-primary" : "btn-secondary"}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                    >
                        <ShieldAlert size={14} color="#ef4444" /> All Failed Attempts
                    </button>
                    <button
                        onClick={() => setMapFilter("failed-valid")}
                        className={mapFilter === "failed-valid" ? "btn-primary" : "btn-secondary"}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                    >
                        <ShieldAlert size={14} color="#f59e0b" /> Failed Valid Users
                    </button>
                    <button
                        onClick={() => setMapFilter("completed")}
                        className={mapFilter === "completed" ? "btn-primary" : "btn-secondary"}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', borderRadius: '6px' }}
                    >
                        <CheckCircle size={14} /> Completed Sessions
                    </button>
                </div>

                {/* Time scope dropdown selector matching page layout */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>Time Filter:</span>
                    <select
                        value={securityScope}
                        onChange={(e) => setSecurityScope(e.target.value)}
                        style={{
                            background: 'rgba(0,0,0,0.2)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="last24hours">Last 24 Hours</option>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7days">Last 7 Days</option>
                        <option value="last14days">Last 14 Days</option>
                        <option value="last30days">Last 30 Days</option>
                    </select>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1, position: 'relative', minHeight: '520px', overflow: 'hidden' }}>
                
                {/* Subtitle details */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', zIndex: 10 }}>
                    <div>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Globe size={18} color="var(--accent-primary)" /> Geographic Connection Forensics
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {mapFilter === "active" && "Showing live tunnels that are currently established."}
                            {mapFilter === "failed" && "Aggregated failure maps displaying connection attempt frequencies by IP."}
                            {mapFilter === "failed-valid" && "Targeted failure vectors matching valid active directory account patterns."}
                            {mapFilter === "completed" && "Recently terminated tunnels displaying duration and data sizes."}
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '20px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Vectors: {mapPoints.length}</span>
                    </div>
                </div>

                {/* Map Panel Wrap */}
                <div style={{ display: 'flex', gap: '20px', flex: 1, minHeight: '520px' }}>
                    
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#090a0f', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
                        {/* Viewport Controls with Focus US Option inside the map canvas area */}
                        <div style={{ position: 'absolute', right: '16px', top: '16px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 20 }}>
                            <button onClick={() => setZoom(prev => Math.min(prev + 0.3, 6))} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ZoomIn size={16} />
                            </button>
                            <button onClick={() => setZoom(prev => Math.max(prev - 0.3, 0.8))} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ZoomOut size={16} />
                            </button>
                            <button onClick={handleFocusUS} className="btn-primary" style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                                Focus US
                            </button>
                            <button onClick={handleReset} className="btn-primary" style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <RotateCcw size={16} />
                            </button>
                        </div>
                        {loadingMap ? (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                                <div style={{ width: '24px', height: '24px', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                <span style={{ fontSize: '0.85rem' }}>LOADING CARTOGRAPHY...</span>
                            </div>
                        ) : (
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
                                                {usStatesGeoJson?.features?.map((feat: GeoJsonFeature, i: number) => {
                                                    const stateName = feat.properties.name;
                                                    const isSelected = selectedState === stateName;
                                                    return (
                                                        <path 
                                                            key={`us-state-${i}`} 
                                                            d={getFeaturePath(feat, projectUS)}
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
                                            {geoJson?.features?.map((feat: GeoJsonFeature, i: number) => {
                                                const isUS = feat.properties.name === "United States of America" || feat.properties.name === "United States" || feat.properties.name === "USA";
                                                return (
                                                    <path 
                                                        key={`world-country-${i}`} 
                                                        d={getFeaturePath(feat, projectWorld)} 
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

                                    {/* Connection Bezier curves (clean static solid paths) */}
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
                                                {/* Outer ripple rings for visual density feedback */}
                                                <circle r={isFail ? 11 : 9} fill={pointColor} opacity="0.08" style={{ pointerEvents: 'none' }} />
                                                <circle r={isFail ? 7 : 5} fill={pointColor} opacity="0.25" style={{ pointerEvents: 'none' }} />
                                                
                                                {/* Core active locator node */}
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
                        )}

                        {/* Popover Hover details */}
                        {hoveredPoint && (
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>ISP/Org:</span>
                                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={hoveredPoint.asnName}>
                                                {hoveredPoint.asnName}
                                            </span>
                                        </div>
                                        {hoveredPoint.timezone && (
                                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Timezone:</span>
                                                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
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
                                        {hoveredPoint.events.map((evt: VpnEvent, index: number) => (
                                            <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '3px', background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
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
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
