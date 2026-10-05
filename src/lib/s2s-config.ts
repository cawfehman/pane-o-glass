import fs from "fs";
import path from "path";

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

const CONFIG_FILE_PATH = path.join(process.cwd(), "data", "s2s-config.json");

export function getS2sConfig(): {
    config: S2sGlobalConfig;
    isConfigured: boolean;
    source: "env" | "file" | "none";
} {
    // 1. Check persistent config file in data/
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const raw = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
            const parsed: S2sGlobalConfig = JSON.parse(raw);
            const hasFmc = Boolean(parsed.fmc?.url && parsed.fmc?.username && parsed.fmc?.password);
            const hasFtds = Boolean(Array.isArray(parsed.ftds) && parsed.ftds.length > 0 && parsed.ftds[0].ip);
            if (hasFmc || hasFtds) {
                return {
                    config: parsed,
                    isConfigured: true,
                    source: "file"
                };
            }
        }
    } catch (e) {
        console.warn("[S2S-CONFIG] Error reading s2s-config.json:", e);
    }

    // 2. Check environment variables
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

    // 3. Unconfigured / blank
    return {
        config: {
            activeMode: "fmc",
            ftds: []
        },
        isConfigured: false,
        source: "none"
    };
}

export function saveS2sConfig(newConfig: Partial<S2sGlobalConfig>, username?: string): S2sGlobalConfig {
    const dir = path.dirname(CONFIG_FILE_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const { config: existing } = getS2sConfig();
    const updated: S2sGlobalConfig = {
        ...existing,
        ...newConfig,
        configuredAt: new Date().toISOString(),
        configuredBy: username || existing.configuredBy || "administrator"
    };

    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
}

export function clearS2sConfig(): void {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
        fs.unlinkSync(CONFIG_FILE_PATH);
    }
}
