import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const IPV4_REGEX = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export async function syncEnvGuardian() {
    const envPath = path.resolve(process.cwd(), ".env");
    let envConfig: Record<string, string> = {};

    if (fs.existsSync(envPath)) {
        try {
            const raw = fs.readFileSync(envPath, "utf8");
            envConfig = dotenv.parse(raw);
        } catch (e: any) {
            console.warn("[ENV-GUARDIAN-SYNC] Could not parse .env file directly:", e.message);
        }
    }

    // Merge with process.env as fallback
    const getVal = (key: string): string => {
        return envConfig[key] || process.env[key] || "";
    };

    // 1. Monitored Watch IPs
    const rawWatchList = [
        getVal("WATCH_IP_LIST"),
        getVal("GUARDIAN_WATCH_IP_LIST"),
        getVal("GUARDIAN_WATCH_LIST"),
        getVal("GUARDIAN_IPS")
    ].join(",");

    const watchIps = Array.from(new Set(
        rawWatchList
            .split(",")
            .map(ip => ip.trim())
            .filter(ip => IPV4_REGEX.test(ip))
    ));

    // 2. Blacklisted IPs
    const rawBlacklist = [
        getVal("GUARDIAN_BLACKLIST"),
        getVal("GUARDIAN_BLACKLIST_IPS"),
        getVal("BLACKLIST_IP_LIST")
    ].join(",");

    const blacklistIps = Array.from(new Set(
        rawBlacklist
            .split(",")
            .map(ip => ip.trim())
            .filter(ip => IPV4_REGEX.test(ip))
    ));

    if (watchIps.length === 0 && blacklistIps.length === 0) {
        console.log("[ENV-GUARDIAN-SYNC] No Guardian IPs configured in .env to sync.");
        return { syncedWatch: 0, syncedBlacklist: 0 };
    }

    const prisma = new PrismaClient();
    let syncedWatch = 0;
    let syncedBlacklist = 0;

    try {
        for (const ip of watchIps) {
            await prisma.guardianWatchIp.upsert({
                where: { ip },
                update: {},
                create: {
                    ip,
                    description: "Synced from WATCH_IP_LIST (.env)",
                    createdBy: "System (.env Sync)"
                }
            });
            syncedWatch++;
        }

        for (const ip of blacklistIps) {
            await prisma.guardianBlacklist.upsert({
                where: { ip },
                update: {},
                create: {
                    ip,
                    reason: "Synced from GUARDIAN_BLACKLIST (.env)"
                }
            });
            syncedBlacklist++;
        }

        console.log(`[ENV-GUARDIAN-SYNC] Successfully synced ${syncedWatch} Watchlist IP(s) and ${syncedBlacklist} Blacklist IP(s) from .env into PostgreSQL.`);
    } catch (err: any) {
        console.error("[ENV-GUARDIAN-SYNC] Database sync error:", err.message);
    } finally {
        await prisma.$disconnect();
    }

    return { syncedWatch, syncedBlacklist };
}

// Allow direct CLI execution
if (require.main === module) {
    syncEnvGuardian()
        .then(() => process.exit(0))
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
