import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Searching VpnEvent for 'sprague'...");
    const events = await prisma.vpnEvent.findMany({
        where: {
            username: {
                contains: 'sprague',
                mode: 'insensitive'
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
    });
    console.log(`Found ${events.length} events matching 'sprague':`);
    console.dir(events, { depth: null });

    const totalCount = await prisma.vpnEvent.count();
    console.log(`Total VpnEvents in DB: ${totalCount}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
