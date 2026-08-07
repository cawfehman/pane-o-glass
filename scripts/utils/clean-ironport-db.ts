import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanIronportDb() {
    console.log("Inspecting current IronportHourlyStat database records...");
    
    const stats = await (prisma as any).ironportHourlyStat.findMany({
        orderBy: { timestamp: "desc" },
        take: 30
    });

    console.log(`Found ${stats.length} recent rows in IronportHourlyStat:`);
    let totalInboundInDb = 0;
    stats.forEach((row: any) => {
        console.log(`  [DB Row] ${new Date(row.timestamp).toISOString()} -> Inbound: ${row.inboundVolume}, Outbound: ${row.outboundVolume}`);
        totalInboundInDb += row.inboundVolume;
    });
    console.log(`Sum of DB inbound volume: ${totalInboundInDb}`);

    console.log("\nDeleting stale/corrupted IronportHourlyStat records to purge old Graylog relative cache...");
    const deleted = await (prisma as any).ironportHourlyStat.deleteMany({});
    console.log(`Deleted ${deleted.count} stale rows from IronportHourlyStat!`);

    await prisma.$disconnect();
}

cleanIronportDb()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
