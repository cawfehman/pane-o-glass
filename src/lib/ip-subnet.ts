/**
 * IP and Subnet / CIDR Bitwise Calculation Utility
 * Provides deterministic, high-performance IPv4 subnet matching for FMC Security Intelligence feeds,
 * Guardian ASN blacklisting, and Perimeter Posture evaluation.
 */

export function ipToLong(ip: string): number {
    const octets = ip.trim().split(".");
    if (octets.length !== 4) return 0;
    return octets.reduce((acc, octet) => {
        const num = parseInt(octet, 10);
        return ((acc << 8) + (isNaN(num) ? 0 : num)) >>> 0;
    }, 0);
}

export function longToIp(long: number): string {
    return [
        (long >>> 24) & 255,
        (long >>> 16) & 255,
        (long >>> 8) & 255,
        long & 255
    ].join(".");
}

const cidrParseCache = new Map<string, { network: string; networkLong: number; prefixLen: number; maskLong: number }>();

export function parseCidr(cidr: string): { network: string; networkLong: number; prefixLen: number; maskLong: number } | null {
    if (!cidr) return null;
    const clean = cidr.trim();
    const cached = cidrParseCache.get(clean);
    if (cached) return cached;

    if (!clean.includes("/")) {
        // Treat as /32 host route
        const netLong = ipToLong(clean);
        const result = {
            network: clean,
            networkLong: netLong,
            prefixLen: 32,
            maskLong: 0xFFFFFFFF >>> 0
        };
        if (cidrParseCache.size < 50000) cidrParseCache.set(clean, result);
        return result;
    }

    const [netStr, prefixStr] = clean.split("/");
    const prefixLen = parseInt(prefixStr, 10);
    if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) return null;

    const maskLong = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    const netLong = ipToLong(netStr);
    const normalizedNetLong = (netLong & maskLong) >>> 0;

    const result = {
        network: longToIp(normalizedNetLong),
        networkLong: normalizedNetLong,
        prefixLen,
        maskLong
    };

    if (cidrParseCache.size < 50000) cidrParseCache.set(clean, result);
    return result;
}

/**
 * Checks if a candidate IPv4 address falls within a target CIDR subnet or matches a host /32.
 * E.g. isIpInSubnet("187.14.230.163", "187.14.230.0/24") -> true
 *      isIpInSubnet("187.14.230.163", "187.14.230.163")    -> true
 *      isIpInSubnet("187.14.232.1", "187.14.230.0/23")    -> false
 */
export function isIpInSubnet(ip: string, cidr: string): boolean {
    if (!ip || !cidr) return false;
    const cleanIp = ip.trim();
    const cleanCidr = cidr.trim();

    if (!cleanCidr.includes("/")) {
        return cleanIp === cleanCidr;
    }

    const parsed = parseCidr(cleanCidr);
    if (!parsed) return false;

    const ipLong = ipToLong(cleanIp);
    return ((ipLong & parsed.maskLong) >>> 0) === parsed.networkLong;
}

/**
 * High-performance IPv4 Subnet Indexer
 * Uses O(1) 24-bit prefix hash maps for subnets (/16 to /24) to evaluate
 * tens of thousands of candidate IPs against thousands of CIDRs in < 20ms.
 */
export class FastSubnetMatcher {
    private slash24Map = new Map<number, string>();
    private otherCidrs: Array<{ mask: number; net: number; cidr: string }> = [];

    constructor(cidrs: string[]) {
        for (const cidr of cidrs) {
            if (!cidr) continue;
            const clean = cidr.trim();
            if (!clean.includes("/")) continue;

            const [netStr, pfxStr] = clean.split("/");
            const prefixLen = parseInt(pfxStr, 10);
            if (isNaN(prefixLen) || prefixLen < 0 || prefixLen > 32) continue;

            if (prefixLen >= 16 && prefixLen <= 24) {
                const oct = netStr.split(".").map(Number);
                if (oct.length !== 4) continue;
                const base24 = (oct[0] << 16) | (oct[1] << 8) | oct[2];
                const count = 1 << (24 - prefixLen);
                for (let j = 0; j < count; j++) {
                    this.slash24Map.set(base24 + j, clean);
                }
            } else {
                const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
                const net = (ipToLong(netStr) & mask) >>> 0;
                this.otherCidrs.push({ mask, net, cidr: clean });
            }
        }
    }

    findMatchingSubnet(ip: string): string | null {
        if (!ip) return null;
        const clean = ip.trim();
        const oct = clean.split(".").map(Number);
        if (oct.length !== 4) return null;

        const key24 = (oct[0] << 16) | (oct[1] << 8) | oct[2];
        const match = this.slash24Map.get(key24);
        if (match) return match;

        if (this.otherCidrs.length > 0) {
            const ipL = (((oct[0] << 24) >>> 0) + (oct[1] << 16) + (oct[2] << 8) + oct[3]) >>> 0;
            for (let i = 0; i < this.otherCidrs.length; i++) {
                if ((ipL & this.otherCidrs[i].mask) >>> 0 === this.otherCidrs[i].net) {
                    return this.otherCidrs[i].cidr;
                }
            }
        }
        return null;
    }

    isSubsumed(ip: string): boolean {
        return this.findMatchingSubnet(ip) !== null;
    }
}

/**
 * Validates whether a string is a well-formed IPv4 address.
 */
export function isValidIpv4(ip: string): boolean {
    if (!ip) return false;
    const parts = ip.trim().split(".");
    if (parts.length !== 4) return false;
    return parts.every((p) => {
        const n = parseInt(p, 10);
        return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
    });
}

/**
 * Validates whether a string is a well-formed IPv4 CIDR (e.g. 192.168.1.0/24).
 */
export function isValidCidr(cidr: string): boolean {
    if (!cidr || !cidr.includes("/")) return false;
    const [ip, prefix] = cidr.trim().split("/");
    if (!isValidIpv4(ip)) return false;
    const p = parseInt(prefix, 10);
    return !isNaN(p) && p >= 0 && p <= 32;
}

/**
 * Normalizes an ASN string to standard "AS<number>" format (e.g. "141039" -> "AS141039").
 */
export function normalizeAsn(asn: string | number | null | undefined): string {
    if (!asn) return "";
    const clean = String(asn).trim().toUpperCase();
    const num = clean.replace(/^AS/, "");
    return num ? `AS${num}` : "";
}
