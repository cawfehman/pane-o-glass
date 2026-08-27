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

import { PrismaClient as PostgresClient } from "@prisma/client";
import { PrismaClient as SqliteClient } from "@prisma/sqlite-client";

const targetPostgresUrl = process.env.DATABASE_URL;

if (!targetPostgresUrl || (!targetPostgresUrl.startsWith("postgres://") && !targetPostgresUrl.startsWith("postgresql://"))) {
    console.error("❌ ERROR: DATABASE_URL in .env must be a valid PostgreSQL connection string starting with 'postgresql://'");
    console.error("Example: DATABASE_URL=\"postgresql://pane_user:Password123!@127.0.0.1:5432/pane_o_glass?schema=public\"");
    process.exit(1);
}

const sqliteDbPath = path.resolve(__dirname, "../../prisma/dev.db");
const postgresClient = new PostgresClient();

async function migrateData() {
    const startTime = Date.now();
    console.log(`\n================ 🚀 Starting SQLite to PostgreSQL Migration ================`);
    console.log(`Source SQLite Database: ${sqliteDbPath}`);
    console.log(`Target PostgreSQL URI: ${targetPostgresUrl.replace(/:[^:@]+@/, ":****@")}\n`);

    if (!fs.existsSync(sqliteDbPath)) {
        console.log("No source SQLite database file (dev.db) found to migrate. Proceeding with clean PostgreSQL database.");
        process.exit(0);
    }

    const sqliteClient = new SqliteClient();

    try {
        // 1. Migrate Users
        const users = await sqliteClient.user.findMany();
        console.log(`[1/12] Migrating Users (${users.length})...`);
        for (const u of users) {
            await postgresClient.user.upsert({
                where: { id: u.id },
                create: u,
                update: u
            });
        }

        // 2. Migrate Audit Logs
        const auditLogs = await sqliteClient.auditLog.findMany();
        console.log(`[2/12] Migrating Audit Logs (${auditLogs.length})...`);
        for (const a of auditLogs) {
            await postgresClient.auditLog.upsert({
                where: { id: a.id },
                create: a,
                update: a
            });
        }

        // 3. Migrate BEC Incidents
        const incidents = await sqliteClient.becIncident.findMany();
        console.log(`[3/12] Migrating BEC Incidents (${incidents.length})...`);
        for (const inc of incidents) {
            await postgresClient.becIncident.upsert({
                where: { id: inc.id },
                create: inc,
                update: inc
            });
        }

        // 4. Migrate BEC Raw URLs
        const rawUrls = await sqliteClient.becRawUrl.findMany();
        console.log(`[4/12] Migrating BEC Raw URLs (${rawUrls.length})...`);
        for (const r of rawUrls) {
            await postgresClient.becRawUrl.upsert({
                where: { id: r.id },
                create: r,
                update: r
            });
        }

        // 5. Migrate BEC Stats Cache
        const statsCache = await sqliteClient.becStatsCache.findMany();
        console.log(`[5/12] Migrating BEC Stats Cache (${statsCache.length})...`);
        for (const s of statsCache) {
            await postgresClient.becStatsCache.upsert({
                where: { rangeSeconds: s.rangeSeconds },
                create: s,
                update: s
            });
        }

        // 6. Migrate Firewall Query History
        const firewallHistory = await sqliteClient.firewallQueryHistory.findMany();
        console.log(`[6/12] Migrating Firewall Query History (${firewallHistory.length})...`);
        for (const f of firewallHistory) {
            await postgresClient.firewallQueryHistory.upsert({
                where: { id: f.id },
                create: f,
                update: f
            });
        }

        // 7. Migrate Guardian Events
        const guardianEvents = await sqliteClient.guardianEvent.findMany();
        console.log(`[7/12] Migrating Guardian Events (${guardianEvents.length})...`);
        for (const ge of guardianEvents) {
            await postgresClient.guardianEvent.upsert({
                where: { id: ge.id },
                create: ge,
                update: ge
            });
        }

        // 8. Migrate Guardian Blacklist
        const blacklist = await sqliteClient.guardianBlacklist.findMany();
        console.log(`[8/12] Migrating Guardian Blacklist (${blacklist.length})...`);
        for (const b of blacklist) {
            await postgresClient.guardianBlacklist.upsert({
                where: { ip: b.ip },
                create: b,
                update: b
            });
        }

        // 9. Migrate VPN Events
        const vpnEvents = await sqliteClient.vpnEvent.findMany();
        console.log(`[9/12] Migrating VPN Events (${vpnEvents.length})...`);
        for (const v of vpnEvents) {
            await postgresClient.vpnEvent.upsert({
                where: { id: v.id },
                create: v,
                update: v
            });
        }

        // 10. Migrate Site Map Versions
        const siteVersions = await sqliteClient.siteMapVersion.findMany();
        console.log(`[10/12] Migrating Site Map Versions (${siteVersions.length})...`);
        for (const sv of siteVersions) {
            await postgresClient.siteMapVersion.upsert({
                where: { id: sv.id },
                create: sv,
                update: sv
            });
        }

        // 11. Migrate Background Jobs
        const jobs = await sqliteClient.backgroundJob.findMany();
        console.log(`[11/12] Migrating Background Jobs (${jobs.length})...`);
        for (const j of jobs) {
            await postgresClient.backgroundJob.upsert({
                where: { name: j.name },
                create: j,
                update: j
            });
        }

        // 12. Migrate User Feedback
        const feedback = await sqliteClient.feedback.findMany();
        console.log(`[12/12] Migrating User Feedback (${feedback.length})...`);
        for (const fb of feedback) {
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
        await sqliteClient.$disconnect();
        await postgresClient.$disconnect();
    }
}

migrateData();
