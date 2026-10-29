const requestCounts = new Map<string, { count: number; expiresAt: number }>();

export function rateLimit(ip: string, limit: number, windowMs: number): boolean {
    const now = Date.now();

    // Periodically sweep expired entries if map grows
    if (requestCounts.size > 200) {
        for (const [k, v] of requestCounts.entries()) {
            if (now > v.expiresAt) requestCounts.delete(k);
        }
    }

    const record = requestCounts.get(ip);
    
    if (record) {
        if (now > record.expiresAt) {
            requestCounts.set(ip, { count: 1, expiresAt: now + windowMs });
            return true;
        }
        if (record.count >= limit) {
            return false;
        }
        record.count++;
        return true;
    }
    
    requestCounts.set(ip, { count: 1, expiresAt: now + windowMs });
    return true;
}
