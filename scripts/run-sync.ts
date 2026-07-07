import { syncFromGraylog } from "../src/app/api/vpn/events/route";
import { prisma } from "../src/lib/prisma";

async function main() {
    console.log("Triggering 24h sync to populate SQLite database...");
    const res = await syncFromGraylog(86400); // sync last 24 hours of logs
    console.log("Sync response:", res);

    const totalEvents = await prisma.vpnEvent.count();
    console.log("Total VPN events in SQLite database:", totalEvents);

    // Let's count active sessions
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActiveEvents = await prisma.vpnEvent.findMany({
        where: {
            status: { in: ["SUCCESS", "DISCONNECT"] },
            createdAt: { gte: twentyFourHoursAgo }
        },
        orderBy: { createdAt: "asc" }
    });

    const activeSessionsMap = new Map<string, any>();
    for (const evt of recentActiveEvents) {
        const key = `${evt.username}-${evt.sourceIp}`;
        if (evt.status === "SUCCESS") {
            activeSessionsMap.set(key, evt);
        } else if (evt.status === "DISCONNECT") {
            activeSessionsMap.delete(key);
        }
    }

    console.log("Calculated active VPN sessions in SQLite database:", activeSessionsMap.size);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
