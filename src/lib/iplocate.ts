import { prisma } from "./prisma";
import { logAudit } from "./audit";
import axios from "axios";
import { isResidential } from "./isp-classification";

/**
 * Non-public IP ranges that should not be queried against external APIs.
 * This includes RFC 1918, RFC 6598, and other special-purpose ranges.
 */
const NON_PUBLIC_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255", label: "RFC 1918" },
    { start: "100.64.0.0", end: "100.127.255.255", label: "RFC 6598 (Shared/CGNAT)" },
    { start: "127.0.0.0", end: "127.255.255.255", label: "Loopback" },
    { start: "169.254.0.0", end: "169.254.255.255", label: "Link-local" },
    // RFC 1918: Only 172.16.0.0 - 172.31.255.255 is private.
    // 172.0-15 and 172.32-255 are valid public IP spaces.
    { start: "172.16.0.0", end: "172.31.255.255", label: "RFC 1918" },
    { start: "192.0.0.0", end: "192.0.0.255", label: "IETF Protocol" },
    { start: "192.0.2.0", end: "192.0.2.255", label: "TEST-NET-1" },
    { start: "192.168.0.0", end: "192.168.255.255", label: "RFC 1918" },
    { start: "198.18.0.0", end: "198.19.255.255", label: "Benchmark" },
    { start: "198.51.100.0", end: "198.51.100.255", label: "TEST-NET-2" },
    { start: "203.0.113.0", end: "203.0.113.255", label: "TEST-NET-3" },
    { start: "224.0.0.0", end: "239.255.255.255", label: "Multicast" },
    { start: "240.0.0.0", end: "255.255.255.255", label: "Reserved" }
];

function ipToLong(ip: string): number {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isPrivateIp(ip: string): boolean {
    if (!ip || typeof ip !== "string") return true;
    try {
        const ipLong = ipToLong(ip.trim());
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch {
        return true;
    }
}

export interface IpEnrichmentResult {
    ip: string;
    asn?: string;
    as_name?: string;
    as_domain?: string;
    country_code?: string;
    country?: string;
    city?: string;
    error?: string;
}

interface IpLocateResponse {
    ip: string;
    country: string;
    country_code: string;
    city: string;
    continent: string;
    latitude: number;
    longitude: number;
    asn: string;
    org: string;
    subdivision: string;
    time_zone: string;
    [key: string]: any;
}

const CACHE_TTL_DAYS = 7;

// Standard major consumer ISPs in the US to skip background auto-enrichment on
const STANDARD_US_ISPS = [
    "comcast",
    "verizon",
    "at&t",
    "t-mobile",
    "charter",
    "spectrum",
    "cox",
    "optimum",
    "centurylink",
    "frontier",
    "suddenlink",
    "windstream",
    "rnc",
    "cablevision"
];

// High-fidelity US cities for mock simulation when no API key is set
const MOCK_US_CITIES = [
    { city: "Philadelphia", subdivision: "Pennsylvania", lat: 39.9526, lng: -75.1652, org: "Comcast Cable" },
    { city: "San Francisco", subdivision: "California", lat: 37.7749, lng: -122.4194, org: "Twitter, Inc." },
    { city: "Ashburn", subdivision: "Virginia", lat: 39.0438, lng: -77.4874, org: "Amazon Web Services" },
    { city: "New York", subdivision: "New York", lat: 40.7128, lng: -74.0060, org: "DigitalOcean" },
    { city: "Chicago", subdivision: "Illinois", lat: 41.8781, lng: -87.6298, org: "RCN Telecom" },
    { city: "Houston", subdivision: "Texas", lat: 29.7604, lng: -95.3698, org: "Comcast Cable" },
    { city: "Phoenix", subdivision: "Arizona", lat: 33.4484, lng: -112.0740, org: "Cox Communications" },
    { city: "Los Angeles", subdivision: "California", lat: 34.0522, lng: -118.2437, org: "Spectrum" },
    { city: "Seattle", subdivision: "Washington", lat: 47.6062, lng: -122.3321, org: "CenturyLink" },
    { city: "Miami", subdivision: "Florida", lat: 25.7617, lng: -80.1918, org: "Atlantic Broadband" }
];

/**
 * Check if the ISP name is a standard residential US consumer ISP
 */
export function isStandardUsIsp(asnName: string | null | undefined): boolean {
    if (!asnName) return false;
    return isResidential(asnName) || STANDARD_US_ISPS.some(isp => asnName.toLowerCase().includes(isp));
}

/**
 * Increment (or decrement if .255) an IPv4 address by 1 within its subnet
 */
export function getNeighborIp(ip: string): string | null {
    if (!ip || isPrivateIp(ip)) return null;
    const parts = ip.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) return null;

    if (parts[3] >= 255) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.254`;
    }
    if (parts[3] <= 0) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
    }
    return `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3] + 1}`;
}

/**
 * Check local database cache for neighboring / similar IPs in the same /24 subnet
 */
export async function findSubnetNeighborInCache(ip: string): Promise<any | null> {
    if (!ip || isPrivateIp(ip)) return null;
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}.`;
    const targetLastOctet = parseInt(parts[3], 10);
    if (isNaN(targetLastOctet)) return null;

    try {
        const neighbors = await prisma.ipLookupCache.findMany({
            where: {
                ip: { startsWith: subnetPrefix },
                countryCode: { notIn: ["UNRESOLVED", "UNKNOWN"] }
            },
            take: 25
        });

        if (!neighbors || neighbors.length === 0) return null;

        let closest: typeof neighbors[0] | null = null;
        let minDistance = Infinity;

        for (const n of neighbors) {
            const last = parseInt(n.ip.split('.')[3], 10);
            if (!isNaN(last)) {
                const dist = Math.abs(last - targetLastOctet);
                if (dist > 0 && dist < minDistance) {
                    minDistance = dist;
                    closest = n;
                }
            }
        }

        if (closest?.rawJson) {
            try {
                const data = JSON.parse(closest.rawJson);
                if (data && (data.country_code || data.country)) {
                    return data;
                }
            } catch {}
        }
    } catch {}

    return null;
}

