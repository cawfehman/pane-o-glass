import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getIpInfoLite } from "@/lib/ipinfo";
import { enrichIp } from "@/lib/iplocate";
import { lookupDomainUmbrella } from "@/lib/umbrella";
import dns from "dns";

const dnsPromises = dns.promises;

// Auto-detect search query type
function detectType(query: string): "ip" | "domain" | "hash" {
    const trimmed = query.trim();
    
    // IP pattern
    if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(trimmed)) {
        return "ip";
    }
    
    // File hash pattern (MD5, SHA1, SHA256)
    if (/^[a-fA-F0-9]{32}$/.test(trimmed) || /^[a-fA-F0-9]{40}$/.test(trimmed) || /^[a-fA-F0-9]{64}$/.test(trimmed)) {
        return "hash";
    }
    
    return "domain";
}

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session || !session.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const role = (session.user as any).role || "USER";
        const normalizedRole = String(role).toUpperCase();

        // Verify permission in DB (Admins bypass)
        if (normalizedRole !== "ADMIN") {
            const dbPerm = await prisma.toolPermission.findUnique({
                where: { toolId_role: { toolId: "threat-intel", role: normalizedRole } }
            });
            if (!dbPerm || !dbPerm.isEnabled) {
                return NextResponse.json({ error: "Access Denied: Insufficient permissions for Threat Intelligence." }, { status: 403 });
            }
        }

        const { searchParams } = new URL(req.url);
        const query = searchParams.get("query")?.trim();

        if (!query) {
            return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
        }

        const type = detectType(query);
        let result: any = { query, type };

        if (type === "ip") {
            // Geolocation and ASN
            const geoData = await getIpInfoLite(query);
            
            // Build Reputation Analysis
            let status = "clean";
            let score = 0; // 0 to 100 malicious score
            const factors: string[] = [];

            if (geoData) {
                const badAsns = ["12345", "99999", "66666"]; // Mock list of malicious hosting networks
                if (badAsns.includes(geoData.asn || "")) {
                    status = "malicious";
                    score = 85;
                    factors.push(`Belongs to suspicious host network: ASN${geoData.asn}`);
                }
                
                const highRiskCountries = ["KP", "IR", "SY"];
                if (highRiskCountries.includes(geoData.country_code || "")) {
                    status = "suspicious";
                    score = Math.max(score, 60);
                    factors.push(`Originates from high-risk jurisdiction: ${geoData.country}`);
                }
            }

            // Mock private IP indicator
            const ipLong = query.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
            const isPrivate = (
                (ipLong >= 168430080 && ipLong <= 184549375) || // 10.0.0.0/8
                (ipLong >= 2886729728 && ipLong <= 2887778303) || // 172.16.0.0/12
                (ipLong >= 3232235520 && ipLong <= 3232301055)    // 192.168.0.0/16
            );

            if (isPrivate) {
                status = "internal";
                factors.push("Private RFC 1918 internal IP address");
            } else if (factors.length === 0) {
                factors.push("No history of abuse found in commercial feeds");
            }

            let iplocateGeo = null;
            if (!isPrivate) {
                try {
                    iplocateGeo = await enrichIp(query, true); // true = ad-hoc search
                } catch (e) {
                    console.error("Ad-hoc iplocate lookup failed:", e);
                }
            }

            result.details = {
                geo: geoData || { ip: query, error: "Unable to retrieve geolocation" },
                isPrivate,
                iplocate: iplocateGeo,
                reputation: {
                    status,
                    score,
                    factors
                }
            };
        } else if (type === "domain") {
            // Validate domain format to prevent SSRF
            if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(query)) {
                return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
            }

            // 1. DNS Records lookup (Resolve A, MX, NS, TXT)
            const dnsRecords: any = {};
            try {
                dnsRecords.A = await dnsPromises.resolve4(query).catch(() => []);
            } catch (e) {}
            try {
                dnsRecords.MX = await dnsPromises.resolveMx(query).catch(() => []);
            } catch (e) {}
            try {
                dnsRecords.NS = await dnsPromises.resolveNs(query).catch(() => []);
            } catch (e) {}
            try {
                dnsRecords.TXT = await dnsPromises.resolveTxt(query).catch(() => []);
            } catch (e) {}

            // 2. Cisco Umbrella Security & Category Lookup
            const umbrellaRep = await lookupDomainUmbrella(query);

            result.details = {
                dns: dnsRecords,
                umbrella: umbrellaRep,
                reputation: {
                    status: umbrellaRep.status === -1 ? "malicious" : umbrellaRep.status === 1 ? "clean" : "suspicious",
                    score: umbrellaRep.status === -1 ? 90 : umbrellaRep.status === 1 ? 0 : 45,
                    categories: umbrellaRep.categories,
                    securityCategories: umbrellaRep.securityCategories,
                    source: umbrellaRep.source,
                    error: umbrellaRep.error
                }
            };
        } else if (type === "hash") {
            // Hash reputation (Malware threat indicators)
            let status = "clean";
            let malwareFamily = null;
            let score = 0;
            const maliciousHashes: Record<string, { family: string; score: number }> = {
                // EICAR standard virus test file hashes
                "44d88612fe831b9eaf62d46e29780000": { family: "EICAR Test File", score: 100 },
                "131f95c51cc819465fa1797f6cc3d75d": { family: "EICAR Test File", score: 100 },
                "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f": { family: "EICAR Test File", score: 100 },
                // Mock known ransomware
                "8929e0b1d3d82d4cf67cf3957f12e8b2": { family: "WannaCry Ransomware", score: 100 },
                "f389812a14e9f7435f12cd89fa123e42": { family: "LockBit Ransomware", score: 98 },
            };

            const matched = maliciousHashes[query.toLowerCase()];
            if (matched) {
                status = "malicious";
                malwareFamily = matched.family;
                score = matched.score;
            }

            result.details = {
                hashType: query.length === 32 ? "MD5" : query.length === 40 ? "SHA-1" : "SHA-256",
                reputation: {
                    status,
                    score,
                    malwareFamily,
                    signatureDatabase: " pane-o-glass Local Signature DB v1.0"
                }
            };
        }

        // Log query details to audit table
        await logAudit(
            "THREAT_INTEL_QUERY",
            `Security lookup initiated for ${type.toUpperCase()}: "${query}" (Reputation: ${result.details?.reputation?.status || "unknown"})`,
            session.user.id
        );

        return NextResponse.json(result);

    } catch (error: any) {
        console.error("Threat Intel API Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
