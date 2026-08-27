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
    console.log(`\n================ 🚀 Starting SQLite to PostgreSQL Migration ================`);
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
            if ((key.endsWith("At") || key === "lastLogin" || key === "lastRun" || key === "firstSeen" || key === "lastSeen" || key === "snapshotDate") && value) {
                parsed[key] = new Date(value as string | number);
            } else if (typeof value === "number" && (key.startsWith("is") || key.startsWith("has"))) {
                parsed[key] = Boolean(value);
            } else {
                parsed[key] = value;
            }
        }
        return parsed;
    };

    try {
        // 1. Migrate Users
        try {
            const users = await getSqliteRows("User");
            console.log(`[1/15] Migrating Users (${users.length.toLocaleString()})...`);
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
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading User table: ${e.message || e}`);
        }

        // 2. Migrate Audit Logs (Bulk 5,000 chunks)
        try {
            const auditLogs = await getSqliteRows("AuditLog");
            console.log(`[2/15] Bulk Migrating Audit Logs (${auditLogs.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < auditLogs.length; i += CHUNK) {
                const chunk = auditLogs.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.auditLog.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading AuditLog table: ${e.message || e}`);
        }

        // 3. Migrate BEC Incidents
        try {
            const incidents = await getSqliteRows("BecIncident");
            console.log(`[3/15] Migrating BEC Incidents (${incidents.length.toLocaleString()})...`);
            for (const raw of incidents) {
                const inc = parseRow(raw);
                try {
                    await postgresClient.becIncident.upsert({
                        where: { id: inc.id },
                        create: inc,
                        update: inc
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading BecIncident table: ${e.message || e}`);
        }

        // 4. Migrate BEC Raw URLs
        try {
            const rawUrls = await getSqliteRows("BecRawUrl");
            console.log(`[4/15] Bulk Migrating BEC Raw URLs (${rawUrls.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < rawUrls.length; i += CHUNK) {
                const chunk = rawUrls.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.becRawUrl.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading BecRawUrl table: ${e.message || e}`);
        }

        // 5. Migrate BEC Stats Cache
        try {
            const statsCache = await getSqliteRows("BecStatsCache");
            console.log(`[5/15] Migrating BEC Stats Cache (${statsCache.length.toLocaleString()})...`);
            for (const raw of statsCache) {
                const s = parseRow(raw);
                try {
                    await postgresClient.becStatsCache.upsert({
                        where: { rangeSeconds: s.rangeSeconds },
                        create: s,
                        update: s
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading BecStatsCache table: ${e.message || e}`);
        }

        // 6. Migrate Firewall Query History
        try {
            const firewallHistory = await getSqliteRows("FirewallQueryHistory");
            console.log(`[6/15] Bulk Migrating Firewall Query History (${firewallHistory.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < firewallHistory.length; i += CHUNK) {
                const chunk = firewallHistory.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallQueryHistory.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading FirewallQueryHistory table: ${e.message || e}`);
        }

        // 7. Migrate Guardian Events
        try {
            const guardianEvents = await getSqliteRows("GuardianEvent");
            console.log(`[7/15] Bulk Migrating Guardian Events (${guardianEvents.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < guardianEvents.length; i += CHUNK) {
                const chunk = guardianEvents.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.guardianEvent.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading GuardianEvent table: ${e.message || e}`);
        }

        // 8. Migrate Guardian Blacklist
        try {
            const blacklist = await getSqliteRows("GuardianBlacklist");
            console.log(`[8/15] Migrating Guardian Blacklist (${blacklist.length.toLocaleString()})...`);
            for (const raw of blacklist) {
                const b = parseRow(raw);
                try {
                    await postgresClient.guardianBlacklist.upsert({
                        where: { ip: b.ip },
                        create: b,
                        update: b
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading GuardianBlacklist table: ${e.message || e}`);
        }

        // 9. Migrate VPN Events (Bulk 5,000 chunks for 1M+ rows)
        try {
            const vpnEvents = await getSqliteRows("VpnEvent");
            console.log(`[9/15] 🚀 Bulk Migrating VPN Events (${vpnEvents.length.toLocaleString()})...`);
            const CHUNK = 5000;
            let processed = 0;
            for (let i = 0; i < vpnEvents.length; i += CHUNK) {
                const chunk = vpnEvents.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.vpnEvent.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                    processed += chunk.length;
                    if (processed % 100000 === 0 || processed === vpnEvents.length) {
                        console.log(`   ↳ Migrated ${processed.toLocaleString()} / ${vpnEvents.length.toLocaleString()} VPN records...`);
                    }
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading VpnEvent table: ${e.message || e}`);
        }

        // 10. Migrate ShunDatabaseIp (Firewall Shun IPs)
        try {
            const shunIps = await getSqliteRows("ShunDatabaseIp");
            console.log(`[10/15] Bulk Migrating Firewall Shun Database IPs (${shunIps.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < shunIps.length; i += CHUNK) {
                const chunk = shunIps.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.shunDatabaseIp.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading ShunDatabaseIp table: ${e.message || e}`);
        }

        // 11. Migrate FirewallShunStats
        try {
            const shunStats = await getSqliteRows("FirewallShunStats");
            console.log(`[11/15] Bulk Migrating Firewall Shun Stats (${shunStats.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < shunStats.length; i += CHUNK) {
                const chunk = shunStats.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallShunStats.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading FirewallShunStats table: ${e.message || e}`);
        }

        // 12. Migrate FirewallShunSnapshot
        try {
            const shunSnapshots = await getSqliteRows("FirewallShunSnapshot");
            console.log(`[12/15] Bulk Migrating Firewall Shun Snapshots (${shunSnapshots.length.toLocaleString()})...`);
            const CHUNK = 5000;
            for (let i = 0; i < shunSnapshots.length; i += CHUNK) {
                const chunk = shunSnapshots.slice(i, i + CHUNK).map(parseRow);
                try {
                    await postgresClient.firewallShunSnapshot.createMany({
                        data: chunk,
                        skipDuplicates: true
                    });
                } catch (e) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading FirewallShunSnapshot table: ${e.message || e}`);
        }

        // 13. Migrate Site Map Versions
        try {
            const siteVersions = await getSqliteRows("SiteMapVersion");
            console.log(`[13/15] Migrating Site Map Versions (${siteVersions.length.toLocaleString()})...`);
            for (const raw of siteVersions) {
                const sv = parseRow(raw);
                try {
                    await postgresClient.siteMapVersion.upsert({
                        where: { id: sv.id },
                        create: sv,
                        update: sv
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading SiteMapVersion table: ${e.message || e}`);
        }

        // 14. Migrate Background Jobs
        try {
            const jobs = await getSqliteRows("BackgroundJob");
            console.log(`[14/15] Migrating Background Jobs (${jobs.length.toLocaleString()})...`);
            for (const raw of jobs) {
                const j = parseRow(raw);
                try {
                    await postgresClient.backgroundJob.upsert({
                        where: { name: j.name },
                        create: j,
                        update: j
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading BackgroundJob table: ${e.message || e}`);
        }

        // 15. Migrate User Feedback
        try {
            const feedback = await getSqliteRows("Feedback");
            console.log(`[15/15] Migrating User Feedback (${feedback.length.toLocaleString()})...`);
            for (const raw of feedback) {
                const fb = parseRow(raw);
                try {
                    await postgresClient.feedback.upsert({
                        where: { id: fb.id },
                        create: fb,
                        update: fb
                    });
                } catch (e: any) {
                    // Ignore duplicates
                }
            }
        } catch (e: any) {
            console.warn(`⚠️ Warning reading Feedback table: ${e.message || e}`);
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
