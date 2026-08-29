const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function checkRecentUnenriched() {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const count24h = await prisma.vpnEvent.count({
        where: {
            createdAt: { gte: twentyFourHoursAgo },
            OR: [
                { ipAsn: null },
                { ipCountry: null }
            ]
        }
    });

    const total24h = await prisma.vpnEvent.count({
        where: { createdAt: { gte: twentyFourHoursAgo } }
    });

    console.log(`[24H-CHECK] Total 24h events: ${total24h} | Unenriched 24h events: ${count24h}`);
}

checkRecentUnenriched().finally(() => prisma.$disconnect());
