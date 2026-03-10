/**
 * Utility for interacting with the ipinfo.io Lite API.
 * Includes RFC1918 (private) IP address validation to avoid unnecessary lookups.
 */

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
    const ipLong = ipToLong(ip);
    return NON_PUBLIC_RANGES.some(range => {
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
