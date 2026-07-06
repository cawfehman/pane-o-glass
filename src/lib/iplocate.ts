import { prisma } from "./prisma";

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
const MAX_AUTO_LIMIT = 950;
const MAX_TOTAL_LIMIT = 1000;

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
 * Fetch IP details from iplocate.io with automated quota rules and 30-day TTL caching.
 */
export async function enrichIp(ip: string, isAdHoc: boolean = false): Promise<any | null> {
    try {
        // 1. Check database cache first
        const cached = await prisma.ipLookupCache.findUnique({
            where: { ip }
        });

        if (cached) {
            const ageInMs = Date.now() - new Date(cached.updatedAt).getTime();
            const ageInDays = ageInMs / (1000 * 60 * 60 * 24);

            if (ageInDays < CACHE_TTL_DAYS) {
                // Cache hit - data is fresh
                return JSON.parse(cached.rawJson);
            }
            console.log(`[iplocate] Cache entry for ${ip} is stale (${ageInDays.toFixed(1)} days old). Attempting refresh.`);
        }

        // 2. Quota Check based on 00:00 UTC daily resets
        const startOfUtcDay = new Date();
        startOfUtcDay.setUTCHours(0, 0, 0, 0);

        const dailyCount = await prisma.ipLookupCache.count({
            where: {
                updatedAt: { gte: startOfUtcDay }
            }
        });

        const limit = isAdHoc ? MAX_TOTAL_LIMIT : MAX_AUTO_LIMIT;
        if (dailyCount >= limit) {
            console.warn(`[iplocate] Daily limit exceeded. Used today: ${dailyCount}/${limit}. Fallback active.`);
            if (cached) {
                // Fallback to expired cache rather than failing
                return JSON.parse(cached.rawJson);
            }
            return null;
        }

        // 3. Resolve IP Geo (Simulator vs Real API lookup)
        let data: IpLocateResponse | null = null;
        const apiKey = process.env.IPLOCATE_API_KEY;

        if (SIMULATED_GEO[ip] && !apiKey) {
            // Simulator Mode (useful for local development testing)
            data = {
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
            } as IpLocateResponse;
            console.log(`[iplocate] Serving simulated coordinates for test IP: ${ip}`);
        } else {
            // Production API Call
            const url = `https://iplocate.io/api/lookup/${ip}${apiKey ? `?apikey=${apiKey}` : ""}`;
            
            // Sequential delay to prevent rate limit (100 req/s) if called rapidly
            await new Promise(resolve => setTimeout(resolve, 20));

            const response = await fetch(url);
            if (response.ok) {
                data = await response.json();
            } else {
                console.error(`[iplocate] API Error: ${response.status} ${response.statusText}`);
            }
        }

        if (!data || !data.country_code) {
            // API failed, return cached stale record if we have it
            return cached ? JSON.parse(cached.rawJson) : null;
        }

        // 4. Update or Create Cache entry
        await prisma.ipLookupCache.upsert({
            where: { ip },
            create: {
                ip,
                latitude: data.latitude,
                longitude: data.longitude,
                countryCode: data.country_code,
                city: data.city,
                subdivision: data.subdivision,
                rawJson: JSON.stringify(data)
            },
            update: {
                latitude: data.latitude,
                longitude: data.longitude,
                countryCode: data.country_code,
                city: data.city,
                subdivision: data.subdivision,
                rawJson: JSON.stringify(data)
            }
        });

        return data;

    } catch (e) {
        console.error(`[iplocate] Error resolving IP ${ip}:`, e);
        return null;
    }
}
