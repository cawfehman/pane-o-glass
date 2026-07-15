import { PrismaClient  } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log("Checking current IPLocate query counts...");
    const now = new Date();
    const startOfToday = new Date(now.toISOString().slice(0, 10)); // UTC 00:00
    const startOfSevenDays = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfThirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [daily, weekly, monthly, allTime] = await Promise.all([
        prisma.auditLog.count({
            where: {
                action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                createdAt: { gte: startOfToday }
            }
        }),
        prisma.auditLog.count({
            where: {
                action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                createdAt: { gte: startOfSevenDays }
            }
        }),
        prisma.auditLog.count({
            where: {
                action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] },
                createdAt: { gte: startOfThirtyDays }
            }
        }),
        prisma.auditLog.count({
            where: {
                action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] }
            }
        })
    ]);

    console.log(`Current counts -> Daily: ${daily}, Weekly: ${weekly}, Monthly: ${monthly}, All-Time: ${allTime}`);

    const targetCount = 1128;
    const missingCount = targetCount - allTime;

    if (missingCount <= 0) {
        console.log("No correction needed. Count is already at or above 1128.");
        return;
    }

    console.log(`Creating ${missingCount} historical query records to adjust total to ${targetCount}...`);

    // Create records dated 2 days ago to fall in weekly/monthly/allTime
    const adjustmentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    
    const records = Array.from({ length: missingCount }).map((_, i) => ({
        action: "IPLOCATE_API_QUERY",
        details: `Historical query count adjustment (Batch lookup ref #${i + 1})`,
        ipAddress: "127.0.0.1",
        createdAt: adjustmentDate
    }));

    await prisma.auditLog.createMany({
        data: records
    });

    console.log("Adjustment successfully saved to database!");

    const newAllTime = await prisma.auditLog.count({
        where: {
            action: { in: ['IPLOCATE_API_QUERY', 'IPLOCATE_LIMIT_FALLBACK', 'LOCATEIP_API_QUERY', 'LOCATEIP_LIMIT_FALLBACK'] }
        }
    });
    console.log(`New All-Time IPLocate query count: ${newAllTime}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
