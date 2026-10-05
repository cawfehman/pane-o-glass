export interface S2sFtdDeviceConfig {
    id: string;
    name: string;
    ip: string;
    user: string;
    pass: string;
    secret?: string;
}

export interface S2sFmcConfig {
    url: string;
    username: string;
    password: string;
    domainUuid?: string;
}

export interface S2sGlobalConfig {
    fmc?: S2sFmcConfig;
    ftds?: S2sFtdDeviceConfig[];
    configuredAt?: string;
    configuredBy?: string;
    activeMode: "fmc" | "ftd_direct" | "hybrid";
}

// In-Memory Ephemeral Storage (Per-process lifecycle, NEVER written to disk)
let inMemoryConfig: S2sGlobalConfig | null = null;

export function getS2sConfig(): {
    config: S2sGlobalConfig;
    isConfigured: boolean;
    source: "env" | "session_memory" | "none";
} {
    // 1. Check ephemeral in-memory session configuration
    if (inMemoryConfig) {
        const hasFmc = Boolean(inMemoryConfig.fmc?.url && inMemoryConfig.fmc?.username && inMemoryConfig.fmc?.password);
        const hasFtds = Boolean(Array.isArray(inMemoryConfig.ftds) && inMemoryConfig.ftds.length > 0 && inMemoryConfig.ftds[0].ip);
        if (hasFmc || hasFtds) {
            return {
                config: inMemoryConfig,
                isConfigured: true,
                source: "session_memory"
            };
        }
    }

    // 2. Check environment variables (.env)
    const envFmcUrl = process.env.FMC_URL?.trim();
    const envFmcUser = process.env.FMC_USER?.trim();
    const envFmcPass = process.env.FMC_PASSWORD?.trim();
    const envFmcDomain = process.env.FMC_DOMAIN_UUID?.trim();

    let envFtds: S2sFtdDeviceConfig[] = [];
    try {
        const rawFtds = process.env.S2S_FIREWALL_CONFIG || "[]";
        const parsed = JSON.parse(rawFtds);
        if (Array.isArray(parsed) && parsed.length > 0) {
            envFtds = parsed;
        }
    } catch {}

    const hasEnvFmc = Boolean(envFmcUrl && envFmcUser && envFmcPass);
    const hasEnvFtds = envFtds.length > 0;

    if (hasEnvFmc || hasEnvFtds) {
        return {
            config: {
                fmc: hasEnvFmc ? {
                    url: envFmcUrl!,
                    username: envFmcUser!,
                    password: envFmcPass!,
                    domainUuid: envFmcDomain
                } : undefined,
                ftds: hasEnvFtds ? envFtds : undefined,
                activeMode: hasEnvFmc && hasEnvFtds ? "hybrid" : hasEnvFmc ? "fmc" : "ftd_direct"
            },
            isConfigured: true,
            source: "env"
        };
    }

    // 3. Unconfigured / blank in .env
    return {
        config: {
            activeMode: "fmc",
            ftds: []
        },
        isConfigured: false,
        source: "none"
    };
}

export function setSessionConfig(newConfig: Partial<S2sGlobalConfig>, username?: string): S2sGlobalConfig {
    const existing = getS2sConfig().config;
    inMemoryConfig = {
        ...existing,
        ...newConfig,
        configuredAt: new Date().toISOString(),
        configuredBy: username || existing.configuredBy || "operator"
    };
    return inMemoryConfig;
}

export function clearSessionConfig(): void {
    inMemoryConfig = null;
}
