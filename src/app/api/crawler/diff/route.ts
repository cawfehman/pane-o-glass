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
        const snap1 = searchParams.get("snap1");
        const snap2 = searchParams.get("snap2");

        if (!snap1 || !snap2) {
            return NextResponse.json({ error: "Parameters 'snap1' and 'snap2' are required." }, { status: 400 });
        }

        const num1 = parseInt(snap1, 10);
        const num2 = parseInt(snap2, 10);

        const [s1, s2] = await Promise.all([
            prisma.crawlSnapshot.findFirst({
                where: isNaN(num1) ? { id: snap1 } : { OR: [{ id: snap1 }, { snapshotNumber: num1 }] },
                include: { devices: true, links: true }
            }),
            prisma.crawlSnapshot.findFirst({
                where: isNaN(num2) ? { id: snap2 } : { OR: [{ id: snap2 }, { snapshotNumber: num2 }] },
                include: { devices: true, links: true }
            })
        ]);

        if (!s1 || !s2) {
            return NextResponse.json({ error: "One or both snapshots could not be found." }, { status: 404 });
        }

        const devMap1 = new Map(s1.devices.map(d => [d.hostname, d]));
        const devMap2 = new Map(s2.devices.map(d => [d.hostname, d]));

        const addedDevices: any[] = [];
        const removedDevices: any[] = [];
        const modifiedDevices: any[] = [];

        for (const [host, dev2] of devMap2.entries()) {
            if (!devMap1.has(host)) {
                addedDevices.push(dev2);
            } else {
                const dev1 = devMap1.get(host)!;
                if (dev1.status !== dev2.status || dev1.ipAddress !== dev2.ipAddress) {
                    modifiedDevices.push({
                        hostname: host,
                        before: { status: dev1.status, ip: dev1.ipAddress },
                        after: { status: dev2.status, ip: dev2.ipAddress }
                    });
                }
            }
        }

        for (const [host, dev1] of devMap1.entries()) {
            if (!devMap2.has(host)) {
                removedDevices.push(dev1);
            }
        }

        return NextResponse.json({
            snapshot1: { id: s1.id, number: s1.snapshotNumber, timestamp: s1.timestamp },
            snapshot2: { id: s2.id, number: s2.snapshotNumber, timestamp: s2.timestamp },
            hasChanges: addedDevices.length > 0 || removedDevices.length > 0 || modifiedDevices.length > 0,
            summary: {
                addedCount: addedDevices.length,
                removedCount: removedDevices.length,
                modifiedCount: modifiedDevices.length
            },
            addedDevices,
            removedDevices,
            modifiedDevices
        });
    } catch (error: any) {
        console.error("Failed to diff snapshots:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
