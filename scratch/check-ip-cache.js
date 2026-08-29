const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const ip = '95.164.206.108';
    
    console.log("=== IpLookupCache for", ip, "===");
    const cached = await prisma.ipLookupCache.findUnique({ where: { ip } });
    console.log("Cached:", cached);

    console.log("\n=== VpnEvent sample rows for", ip, "===");
    const events = await prisma.vpnEvent.findMany({
        where: { sourceIp: ip },
        orderBy: { createdAt: 'desc' },
        take: 10
    });

    console.log(events.map(e => ({
        id: e.id,
        createdAt: e.createdAt,
        username: e.username,
        ipAsn: e.ipAsn,
        ipAsName: e.ipAsName,
        ipCountry: e.ipCountry,
        ipCountryCode: e.ipCountryCode
    })));
}

main().finally(() => prisma.$disconnect());
