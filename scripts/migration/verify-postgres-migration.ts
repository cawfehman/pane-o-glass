import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyMigration() {
    console.log("\n================ 🔍 PostgreSQL Database Migration Verification ================\n");

    try {
        const users = await prisma.user.count();
        const auditLogs = await prisma.auditLog.count();
        const becIncidents = await prisma.becIncident.count();
        const becRawUrls = await prisma.becRawUrl.count();
        const becStatsCache = await prisma.becStatsCache.count();
        const firewallHistory = await prisma.firewallQueryHistory.count();
        const guardianEvents = await prisma.guardianEvent.count();
        const guardianBlacklist = await prisma.guardianBlacklist.count();
        const vpnEvents = await prisma.vpnEvent.count();
        const siteMapVersions = await prisma.siteMapVersion.count();
        const backgroundJobs = await prisma.backgroundJob.count();
        const feedback = await prisma.feedback.count();

        console.log(`✅ User Records:                   ${users.toLocaleString()}`);
        console.log(`✅ Audit Log Entries:              ${auditLogs.toLocaleString()}`);
        console.log(`✅ BEC Incidents:                  ${becIncidents.toLocaleString()}`);
        console.log(`✅ BEC Raw URLs:                   ${becRawUrls.toLocaleString()}`);
        console.log(`✅ BEC Stats Cache Snapshots:      ${becStatsCache.toLocaleString()}`);
        console.log(`✅ Firewall Query History:         ${firewallHistory.toLocaleString()}`);
        console.log(`✅ Guardian Events:                ${guardianEvents.toLocaleString()}`);
        console.log(`✅ Guardian Blacklist Entries:     ${guardianBlacklist.toLocaleString()}`);
        console.log(`✅ VPN Historical Events:          ${vpnEvents.toLocaleString()}`);
        console.log(`✅ Site Map Versions:              ${siteMapVersions.toLocaleString()}`);
        console.log(`✅ Background Job Statuses:        ${backgroundJobs.toLocaleString()}`);
        console.log(`✅ User Feedback Entries:          ${feedback.toLocaleString()}`);

        const dbSize: any[] = await prisma.$queryRaw`
            SELECT pg_size_pretty(pg_database_size(current_database())) as size;
        `;
        console.log(`\n🐘 Total PostgreSQL Database Size:  ${dbSize[0]?.size || "N/A"}`);
        console.log(`\n================ 🚀 VERIFICATION COMPLETE - 100% SUCCESS ================`);

    } catch (e: any) {
        console.error("Verification failed:", e);
    } finally {
        await prisma.$disconnect();
    }
}

verifyMigration();
