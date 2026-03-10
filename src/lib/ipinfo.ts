/**
 * Utility for interacting with the ipinfo.io Lite API.
 * Includes RFC1918 (private) IP address validation to avoid unnecessary lookups.
 */

const RFC1918_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" },
    { start: "172.16.0.0", end: "172.31.255.255" },
    { start: "192.168.0.0", end: "192.168.255.255" },
    { start: "127.0.0.0", end: "127.255.255.255" } // Loopback
];

function ipToLong(ip: string): number {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

export function isPrivateIp(ip: string): boolean {
    const ipLong = ipToLong(ip);
    return RFC1918_RANGES.some(range => {
        return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
    });
}

export interface IpInfoLiteResponse {
    ip: string;
    asn?: string;
    as_name?: string;
    as_domain?: string;
    country_code?: string;
    country?: string;
    error?: string;
}

export async function getIpInfoLite(ip: string): Promise<IpInfoLiteResponse | null> {
    if (isPrivateIp(ip)) {
        console.log(`Skipping ipinfo.io lookup for private IP: ${ip}`);
        return null;
    }

    const token = process.env.IPINFO_TOKEN;
    if (!token) {
        console.warn("IPINFO_TOKEN is missing in environment variables.");
        return null;
    }

    try {
        const url = `https://api.ipinfo.io/lite/${ip}?token=${token}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`ipinfo.io API error for ${ip}: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data as IpInfoLiteResponse;
    } catch (error) {
        console.error(`Failed to fetch ipinfo.io data for ${ip}:`, error);
        return null;
    }
}
