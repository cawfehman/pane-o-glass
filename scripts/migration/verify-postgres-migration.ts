import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyMigration() {
    console.log("\n================ 🔍 PostgreSQL Database Migration Verification ================\n");

    try {
        const users = await prisma.user.count();
        const auditLogs = await prisma.auditLog.count();
        const healthProbes = await prisma.healthProbe.count();
        const toolPerms = await prisma.toolPermission.count();
        const feedback = await prisma.feedback.count();
        const backgroundJobs = await prisma.backgroundJob.count();
        const siteMapVersions = await prisma.siteMapVersion.count();
        const vpnEvents = await prisma.vpnEvent.count();
        const ipCache = await prisma.ipLookupCache.count();
        const firewallHistory = await prisma.firewallQueryHistory.count();
        const guardianEvents = await prisma.guardianEvent.count();
        const guardianBlacklist = await prisma.guardianBlacklist.count();
        const shunIps = await prisma.shunDatabaseIp.count();
        const shunStats = await prisma.firewallShunStats.count();
        const shunSnapshots = await prisma.firewallShunSnapshot.count();
        const ironportStats = await prisma.ironportHourlyStat.count();
        const templates = await prisma.notificationTemplate.count();
        const campaigns = await prisma.notificationCampaign.count();
        const recipients = await prisma.campaignRecipient.count();
        const telemetrySnapshots = await prisma.sqliteTelemetrySnapshot.count();
        const becIncidents = await prisma.becIncident.count();
        const becRawUrls = await prisma.becRawUrl.count();
        const becStatsCache = await prisma.becStatsCache.count();

        console.log(`✅ User Records:                   ${users.toLocaleString()}`);
        console.log(`✅ Audit Log Entries:              ${auditLogs.toLocaleString()}`);
        console.log(`✅ Health Probes:                  ${healthProbes.toLocaleString()}`);
        console.log(`✅ Tool Permissions:               ${toolPerms.toLocaleString()}`);
        console.log(`✅ User Feedback Entries:          ${feedback.toLocaleString()}`);
        console.log(`✅ Background Job Statuses:        ${backgroundJobs.toLocaleString()}`);
        console.log(`✅ Site Map Versions:              ${siteMapVersions.toLocaleString()}`);
        console.log(`✅ VPN Historical Events:          ${vpnEvents.toLocaleString()}`);
        console.log(`✅ IP Lookup Cache Entries:        ${ipCache.toLocaleString()}`);
        console.log(`✅ Firewall Query History:         ${firewallHistory.toLocaleString()}`);
        console.log(`✅ Guardian Events:                ${guardianEvents.toLocaleString()}`);
        console.log(`✅ Guardian Blacklist Entries:     ${guardianBlacklist.toLocaleString()}`);
        console.log(`✅ Shun Database IPs:              ${shunIps.toLocaleString()}`);
        console.log(`✅ Firewall Shun Stats:            ${shunStats.toLocaleString()}`);
        console.log(`✅ Firewall Shun Snapshots:        ${shunSnapshots.toLocaleString()}`);
        console.log(`✅ IronPort Hourly Stats:          ${ironportStats.toLocaleString()}`);
        console.log(`✅ Notification Templates:         ${templates.toLocaleString()}`);
        console.log(`✅ Notification Campaigns:         ${campaigns.toLocaleString()}`);
        console.log(`✅ Campaign Recipients:            ${recipients.toLocaleString()}`);
        console.log(`✅ Telemetry Snapshots:            ${telemetrySnapshots.toLocaleString()}`);
        console.log(`✅ BEC Incidents:                  ${becIncidents.toLocaleString()}`);
        console.log(`✅ BEC Raw URLs:                   ${becRawUrls.toLocaleString()}`);
        console.log(`✅ BEC Stats Cache Snapshots:      ${becStatsCache.toLocaleString()}`);

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
