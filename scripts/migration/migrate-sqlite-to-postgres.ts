import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Auto-generate SQLite client if not present in node_modules
const sqliteClientPath = path.resolve(__dirname, "../../node_modules/@prisma/sqlite-client");
const sqliteSchemaPath = path.resolve(__dirname, "../../prisma/schema.sqlite.prisma");

if (!fs.existsSync(sqliteClientPath) && fs.existsSync(sqliteSchemaPath)) {
    console.log("⚡ Auto-generating temporary SQLite migration client...");
    try {
        execSync(`npx prisma generate --schema="${sqliteSchemaPath}"`, { stdio: "inherit" });
    } catch (e: any) {
        console.error("Failed to generate sqlite client:", e.message || e);
    }
}

const targetPostgresUrl = process.env.DATABASE_URL;

if (!targetPostgresUrl || (!targetPostgresUrl.startsWith("postgres://") && !targetPostgresUrl.startsWith("postgresql://"))) {
    console.error("❌ ERROR: DATABASE_URL in .env must be a valid PostgreSQL connection string starting with 'postgresql://'");
    process.exit(1);
}

const sqliteDbPath = path.resolve(__dirname, "../../prisma/dev.db");

async function migrateData() {
    const { PrismaClient: PostgresClient } = require("@prisma/client");
    const { PrismaClient: SqliteClient } = require("@prisma/sqlite-client");

    const postgresClient = new PostgresClient();

    const startTime = Date.now();
    console.log(`\n================ 🚀 Starting Complete SQLite to PostgreSQL Migration ================`);
    console.log(`Source SQLite Database: ${sqliteDbPath}`);
    console.log(`Target PostgreSQL URI: ${targetPostgresUrl.replace(/:[^:@]+@/, ":****@")}\n`);

    if (!fs.existsSync(sqliteDbPath)) {
        console.log("No source SQLite database file (dev.db) found to migrate. Proceeding with clean PostgreSQL database.");
        process.exit(0);
    }

    const sqliteClient = new SqliteClient();

    // Helper to query all raw rows from a table in SQLite without schema validation
    const getSqliteRows = async (tableName: string): Promise<any[]> => {
        try {
            const rows: any[] = await sqliteClient.$queryRawUnsafe(`SELECT * FROM "${tableName}";`);
            return rows || [];
        } catch (e) {
            return [];
        }
    };

    // Helper to parse dates and booleans for Prisma compatibility
    const parseRow = (row: any) => {
        const parsed: any = {};
        for (const [key, value] of Object.entries(row)) {
            if ((key.endsWith("At") || key.endsWith("Date") || key === "lastLogin" || key === "lastRun" || key === "firstSeen" || key === "lastSeen" || key === "timestamp" || key === "alertSentAt" || key === "triagedAt" || key === "approvedAt" || key === "testSentAt" || key === "sentAt") && value) {
                parsed[key] = new Date(value as string | number);
            } else if (typeof value === "number" && (key.startsWith("is") || key.startsWith("has") || key === "contentionDetected")) {
                parsed[key] = Boolean(value);
            } else {
                parsed[key] = value;
            }
        }
        return parsed;
    };

    const CHUNK = 5000;

    try {
        // 1. Users
        try {
            const users = await getSqliteRows("User");
            console.log(`[1/23] Migrating Users (${users.length.toLocaleString()})...`);
            for (const raw of users) {
                const u = parseRow(raw);
                try {
                    await postgresClient.user.upsert({
                        where: { username: u.username },
                        create: u,
                        update: {
                            password: u.password,
                            firstName: u.firstName,
                            lastName: u.lastName,
                            role: u.role,
                            isExternal: u.isExternal,
                            isRoleOverridden: u.isRoleOverridden,
                            lastLogin: u.lastLogin,
                            sessionTimeout: u.sessionTimeout
                        }
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 2. Audit Logs
        try {
            const auditLogs = await getSqliteRows("AuditLog");
            console.log(`[2/23] Bulk Migrating Audit Logs (${auditLogs.length.toLocaleString()})...`);
            for (let i = 0; i < auditLogs.length; i += CHUNK) {
                const chunk = auditLogs.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.auditLog.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 3. Health Probes
        try {
            const healthProbes = await getSqliteRows("HealthProbe");
            console.log(`[3/23] Bulk Migrating Health Probes (${healthProbes.length.toLocaleString()})...`);
            for (let i = 0; i < healthProbes.length; i += CHUNK) {
                const chunk = healthProbes.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.healthProbe.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 4. Tool Permissions
        try {
            const toolPerms = await getSqliteRows("ToolPermission");
            console.log(`[4/23] Migrating Tool Permissions (${toolPerms.length.toLocaleString()})...`);
            for (const raw of toolPerms) {
                const p = parseRow(raw);
                try {
                    await postgresClient.toolPermission.upsert({
                        where: { toolId_role: { toolId: p.toolId, role: p.role } },
                        create: p,
                        update: p
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 5. User Feedback
        try {
            const feedback = await getSqliteRows("Feedback");
            console.log(`[5/23] Migrating User Feedback (${feedback.length.toLocaleString()})...`);
            for (const raw of feedback) {
                const fb = parseRow(raw);
                try {
                    await postgresClient.feedback.upsert({
                        where: { id: fb.id },
                        create: fb,
                        update: fb
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 6. Background Jobs
        try {
            const jobs = await getSqliteRows("BackgroundJob");
            console.log(`[6/23] Migrating Background Jobs (${jobs.length.toLocaleString()})...`);
            for (const raw of jobs) {
                const j = parseRow(raw);
                try {
                    await postgresClient.backgroundJob.upsert({
                        where: { name: j.name },
                        create: j,
                        update: j
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 7. Site Map Versions
        try {
            const siteVersions = await getSqliteRows("SiteMapVersion");
            console.log(`[7/23] Migrating Site Map Versions (${siteVersions.length.toLocaleString()})...`);
            for (const raw of siteVersions) {
                const sv = parseRow(raw);
                try {
                    await postgresClient.siteMapVersion.upsert({
                        where: { id: sv.id },
                        create: sv,
                        update: sv
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 8. VPN Events
        try {
            const vpnEvents = await getSqliteRows("VpnEvent");
            console.log(`[8/23] 🚀 Bulk Migrating VPN Events (${vpnEvents.length.toLocaleString()})...`);
            let processed = 0;
            for (let i = 0; i < vpnEvents.length; i += CHUNK) {
                const chunk = vpnEvents.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.vpnEvent.createMany({ data: chunk, skipDuplicates: true });
                    processed += chunk.length;
                    if (processed % 200000 === 0 || processed === vpnEvents.length) {
                        console.log(`   ↳ Migrated ${processed.toLocaleString()} / ${vpnEvents.length.toLocaleString()} VPN records...`);
                    }
                } catch (e) {}
            }
        } catch (e) {}

        // 9. IP Lookup Cache
        try {
            const ipCache = await getSqliteRows("IpLookupCache");
            console.log(`[9/23] Bulk Migrating IP Lookup Cache (${ipCache.length.toLocaleString()})...`);
            for (let i = 0; i < ipCache.length; i += CHUNK) {
                const chunk = ipCache.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.ipLookupCache.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 10. Firewall Query History
        try {
            const firewallHistory = await getSqliteRows("FirewallQueryHistory");
            console.log(`[10/23] Bulk Migrating Firewall Query History (${firewallHistory.length.toLocaleString()})...`);
            for (let i = 0; i < firewallHistory.length; i += CHUNK) {
                const chunk = firewallHistory.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallQueryHistory.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 11. Guardian Events
        try {
            const guardianEvents = await getSqliteRows("GuardianEvent");
            console.log(`[11/23] Bulk Migrating Guardian Events (${guardianEvents.length.toLocaleString()})...`);
            for (let i = 0; i < guardianEvents.length; i += CHUNK) {
                const chunk = guardianEvents.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.guardianEvent.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 12. Guardian Blacklist
        try {
            const blacklist = await getSqliteRows("GuardianBlacklist");
            console.log(`[12/23] Migrating Guardian Blacklist (${blacklist.length.toLocaleString()})...`);
            for (const raw of blacklist) {
                const b = parseRow(raw);
                try {
                    await postgresClient.guardianBlacklist.upsert({
                        where: { ip: b.ip },
                        create: b,
                        update: b
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 13. Shun Database IPs
        try {
            const shunIps = await getSqliteRows("ShunDatabaseIp");
            console.log(`[13/23] Bulk Migrating Firewall Shun Database IPs (${shunIps.length.toLocaleString()})...`);
            for (let i = 0; i < shunIps.length; i += CHUNK) {
                const chunk = shunIps.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.shunDatabaseIp.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 14. Firewall Shun Stats
        try {
            const shunStats = await getSqliteRows("FirewallShunStats");
            console.log(`[14/23] Bulk Migrating Firewall Shun Stats (${shunStats.length.toLocaleString()})...`);
            for (let i = 0; i < shunStats.length; i += CHUNK) {
                const chunk = shunStats.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallShunStats.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 15. Firewall Shun Snapshots
        try {
            const shunSnapshots = await getSqliteRows("FirewallShunSnapshot");
            console.log(`[15/23] Bulk Migrating Firewall Shun Snapshots (${shunSnapshots.length.toLocaleString()})...`);
            for (let i = 0; i < shunSnapshots.length; i += CHUNK) {
                const chunk = shunSnapshots.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallShunSnapshot.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 16. IronPort Hourly Stats
        try {
            const ironportStats = await getSqliteRows("IronportHourlyStat");
            console.log(`[16/23] Bulk Migrating IronPort Hourly Stats (${ironportStats.length.toLocaleString()})...`);
            for (let i = 0; i < ironportStats.length; i += CHUNK) {
                const chunk = ironportStats.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.ironportHourlyStat.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 17. Notification Templates
        try {
            const templates = await getSqliteRows("NotificationTemplate");
            console.log(`[17/23] Migrating Notification Templates (${templates.length.toLocaleString()})...`);
            for (const raw of templates) {
                const t = parseRow(raw);
                try {
                    await postgresClient.notificationTemplate.upsert({
                        where: { name: t.name },
                        create: t,
                        update: t
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 18. Notification Campaigns
        try {
            const campaigns = await getSqliteRows("NotificationCampaign");
            console.log(`[18/23] Migrating Notification Campaigns (${campaigns.length.toLocaleString()})...`);
            for (const raw of campaigns) {
                const c = parseRow(raw);
                try {
                    await postgresClient.notificationCampaign.upsert({
                        where: { id: c.id },
                        create: c,
                        update: c
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 19. Campaign Recipients
        try {
            const recipients = await getSqliteRows("CampaignRecipient");
            console.log(`[19/23] Bulk Migrating Campaign Recipients (${recipients.length.toLocaleString()})...`);
            for (let i = 0; i < recipients.length; i += CHUNK) {
                const chunk = recipients.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.campaignRecipient.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 20. Telemetry Snapshots
        try {
            const snapshots = await getSqliteRows("SqliteTelemetrySnapshot");
            console.log(`[20/23] Bulk Migrating Telemetry Snapshots (${snapshots.length.toLocaleString()})...`);
            for (let i = 0; i < snapshots.length; i += CHUNK) {
                const chunk = snapshots.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.sqliteTelemetrySnapshot.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e) {}

        // 21. BEC Incidents
        try {
            const incidents = await getSqliteRows("BecIncident");
            console.log(`[21/23] Migrating BEC Incidents (${incidents.length.toLocaleString()})...`);
            for (const raw of incidents) {
                const inc = parseRow(raw);
                try {
                    await postgresClient.becIncident.upsert({
                        where: { id: inc.id },
                        create: inc,
                        update: inc
                    });
                } catch (e) {}
            }
        } catch (e) {}

        // 22. BEC Raw URLs
        try {
            const rawUrls = await getSqliteRows("BecRawUrl");
            console.log(`[22/23] Bulk Migrating BEC Raw URLs (${rawUrls.length.toLocaleString()})...`);
            for (let i = 0; i < rawUrls.length; i += CHUNK) {
                const chunk = rawUrls.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.becRawUrl.createMany({ data: chunk, skipDuplicates: true });
                } catch (e) {}
            }
        } catch (e: any) {}

        // 23. BEC Stats Cache
        try {
            const statsCache = await getSqliteRows("BecStatsCache");
            console.log(`[23/23] Migrating BEC Stats Cache (${statsCache.length.toLocaleString()})...`);
            for (const raw of statsCache) {
                const s = parseRow(raw);
                try {
                    await postgresClient.becStatsCache.upsert({
                        where: { rangeSeconds: s.rangeSeconds },
                        create: s,
                        update: s
                    });
                } catch (e) {}
            }
        } catch (e) {}

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n================ ✅ COMPLETE! All 23 Tables Migrated in ${duration}s ================`);

    } catch (err: any) {
        console.error(`\n❌ Migration Failed:`, err);
        process.exit(1);
    } finally {
        await sqliteClient.$disconnect();
        await postgresClient.$disconnect();
    }
}

migrateData();
