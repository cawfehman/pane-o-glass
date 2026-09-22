import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const snapshots = await prisma.crawlSnapshot.findMany({
            orderBy: { snapshotNumber: "desc" },
            select: {
                id: true,
                snapshotNumber: true,
                timestamp: true,
                seedDevices: true,
                totalDiscovered: true,
                totalReachable: true,
                totalUnreachable: true,
                durationSeconds: true,
                crawlProfile: true,
                maxHops: true,
                _count: {
                    select: {
                        devices: true,
                        links: true
                    }
                }
            }
        });

        return NextResponse.json(snapshots);
    } catch (error: any) {
        console.error("Failed to fetch crawler snapshots:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
