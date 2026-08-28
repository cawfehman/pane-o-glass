import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function checkDbMetrics() {
    console.log("=== PANE-O-GLASS POSTGRESQL DATABASE HEALTH & SIZE METRICS ===");
    try {
        const pgSize: any[] = await prisma.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size;`;
        console.log(`PostgreSQL Database Size: ${pgSize[0]?.size || 'unknown'}`);
    } catch (e: any) {
        console.log("Could not query PostgreSQL size directly:", e.message);
    }

    try {
        const vpnCount = await prisma.vpnEvent.count();
        const auditCount = await prisma.auditLog.count();
        const cacheCount = await prisma.ipLookupCache.count();
        const shunCount = await prisma.shunDatabaseIp.count();
        const userCount = await prisma.user.count();
        const campaignCount = await prisma.notificationCampaign.count();
        const recipientCount = await prisma.campaignRecipient.count();

        console.log("Table Row Counts:");
        console.log(`- VpnEvent: ${vpnCount.toLocaleString()} rows`);
        console.log(`- AuditLog: ${auditCount.toLocaleString()} rows`);
        console.log(`- IpLookupCache: ${cacheCount.toLocaleString()} rows`);
        console.log(`- ShunDatabaseIp: ${shunCount.toLocaleString()} rows`);
        console.log(`- CampaignRecipient: ${recipientCount.toLocaleString()} rows`);
        console.log(`- NotificationCampaign: ${campaignCount.toLocaleString()} rows`);
        console.log(`- User: ${userCount.toLocaleString()} rows`);
    } catch (e: any) {
        console.error("Error checking DB:", e.message);
    } finally {
        await prisma.$disconnect();
    }
}

checkDbMetrics();
