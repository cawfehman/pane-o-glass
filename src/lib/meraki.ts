import fs from "fs";
import path from "path";

const MERAKI_BASE_URL = "https://api.meraki.com/api/v1";

/**
 * Forbidden path segments that could trigger state-changing or disruptive actions on Meraki devices.
 * Even though only HTTP GET is implemented, we double-guard the URL path itself.
 */
const FORBIDDEN_PATH_PATTERNS = [
    "/reboot",
    "/blinkleds",
    "/cycle",
    "/claim",
    "/unclaim",
    "/bind",
    "/unbind",
    "/provision",
    "/combine",
    "/split",
];

export class ReadOnlyViolationError extends Error {
    constructor(message: string) {
        super(`MERAKI_READ_ONLY_VIOLATION: ${message}`);
        this.name = "ReadOnlyViolationError";
    }
}

export interface MerakiOrganization {
    id: string;
    name: string;
    url?: string;
}

export interface MerakiNetwork {
    id: string;
    organizationId: string;
    name: string;
    productTypes: string[];
    timeZone?: string;
    tags: string[];
    notes?: string;
}

export interface MerakiUplinkInterface {
    interface: string; // wan1, wan2, cellular
    status: string; // active, ready, failed, not connected
    ip?: string | null;
    gateway?: string | null;
    publicIp?: string | null;
    primaryDns?: string | null;
    secondaryDns?: string | null;
    ipAssignedBy?: string | null;
    provider?: string | null;
    model?: string | null;
    signalStat?: {
        rsrp?: string;
        rsrq?: string;
    } | null;
}

export interface MerakiDeviceUnified {
    serial: string;
    name: string;
    model: string;
    productType: "switch" | "appliance" | "wireless" | "camera" | "sensor" | "cellularGateway" | string;
    mac: string;
    macCompact: string; // e.g. "683a1eaf84be" (matches Netcrawl format)
    lanIp: string | null;
    networkId: string;
    networkName: string;
    organizationId: string;
    organizationName: string;
    status: "online" | "alerting" | "offline" | "dormant" | "unknown";
    lastReportedAt: string | null;
    publicIp: string | null;
    gateway: string | null;
    ipType: string | null;
    primaryDns: string | null;
    secondaryDns: string | null;
    firmware: string | null;
    address: string | null;
    notes: string | null;
    tags: string[];
    uplinks: MerakiUplinkInterface[];
    // Topology & Grouping Metadata (Cooper AutoVPN Group vs CRMC Individual Site/IDF)
    grouping: {
        groupMode: "COOPER_AUTOVPN_CLUSTER" | "CRMC_SITE_IDF";
        groupId: string;
        groupTitle: string;
        siteName: string;
        idfOrSubgroup: string;
        isHeadend: boolean;
    };
}

export interface MerakiTopologyGroup {
    groupId: string;
    groupMode: "COOPER_AUTOVPN_CLUSTER" | "CRMC_SITE_IDF";
    organizationId: string;
    organizationName: string;
    groupTitle: string;
    siteName: string;
    idfOrSubgroup: string;
    description: string;
    headendDevices: MerakiDeviceUnified[];
    devices: MerakiDeviceUnified[];
    counts: {
        total: number;
        switches: number;
        appliances: number;
        wireless: number;
        online: number;
        alerting: number;
        offline: number;
        dormant: number;
    };
}

export interface MerakiDhcpPool {
    serial: string;
    deviceName: string;
    model: string;
    networkId: string;
    networkName: string;
    organizationId: string;
    organizationName: string;
    deviceStatus: string;
    vlanId: number;
    vlanName?: string;
    subnet: string;
    applianceIp?: string;
    usedCount: number;
    freeCount: number;
    totalCount: number;
    utilizationPct: number;
    severity: "CRITICAL" | "WARNING" | "HEALTHY";
    scannedAt: string;
}

export interface MerakiSwitchPort {
    portId: string;
    name: string;
    enabled: boolean;
    status: string; // Connected, Disconnected, Disabled
    isUplink: boolean;
    vlan: number | null;
    voiceVlan: number | null;
    type: string; // access, trunk
    allowedVlans: string;
    poeEnabled: boolean;
    poeAllocated: boolean;
    powerUsageInWh: number | null;
    speed: string | null;
    duplex: string | null;
    stpGuard: string | null;
    rstpEnabled: boolean;
    clientCount: number;
    trafficInKbps: {
        total: number;
        sent: number;
        recv: number;
    } | null;
    errors: string[];
    warnings: string[];
    cdp: {
        deviceId?: string;
        portId?: string;
        address?: string;
        managementAddress?: string;
        platform?: string;
        version?: string;
        nativeVlan?: number;
        systemName?: string;
    } | null;
    lldp: {
        systemName?: string;
        portId?: string;
        chassisId?: string;
        managementAddress?: string;
        systemDescription?: string;
        portDescription?: string;
        managementVlan?: number;
    } | null;
}

export interface MerakiRoutedInterface {
    interfaceId: string;
    name: string;
    subnet: string;
    interfaceIp: string;
    multicastRouting: string;
    vlanId: number;
    defaultGateway?: string;
}

export interface MerakiSwitchInspection {
    device: MerakiDeviceUnified | null;
    serial: string;
    ports: MerakiSwitchPort[];
    routedInterfaces: MerakiRoutedInterface[];
    summary: {
        totalPorts: number;
        connectedPorts: number;
        disabledPorts: number;
        poeActivePorts: number;
        trunkPorts: number;
        neighborCount: number;
        errorPortCount: number;
    };
}

export interface MerakiNetworkClient {
    id: string;
    mac: string;
    macCompact: string;
    description: string | null;
    ip: string | null;
    ip6: string | null;
    user: string | null;
    firstSeen: string | null;
    lastSeen: string | null;
    manufacturer: string | null;
    os: string | null;
    recentDeviceSerial: string | null;
    recentDeviceName: string | null;
    recentDeviceMac: string | null;
    recentDeviceConnection: "Wired" | "Wireless" | string;
    ssid: string | null;
    vlan: string | number | null;
    switchport: string | null;
    status: string | null;
    usage: {
        sent: number;
        recv: number;
        total: number;
    };
    networkId: string;
    networkName: string;
    organizationId: string;
    organizationName: string;
}

export interface MerakiWirelessFailureSummary {
    totalFailures: number;
    byStage: {
        assoc: number;
        auth: number;
        dhcp: number;
        dns: number;
    };
    topFailureTypes: { type: string; step: string; count: number }[];
    topFailingSerials: { serial: string; deviceName: string; count: number }[];
    topFailingVlans: { vlan: number; count: number }[];
    recentEvents: {
        clientMac: string;
        serial: string;
        deviceName: string;
        ssidNumber: number;
        vlan: number;
        failureStep: string;
        type: string;
        ts: string;
    }[];
}

// ---------------------------------------------------------------------------
// Internal Shared Server Cache, In-Flight Coalescing & Rate Limiter
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
    data: T;
    fetchedAtMs: number;
    expiresAt: number;
}

interface OverviewSnapshotEntry {
    response: MerakiFleetOverviewResponse;
    fetchedAtMs: number;
    expiresAt: number;
}

const OVERVIEW_CACHE_TTL_MS = 720_000; // 12-minute cache TTL (provides a 2-minute overlap buffer over the 10-minute poller)
const BACKGROUND_POLL_INTERVAL_MS = 600_000; // 10-minute automatic background poller
const MIN_FORCE_REFRESH_COOLDOWN_MS = 15_000; // If refreshed <15s ago by another user, reuse that fresh pull

