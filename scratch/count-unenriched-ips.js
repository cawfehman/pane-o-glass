const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

function ipToLong(ip) {
    return ip.split('.').reduce((long, octet) => (long << 8) + parseInt(octet, 10), 0) >>> 0;
}

const NON_PUBLIC_RANGES = [
    { start: "10.0.0.0", end: "10.255.255.255" },
    { start: "100.64.0.0", end: "100.127.255.255" },
    { start: "127.0.0.0", end: "127.255.255.255" },
    { start: "169.254.0.0", end: "169.254.255.255" },
    { start: "172.16.0.0", end: "172.31.255.255" },
    { start: "192.0.0.0", end: "192.0.0.255" },
    { start: "192.0.2.0", end: "192.0.2.255" },
    { start: "192.168.0.0", end: "192.168.255.255" },
    { start: "198.18.0.0", end: "198.19.255.255" },
    { start: "198.51.100.0", end: "198.51.100.255" },
    { start: "203.0.113.0", end: "203.0.113.255" },
    { start: "224.0.0.0", end: "239.255.255.255" },
    { start: "240.0.0.0", end: "255.255.255.255" }
];

function isPrivateIp(ip) {
    try {
        const ipLong = ipToLong(ip);
        return NON_PUBLIC_RANGES.some(range => {
            return ipLong >= ipToLong(range.start) && ipLong <= ipToLong(range.end);
        });
    } catch (e) {
        return true;
    }
}

async function main() {
    const totalEvents = await prisma.vpnEvent.count();
    
    const unEnrichedEvents = await prisma.vpnEvent.findMany({
        where: {
            OR: [
                { ipAsn: null },
                { ipCountry: null }
            ]
        },
        select: { sourceIp: true },
        distinct: ['sourceIp']
    });

    const allPublicIps = unEnrichedEvents
        .map(e => e.sourceIp)
        .filter(ip => ip && !isPrivateIp(ip));

    const totalUnenrichedRows = await prisma.vpnEvent.count({
        where: {
            OR: [
                { ipAsn: null },
                { ipCountry: null }
            ]
        }
    });

    let alreadyCachedInDb = 0;
    const chunkSize = 5000;
    for (let i = 0; i < allPublicIps.length; i += chunkSize) {
        const chunk = allPublicIps.slice(i, i + chunkSize);
        const count = await prisma.ipLookupCache.count({
            where: { ip: { in: chunk } }
        });
        alreadyCachedInDb += count;
    }

    console.log(JSON.stringify({
        totalVpnEvents: totalEvents,
        totalUnenrichedRows,
        uniquePublicIpsToEnrich: allPublicIps.length,
        alreadyInIpLookupCache: alreadyCachedInDb,
        netNewExternalLookupsNeeded: allPublicIps.length - alreadyCachedInDb
    }, null, 2));
}

main().finally(() => prisma.$disconnect());
