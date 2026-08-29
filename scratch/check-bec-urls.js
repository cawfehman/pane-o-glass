const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const rawCount = await prisma.becRawUrl.count();
    const incidentCount = await prisma.becIncident.count();

    console.log(`[BEC DB CHECK] BecRawUrl total count: ${rawCount} | BecIncident total count: ${incidentCount}`);

    if (rawCount > 0) {
        const sampleRaw = await prisma.becRawUrl.findMany({ take: 3, orderBy: { createdAt: 'desc' } });
        console.log("\nSample BecRawUrl records:", sampleRaw);
    }
}

main().finally(() => prisma.$disconnect());
