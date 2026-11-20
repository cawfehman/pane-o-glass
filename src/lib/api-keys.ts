import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { isIpInSubnet } from "@/lib/ip-subnet";

export const API_SCOPES = [
    {
        id: "shun:read",
        label: "Shun Database Read",
        description: "Lookup IP shun status, perimeter coverage, and threat enrichment"
    },
    {
        id: "shun:write",
        label: "Shun Database Manage",
        description: "Trigger new shuns or unshun operations across perimeter firewalls"
    },
    {
        id: "guardian:read",
        label: "Citrix Guardian Read",
        description: "Query Citrix Guardian watchlist, strike counts, and permanent blacklists"
    },
    {
        id: "vpn:read",
        label: "VPN Telemetry Read",
        description: "Query active AnyConnect VPN sessions and S2S tunnel diagnostics"
    },
    {
        id: "ise:read",
        label: "Cisco ISE Read",
        description: "Query Cisco ISE authentication records, live sessions, and TACACS+ logs"
    },
    {
        id: "crawler:read",
        label: "NetCrawl Topology Read",
        description: "Query Cisco IOS network topology, VLANs, and hop-by-hop path traces"
    },
    {
        id: "audit:read",
        label: "Audit Logs Read",
        description: "Query immutable audit logs and security operation reports"
    }
] as const;

export type ApiScope = typeof API_SCOPES[number]["id"];

/**
 * Hash raw API key with SHA-256 for secure database storage.
 */
export function hashApiKey(rawKey: string): string {
    return crypto.createHash("sha256").update(rawKey.trim()).digest("hex");
}

/**
 * Generate a new secure API Key.
 * Format: pog_live_<48-hex-chars>
 */
export async function createApiKey(params: {
    name: string;
    type: "SERVICE" | "PERSONAL";
    scopes: string[];
    allowedIps?: string | null;
    userId?: string | null;
    createdBy: string;
    expiresInDays?: number | null;
}): Promise<{
    id: string;
    name: string;
    type: "SERVICE" | "PERSONAL";
    keyPrefix: string;
    rawKey: string;
    scopes: string[];
    allowedIps: string | null;
    expiresAt: Date | null;
}> {
    const randomBytes = crypto.randomBytes(24).toString("hex");
    const rawKey = `pog_live_${randomBytes}`;
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 16) + "...";

    let expiresAt: Date | null = null;
    if (params.expiresInDays && params.expiresInDays > 0) {
        expiresAt = new Date(Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000);
    }

    const created = await prisma.apiKey.create({
        data: {
            name: params.name.trim(),
            type: params.type,
            keyHash,
            keyPrefix,
            scopes: params.scopes,
            allowedIps: params.allowedIps ? params.allowedIps.trim() : null,
            userId: params.type === "PERSONAL" ? params.userId : null,
            createdBy: params.createdBy,
            expiresAt
        }
    });

    return {
        id: created.id,
        name: created.name,
        type: created.type,
        keyPrefix: created.keyPrefix,
        rawKey, // Returned ONLY once upon creation
        scopes: created.scopes,
        allowedIps: created.allowedIps,
        expiresAt: created.expiresAt
    };
}

/**
 * Extract caller's real client IP address from standard reverse-proxy headers.
 */
export function getClientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0].trim();
        if (first) return first;
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp && realIp.trim()) return realIp.trim();

    const cfIp = req.headers.get("cf-connecting-ip");
    if (cfIp && cfIp.trim()) return cfIp.trim();

    return "127.0.0.1";
}

/**
 * Validate incoming API request against API key, IP ACL, expiration, and required scope.
 */
export async function validateApiKeyRequest(
    req: Request,
    requiredScope?: string
): Promise<{
    authorized: boolean;
    apiKey?: any;
    callerIdentity?: string;
    error?: string;
    status?: number;
}> {
    // 1. Extract API key from X-API-Key or Authorization: Bearer
    const headerValue = req.headers.get("x-api-key") || req.headers.get("authorization");
    if (!headerValue) {
        return {
            authorized: false,
            status: 401,
            error: "Missing API Key. Provide header 'X-API-Key: <key>' or 'Authorization: Bearer <key>'."
        };
    }

    const rawKey = headerValue.replace(/^Bearer\s+/i, "").trim();
    if (!rawKey) {
        return { authorized: false, status: 401, error: "Empty API Key provided." };
    }

    // 2. Hash key and find record in PostgreSQL
    const keyHash = hashApiKey(rawKey);
    const keyRecord = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: {
            user: {
                select: { id: true, username: true, role: true }
            }
        }
    });

    if (!keyRecord) {
        return { authorized: false, status: 401, error: "Invalid API Key." };
    }

    // 3. Check active state
    if (!keyRecord.isActive) {
        return {
            authorized: false,
            status: 403,
            error: "Forbidden: API Key has been deactivated or revoked."
        };
    }

    // 4. Check expiration
    if (keyRecord.expiresAt && keyRecord.expiresAt.getTime() < Date.now()) {
        return {
            authorized: false,
            status: 403,
            error: "Forbidden: API Key has expired."
        };
    }

    // 5. Enforce Source IP ACL (if defined for this key)
    const clientIp = getClientIp(req);
    if (keyRecord.allowedIps && keyRecord.allowedIps.trim()) {
        const allowedEntries = keyRecord.allowedIps
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);

        const isIpAllowed = allowedEntries.some(entry => {
            if (entry.includes("/")) {
                return isIpInSubnet(clientIp, entry);
            }
            return entry === clientIp;
        });

        if (!isIpAllowed) {
            return {
                authorized: false,
                status: 403,
                error: `Access Denied: Source IP ${clientIp} is not authorized for this API Key.`
            };
        }
    }

    // 6. Check Scope / Permission
    if (requiredScope) {
        const hasScope = keyRecord.scopes.includes(requiredScope) || keyRecord.scopes.includes("*");
        if (!hasScope) {
            return {
                authorized: false,
                status: 403,
                error: `Forbidden: API Key lacks required scope '${requiredScope}'.`
            };
        }
    }

    // 7. Update lastUsedAt asynchronously
    prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() }
    }).catch(() => {});

    const callerIdentity = keyRecord.type === "PERSONAL" && keyRecord.user
        ? `${keyRecord.user.username} (via ${keyRecord.name})`
        : `${keyRecord.name} [Service]`;

    return {
        authorized: true,
        apiKey: keyRecord,
        callerIdentity
    };
}
