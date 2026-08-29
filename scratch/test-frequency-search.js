const { PrismaClient, Prisma } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testFrequencyEnrichment(hosts) {
    console.log(`\n=== Testing First-Seen & Frequency Aggregation for Hosts:`, hosts, `===`);

    const start = Date.now();
    const statsRaw = await prisma.$queryRaw`
        SELECT "targetHost", MIN("createdAt") as "firstSeen", MAX("createdAt") as "lastSeen", COUNT(*)::int as "totalSeenCount"
        FROM "BecRawUrl"
        WHERE "targetHost" IN (${Prisma.join(hosts)})
        GROUP BY "targetHost"
    `;
    const duration = Date.now() - start;

    console.log(`Aggregated ${statsRaw.length} host stats in ${duration}ms:`);
    console.log(statsRaw.map(s => {
        const ageMs = Date.now() - new Date(s.firstSeen).getTime();
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const count = s.totalSeenCount;

        let riskTag = "NORMAL";
        if (ageDays <= 1) riskTag = "🆕 NEWLY OBSERVED (<24h)";
        else if (ageDays <= 7) riskTag = "⚠️ RECENT DOMAIN (<7d)";
        else if (count <= 3) riskTag = "🚨 RARE / LOW FREQUENCY (30d+ but only seen " + count + "x)";

        return {
            targetHost: s.targetHost,
            firstSeen: s.firstSeen,
            totalSeenCount: count,
            ageDays,
            riskTag
        };
    }));
}

async function main() {
    await testFrequencyEnrichment(['fonts.gstatic.com', 'e.email.ticketsatwork.com', 'www.ebgaffiliates.com']);
}

main().finally(() => prisma.$disconnect());
