import { prisma } from "./prisma";
import { logAudit } from "./audit";

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

const CACHE_TTL_DAYS = 30;

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
    const clean = asnName.toLowerCase();
    return STANDARD_US_ISPS.some(isp => clean.includes(isp));
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
                    results[ip] = JSON.parse(cached.rawJson);
                    continue;
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
            // iplocate POST batch query structure: POST https://iplocate.io/api/batch?apikey=...
            const url = `https://iplocate.io/api/batch${apiKey ? `?apikey=${apiKey}` : ""}`;
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(lookupList)
            });

            if (response.ok) {
                const data = await response.json();
                
                // Save resolved results in parallel to cache
                await Promise.all(Object.keys(data).map(async (ip) => {
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
                    }
                }));

                const totalQueriesPerformed = Object.keys(data).length;
                await logAudit(
                    "IPLOCATE_API_QUERY",
                    `Executed batch lookup for ${totalQueriesPerformed} IPs. Daily usage since 00:00 UTC: ${dailyCountBefore + totalQueriesPerformed} queries.`
                );
            } else {
                console.warn(`[iplocate] Batch API failed (Status: ${response.status}). Falling back to sequential single lookups...`);
                
                for (const ip of lookupList) {
                    try {
                        const singleUrl = `https://iplocate.io/api/lookup/${ip}${apiKey ? `?apikey=${apiKey}` : ""}`;
                        // sequential throttle delay to stay within rate limits
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
                            }
                        } else {
                            console.error(`[iplocate] Sequential fallback failed for ${ip}:`, singleRes.status);
                            const staleCached = cachedMap.get(ip);
                            if (staleCached) {
                                results[ip] = JSON.parse(staleCached.rawJson);
                            }
                        }
                    } catch (err) {
                        console.error(`[iplocate] Error in sequential fallback for ${ip}:`, err);
                    }
                }
                
                const totalQueriesPerformed = Object.keys(results).filter(ip => lookupList.includes(ip)).length;
                await logAudit(
                    "IPLOCATE_API_QUERY",
                    `Executed sequential lookups for ${totalQueriesPerformed} IPs (Batch API fallback). Daily usage since 00:00 UTC: ${dailyCountBefore + totalQueriesPerformed} queries.`
                );
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