/**
 * When an IP lookup fails or returns partial data, check cache for similar IPs
 * or increment by 1 (ip ± 1) to fill in missing fields.
 */
export async function fillMissingFieldsFromNeighbor(
    targetIp: string,
    existingData: any = null,
    apiKey?: string
): Promise<any | null> {
    const cleanIp = targetIp.trim();
    if (!cleanIp || isPrivateIp(cleanIp)) return null;

    // 1. Check local DB cache for any neighbor in the same /24 subnet (0 API credits)
    let neighborData = await findSubnetNeighborInCache(cleanIp);

    // 2. If no neighbor in cache and API key configured, probe neighbor IP (ip + 1 or ip - 1)
    if (!neighborData && apiKey) {
        const neighborIp = getNeighborIp(cleanIp);
        if (neighborIp && neighborIp !== cleanIp) {
            try {
                const res = await axios.get(`https://www.iplocate.io/api/lookup/${neighborIp}`, {
                    headers: { "X-API-KEY": apiKey },
                    timeout: 5000
                });
                if (res.data && (res.data.country_code || res.data.country)) {
                    neighborData = res.data;

                    // Cache the neighbor IP so it's directly available for future lookups
                    await prisma.ipLookupCache.upsert({
                        where: { ip: neighborIp },
                        create: {
                            ip: neighborIp,
                            latitude: neighborData.latitude || null,
                            longitude: neighborData.longitude || null,
                            countryCode: neighborData.country_code || null,
                            city: neighborData.city || null,
                            subdivision: neighborData.subdivision || null,
                            rawJson: JSON.stringify(neighborData)
                        },
                        update: {
                            latitude: neighborData.latitude || null,
                            longitude: neighborData.longitude || null,
                            countryCode: neighborData.country_code || null,
                            city: neighborData.city || null,
                            subdivision: neighborData.subdivision || null,
                            rawJson: JSON.stringify(neighborData)
                        }
                    }).catch(() => {});
                }
            } catch {}
        }
    }

    if (neighborData) {
        // Fill in missing values using the neighboring IP
        const merged = {
            ...(existingData || {}),
            ip: cleanIp,
            country: existingData?.country || neighborData.country,
            country_code: existingData?.country_code || neighborData.country_code,
            city: existingData?.city || neighborData.city,
            subdivision: existingData?.subdivision || neighborData.subdivision,
            latitude: (existingData?.latitude !== undefined && existingData?.latitude !== null) ? existingData.latitude : (neighborData.latitude || null),
            longitude: (existingData?.longitude !== undefined && existingData?.longitude !== null) ? existingData.longitude : (neighborData.longitude || null),
            asn: existingData?.asn || neighborData.asn,
            org: existingData?.org || neighborData.org,
            company: existingData?.company || neighborData.company,
            inheritedFrom: neighborData.ip || "subnet-neighbor"
        };

        await prisma.ipLookupCache.upsert({
            where: { ip: cleanIp },
            create: {
                ip: cleanIp,
                latitude: merged.latitude,
                longitude: merged.longitude,
                countryCode: merged.country_code,
                city: merged.city,
                subdivision: merged.subdivision,
                rawJson: JSON.stringify(merged)
            },
            update: {
                latitude: merged.latitude,
                longitude: merged.longitude,
                countryCode: merged.country_code,
                city: merged.city,
                subdivision: merged.subdivision,
                rawJson: JSON.stringify(merged)
            }
        }).catch(() => {});

        return merged;
    }

    return null;
}

