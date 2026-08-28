import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import { getBulkUserAdStatus } from '../../src/lib/ldap';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const prisma = new PrismaClient();

async function runBackfill() {
    console.log("[AD-BACKFILL] Starting Active Directory Identity Snapshot backfill for VpnEvents...");

    const unEnrichedCount = await prisma.vpnEvent.count({
        where: { adStatus: null }
    });

    console.log(`[AD-BACKFILL] Found ${unEnrichedCount.toLocaleString()} VpnEvent records requiring AD enrichment.`);
    if (unEnrichedCount === 0) {
        console.log("[AD-BACKFILL] All records already enriched! Exiting.");
        await prisma.$disconnect();
        return;
    }

    // Process in batches of 1,000 events
    const BATCH_SIZE = 1000;
    let processed = 0;

    while (processed < unEnrichedCount) {
        const events = await prisma.vpnEvent.findMany({
            where: { adStatus: null },
            select: { id: true, username: true },
            take: BATCH_SIZE
        });

        if (events.length === 0) break;

        const uniqueUsernames = Array.from(new Set(events.map(e => e.username).filter(Boolean)));
        console.log(`[AD-BACKFILL] Processing batch of ${events.length} records (${uniqueUsernames.length} unique usernames)...`);

        const adMap = await getBulkUserAdStatus(uniqueUsernames).catch(err => {
            console.error("[AD-BACKFILL] LDAP Batch Lookup Error:", err.message || err);
            return {} as Record<string, any>;
        });

        const now = new Date();
        const updateOps: Promise<any>[] = [];

        for (const evt of events) {
            const u = evt.username;
            const adInfo = adMap[u] || {
                adStatus: "NOT_FOUND",
                displayName: null,
                department: null,
                title: null
            };

            updateOps.push(
                prisma.vpnEvent.update({
                    where: { id: evt.id },
                    data: {
                        adStatus: adInfo.adStatus,
                        adDisplayName: adInfo.displayName || null,
                        adDepartment: adInfo.department || null,
                        adTitle: adInfo.title || null,
                        adEnrichedAt: now
                    }
                })
            );
        }

        // Execute batch update promises in chunks of 100 to prevent connection pool overflow
        for (let i = 0; i < updateOps.length; i += 100) {
            await Promise.all(updateOps.slice(i, i + 100));
        }

        processed += events.length;
        console.log(`[AD-BACKFILL] Progress: ${processed.toLocaleString()} / ${unEnrichedCount.toLocaleString()} events enriched.`);
    }

    console.log("[AD-BACKFILL] Completed Active Directory Identity Snapshot backfill successfully!");
    await prisma.$disconnect();
}

runBackfill().catch(err => {
    console.error("[AD-BACKFILL-FATAL]", err);
    process.exit(1);
});
