import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

function normalizeHostname(h?: string | null): string {
    if (!h) return "";
    return h.split(".")[0].split("(")[0].trim().toLowerCase();
}

async function main() {
    console.log(`[${new Date().toISOString()}] [SEED] Starting Device Credential & Protocol Seeding...`);

    // 1. Ensure schema columns exist
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "credentialProfile" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "protocolOverride" TEXT`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlerDeviceOverride" ADD COLUMN IF NOT EXISTS "portOverride" INTEGER`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlDevice" ADD COLUMN IF NOT EXISTS "protocol" TEXT DEFAULT 'ssh'`);
        await prisma.$executeRawUnsafe(`ALTER TABLE "CrawlDevice" ADD COLUMN IF NOT EXISTS "telnetDetected" BOOLEAN DEFAULT false`);
        await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CrawlerDeviceOverride_credentialProfile_idx" ON "CrawlerDeviceOverride"("credentialProfile")`);
    } catch (e: any) {
        console.warn("[SEED] Schema ensure warning:", e.message);
    }

    // 2. Fetch existing devices from newest snapshots
    const allDevices = await prisma.crawlDevice.findMany({
        orderBy: { createdAt: "desc" }
    });

    console.log(`[SEED] Found ${allDevices.length} historical device records in database.`);

    const uniqueDevices = new Map<string, any>();
    for (const dev of allDevices) {
        const norm = normalizeHostname(dev.hostname);
        if (!norm) continue;
        if (!uniqueDevices.has(norm)) {
            uniqueDevices.set(norm, dev);
        } else {
            const existing = uniqueDevices.get(norm);
            if (existing.status !== "REACHABLE" && dev.status === "REACHABLE") {
                uniqueDevices.set(norm, dev);
            }
        }
    }

    console.log(`[SEED] Deduplicated down to ${uniqueDevices.size} unique device hostnames.`);

    let cooperCount = 0;
    let crmcCount = 0;
    let telnetCount = 0;
    let sshCount = 0;
    let updatedCount = 0;

    for (const [normHost, dev] of uniqueDevices.entries()) {
        const rawHost = dev.hostname;
        const site = (dev.site || "").toUpperCase();
        const rawCred = (dev.credentialUsed || "").toLowerCase();
        const isTelnet = dev.protocol === "telnet" || rawCred.includes("telnet");

        const isCrmc = site === "CRM" || normHost.startsWith("crm") || normHost.startsWith("crmc");

        let credProfile = isCrmc ? "CRMC_TACACS" : "COOPER_TACACS";
        if (rawCred.includes("local") || rawCred.includes("fallback")) {
            credProfile = isCrmc ? "CRMC_LOCAL" : "COOPER_LOCAL";
        }

        const protocol = isTelnet ? "TELNET" : "SSH";
        const port = isTelnet ? 23 : 22;

        if (isCrmc) crmcCount++;
        else cooperCount++;

        if (isTelnet) telnetCount++;
        else sshCount++;

        await prisma.crawlerDeviceOverride.upsert({
            where: { hostname: normHost },
            create: {
                hostname: normHost,
                rawHostname: rawHost,
                ipAddress: dev.ipAddress || null,
                tag: "CUSTOM",
                siteOverride: dev.site || (isCrmc ? "CRM" : null),
                idfOverride: dev.idf || null,
                roleOverride: dev.role || null,
                credentialProfile: credProfile,
                protocolOverride: protocol,
                portOverride: port,
                reason: "Auto-seeded from historical crawl snapshots",
                createdBy: "system-seed"
            },
            update: {
                // If override exists but credentialProfile is null, backfill it
                credentialProfile: credProfile,
                protocolOverride: protocol,
                portOverride: port
            }
        });

        updatedCount++;
    }

    console.log(`[SEED] [SUCCESS] Completed Device Seeding:`);
    console.log(`  - Total Devices Seeded: ${updatedCount}`);
    console.log(`  - Cooper Domain Devices: ${cooperCount}`);
    console.log(`  - CRMC Domain Devices:   ${crmcCount}`);
    console.log(`  - SSH Devices (Port 22): ${sshCount}`);
    console.log(`  - Telnet Devices (P 23): ${telnetCount}`);

    await prisma.$disconnect();
}

main().catch((err) => {
    console.error("[SEED] Error:", err);
    process.exit(1);
});