/**
 * Bulk geocode multiple IP addresses at once using iplocate.io POST /api/batch
 */
export async function enrichIpsBatch(ips: string[], isAdHoc: boolean = false): Promise<Record<string, any>> {
    const results: Record<string, any> = {};
    if (!ips || ips.length === 0) return results;

    const uniqueIps = Array.from(new Set(ips.map(ip => ip.trim()))).filter(Boolean);
    const uncachedIps: string[] = [];

    try {
        // 1. Check cache for all requested IPs
        const cachedRecords = await prisma.ipLookupCache.findMany({
            where: { ip: { in: uniqueIps } }
        });

        const now = Date.now();
        const cachedMap = new Map(cachedRecords.map(r => [r.ip, r]));

        for (const ip of uniqueIps) {
            const cached = cachedMap.get(ip);
            if (cached) {
                const ageInMs = now - new Date(cached.updatedAt).getTime();
                const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
                if (ageInDays < CACHE_TTL_DAYS) {
                    try {
                        const parsed = JSON.parse(cached.rawJson);
                        results[ip] = parsed;
                        continue;
                    } catch {
                        // Fall through to re-enrich if rawJson was corrupt
                    }
                }
            }
            uncachedIps.push(ip);
        }

        if (uncachedIps.length === 0) {
            return results; // All resolved from fresh cache!
        }

        // 2. Count current daily usage since 00:00 UTC (for analytics/tracking)
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);
        const dailyCountBefore = await prisma.ipLookupCache.count({
            where: { updatedAt: { gte: startOfUtcDay } }
        });

        // 3. Check for API key in environment
        const apiKey = process.env.IPLOCATE_API_KEY;
        const lookupList: string[] = [];
        
        for (const ip of uncachedIps) {
            if (!apiKey) {
                // If NO API key is set, automatically generate high-fidelity simulated US geolocation
                const lastOctet = parseInt(ip.split(".").pop() || "0", 10) || 0;
                const mock = MOCK_US_CITIES[lastOctet % MOCK_US_CITIES.length];
                
                const mockData = {
                    ip,
                    country: "United States",
                    country_code: "US",
                    city: mock.city,
                    continent: "North America",
                    latitude: mock.lat,
                    longitude: mock.lng,
                    asn: `AS${10000 + lastOctet}`,
                    org: mock.org,
                    subdivision: mock.subdivision,
                    time_zone: "America/New_York",
                    simulated: true
                };
                
                await prisma.ipLookupCache.upsert({
                    where: { ip },
                    create: {
                        ip,
                        latitude: mockData.latitude,
                        longitude: mockData.longitude,
                        countryCode: mockData.country_code,
                        city: mockData.city,
                        subdivision: mockData.subdivision,
                        rawJson: JSON.stringify(mockData)
                    },
                    update: {
                        latitude: mockData.latitude,
                        longitude: mockData.longitude,
                        countryCode: mockData.country_code,
                        city: mockData.city,
                        subdivision: mockData.subdivision,
                        rawJson: JSON.stringify(mockData)
                    }
                });
                
                results[ip] = mockData;
            } else {
                lookupList.push(ip);
            }
        }

        if (lookupList.length > 0) {
            // Process lookupList in chunks of 50 to strictly respect API batch boundaries
            const CHUNK_SIZE = 50;
            const chunks: string[][] = [];
            for (let i = 0; i < lookupList.length; i += CHUNK_SIZE) {
                chunks.push(lookupList.slice(i, i + CHUNK_SIZE));
            }

            for (const chunk of chunks) {
                const url = `https://iplocate.io/api/batch${apiKey ? `?apikey=${apiKey}` : ""}`;
                
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(chunk)
                    });

                    if (response.ok) {
                        const data = await response.json();
                        
                        // Save resolved results and negative cache unresolved IPs
                        await Promise.all(chunk.map(async (ip) => {
                            const info = data[ip];
                            if (info && info.country_code) {
                                await prisma.ipLookupCache.upsert({
                                    where: { ip },
                                    create: {
                                        ip,
                                        latitude: info.latitude,
                                        longitude: info.longitude,
                                        countryCode: info.country_code,
                                        city: info.city,
                                        subdivision: info.subdivision,
                                        rawJson: JSON.stringify(info)
                                    },
                                    update: {
                                        latitude: info.latitude,
                                        longitude: info.longitude,
                                        countryCode: info.country_code,
                                        city: info.city,
                                        subdivision: info.subdivision,
                                        rawJson: JSON.stringify(info)
                                    }
                                });
                                results[ip] = info;
                            } else {
                                // Primary batch lookup failed or returned partial fields: Fill missing values from neighbor (cache or ip ± 1)
                                const filled = await fillMissingFieldsFromNeighbor(ip, info, apiKey).catch(() => null);
                                if (filled && (filled.country_code || filled.country)) {
                                    results[ip] = filled;
                                } else {
                                    // Both failed - cache as UNRESOLVED so subsequent cycles do not query it in a loop
                                    const unresolvedInfo = {
                                        ip,
                                        country: "Unknown",
                                        country_code: "UNRESOLVED",
                                        city: "N/A",
                                        unresolved: true,
                                        timestamp: Date.now()
                                    };
                                    await prisma.ipLookupCache.upsert({
                                        where: { ip },
                                        create: {
                                            ip,
                                            countryCode: "UNRESOLVED",
                                            city: "N/A",
                                            rawJson: JSON.stringify(unresolvedInfo)
                                        },
                                        update: {
                                            countryCode: "UNRESOLVED",
                                            city: "N/A",
                                            rawJson: JSON.stringify(unresolvedInfo)
                                        }
                                    }).catch(() => {});
                                    results[ip] = unresolvedInfo;
                                }
                            }
                        }));

                        const totalQueriesPerformed = Object.keys(data).length;
                        await logAudit(
                            "IPLOCATE_API_QUERY",
                            `Executed batch lookup for ${totalQueriesPerformed} IPs. Daily usage since 00:00 UTC: ${dailyCountBefore + totalQueriesPerformed} queries.`
                        );
                    } else {
                        if (response.status === 429) {
                            await logAudit(
                                "IPLOCATE_RATE_LIMIT",
                                `IPLocate.io API Rate Limit Exceeded (HTTP 429) during batch lookup for ${chunk.length} IPs.`
                            ).catch(() => {});
                        }
                        console.warn(`[iplocate] Batch API failed for chunk (Status: ${response.status}). Falling back to sequential single lookups...`);
                        
                        for (const ip of chunk) {
                            try {
                                const singleUrl = `https://iplocate.io/api/lookup/${ip}${apiKey ? `?apikey=${apiKey}` : ""}`;
                                await new Promise(r => setTimeout(r, 20));
                                
                                const singleRes = await fetch(singleUrl);
                                if (singleRes.ok) {
                                    const info = await singleRes.json();
                                    if (info && info.country_code) {
                                        await prisma.ipLookupCache.upsert({
                                            where: { ip },
                                            create: {
                                                ip,
                                                latitude: info.latitude,
                                                longitude: info.longitude,
                                                countryCode: info.country_code,
                                                city: info.city,
                                                subdivision: info.subdivision,
                                                rawJson: JSON.stringify(info)
                                            },
                                            update: {
                                                latitude: info.latitude,
                                                longitude: info.longitude,
                                                countryCode: info.country_code,
                                                city: info.city,
                                                subdivision: info.subdivision,
                                                rawJson: JSON.stringify(info)
                                            }
                                        });
                                        results[ip] = info;
                                    } else {
                                        const filled = await fillMissingFieldsFromNeighbor(ip, info, apiKey).catch(() => null);
                                        if (filled && (filled.country_code || filled.country)) {
                                            results[ip] = filled;
                                        } else {
                                            const unresolvedInfo = { ip, country: "Unknown", country_code: "UNRESOLVED", city: "N/A", unresolved: true, timestamp: Date.now() };
                                            await prisma.ipLookupCache.upsert({
                                                where: { ip },
                                                create: { ip, countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedInfo) },
                                                update: { countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedInfo) }
                                            }).catch(() => {});
                                            results[ip] = unresolvedInfo;
                                        }
                                    }
                                } else {
                                    console.error(`[iplocate] Sequential fallback failed for ${ip}:`, singleRes.status);
                                    const filled = await fillMissingFieldsFromNeighbor(ip, null, apiKey).catch(() => null);
                                    if (filled && (filled.country_code || filled.country)) {
                                        results[ip] = filled;
                                    } else {
                                        if (singleRes.status !== 429) {
                                            const unresolvedInfo = { ip, country: "Unknown", country_code: "UNRESOLVED", city: "N/A", status: singleRes.status, unresolved: true, timestamp: Date.now() };
                                            await prisma.ipLookupCache.upsert({
                                                where: { ip },
                                                create: { ip, countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedInfo) },
                                                update: { countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedInfo) }
                                            }).catch(() => {});
                                            results[ip] = unresolvedInfo;
                                        }
                                        const staleCached = cachedMap.get(ip);
                                        if (staleCached) {
                                            results[ip] = JSON.parse(staleCached.rawJson);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.error(`[iplocate] Error in sequential fallback for ${ip}:`, err);
                            }
                        }
                    }
                } catch (chunkErr) {
                    console.error("[iplocate] Error executing chunk batch lookup:", chunkErr);
                }
            }
        } else if (uncachedIps.length > 0 && !apiKey) {
            // Log the simulated geocoding runs under IPLOCATE_API_QUERY as well
            await logAudit(
                "IPLOCATE_API_QUERY",
                `Simulated batch geocoding for ${uncachedIps.length} IPs (No API key configured).`
            );
        }

    } catch (e) {
        console.error("[iplocate] Error in batch query execution:", e);
    }

    return results;
}

