const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function testSearch(query) {
    console.log(`\n=== Testing Search Query: "${query}" ===`);
    const clean = query.trim().toLowerCase();
    const cleanDomain = clean.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];

    const whereConditions = {
        OR: [
            { targetHost: { contains: cleanDomain, mode: 'insensitive' } },
            { targetHost: { contains: clean, mode: 'insensitive' } },
            { destUrl: { contains: clean, mode: 'insensitive' } },
            { mid: { contains: clean } },
            { recipient: { contains: clean, mode: 'insensitive' } },
            { sender: { contains: clean, mode: 'insensitive' } },
            { subject: { contains: clean, mode: 'insensitive' } }
        ]
    };

    const start = Date.now();
    const [urls, totalMatches] = await Promise.all([
        prisma.becRawUrl.findMany({
            where: whereConditions,
            orderBy: { createdAt: 'desc' },
            take: 5
        }),
        prisma.becRawUrl.count({ where: whereConditions })
    ]);
    const duration = Date.now() - start;

    console.log(`Found ${totalMatches} total matching records in ${duration}ms.`);
    console.log(urls.map(u => ({
        id: u.id,
        mid: u.mid,
        targetHost: u.targetHost,
        recipient: u.recipient,
        sender: u.sender,
        destUrl: u.destUrl.slice(0, 80) + '...',
        createdAt: u.createdAt
    })));
}

async function main() {
    await testSearch('ticketsatwork');
    await testSearch('gstatic');
    await testSearch('287502509');
}

main().finally(() => prisma.$disconnect());
