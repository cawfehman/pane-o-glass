import axios from "axios";
import { prisma } from "./prisma";

export interface IpLocateCreditInfo {
    configured: boolean;
    remaining: number | null;
    limit: number | null;
    resetAt: string | null;
    lastChecked: string;
    percentRemaining: number | null;
    status: "HEALTHY" | "LOW" | "DEPLETED" | "UNCONFIGURED" | "ERROR" | "UNKNOWN";
    message?: string;
}

// In-memory cache for fast, zero-delay retrieval
let cachedCreditInfo: IpLocateCreditInfo | null = null;
let lastFetchEpoch = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Update the in-memory and database credit cache from response headers
 */
export async function updateCreditInfoFromHeaders(headers: any): Promise<IpLocateCreditInfo | null> {
    if (!headers) return null;

    // Axios headers can be lowercase or standard case
    const getHeader = (name: string) => {
        if (typeof headers.get === "function") {
            return headers.get(name) || headers.get(name.toLowerCase());
        }
        return headers[name] || headers[name.toLowerCase()];
    };

    const remainingStr = getHeader("x-ratelimit-remaining");
    const limitStr = getHeader("x-ratelimit-limit");
    const resetStr = getHeader("x-ratelimit-reset");

    if (remainingStr === undefined && limitStr === undefined) {
        return null;
    }

    const remaining = remainingStr !== undefined && remainingStr !== null ? parseInt(String(remainingStr), 10) : null;
    const limit = limitStr !== undefined && limitStr !== null ? parseInt(String(limitStr), 10) : null;
    let resetAt: string | null = null;

    if (resetStr) {
        const resetEpoch = parseInt(String(resetStr), 10);
        if (!isNaN(resetEpoch)) {
            // Unix timestamp in seconds
            resetAt = new Date(resetEpoch * 1000).toISOString();
        }
    }

    let status: IpLocateCreditInfo["status"] = "HEALTHY";
    if (remaining !== null) {
        if (remaining < 5000) {
            status = "DEPLETED"; // Rose (< 5k)
        } else if (remaining < 15000) {
            status = "LOW"; // Amber (5k - 15k)
        } else {
            status = "HEALTHY"; // Emerald (>= 15k)
        }
    }

    const nowIso = new Date().toISOString();
    const info: IpLocateCreditInfo = {
        configured: Boolean(process.env.IPLOCATE_API_KEY),
        remaining,
        limit,
        resetAt,
        lastChecked: nowIso,
        percentRemaining: null,
        status,
        message: remaining !== null
            ? `${remaining.toLocaleString()} credits remaining`
            : undefined
    };

    cachedCreditInfo = info;
    lastFetchEpoch = Date.now();

    // Persist to BackgroundJob table for System Health monitor visibility
    try {
        await prisma.backgroundJob.upsert({
            where: { name: "IPLocate Quota & Credits" },
            create: {
                name: "IPLocate Quota & Credits",
                status: status === "DEPLETED" ? "FAILURE" : "SUCCESS",
                message: JSON.stringify(info),
                lastRun: new Date()
            },
            update: {
                status: status === "DEPLETED" ? "FAILURE" : "SUCCESS",
                message: JSON.stringify(info),
                lastRun: new Date()
            }
        });
    } catch {}

    return info;
}

/**
 * Fetch the current credit status from IPLocate.io or cache (10-minute TTL)
 */
export async function getIpLocateCreditStatus(forceRefresh: boolean = false): Promise<IpLocateCreditInfo> {
    const apiKey = process.env.IPLOCATE_API_KEY;

    if (!apiKey) {
        return {
            configured: false,
            remaining: null,
            limit: null,
            resetAt: null,
            lastChecked: new Date().toISOString(),
            percentRemaining: null,
            status: "UNCONFIGURED",
            message: "No IPLOCATE_API_KEY configured (using local cache / simulation)"
        };
    }

    const now = Date.now();
    if (!forceRefresh && cachedCreditInfo && (now - lastFetchEpoch < CACHE_TTL_MS)) {
        return cachedCreditInfo;
    }

    // Try reading last recorded status from BackgroundJob if in-memory cache is empty
    if (!forceRefresh && !cachedCreditInfo) {
        try {
            const job = await prisma.backgroundJob.findUnique({
                where: { name: "IPLocate Quota & Credits" }
            });
            if (job && job.message) {
                const parsed = JSON.parse(job.message);
                const age = now - new Date(job.lastRun).getTime();
                if (age < CACHE_TTL_MS) {
                    cachedCreditInfo = parsed;
                    lastFetchEpoch = new Date(job.lastRun).getTime();
                    return parsed;
                }
            }
        } catch {}
    }

    // Live probe to https://www.iplocate.io/api/lookup
    try {
        const response = await axios.get("https://www.iplocate.io/api/lookup", {
            headers: { "X-API-KEY": apiKey },
            timeout: 5000
        });

        const updated = await updateCreditInfoFromHeaders(response.headers);
        if (updated) {
            return updated;
        }
    } catch (err: any) {
        if (err.response?.headers) {
            const updated = await updateCreditInfoFromHeaders(err.response.headers);
            if (updated) {
                return updated;
            }
        }

        if (cachedCreditInfo) {
            return {
                ...cachedCreditInfo,
                message: `Failed to refresh: ${err.message}`
            };
        }

        return {
            configured: true,
            remaining: null,
            limit: null,
            resetAt: null,
            lastChecked: new Date().toISOString(),
            percentRemaining: null,
            status: "ERROR",
            message: `Connection error: ${err.message}`
        };
    }

    return (
        cachedCreditInfo || {
            configured: true,
            remaining: null,
            limit: null,
            resetAt: null,
            lastChecked: new Date().toISOString(),
            percentRemaining: null,
            status: "UNKNOWN",
            message: "Could not retrieve headers from IPLocate"
        }
    );
}
