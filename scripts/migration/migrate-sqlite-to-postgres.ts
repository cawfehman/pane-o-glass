import { PrismaClient } from "@prisma/client";
import Database from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const targetPostgresUrl = process.env.DATABASE_URL;

if (!targetPostgresUrl || (!targetPostgresUrl.startsWith("postgres://") && !targetPostgresUrl.startsWith("postgresql://"))) {
    console.error("❌ ERROR: DATABASE_URL in .env must be a valid PostgreSQL connection string starting with 'postgresql://'");
    console.error("Example: DATABASE_URL=\"postgresql://pane_user:Password123!@127.0.0.1:5432/pane_o_glass?schema=public\"");
    process.exit(1);
}

const sqliteDbPath = path.resolve(__dirname, "../../prisma/dev.db");
let sqliteDb: any = null;

try {
    sqliteDb = new Database(sqliteDbPath, { readonly: true });
} catch (e: any) {
    console.error(`❌ Could not open SQLite database at ${sqliteDbPath}:`, e.message || e);
}

const postgresClient = new PrismaClient();

async function migrateData() {
    const startTime = Date.now();
    console.log(`\n================ 🚀 Starting SQLite to PostgreSQL Migration ================`);
    console.log(`Source SQLite Database: ${sqliteDbPath}`);
    console.log(`Target PostgreSQL URI: ${targetPostgresUrl.replace(/:[^:@]+@/, ":****@")}\n`);

    if (!sqliteDb) {
        console.log("No source SQLite database file found to migrate. Proceeding with clean PostgreSQL database.");
        process.exit(0);
    }

    try {
        // Helper to query all rows from a table in SQLite
        const getSqliteRows = (tableName: string): any[] => {
            try {
                return sqliteDb.prepare(`SELECT * FROM "${tableName}";`).all();
            } catch (e) {
                return [];
            }
        };

        // Helper to parse dates and booleans for Prisma compatibility
        const parseRow = (row: any) => {
            const parsed: any = {};
            for (const [key, value] of Object.entries(row)) {
                if ((key.endsWith("At") || key === "lastLogin" || key === "lastRun") && value) {
                    parsed[key] = new Date(value as string | number);
                } else if (typeof value === "number" && (key.startsWith("is") || key.startsWith("has"))) {
                    parsed[key] = Boolean(value);
                } else {
                    parsed[key] = value;
                }
            }
            return parsed;
        };

        // 1. Migrate Users
        const users = getSqliteRows("User");
        console.log(`[1/12] Migrating Users (${users.length})...`);
        for (const raw of users) {
            const u = parseRow(raw);
            await postgresClient.user.upsert({
                where: { id: u.id },
                create: u,
                update: u
            });
        }

        // 2. Migrate Audit Logs
        const auditLogs = getSqliteRows("AuditLog");
        console.log(`[2/12] Migrating Audit Logs (${auditLogs.length})...`);
        for (const raw of auditLogs) {
            const a = parseRow(raw);
            await postgresClient.auditLog.upsert({
                where: { id: a.id },
                create: a,
                update: a
            });
        }

        // 3. Migrate BEC Incidents
        const incidents = getSqliteRows("BecIncident");
        console.log(`[3/12] Migrating BEC Incidents (${incidents.length})...`);
        for (const raw of incidents) {
            const inc = parseRow(raw);
            await postgresClient.becIncident.upsert({
                where: { id: inc.id },
                create: inc,
                update: inc
            });
        }

        // 4. Migrate BEC Raw URLs
        const rawUrls = getSqliteRows("BecRawUrl");
        console.log(`[4/12] Migrating BEC Raw URLs (${rawUrls.length})...`);
        for (const raw of rawUrls) {
            const r = parseRow(raw);
            await postgresClient.becRawUrl.upsert({
                where: { id: r.id },
                create: r,
                update: r
            });
        }

        // 5. Migrate BEC Stats Cache
        const statsCache = getSqliteRows("BecStatsCache");
        console.log(`[5/12] Migrating BEC Stats Cache (${statsCache.length})...`);
        for (const raw of statsCache) {
            const s = parseRow(raw);
            await postgresClient.becStatsCache.upsert({
                where: { rangeSeconds: s.rangeSeconds },
                create: s,
                update: s
            });
        }

        // 6. Migrate Firewall Query History
        const firewallHistory = getSqliteRows("FirewallQueryHistory");
        console.log(`[6/12] Migrating Firewall Query History (${firewallHistory.length})...`);
        for (const raw of firewallHistory) {
            const f = parseRow(raw);
            await postgresClient.firewallQueryHistory.upsert({
                where: { id: f.id },
                create: f,
                update: f
            });
        }

        // 7. Migrate Guardian Events
        const guardianEvents = getSqliteRows("GuardianEvent");
        console.log(`[7/12] Migrating Guardian Events (${guardianEvents.length})...`);
        for (const raw of guardianEvents) {
            const ge = parseRow(raw);
            await postgresClient.guardianEvent.upsert({
                where: { id: ge.id },
                create: ge,
                update: ge
            });
        }

        // 8. Migrate Guardian Blacklist
        const blacklist = getSqliteRows("GuardianBlacklist");
        console.log(`[8/12] Migrating Guardian Blacklist (${blacklist.length})...`);
        for (const raw of blacklist) {
            const b = parseRow(raw);
            await postgresClient.guardianBlacklist.upsert({
                where: { ip: b.ip },
                create: b,
                update: b
            });
        }

        // 9. Migrate VPN Events
        const vpnEvents = getSqliteRows("VpnEvent");
        console.log(`[9/12] Migrating VPN Events (${vpnEvents.length})...`);
        for (const raw of vpnEvents) {
            const v = parseRow(raw);
            await postgresClient.vpnEvent.upsert({
                where: { id: v.id },
                create: v,
                update: v
            });
        }

        // 10. Migrate Site Map Versions
        const siteVersions = getSqliteRows("SiteMapVersion");
        console.log(`[10/12] Migrating Site Map Versions (${siteVersions.length})...`);
        for (const raw of siteVersions) {
            const sv = parseRow(raw);
            await postgresClient.siteMapVersion.upsert({
                where: { id: sv.id },
                create: sv,
                update: sv
            });
        }

        // 11. Migrate Background Jobs
        const jobs = getSqliteRows("BackgroundJob");
        console.log(`[11/12] Migrating Background Jobs (${jobs.length})...`);
        for (const raw of jobs) {
            const j = parseRow(raw);
            await postgresClient.backgroundJob.upsert({
                where: { name: j.name },
                create: j,
                update: j
            });
        }

        // 12. Migrate User Feedback
        const feedback = getSqliteRows("Feedback");
        console.log(`[12/12] Migrating User Feedback (${feedback.length})...`);
        for (const raw of feedback) {
            const fb = parseRow(raw);
            await postgresClient.feedback.upsert({
                where: { id: fb.id },
                create: fb,
                update: fb
            });
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n================ ✅ SUCCESS! Migration Completed in ${duration}s ================`);

    } catch (err: any) {
        console.error(`\n❌ Migration Failed:`, err);
        process.exit(1);
    } finally {
        if (sqliteDb) sqliteDb.close();
        await postgresClient.$disconnect();
    }
}

migrateData();
