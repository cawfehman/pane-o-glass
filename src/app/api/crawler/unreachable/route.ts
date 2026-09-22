import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const snapshotId = searchParams.get("snapshotId");

        let targetSnapshot;
        if (snapshotId) {
            const numId = parseInt(snapshotId, 10);
            targetSnapshot = await prisma.crawlSnapshot.findFirst({
                where: isNaN(numId) ? { id: snapshotId } : { OR: [{ id: snapshotId }, { snapshotNumber: numId }] }
            });
        } else {
            targetSnapshot = await prisma.crawlSnapshot.findFirst({
                orderBy: { snapshotNumber: "desc" }
            });
        }

        if (!targetSnapshot) {
            return NextResponse.json([]);
        }

        const unreachableDevices = await prisma.crawlDevice.findMany({
            where: {
                snapshotId: targetSnapshot.id,
                status: { not: "REACHABLE" }
            },
            select: {
                id: true,
                hostname: true,
                ipAddress: true,
                status: true,
                failureReason: true,
                discoveredVia: true,
                site: true,
                idf: true,
                role: true
            }
        });

        return NextResponse.json(unreachableDevices);
    } catch (error: any) {
        console.error("Failed to fetch unreachable devices:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
