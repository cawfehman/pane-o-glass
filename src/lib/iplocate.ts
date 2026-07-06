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

// Offline simulation coordinates mapping for standard test locations
const SIMULATED_GEO: Record<string, Partial<IpLocateResponse>> = {
    "72.241.10.15": {
        city: "Philadelphia",
        subdivision: "Pennsylvania",
        country: "United States",
        country_code: "US",
        latitude: 39.9526,
        longitude: -75.1652,
        org: "Comcast Cable Communications",
        asn: "AS7922"
    },
    "104.244.42.1": {
        city: "San Francisco",
        subdivision: "California",
        country: "United States",
        country_code: "US",
        latitude: 37.7749,
        longitude: -122.4194,
        org: "Twitter, Inc.",
        asn: "AS13414"
    },
    "52.201.10.22": {
        city: "Ashburn",
        subdivision: "Virginia",
        country: "United States",
        country_code: "US",
        latitude: 39.0438,
        longitude: -77.4874,
        org: "Amazon.com, Inc. (AWS Datacenter)",
        asn: "AS14618"
    },
    "162.243.10.45": {
        city: "New York",
        subdivision: "New York",
        country: "United States",
        country_code: "US",
        latitude: 40.7128,
        longitude: -74.0060,
        org: "DigitalOcean, LLC",
        asn: "AS14061"
    }
};

/**
 * Check if the ISP name is a standard residential US consumer ISP
 */
export function isStandardUsIsp(asnName: string | null): boolean {
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

        // 3. Separate simulation test IPs from live API lookups if no API key set
        const apiKey = process.env.IPLOCATE_API_KEY;
        const lookupList: string[] = [];
        
        for (const ip of uncachedIps) {
            if (SIMULATED_GEO[ip] && !apiKey) {
                // Populate mock data
                const mockData = {
                    ip,
                    country: "United States",
                    country_code: "US",
                    city: "Local City",
                    continent: "North America",
                    latitude: 38.0,
                    longitude: -97.0,
                    asn: "AS12345",
                    org: "Simulated Provider",
                    subdivision: "Simulated State",
                    time_zone: "America/New_York",
                    ...SIMULATED_GEO[ip]
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
                    `Executed batch lookup for ${totalQueriesPerformed} IPs. Daily usage since 00:00 UTC: ${dailyCountBefore + totalQueriesPerformed} queries.`,
                    "SYSTEM"
                );
            } else {
                console.error(`[iplocate] Batch API Error: ${response.status} ${response.statusText}`);
                
                // On API error, return expired cache entries for stale lookup IPs if we have them
                for (const ip of lookupList) {
                    const staleCached = cachedMap.get(ip);
                    if (staleCached) {
                        results[ip] = JSON.parse(staleCached.rawJson);
                    }
                }
            }
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
