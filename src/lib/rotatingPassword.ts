const WORD_LIST = [
    "antigravity", "firewall", "checkpoint", "guardian", "sentinel",
    "shun", "triage", "forensics", "reputation", "umbrella",
    "tunnel", "anyconnect", "gateway", "ise", "tacacs",
    "audit", "vector", "cache", "enrichment", "cartography",
    "spidering", "beacons", "collision", "metrics", "latency",
    "journal", "uncommitted", "database", "sqlite", "prisma",
    "turbopack", "middleware", "session", "authenticator", "reconnect",
    "broadband", "throughput", "handshake", "security",
    "packet", "ingress", "egress", "threat", "breach",
    "compromise", "vulnerability", "exploit", "payload", "obfuscation"
];

export function getRotatingPassword(offsetMinutes = 0) {
    const timeIndex = Math.floor((Date.now() + offsetMinutes * 60 * 1000) / 120000);
    const index = Math.abs(timeIndex) % WORD_LIST.length;
    return WORD_LIST[index];
}

export function verifyRotatingPassword(input: string): boolean {
    const cleanInput = input.trim().toLowerCase();
    // Allow current word and previous word to handle time boundaries gracefully
    return cleanInput === getRotatingPassword(0) || cleanInput === getRotatingPassword(-2);
}
