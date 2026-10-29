/**
 * In-memory server-side cache for crawler snapshots.
 * Caches computed snapshot payloads (especially Master Topology which aggregates across snapshots)
 * to eliminate multi-second database queries and redundant graph reconciliations.
 */

interface CachedSnapshot {
    data: any;
    cachedAt: number;
}

// Global variable in Node.js process to persist across Next.js API requests
const globalForCrawlerCache = globalThis as unknown as {
    crawlerSnapshotCache?: Map<string, CachedSnapshot>;
};

export const snapshotCache = globalForCrawlerCache.crawlerSnapshotCache ?? new Map<string, CachedSnapshot>();
globalForCrawlerCache.crawlerSnapshotCache = snapshotCache;

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function getCachedSnapshot(key: string, maxAgeMs = DEFAULT_TTL_MS): any | null {
    const cleanKey = (key || "").trim().toLowerCase();
    const entry = snapshotCache.get(cleanKey);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > maxAgeMs) {
        snapshotCache.delete(cleanKey);
        return null;
    }
    return entry.data;
}

export function setCachedSnapshot(key: string, data: any): void {
    const cleanKey = (key || "").trim().toLowerCase();
    const now = Date.now();

    // Proactively evict expired snapshots
    for (const [k, entry] of snapshotCache.entries()) {
        if (now - entry.cachedAt > DEFAULT_TTL_MS) {
            snapshotCache.delete(k);
        }
    }

    // Hard LRU cap: keep at most 5 topology snapshots in memory (~20-50MB max)
    if (snapshotCache.size >= 5) {
        const oldestKey = snapshotCache.keys().next().value;
        if (oldestKey) snapshotCache.delete(oldestKey);
    }

    snapshotCache.set(cleanKey, {
        data,
        cachedAt: now
    });
}

export function invalidateCrawlerSnapshotCache(key?: string): void {
    if (key) {
        snapshotCache.delete(key.trim().toLowerCase());
    } else {
        snapshotCache.clear();
    }
}
