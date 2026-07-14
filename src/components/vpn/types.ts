export interface VpnEvent {
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

export interface GeoJsonFeature {
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
