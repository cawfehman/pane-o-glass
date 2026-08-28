const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient({ log: ['query'] });

async function main() {
    console.log("--- Testing Prisma distinct query ---");
    const result = await prisma.vpnEvent.findMany({
        where: {
            OR: [
                { ipAsn: null },
                { ipCountry: null }
            ]
        },
        orderBy: { createdAt: 'desc' },
        select: { sourceIp: true, createdAt: true },
        distinct: ['sourceIp'],
        take: 10
    });

    console.log("Top 10 results returned:", result);
}

main().finally(() => prisma.$disconnect());