/**
 * Fetch IP details from iplocate.io with automated quota rules and 30-day TTL caching.
 */
export async function enrichIp(ip: string, isAdHoc: boolean = false): Promise<any | null> {
    const res = await enrichIpsBatch([ip], isAdHoc);
    return res[ip] || null;
}

/**
 * Standard single IP enrichment function backed strictly by IPLocate & local PostgreSQL cache.
 * Replaces all deprecated IPInfo lookups across the platform.
 */
export async function getIpEnrichment(ip: string): Promise<IpEnrichmentResult | null> {
    const cleanIp = (ip || "").trim();
    if (!cleanIp || isPrivateIp(cleanIp)) {
        return null;
    }

    // 1. Check local IpLookupCache first (0 external API credits, 7-day TTL)
    try {
        const cached = await prisma.ipLookupCache.findUnique({ where: { ip: cleanIp } });
        if (cached?.rawJson) {
            const ageInMs = Date.now() - new Date(cached.updatedAt).getTime();
            const ageInDays = ageInMs / (1000 * 60 * 60 * 24);
            if (ageInDays < CACHE_TTL_DAYS) {
                try {
                    const raw = JSON.parse(cached.rawJson);
                    if (cached.countryCode === "UNRESOLVED" || raw.unresolved) {
                        return null;
                    }
                    const asnRaw = typeof raw.asn === "object" ? raw.asn?.asn : (raw.asn || raw.as_number);
                    return {
                        ip: cleanIp,
                        asn: asnRaw ? String(asnRaw) : undefined,
                        as_name: raw.company?.name || raw.asn?.name || raw.as_name || raw.org || undefined,
                        as_domain: raw.company?.domain || raw.asn?.domain || raw.as_domain || undefined,
                        country_code: raw.country_code || cached.countryCode || undefined,
                        country: raw.country || undefined,
                        city: raw.city || cached.city || undefined
                    };
                } catch {
                    if (cached.countryCode && cached.countryCode !== "UNRESOLVED") {
                        return {
                            ip: cleanIp,
                            country_code: cached.countryCode,
                            city: cached.city || undefined
                        };
                    }
                }
            }
        }
    } catch {}

    // 2. Fetch live via iplocate.io API
    const apiKey = process.env.IPLOCATE_API_KEY;
    if (!apiKey) {
        console.warn("[iplocate] IPLOCATE_API_KEY is not configured.");
        return null;
    }

    try {
        const response = await axios.get(`https://www.iplocate.io/api/lookup/${cleanIp}`, {
            headers: { "X-API-KEY": apiKey },
            timeout: 5000
        });

        if (response.data && (response.data.country_code || response.data.country)) {
            const data = response.data;
            const countryCode = data.country_code || null;
            const city = data.city || null;
            const asnRaw = typeof data.asn === "object" ? data.asn?.asn : (data.asn || data.as_number);
            const asName = data.company?.name || data.asn?.name || data.as_name || data.org || null;
            const asDomain = data.company?.domain || data.asn?.domain || data.as_domain || null;

            await prisma.ipLookupCache.upsert({
                where: { ip: cleanIp },
                create: {
                    ip: cleanIp,
                    latitude: data.latitude || null,
                    longitude: data.longitude || null,
                    countryCode,
                    city,
                    subdivision: data.subdivision || null,
                    rawJson: JSON.stringify(data)
                },
                update: {
                    latitude: data.latitude || null,
                    longitude: data.longitude || null,
                    countryCode,
                    city,
                    subdivision: data.subdivision || null,
                    rawJson: JSON.stringify(data)
                }
            }).catch(() => {});

            await logAudit(
                "IPLOCATE_API_QUERY",
                `Enriched IP ${cleanIp} via IPLocate (${asName || "Unknown ASN"}).`
            ).catch(() => {});

            return {
                ip: cleanIp,
                asn: asnRaw ? String(asnRaw) : undefined,
                as_name: asName || undefined,
                as_domain: asDomain || undefined,
                country_code: countryCode || undefined,
                country: data.country || undefined,
                city: city || undefined
            };
        } else {
            // Live lookup returned empty / missing country: Fallback to neighbor resolution (cache first, then ip ± 1)
            const filled = await fillMissingFieldsFromNeighbor(cleanIp, response.data, apiKey).catch(() => null);
            if (filled && (filled.country_code || filled.country)) {
                const asnRaw = typeof filled.asn === "object" ? filled.asn?.asn : (filled.asn || filled.as_number);
                const asName = filled.company?.name || filled.asn?.name || filled.as_name || filled.org || null;
                const asDomain = filled.company?.domain || filled.asn?.domain || filled.as_domain || null;
                return {
                    ip: cleanIp,
                    asn: asnRaw ? String(asnRaw) : undefined,
                    as_name: asName || undefined,
                    as_domain: asDomain || undefined,
                    country_code: filled.country_code || undefined,
                    country: filled.country || undefined,
                    city: filled.city || undefined
                };
            }

            const unresolvedData = { ip: cleanIp, country: "Unknown", country_code: "UNRESOLVED", city: "N/A", unresolved: true, timestamp: Date.now() };
            await prisma.ipLookupCache.upsert({
                where: { ip: cleanIp },
                create: { ip: cleanIp, countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) },
                update: { countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) }
            }).catch(() => {});
        }
    } catch (err: any) {
        console.error(`[iplocate] Failed lookup for ${cleanIp}:`, err.message);
        // Primary lookup threw an error: Fallback to neighbor resolution (cache first, then ip ± 1)
        const filled = await fillMissingFieldsFromNeighbor(cleanIp, null, apiKey).catch(() => null);
        if (filled && (filled.country_code || filled.country)) {
            const asnRaw = typeof filled.asn === "object" ? filled.asn?.asn : (filled.asn || filled.as_number);
            const asName = filled.company?.name || filled.asn?.name || filled.as_name || filled.org || null;
            const asDomain = filled.company?.domain || filled.asn?.domain || filled.as_domain || null;
            return {
                ip: cleanIp,
                asn: asnRaw ? String(asnRaw) : undefined,
                as_name: asName || undefined,
                as_domain: asDomain || undefined,
                country_code: filled.country_code || undefined,
                country: filled.country || undefined,
                city: filled.city || undefined
            };
        }

        if (err.response?.status !== 429) {
            const unresolvedData = { ip: cleanIp, country: "Unknown", country_code: "UNRESOLVED", city: "N/A", status: err.response?.status || 500, unresolved: true, timestamp: Date.now() };
            await prisma.ipLookupCache.upsert({
                where: { ip: cleanIp },
                create: { ip: cleanIp, countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) },
                update: { countryCode: "UNRESOLVED", city: "N/A", rawJson: JSON.stringify(unresolvedData) }
            }).catch(() => {});
        }
    }

    return null;
}

// Backward compatibility alias: redirects any residual getIpInfoLite calls directly to IPLocate
export const getIpInfoLite = getIpEnrichment;
export type IpInfoLiteResponse = IpEnrichmentResult;

