const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkGuardian() {
    const totalCount = await prisma.guardianEvent.count();
    const oldest = await prisma.guardianEvent.findFirst({ orderBy: { createdAt: 'asc' } });
    const newest = await prisma.guardianEvent.findFirst({ orderBy: { createdAt: 'desc' } });

    console.log(`=== GUARDIAN EVENT DATABASE RETENTION ===`);
    console.log(`Total Records in Database: ${totalCount}`);
    if (oldest) console.log(`Oldest Record: ${oldest.createdAt.toISOString()} (${oldest.action} - ${oldest.ip})`);
    if (newest) console.log(`Newest Record: ${newest.createdAt.toISOString()} (${newest.action} - ${newest.ip})`);

    const actionCounts = await prisma.guardianEvent.groupBy({
        by: ['action'],
        _count: { _all: true }
    });
    console.log(`\nAction Breakdown:`, actionCounts);
}

checkGuardian().finally(() => prisma.$disconnect());
