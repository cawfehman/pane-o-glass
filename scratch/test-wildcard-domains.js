const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testApiLike(query) {
    console.log(`\n=== Testing API Logic for Query: "${query}" ===`);
    const hasWildcard = query.includes('*') || query.includes('%') || query.startsWith('.');
    const cleanQuery = query.replace(/^\*\.?/, '.');

    let pattern = cleanQuery.replace(/\*/g, '%');
    if (cleanQuery.startsWith('.')) {
        pattern = `%${cleanQuery}`;
    } else if (!pattern.includes('%')) {
        pattern = `%${pattern}%`;
    }

    const start = Date.now();
    const rawResults = await prisma.$queryRaw`
        SELECT "id", "mid", "targetHost", "destUrl", "recipient", "createdAt"
        FROM "BecRawUrl"
        WHERE ("targetHost" ILIKE ${pattern}
           OR "destUrl" ILIKE ${pattern}
           OR "recipient" ILIKE ${pattern})
        ORDER BY "createdAt" DESC
        LIMIT 5
    `;
    const countRaw = await prisma.$queryRaw`
        SELECT COUNT(*)::int as count
        FROM "BecRawUrl"
        WHERE ("targetHost" ILIKE ${pattern}
           OR "destUrl" ILIKE ${pattern}
           OR "recipient" ILIKE ${pattern})
    `;
    const duration = Date.now() - start;

    console.log(`[Pattern: ${pattern}] Found ${countRaw[0]?.count || 0} matches in ${duration}ms:`);
    console.log(rawResults);
}

async function main() {
    await testApiLike('*.claims');
    await testApiLike('*.email.*');
    await testApiLike('.com');
    await testApiLike('*.top');
}

main().finally(() => prisma.$disconnect());