const globalForMeraki = globalThis as unknown as {
    __merakiApiCache?: Map<string, CacheEntry<any>>;
    __merakiInFlight?: Map<string, Promise<any>>;
    __merakiOverviewSnapshots?: Map<string, OverviewSnapshotEntry>;
    __merakiOverviewInFlight?: Map<string, Promise<MerakiFleetOverviewResponse>>;
    __merakiDhcpDeviceCache?: Map<string, { pools: MerakiDhcpPool[]; expiresAt: number }>;
    __merakiPollerStarted?: boolean;
    __merakiPollerTimer?: ReturnType<typeof setInterval>;
    __merakiLastBackgroundPollMs?: number;
};

const apiCache = globalForMeraki.__merakiApiCache ?? (globalForMeraki.__merakiApiCache = new Map<string, CacheEntry<any>>());
const inFlightRequests = globalForMeraki.__merakiInFlight ?? (globalForMeraki.__merakiInFlight = new Map<string, Promise<any>>());
const overviewSnapshots =
    globalForMeraki.__merakiOverviewSnapshots ?? (globalForMeraki.__merakiOverviewSnapshots = new Map<string, OverviewSnapshotEntry>());
const overviewInFlight =
    globalForMeraki.__merakiOverviewInFlight ??
    (globalForMeraki.__merakiOverviewInFlight = new Map<string, Promise<MerakiFleetOverviewResponse>>());
const dhcpDeviceCache =
    globalForMeraki.__merakiDhcpDeviceCache ??
    (globalForMeraki.__merakiDhcpDeviceCache = new Map<string, { pools: MerakiDhcpPool[]; expiresAt: number }>());

let cachedEnvKey: string | null = null;
let cachedEnvMtime = 0;

function getMerakiApiKey(): string {
    if (process.env.MERAKI_API_KEY && process.env.MERAKI_API_KEY.trim().length > 10) {
        return process.env.MERAKI_API_KEY.trim();
    }

    try {
        const envPath = path.join(process.cwd(), ".env");
        const stat = fs.statSync(envPath);
        if (cachedEnvKey && stat.mtimeMs === cachedEnvMtime) {
            return cachedEnvKey;
        }
        const content = fs.readFileSync(envPath, "utf-8");
        for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith("MERAKI_API_KEY=")) {
                const rawVal = trimmed.slice("MERAKI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
                if (rawVal) {
                    cachedEnvKey = rawVal;
                    cachedEnvMtime = stat.mtimeMs;
                    process.env.MERAKI_API_KEY = rawVal;
                    return rawVal;
                }
            }
        }
    } catch {
        // Fallback if .env cannot be read
    }

    throw new Error("MERAKI_API_KEY is not configured in environment.");
}

// Pacing queue to stay safely under Meraki's 10 req/sec limit (target ~7 req/sec max burst)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 140; // ~7 requests/sec max
let rateLimitChain: Promise<void> = Promise.resolve();

function acquireRateLimitSlot(): Promise<void> {
    const next = rateLimitChain.then(async () => {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < MIN_REQUEST_INTERVAL_MS) {
            await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
        }
        lastRequestTime = Date.now();
    });
    rateLimitChain = next.catch(() => {});
    return next;
}

/**
 * Normalizes any MAC address string to lowercase compact 12-hex format ("683a1eaf84be")
 * matching the format used by the Cisco IOS Network Crawler.
 */
export function normalizeMacCompact(mac?: string | null): string {
    if (!mac) return "";
    return mac.toLowerCase().replace(/[^0-9a-f]/g, "");
}

/**
 * Normalizes any MAC address string to standard colon-delimited format ("68:3a:1e:af:84:be").
 */
export function normalizeMacColon(mac?: string | null): string {
    const hex = normalizeMacCompact(mac);
    if (hex.length !== 12) return mac || "";
    return hex.match(/.{1,2}/g)!.join(":");
}

/**
 * Strictly read-only HTTP GET wrapper for Cisco Meraki Dashboard API v1.
 * Blocks any non-GET semantics or action-oriented endpoint paths.
 */
export async function merakiGet<T = any>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    options?: { ttlMs?: number; forceRefresh?: boolean }
): Promise<T> {
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const lowerPath = normalizedEndpoint.toLowerCase();

    for (const forbidden of FORBIDDEN_PATH_PATTERNS) {
        if (lowerPath.includes(forbidden)) {
            throw new ReadOnlyViolationError(
                `Endpoint '${normalizedEndpoint}' matches forbidden write/action pattern '${forbidden}'.`
            );
        }
    }

    const url = new URL(`${MERAKI_BASE_URL}${normalizedEndpoint}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== "") {
                url.searchParams.set(k, String(v));
            }
        }
    }

    const cacheKey = url.toString();
    const ttlMs = options?.ttlMs ?? 720_000; // Default 12 min shared server cache (2m buffer over 10m background poller)

    if (!options?.forceRefresh && ttlMs > 0) {
        const cached = apiCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data as T;
        }
    }

    // Coalesce concurrent identical requests (prevents cache stampedes when multiple users open the page simultaneously)
    if (!options?.forceRefresh && inFlightRequests.has(cacheKey)) {
        return (await inFlightRequests.get(cacheKey)) as T;
    }

    const fetchPromise = (async (): Promise<T> => {
        const apiKey = getMerakiApiKey();
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await acquireRateLimitSlot();

            const response = await fetch(url.toString(), {
                method: "GET", // STRICTLY READ-ONLY HTTP GET
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Accept": "application/json",
                },
                cache: "no-store",
            });

            if (response.status === 429 && attempt < maxRetries) {
                const retryAfterHeader = response.headers.get("Retry-After");
                const retrySec = retryAfterHeader ? parseFloat(retryAfterHeader) : 2;
                const backoffMs = Math.max(1000, Math.min(10_000, (isNaN(retrySec) ? 2 : retrySec) * 1000));
                await new Promise((r) => setTimeout(r, backoffMs));
                continue;
            }

            if (!response.ok) {
                const errBody = await response.text().catch(() => "");
                throw new Error(`Meraki API GET ${normalizedEndpoint} failed (${response.status}): ${errBody.slice(0, 240)}`);
            }

            const data = (await response.json()) as T;
            if (ttlMs > 0) {
                const nowMs = Date.now();
                apiCache.set(cacheKey, {
                    data,
                    fetchedAtMs: nowMs,
                    expiresAt: nowMs + ttlMs,
                });
            }
            return data;
        }

        throw new Error(`Meraki API GET ${normalizedEndpoint} exceeded retry limit due to rate limiting.`);
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    try {
        return await fetchPromise;
    } finally {
        inFlightRequests.delete(cacheKey);
    }
}

// ---------------------------------------------------------------------------
// Core Multi-Org Discovery & Fleet Overview
// ---------------------------------------------------------------------------

export async function getMerakiOrganizations(forceRefresh = false): Promise<MerakiOrganization[]> {
    const orgs = await merakiGet<any[]>("/organizations", undefined, {
        ttlMs: 600_000,
        forceRefresh,
    });
    return (orgs || []).map((o) => ({
        id: String(o.id),
        name: String(o.name),
        url: o.url ? String(o.url) : undefined,
    }));
}

export interface MerakiFleetOverviewResponse {
    organizations: {
        id: string;
        name: string;
        networkCount: number;
        deviceCount: number;
        switches: number;
        appliances: number;
        wireless: number;
        online: number;
        alerting: number;
        offline: number;
        dormant: number;
    }[];
    networks: MerakiNetwork[];
    devices: MerakiDeviceUnified[];
    topologyGroups: MerakiTopologyGroup[];
    summary: {
        totalOrganizations: number;
        totalNetworks: number;
        totalDevices: number;
        byProductType: {
            switch: number;
            appliance: number;
            wireless: number;
            other: number;
        };
        byStatus: {
            online: number;
            alerting: number;
            offline: number;
            dormant: number;
        };
        uplinksSummary: {
            active: number;
            ready: number;
            failed: number;
            notConnected: number;
        };
    };
    fetchedAt: string;
    cacheMeta: {
        status: "LIVE" | "CACHED";
        fetchedAt: string;
        ageSeconds: number;
        ttlSeconds: number;
        pollIntervalSeconds: number;
        expiresAt: string;
        nextAutoPollAt: string;
    };
}

/**
 * Slices a full ("ALL") MerakiFleetOverviewResponse down to a single organization in memory
 * so switching org tabs in the UI never triggers extra Meraki API calls.
 */
function sliceOverviewByOrg(full: MerakiFleetOverviewResponse, orgId: string): MerakiFleetOverviewResponse {
    const organizations = full.organizations.filter((o) => o.id === orgId);
    const networks = full.networks.filter((n) => n.organizationId === orgId);
    const devices = full.devices.filter((d) => d.organizationId === orgId);
    const topologyGroups = full.topologyGroups.filter((g) => g.organizationId === orgId);

    const summary: MerakiFleetOverviewResponse["summary"] = {
        totalOrganizations: organizations.length,
        totalNetworks: networks.length,
        totalDevices: devices.length,
        byProductType: {
            switch: devices.filter((d) => d.productType === "switch").length,
            appliance: devices.filter((d) => d.productType === "appliance").length,
            wireless: devices.filter((d) => d.productType === "wireless").length,
            other: devices.filter((d) => !["switch", "appliance", "wireless"].includes(d.productType)).length,
        },
        byStatus: {
            online: devices.filter((d) => d.status === "online").length,
            alerting: devices.filter((d) => d.status === "alerting").length,
            offline: devices.filter((d) => d.status === "offline").length,
            dormant: devices.filter((d) => d.status === "dormant").length,
        },
        uplinksSummary: {
            active: 0,
            ready: 0,
            failed: 0,
            notConnected: 0,
        },
    };

    for (const d of devices) {
        for (const u of d.uplinks) {
            const s = u.status.toLowerCase();
            if (s === "active") summary.uplinksSummary.active++;
            else if (s === "ready") summary.uplinksSummary.ready++;
            else if (s === "failed") summary.uplinksSummary.failed++;
            else if (s === "not connected") summary.uplinksSummary.notConnected++;
        }
    }

    return {
        organizations,
        networks,
        devices,
        topologyGroups,
        summary,
        fetchedAt: full.fetchedAt,
        cacheMeta: { ...full.cacheMeta },
    };
}

/**
 * Starts the singleton 10-minute background poller that keeps Cooper Health (905261)
 * and Cape Regional (262100) fleet snapshots continuously warm on the server.
 */
function ensureBackgroundPollerStarted(): void {
    if (globalForMeraki.__merakiPollerStarted) return;
    globalForMeraki.__merakiPollerStarted = true;

    const timer = setInterval(() => {
        globalForMeraki.__merakiLastBackgroundPollMs = Date.now();
        getMerakiFleetOverview({ orgId: "ALL", forceRefresh: true }).catch(() => {
            // Silently ignore transient background poll errors; existing snapshot remains available
        });
    }, BACKGROUND_POLL_INTERVAL_MS);

    if (typeof (timer as any)?.unref === "function") {
        (timer as any).unref();
    }
    globalForMeraki.__merakiPollerTimer = timer;
}

export async function getMerakiFleetOverview(options?: {
    orgId?: string;
    forceRefresh?: boolean;
}): Promise<MerakiFleetOverviewResponse> {
    ensureBackgroundPollerStarted();

    const orgKey = options?.orgId && options.orgId !== "ALL" ? options.orgId : "ALL";
    const nowMs = Date.now();
    const existingSnapshot = overviewSnapshots.get(orgKey) ?? overviewSnapshots.get("ALL");

    // 1. Serve from 12-minute shared server snapshot cache if still fresh (2m overlap buffer over the 10m poller)
    const recentlyRefreshed = existingSnapshot && nowMs - existingSnapshot.fetchedAtMs < MIN_FORCE_REFRESH_COOLDOWN_MS;
    if (existingSnapshot && (recentlyRefreshed || (!options?.forceRefresh && existingSnapshot.expiresAt > nowMs))) {
        const ageSeconds = Math.max(0, Math.round((nowMs - existingSnapshot.fetchedAtMs) / 1000));
        const baseResp =
            orgKey !== "ALL" && existingSnapshot.response.organizations.length > 1
                ? sliceOverviewByOrg(existingSnapshot.response, orgKey)
                : existingSnapshot.response;
        return {
            ...baseResp,
            cacheMeta: {
                status: "CACHED",
                fetchedAt: existingSnapshot.response.fetchedAt,
                ageSeconds,
                ttlSeconds: Math.round(OVERVIEW_CACHE_TTL_MS / 1000),
                pollIntervalSeconds: Math.round(BACKGROUND_POLL_INTERVAL_MS / 1000),
                expiresAt: new Date(existingSnapshot.expiresAt).toISOString(),
                nextAutoPollAt: new Date(existingSnapshot.fetchedAtMs + BACKGROUND_POLL_INTERVAL_MS).toISOString(),
            },
        };
    }

    // 2. Always fetch the full ("ALL") snapshot so all org views share one single 10-minute poll
    if (overviewInFlight.has("ALL")) {
        const sharedResp = await overviewInFlight.get("ALL")!;
        const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(sharedResp.fetchedAt).getTime()) / 1000));
        const sliced = orgKey !== "ALL" ? sliceOverviewByOrg(sharedResp, orgKey) : sharedResp;
        return {
            ...sliced,
            cacheMeta: {
                ...sharedResp.cacheMeta,
                status: "CACHED",
                ageSeconds,
            },
        };
    }

    const forceRefresh = options?.forceRefresh ?? false;

    const buildPromise = (async (): Promise<MerakiFleetOverviewResponse> => {
        const allOrgs = await getMerakiOrganizations(forceRefresh);
        const targetOrgs = allOrgs;

        const networksAll: MerakiNetwork[] = [];
        const devicesAll: MerakiDeviceUnified[] = [];
        const orgSummaries: MerakiFleetOverviewResponse["organizations"] = [];

        for (const org of targetOrgs) {
            const [rawNets, rawDevs, rawStatuses, rawUplinks] = await Promise.all([
                merakiGet<any[]>(`/organizations/${org.id}/networks`, { perPage: 1000 }, { ttlMs: 720_000, forceRefresh }).catch(() => []),
                merakiGet<any[]>(`/organizations/${org.id}/devices`, { perPage: 1000 }, { ttlMs: 720_000, forceRefresh }).catch(() => []),
                merakiGet<any[]>(`/organizations/${org.id}/devices/statuses`, { perPage: 1000 }, { ttlMs: 720_000, forceRefresh }).catch(() => []),
                merakiGet<any[]>(`/organizations/${org.id}/uplinks/statuses`, { perPage: 1000 }, { ttlMs: 720_000, forceRefresh }).catch(() => []),
            ]);

        const netMap = new Map<string, MerakiNetwork>();
        for (const n of rawNets || []) {
            const net: MerakiNetwork = {
                id: String(n.id),
                organizationId: org.id,
                name: String(n.name || n.id),
                productTypes: Array.isArray(n.productTypes) ? n.productTypes : [],
                timeZone: n.timeZone,
                tags: Array.isArray(n.tags) ? n.tags : [],
                notes: n.notes,
            };
            netMap.set(net.id, net);
            networksAll.push(net);
        }

        const statusBySerial = new Map<string, any>();
        for (const st of rawStatuses || []) {
            if (st?.serial) statusBySerial.set(String(st.serial), st);
        }

        const uplinksBySerial = new Map<string, MerakiUplinkInterface[]>();
        for (const up of rawUplinks || []) {
            if (up?.serial && Array.isArray(up.uplinks)) {
                uplinksBySerial.set(
                    String(up.serial),
                    up.uplinks.map((u: any) => ({
                        interface: String(u.interface || ""),
                        status: String(u.status || "unknown"),
                        ip: u.ip || null,
                        gateway: u.gateway || null,
                        publicIp: u.publicIp || null,
                        primaryDns: u.primaryDns || null,
                        secondaryDns: u.secondaryDns || null,
                        ipAssignedBy: u.ipAssignedBy || null,
                        provider: u.provider || null,
                        model: u.model || null,
                        signalStat: u.signalStat || null,
                    }))
                );
            }
        }

        let switches = 0;
        let appliances = 0;
        let wireless = 0;
        let online = 0;
        let alerting = 0;
        let offline = 0;
        let dormant = 0;

        for (const d of rawDevs || []) {
            const serial = String(d.serial || "");
            if (!serial) continue;

            const st = statusBySerial.get(serial);
            const netId = String(d.networkId || st?.networkId || "");
            const netName = netMap.get(netId)?.name || netId || "Unbound Network";
            const productType = String(d.productType || st?.productType || "unknown");
            const rawStatus = String(st?.status || "unknown").toLowerCase();

            const status: MerakiDeviceUnified["status"] =
                rawStatus === "online" || rawStatus === "alerting" || rawStatus === "offline" || rawStatus === "dormant"
                    ? (rawStatus as any)
                    : "unknown";

            if (productType === "switch") switches++;
            else if (productType === "appliance") appliances++;
            else if (productType === "wireless") wireless++;

            if (status === "online") online++;
            else if (status === "alerting") alerting++;
            else if (status === "offline") offline++;
            else if (status === "dormant") dormant++;

            const macColon = normalizeMacColon(d.mac || st?.mac);
            const macCompact = normalizeMacCompact(d.mac || st?.mac);
            const modelStr = String(d.model || st?.model || "");
            const rawName = String(d.name || st?.name || "").trim();
            // On Cooper Health AutoVPN endpoints, d.name is often blank because the clinic/user name is on the Network
            const resolvedName = rawName || (netName && netName !== "Unbound Network" ? `${netName} (${modelStr || serial})` : serial);

            const grouping = classifyDeviceGrouping({
                orgId: org.id,
                orgName: org.name,
                networkId: netId,
                networkName: netName,
                deviceName: resolvedName,
                rawDeviceName: rawName,
                model: modelStr,
                productType,
                serial,
            });

            devicesAll.push({
                serial,
                name: resolvedName,
                model: modelStr,
                productType,
                mac: macColon,
                macCompact,
                lanIp: d.lanIp || st?.lanIp || null,
                networkId: netId,
                networkName: netName,
                organizationId: org.id,
                organizationName: org.name,
                status,
                lastReportedAt: st?.lastReportedAt || null,
                publicIp: st?.publicIp || null,
                gateway: st?.gateway || null,
                ipType: st?.ipType || null,
                primaryDns: st?.primaryDns || null,
                secondaryDns: st?.secondaryDns || null,
                firmware: d.firmware || null,
                address: d.address || null,
                notes: d.notes || null,
                tags: Array.isArray(d.tags) ? d.tags : Array.isArray(st?.tags) ? st.tags : [],
                uplinks: uplinksBySerial.get(serial) || [],
                grouping,
            });
        }

        orgSummaries.push({
            id: org.id,
            name: org.name,
            networkCount: (rawNets || []).length,
            deviceCount: (rawDevs || []).length,
            switches,
            appliances,
            wireless,
            online,
            alerting,
            offline,
            dormant,
        });
    }

    const summary: MerakiFleetOverviewResponse["summary"] = {
        totalOrganizations: orgSummaries.length,
        totalNetworks: networksAll.length,
        totalDevices: devicesAll.length,
        byProductType: {
            switch: devicesAll.filter((d) => d.productType === "switch").length,
            appliance: devicesAll.filter((d) => d.productType === "appliance").length,
            wireless: devicesAll.filter((d) => d.productType === "wireless").length,
            other: devicesAll.filter((d) => !["switch", "appliance", "wireless"].includes(d.productType)).length,
        },
        byStatus: {
            online: devicesAll.filter((d) => d.status === "online").length,
            alerting: devicesAll.filter((d) => d.status === "alerting").length,
            offline: devicesAll.filter((d) => d.status === "offline").length,
            dormant: devicesAll.filter((d) => d.status === "dormant").length,
        },
        uplinksSummary: {
            active: 0,
            ready: 0,
            failed: 0,
            notConnected: 0,
        },
    };

    for (const d of devicesAll) {
        for (const u of d.uplinks) {
            const s = u.status.toLowerCase();
            if (s === "active") summary.uplinksSummary.active++;
            else if (s === "ready") summary.uplinksSummary.ready++;
            else if (s === "failed") summary.uplinksSummary.failed++;
            else if (s === "not connected") summary.uplinksSummary.notConnected++;
        }
    }

    const topologyGroups = buildTopologyGroups(devicesAll);
    const fetchedAtMs = Date.now();
    const fetchedAtIso = new Date(fetchedAtMs).toISOString();
    const expiresAtMs = fetchedAtMs + OVERVIEW_CACHE_TTL_MS;
    const expiresAtIso = new Date(expiresAtMs).toISOString();

    const freshResponse: MerakiFleetOverviewResponse = {
        organizations: orgSummaries,
        networks: networksAll,
        devices: devicesAll,
        topologyGroups,
        summary,
        fetchedAt: fetchedAtIso,
        cacheMeta: {
            status: "LIVE",
            fetchedAt: fetchedAtIso,
            ageSeconds: 0,
            ttlSeconds: Math.round(OVERVIEW_CACHE_TTL_MS / 1000),
            pollIntervalSeconds: Math.round(BACKGROUND_POLL_INTERVAL_MS / 1000),
            expiresAt: expiresAtIso,
            nextAutoPollAt: new Date(fetchedAtMs + BACKGROUND_POLL_INTERVAL_MS).toISOString(),
        },
    };

    // Store the full ("ALL") snapshot and pre-populate per-organization slices so org tab switching is instant
    overviewSnapshots.set("ALL", {
        response: freshResponse,
        fetchedAtMs,
        expiresAt: expiresAtMs,
    });
    for (const orgSummary of orgSummaries) {
        overviewSnapshots.set(orgSummary.id, {
            response: sliceOverviewByOrg(freshResponse, orgSummary.id),
            fetchedAtMs,
            expiresAt: expiresAtMs,
        });
    }

    return freshResponse;
    })();

    overviewInFlight.set("ALL", buildPromise);
    try {
        const fullResult = await buildPromise;
        return orgKey !== "ALL" ? sliceOverviewByOrg(fullResult, orgKey) : fullResult;
    } finally {
        overviewInFlight.delete("ALL");
    }
}

// Kick off initial background warm-up 2 seconds after module load so the first user gets instant 0ms response
if (!globalForMeraki.__merakiPollerStarted) {
    ensureBackgroundPollerStarted();
    const warmupTimer = setTimeout(() => {
        getMerakiFleetOverview({ orgId: "ALL", forceRefresh: false }).catch(() => {});
    }, 2000);
    if (typeof (warmupTimer as any)?.unref === "function") {
        (warmupTimer as any).unref();
    }
}

/**
 * Architectural Grouping Rule:
 * - Cooper Health (905261): All remote access endpoints / AutoVPN spoke devices are grouped TOGETHER
 *   into a single unified cluster anchored by the MX200/MX250 Headend in the Wilmington Firewall DMZ.
 * - Cape Regional / CRMC (262100): Switches, wireless APs, and appliances are NOT lumped together;
 *   they remain separated into their individual IDFs (2N, DI, GS, GE, CT, LAB2, PEDS, MSO/PA, etc.)
 *   or standalone clinic sites.
 */
function classifyDeviceGrouping(params: {
    orgId: string;
    orgName: string;
    networkId: string;
    networkName: string;
    deviceName: string;
    rawDeviceName: string;
    model: string;
    productType: string;
    serial: string;
}): MerakiDeviceUnified["grouping"] {
    const { orgId, networkId, networkName, deviceName, model, productType } = params;
    const upperModel = model.toUpperCase();
    const upperName = deviceName.toUpperCase();
    const upperNet = networkName.toUpperCase();

    // 1. Cooper University Health System (905261) -> Single Unified AutoVPN Cluster
    if (orgId === "905261" || upperNet.includes("COOPER") || params.orgName.toUpperCase().includes("COOPER")) {
        const isHeadend = upperModel.startsWith("MX250") || upperModel.startsWith("MX200") || upperModel.startsWith("MX450");
        let idfOrSubgroup = "Remote Clinic AutoVPN Spokes (MX)";
        if (isHeadend) {
            idfOrSubgroup = "Wilmington Firewall DMZ — MX250 Headend Concentrator";
        } else if (upperModel.startsWith("Z")) {
            idfOrSubgroup = "Teleworker / Remote Access Endpoints (Z3)";
        } else if (productType === "switch") {
            idfOrSubgroup = "Remote Branch MS Switch";
        }

        return {
            groupMode: "COOPER_AUTOVPN_CLUSTER",
            groupId: "cooper-autovpn-headend-cluster",
            groupTitle: "Cooper Health — AutoVPN & Remote Access Endpoints (MX200/MX250 DMZ Headend)",
            siteName: "Cooper Health AutoVPN Cluster",
            idfOrSubgroup,
            isHeadend,
        };
    }

    // 2. Cape Regional / CRMC (262100) -> Individual IDF Closets & Standalone Sites (Never lumped into one group)
    if (upperNet === "CAPE REGIONAL MEDICAL CENTER") {
        // Parse specific hospital IDF stack / closet from device name
        let idfCode = "Campus Wireless & General";
        let idfLabel = "CRMC Hospital — Campus Wireless & Standalone";

        if (upperName.startsWith("2N-") || upperName.includes("2N ")) {
            idfCode = "IDF-2N";
            idfLabel = "CRMC Hospital — IDF 2N (2nd Floor North Stack)";
        } else if (upperName.startsWith("DI-") || upperName.includes("DIAGNOSTIC")) {
            idfCode = "IDF-DI";
            idfLabel = "CRMC Hospital — IDF DI (Diagnostic Imaging Stack)";
        } else if (upperName.startsWith("GS-")) {
            idfCode = "IDF-GS";
            idfLabel = "CRMC Hospital — IDF GS (Ground South Stack)";
        } else if (upperName.startsWith("GE-")) {
            idfCode = "IDF-GE";
            idfLabel = "CRMC Hospital — IDF GE (Ground East Stack)";
        } else if (upperName.startsWith("CT-")) {
            idfCode = "IDF-CT";
            idfLabel = "CRMC Hospital — IDF CT (CT / Radiology Stack)";
        } else if (upperName.startsWith("LAB2-") || upperName.includes("JOC LAB") || upperName.includes("CRMC LAB")) {
            idfCode = "IDF-LAB2";
            idfLabel = "CRMC Hospital — IDF LAB2 (Laboratory Stack)";
        } else if (upperName.startsWith("PEDS") || upperName.includes("PEDS ")) {
            idfCode = "IDF-PEDS";
            idfLabel = "CRMC Hospital — IDF PEDS (Pediatrics Stack)";
        } else if (upperName.startsWith("4-MERAKI")) {
            idfCode = "IDF-4FL";
            idfLabel = "CRMC Hospital — IDF 4th Floor Stack";
        } else if (upperName.includes("MSO") || upperName.startsWith("PA(")) {
            idfCode = "IDF-MSO-PA";
            idfLabel = "CRMC Hospital — IDF MSO / PA (Upstairs & Downstairs)";
        } else if (upperName.includes("CATHLAB") || upperName.includes("CARDIO")) {
            idfCode = "IDF-CATHLAB";
            idfLabel = "CRMC Hospital — CathLab & Cardiology";
        } else if (upperName.includes("MATERNITY")) {
            idfCode = "IDF-MATERNITY";
            idfLabel = "CRMC Hospital — Maternity Closet";
        } else if (upperName.includes("MRI")) {
            idfCode = "IDF-MRI";
            idfLabel = "CRMC Hospital — MRI Trailer";
        } else if (upperName.includes("WOUND")) {
            idfCode = "IDF-WOUND";
            idfLabel = "CRMC Hospital — Wound Care";
        } else if (upperName.startsWith("HIM_") || upperName.includes("HIM ")) {
            idfCode = "IDF-HIM";
            idfLabel = "CRMC Hospital — HIM Closet";
        } else if (upperName.includes("RIO")) {
            idfCode = "SITE-RIO";
            idfLabel = "CRPA — Rio Grande";
        } else if (productType === "appliance") {
            idfCode = "CRMC-HEADEND-MX";
            idfLabel = "CRMC Hospital — Edge MX Appliance";
        }

        return {
            groupMode: "CRMC_SITE_IDF",
            groupId: `crmc-hospital-${idfCode.toLowerCase()}`,
            groupTitle: idfLabel,
            siteName: "Cape Regional Medical Center (Hospital)",
            idfOrSubgroup: idfCode,
            isHeadend: false,
        };
    }

    if (upperNet === "CAPE REGIONAL PHYSICIANS ASSOCIATES") {
        let subCode = "CRPA-GENERAL";
        let subTitle = "CRPA — Outpatient Clinics & Wireless";

        if (upperName.startsWith("VD_") || upperName.includes("VILLAGE DRIVE")) {
            subCode = "CRPA-VD";
            subTitle = "CRPA — Village Drive (VD Closet)";
        } else if (upperName.includes("MEDCOM") || upperName.includes("MED COMM")) {
            subCode = "CRPA-MEDCOM";
            subTitle = "CRPA — MedCom 211 / 217 (3rd Flr & Cast)";
        } else if (upperName.includes("CRPA-225") || upperName.includes("(215)")) {
            subCode = "CRPA-215-225";
            subTitle = "CRPA — 215 / 225 Medical Office Building";
        } else if (upperName.includes("GYN") || upperName.includes("PULMONARY")) {
            subCode = "CRPA-SPECIALTY";
            subTitle = "CRPA — GYN & Pulmonary";
        }

        return {
            groupMode: "CRMC_SITE_IDF",
            groupId: `crmc-crpa-${subCode.toLowerCase()}`,
            groupTitle: subTitle,
            siteName: "Cape Regional Physicians Associates",
            idfOrSubgroup: subCode,
            isHeadend: false,
        };
    }

    // Any other standalone Cape Regional site network (Marmora, Stone Harbor, Seaville, North Cape May, Urgent Cares)
    return {
        groupMode: "CRMC_SITE_IDF",
        groupId: `crmc-site-${networkId}`,
        groupTitle: networkName,
        siteName: networkName,
        idfOrSubgroup: "Standalone Site",
        isHeadend: false,
    };
}

function buildTopologyGroups(devices: MerakiDeviceUnified[]): MerakiTopologyGroup[] {
    const map = new Map<string, MerakiTopologyGroup>();

    for (const dev of devices) {
        const g = dev.grouping;
        let entry = map.get(g.groupId);
        if (!entry) {
            entry = {
                groupId: g.groupId,
                groupMode: g.groupMode,
                organizationId: dev.organizationId,
                organizationName: dev.organizationName,
                groupTitle: g.groupTitle,
                siteName: g.siteName,
                idfOrSubgroup: g.idfOrSubgroup,
                description:
                    g.groupMode === "COOPER_AUTOVPN_CLUSTER"
                        ? "All Cooper Health remote clinics and teleworker endpoints grouped together as AutoVPN spokes terminating on the MX200/MX250 Headend in the Wilmington Firewall DMZ."
                        : `Individual Cape Regional IDF / standalone site (${g.siteName}). Kept separate for per-IDF switch and wireless topology placement.`,
                headendDevices: [],
                devices: [],
                counts: {
                    total: 0,
                    switches: 0,
                    appliances: 0,
                    wireless: 0,
                    online: 0,
                    alerting: 0,
                    offline: 0,
                    dormant: 0,
                },
            };
            map.set(g.groupId, entry);
        }

        if (g.isHeadend) {
            entry.headendDevices.push(dev);
        }
        entry.devices.push(dev);
        entry.counts.total++;
        if (dev.productType === "switch") entry.counts.switches++;
        else if (dev.productType === "appliance") entry.counts.appliances++;
        else if (dev.productType === "wireless") entry.counts.wireless++;

        if (dev.status === "online") entry.counts.online++;
        else if (dev.status === "alerting") entry.counts.alerting++;
        else if (dev.status === "offline") entry.counts.offline++;
        else if (dev.status === "dormant") entry.counts.dormant++;
    }

    const groups = Array.from(map.values());
    groups.sort((a, b) => {
        // Put Cooper AutoVPN Cluster first, then CRMC Hospital IDFs with switches, then standalone sites
        if (a.groupMode !== b.groupMode) {
            return a.groupMode === "COOPER_AUTOVPN_CLUSTER" ? -1 : 1;
        }
        if (a.counts.switches !== b.counts.switches) {
            return b.counts.switches - a.counts.switches;
        }
        return a.groupTitle.localeCompare(b.groupTitle);
    });

    return groups;
}

/**
 * Phase 2 Network Crawler Helper:
 * Resolves any Meraki device by MAC address (compact "683a1eaf84be", colon "68:3a:1e:af:84:be",
 * or Cisco dotted "683a.1eaf.84be"), LAN IP, Serial, or Hostname.
 */
export async function resolveMerakiDeviceByMacOrIp(query: string): Promise<MerakiDeviceUnified | null> {
    if (!query || !query.trim()) return null;
    const trimmed = query.trim();
    const compactCandidate = normalizeMacCompact(trimmed);

    const overview = await getMerakiFleetOverview();
    for (const dev of overview.devices) {
        if (dev.serial.toLowerCase() === trimmed.toLowerCase()) return dev;
        if (dev.lanIp && dev.lanIp === trimmed) return dev;
        if (dev.name.toLowerCase() === trimmed.toLowerCase()) return dev;
        if (compactCandidate.length === 12 && dev.macCompact === compactCandidate) return dev;
    }
    return null;
}

// ---------------------------------------------------------------------------
// MS Switch Port, PoE, L3 SVI & CDP/LLDP Inspector
// ---------------------------------------------------------------------------

export async function getMerakiSwitchDetails(
    serial: string,
    forceRefresh = false
): Promise<MerakiSwitchInspection> {
    const cleanSerial = serial.trim().toUpperCase();
    const overview = await getMerakiFleetOverview({ forceRefresh });
    const device = overview.devices.find((d) => d.serial.toUpperCase() === cleanSerial) || null;

    const ttlMs = 60_000;
    const [rawPorts, rawStatuses, rawLldpCdp, rawSvIs] = await Promise.all([
        merakiGet<any[]>(`/devices/${cleanSerial}/switch/ports`, undefined, { ttlMs, forceRefresh }).catch(() => []),
        merakiGet<any[]>(`/devices/${cleanSerial}/switch/ports/statuses`, undefined, { ttlMs, forceRefresh }).catch(() => []),
        merakiGet<any>(`/devices/${cleanSerial}/lldpCdp`, undefined, { ttlMs, forceRefresh }).catch(() => null),
        merakiGet<any[]>(`/devices/${cleanSerial}/switch/routing/interfaces`, undefined, { ttlMs, forceRefresh }).catch(() => []),
    ]);

    const statusByPortId = new Map<string, any>();
    for (const st of rawStatuses || []) {
        if (st?.portId !== undefined) {
            statusByPortId.set(String(st.portId), st);
        }
    }

    const neighborPorts = rawLldpCdp?.ports || {};

    const ports: MerakiSwitchPort[] = (rawPorts || []).map((cfg: any) => {
        const portId = String(cfg.portId);
        const st = statusByPortId.get(portId) || {};
        const nb = neighborPorts[portId] || {};

        const cdpRaw = st.cdp || nb.cdp || null;
        const lldpRaw = st.lldp || nb.lldp || null;

        const cdp = cdpRaw
            ? {
                  deviceId: cdpRaw.deviceId,
                  portId: cdpRaw.portId || cdpRaw.sourcePort,
                  address: cdpRaw.address,
                  managementAddress: cdpRaw.managementAddress,
                  platform: cdpRaw.platform,
                  version: cdpRaw.version,
                  nativeVlan: cdpRaw.nativeVlan,
                  systemName: cdpRaw.systemName,
              }
            : null;

        const lldp = lldpRaw
            ? {
                  systemName: lldpRaw.systemName,
                  portId: lldpRaw.portId || lldpRaw.sourcePort,
                  chassisId: lldpRaw.chassisId,
                  managementAddress: lldpRaw.managementAddress,
                  systemDescription: lldpRaw.systemDescription,
                  portDescription: lldpRaw.portDescription,
                  managementVlan: lldpRaw.managementVlan,
              }
            : null;

        return {
            portId,
            name: String(cfg.name || `Port ${portId}`),
            enabled: Boolean(cfg.enabled ?? st.enabled ?? true),
            status: String(st.status || (cfg.enabled ? "Disconnected" : "Disabled")),
            isUplink: Boolean(st.isUplink),
            vlan: cfg.vlan ?? null,
            voiceVlan: cfg.voiceVlan ?? null,
            type: String(cfg.type || "access"),
            allowedVlans: String(cfg.allowedVlans || "all"),
            poeEnabled: Boolean(cfg.poeEnabled),
            poeAllocated: Boolean(st.poe?.isAllocated || (st.powerUsageInWh && st.powerUsageInWh > 0)),
            powerUsageInWh: typeof st.powerUsageInWh === "number" ? st.powerUsageInWh : null,
            speed: st.speed || null,
            duplex: st.duplex || null,
            stpGuard: cfg.stpGuard || null,
            rstpEnabled: Boolean(cfg.rstpEnabled),
            clientCount: typeof st.clientCount === "number" ? st.clientCount : 0,
            trafficInKbps: st.trafficInKbps
                ? {
                      total: Number(st.trafficInKbps.total || 0),
                      sent: Number(st.trafficInKbps.sent || 0),
                      recv: Number(st.trafficInKbps.recv || 0),
                  }
                : null,
            errors: Array.isArray(st.errors) ? st.errors : [],
            warnings: Array.isArray(st.warnings) ? st.warnings : [],
            cdp,
            lldp,
        };
    });

    ports.sort((a, b) => {
        const na = parseInt(a.portId, 10);
        const nb = parseInt(b.portId, 10);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.portId.localeCompare(b.portId);
    });

    const routedInterfaces: MerakiRoutedInterface[] = (rawSvIs || []).map((svi: any) => ({
        interfaceId: String(svi.interfaceId || ""),
        name: String(svi.name || ""),
        subnet: String(svi.subnet || ""),
        interfaceIp: String(svi.interfaceIp || ""),
        multicastRouting: String(svi.multicastRouting || "disabled"),
        vlanId: Number(svi.vlanId || 0),
        defaultGateway: svi.defaultGateway ? String(svi.defaultGateway) : undefined,
    }));

    return {
        device,
        serial: cleanSerial,
        ports,
        routedInterfaces,
        summary: {
            totalPorts: ports.length,
            connectedPorts: ports.filter((p) => p.status.toLowerCase() === "connected").length,
            disabledPorts: ports.filter((p) => !p.enabled).length,
            poeActivePorts: ports.filter((p) => p.poeAllocated).length,
            trunkPorts: ports.filter((p) => p.type.toLowerCase() === "trunk").length,
            neighborCount: ports.filter((p) => p.cdp || p.lldp).length,
            errorPortCount: ports.filter((p) => p.errors.length > 0).length,
        },
    };
}

// ---------------------------------------------------------------------------
// MX Appliance DHCP Pool Exhaustion & Subnet Utilization
// ---------------------------------------------------------------------------

export interface MerakiDhcpScanResponse {
    pools: MerakiDhcpPool[];
    coverage: {
        totalOnlineAppliances: number;
        cachedAppliances: number;
        newlyScannedAppliances: number;
        remainingUnscannedAppliances: number;
    };
    summary: {
        totalSubnets: number;
        criticalPools: number; // >= 90%
        warningPools: number; // >= 75% and < 90%
        healthyPools: number; // < 75%
        highestUtilizationPct: number;
    };
    fetchedAt: string;
}

const DHCP_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes per MX appliance

export async function getMerakiDhcpPools(options?: {
    orgId?: string;
    search?: string;
    serial?: string;
    batchSize?: number;
    forceRefresh?: boolean;
}): Promise<MerakiDhcpScanResponse> {
    const overview = await getMerakiFleetOverview({
        orgId: options?.orgId,
        forceRefresh: options?.forceRefresh,
    });

    const searchLower = (options?.search || "").trim().toLowerCase();
    const targetSerial = (options?.serial || "").trim().toUpperCase();

    // Filter to MX appliances that are online or alerting (offline/dormant MXs don't respond with live DHCP leases)
    let candidateAppliances = overview.devices.filter(
        (d) => d.productType === "appliance" && (d.status === "online" || d.status === "alerting")
    );

    if (targetSerial) {
        candidateAppliances = candidateAppliances.filter((d) => d.serial.toUpperCase() === targetSerial);
    } else if (searchLower) {
        candidateAppliances = candidateAppliances.filter(
            (d) =>
                d.name.toLowerCase().includes(searchLower) ||
                d.networkName.toLowerCase().includes(searchLower) ||
                d.serial.toLowerCase().includes(searchLower) ||
                (d.lanIp && d.lanIp.toLowerCase().includes(searchLower)) ||
                d.tags.some((t) => t.toLowerCase().includes(searchLower))
        );
    }

    // Prioritize Cape Regional MXs first (only 11 total) and alerting MXs first
    candidateAppliances.sort((a, b) => {
        if (a.status === "alerting" && b.status !== "alerting") return -1;
        if (b.status === "alerting" && a.status !== "alerting") return 1;
        if (a.organizationId === "262100" && b.organizationId !== "262100") return -1;
        if (b.organizationId === "262100" && a.organizationId !== "262100") return 1;
        return a.networkName.localeCompare(b.networkName);
    });

    const now = Date.now();
    const batchSize = Math.min(80, Math.max(1, options?.batchSize ?? 30));
    let newlyScanned = 0;

    for (const mx of candidateAppliances) {
        const cached = dhcpDeviceCache.get(mx.serial);
        const isFresh = cached && cached.expiresAt > now && !options?.forceRefresh;

        if (!isFresh && newlyScanned < batchSize) {
            newlyScanned++;
            try {
                const rawSubnets = await merakiGet<any[]>(
                    `/devices/${mx.serial}/appliance/dhcp/subnets`,
                    undefined,
                    { ttlMs: DHCP_CACHE_TTL_MS, forceRefresh: options?.forceRefresh }
                );

                const devicePools: MerakiDhcpPool[] = (rawSubnets || []).map((sub: any) => {
                    const usedCount = Number(sub.usedCount || 0);
                    const freeCount = Number(sub.freeCount || 0);
                    const totalCount = usedCount + freeCount;
                    const utilizationPct =
                        totalCount > 0 ? Math.round((usedCount / totalCount) * 1000) / 10 : 0;

                    const severity: MerakiDhcpPool["severity"] =
                        utilizationPct >= 90 ? "CRITICAL" : utilizationPct >= 75 ? "WARNING" : "HEALTHY";

                    return {
                        serial: mx.serial,
                        deviceName: mx.name,
                        model: mx.model,
                        networkId: mx.networkId,
                        networkName: mx.networkName,
                        organizationId: mx.organizationId,
                        organizationName: mx.organizationName,
                        deviceStatus: mx.status,
                        vlanId: Number(sub.vlanId ?? 1),
                        subnet: String(sub.subnet || "Unknown"),
                        usedCount,
                        freeCount,
                        totalCount,
                        utilizationPct,
                        severity,
                        scannedAt: new Date().toISOString(),
                    };
                });

                dhcpDeviceCache.set(mx.serial, {
                    pools: devicePools,
                    expiresAt: Date.now() + DHCP_CACHE_TTL_MS,
                });
            } catch {
                // Some MXs in passthrough/concentrator mode do not run DHCP servers
                dhcpDeviceCache.set(mx.serial, {
                    pools: [],
                    expiresAt: Date.now() + DHCP_CACHE_TTL_MS,
                });
            }
        }
    }

    // Collect all cached pools matching the current candidate set
    const allPools: MerakiDhcpPool[] = [];
    let cachedCount = 0;

    for (const mx of candidateAppliances) {
        const entry = dhcpDeviceCache.get(mx.serial);
        if (entry && entry.expiresAt > now) {
            cachedCount++;
            allPools.push(...entry.pools);
        }
    }

    // Sort highest utilization first
    allPools.sort((a, b) => b.utilizationPct - a.utilizationPct || b.usedCount - a.usedCount);

    const remainingUnscanned = Math.max(0, candidateAppliances.length - cachedCount);

    return {
        pools: allPools,
        coverage: {
            totalOnlineAppliances: candidateAppliances.length,
            cachedAppliances: cachedCount,
            newlyScannedAppliances: newlyScanned,
            remainingUnscannedAppliances: remainingUnscanned,
        },
        summary: {
            totalSubnets: allPools.length,
            criticalPools: allPools.filter((p) => p.severity === "CRITICAL").length,
            warningPools: allPools.filter((p) => p.severity === "WARNING").length,
            healthyPools: allPools.filter((p) => p.severity === "HEALTHY").length,
            highestUtilizationPct: allPools.length > 0 ? allPools[0].utilizationPct : 0,
        },
        fetchedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Wireless (MR) Diagnostics & Network Client Finder
// ---------------------------------------------------------------------------

export async function getMerakiClientsAndWireless(options: {
    orgId?: string;
    networkId?: string;
    search?: string;
    timespan?: number; // seconds, default 86400 (24h)
    forceRefresh?: boolean;
}): Promise<{
    clients: MerakiNetworkClient[];
    wirelessFailures: MerakiWirelessFailureSummary | null;
    ssids: { number: number; name: string; enabled: boolean; authMode?: string; encryptionMode?: string }[];
    inspectedNetworks: { id: string; name: string; organizationName: string }[];
}> {
    const overview = await getMerakiFleetOverview({
        orgId: options.orgId,
        forceRefresh: options.forceRefresh,
    });

    const timespan = Math.min(604800, Math.max(300, options.timespan ?? 86400));
    const deviceBySerial = new Map<string, MerakiDeviceUnified>();
    for (const d of overview.devices) {
        deviceBySerial.set(d.serial, d);
    }

    const orgNameById = new Map<string, string>();
    for (const o of overview.organizations) {
        orgNameById.set(o.id, o.name);
    }

    // Determine which network(s) to query
    let targetNetworks: MerakiNetwork[] = [];
    if (options.networkId && options.networkId !== "AUTO") {
        const found = overview.networks.find((n) => n.id === options.networkId);
        if (found) targetNetworks = [found];
    } else {
        // Default to networks that have wireless or switches (e.g., Cape Regional Medical Center first)
        const sortedNets = [...overview.networks].sort((a, b) => {
            const aHasWireless = a.productTypes.includes("wireless") ? 1 : 0;
            const bHasWireless = b.productTypes.includes("wireless") ? 1 : 0;
            if (aHasWireless !== bHasWireless) return bHasWireless - aHasWireless;
            const aHasSwitch = a.productTypes.includes("switch") ? 1 : 0;
            const bHasSwitch = b.productTypes.includes("switch") ? 1 : 0;
            if (aHasSwitch !== bHasSwitch) return bHasSwitch - aHasSwitch;
            return a.name.localeCompare(b.name);
        });
        targetNetworks = sortedNets.slice(0, 3);
    }

    const clients: MerakiNetworkClient[] = [];
    const ssids: { number: number; name: string; enabled: boolean; authMode?: string; encryptionMode?: string }[] = [];
    let wirelessFailures: MerakiWirelessFailureSummary | null = null;

    const searchLower = (options.search || "").trim().toLowerCase();
    const searchMacCompact = normalizeMacCompact(options.search);

    for (const net of targetNetworks) {
        const orgName = orgNameById.get(net.organizationId) || net.organizationId;

        const rawClients = await merakiGet<any[]>(
            `/networks/${net.id}/clients`,
            { perPage: 1000, timespan },
            { ttlMs: 60_000, forceRefresh: options.forceRefresh }
        ).catch(() => []);

        for (const c of rawClients || []) {
            const macColon = normalizeMacColon(c.mac);
            const macCompact = normalizeMacCompact(c.mac);
            const serial = c.recentDeviceSerial ? String(c.recentDeviceSerial) : null;
            const dev = serial ? deviceBySerial.get(serial) : null;

            const clientItem: MerakiNetworkClient = {
                id: String(c.id || macCompact),
                mac: macColon,
                macCompact,
                description: c.description || null,
                ip: c.ip || null,
                ip6: c.ip6 || null,
                user: c.user || null,
                firstSeen: c.firstSeen || null,
                lastSeen: c.lastSeen || null,
                manufacturer: c.manufacturer || null,
                os: c.os || null,
                recentDeviceSerial: serial,
                recentDeviceName: c.recentDeviceName || dev?.name || null,
                recentDeviceMac: c.recentDeviceMac || null,
                recentDeviceConnection: c.recentDeviceConnection || (c.ssid ? "Wireless" : "Wired"),
                ssid: c.ssid || null,
                vlan: c.vlan ?? null,
                switchport: c.switchport ? String(c.switchport) : null,
                status: c.status || null,
                usage: {
                    sent: Number(c.usage?.sent || 0),
                    recv: Number(c.usage?.recv || 0),
                    total: Number(c.usage?.total || (Number(c.usage?.sent || 0) + Number(c.usage?.recv || 0))),
                },
                networkId: net.id,
                networkName: net.name,
                organizationId: net.organizationId,
                organizationName: orgName,
            };

            if (searchLower) {
                const match =
                    (clientItem.ip && clientItem.ip.toLowerCase().includes(searchLower)) ||
                    (clientItem.description && clientItem.description.toLowerCase().includes(searchLower)) ||
                    (clientItem.user && clientItem.user.toLowerCase().includes(searchLower)) ||
                    clientItem.mac.toLowerCase().includes(searchLower) ||
                    (searchMacCompact.length >= 4 && clientItem.macCompact.includes(searchMacCompact)) ||
                    (clientItem.recentDeviceName && clientItem.recentDeviceName.toLowerCase().includes(searchLower)) ||
                    (clientItem.ssid && clientItem.ssid.toLowerCase().includes(searchLower)) ||
                    (clientItem.manufacturer && clientItem.manufacturer.toLowerCase().includes(searchLower)) ||
                    (clientItem.os && clientItem.os.toLowerCase().includes(searchLower));
                if (!match) continue;
            }

            clients.push(clientItem);
        }

        // If this network has wireless, fetch SSIDs and failed connections on the primary wireless network
        if (net.productTypes.includes("wireless") && !wirelessFailures) {
            const [rawSsids, rawFailed] = await Promise.all([
                merakiGet<any[]>(`/networks/${net.id}/wireless/ssids`, undefined, {
                    ttlMs: 180_000,
                    forceRefresh: options.forceRefresh,
                }).catch(() => []),
                merakiGet<any[]>(
                    `/networks/${net.id}/wireless/failedConnections`,
                    { timespan: Math.min(timespan, 86400) },
                    { ttlMs: 90_000, forceRefresh: options.forceRefresh }
                ).catch(() => []),
            ]);

            for (const s of rawSsids || []) {
                if (s.enabled || !String(s.name || "").startsWith("Unconfigured")) {
                    ssids.push({
                        number: Number(s.number),
                        name: String(s.name),
                        enabled: Boolean(s.enabled),
                        authMode: s.authMode,
                        encryptionMode: s.encryptionMode,
                    });
                }
            }

            const byStage = { assoc: 0, auth: 0, dhcp: 0, dns: 0 };
            const typeMap = new Map<string, { type: string; step: string; count: number }>();
            const serialCountMap = new Map<string, number>();
            const vlanCountMap = new Map<number, number>();

            for (const f of rawFailed || []) {
                const step = String(f.failureStep || "").toLowerCase();
                if (step === "assoc") byStage.assoc++;
                else if (step === "auth") byStage.auth++;
                else if (step === "dhcp") byStage.dhcp++;
                else if (step === "dns") byStage.dns++;

                const tKey = `${step}:${f.type || "unknown"}`;
                const existing = typeMap.get(tKey) || { type: String(f.type || "unknown"), step, count: 0 };
                existing.count++;
                typeMap.set(tKey, existing);

                if (f.serial) {
                    serialCountMap.set(String(f.serial), (serialCountMap.get(String(f.serial)) || 0) + 1);
                }
                if (f.vlan !== undefined && f.vlan !== null) {
                    const vNum = Number(f.vlan);
                    vlanCountMap.set(vNum, (vlanCountMap.get(vNum) || 0) + 1);
                }
            }

            const topFailureTypes = Array.from(typeMap.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            const topFailingSerials = Array.from(serialCountMap.entries())
                .map(([serial, count]) => ({
                    serial,
                    deviceName: deviceBySerial.get(serial)?.name || serial,
                    count,
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 8);

            const topFailingVlans = Array.from(vlanCountMap.entries())
                .map(([vlan, count]) => ({ vlan, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 6);

            const recentEvents = (rawFailed || []).slice(0, 50).map((f: any) => ({
                clientMac: normalizeMacColon(f.clientMac),
                serial: String(f.serial || ""),
                deviceName: deviceBySerial.get(String(f.serial || ""))?.name || String(f.serial || ""),
                ssidNumber: Number(f.ssidNumber ?? 0),
                vlan: Number(f.vlan ?? 0),
                failureStep: String(f.failureStep || ""),
                type: String(f.type || ""),
                ts: String(f.ts || ""),
            }));

            wirelessFailures = {
                totalFailures: (rawFailed || []).length,
                byStage,
                topFailureTypes,
                topFailingSerials,
                topFailingVlans,
                recentEvents,
            };
        }
    }

    clients.sort((a, b) => b.usage.total - a.usage.total);

    return {
        clients: clients.slice(0, 500),
        wirelessFailures,
        ssids,
        inspectedNetworks: targetNetworks.map((n) => ({
            id: n.id,
            name: n.name,
            organizationName: orgNameById.get(n.organizationId) || n.organizationId,
        })),
    };
}
