import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { NativePathTracer } from "@/lib/crawler/tracer";
import { hasPermission } from "@/app/actions/permissions";

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const role = (session?.user as any)?.role || 'USER';
        if (!session?.user || !(await hasPermission(role, 'crawler'))) {
            return NextResponse.json({ error: "Forbidden: Netcrawler permission required." }, { status: 403 });
        }

        const body = await request.json();
        const { sourceIp, destIp, snapshotId } = body;

        if (!sourceIp || !destIp) {
            return NextResponse.json({ error: "Missing sourceIp or destIp parameter" }, { status: 400 });
        }

        // Find snapshot (either master, specified ID, or latest snapshot)
        const isMaster = Boolean(snapshotId && String(snapshotId).toLowerCase() === "master");
        let snapshot: any;
        let devices: any[] = [];

        if (isMaster) {
            const allDevices = await prisma.crawlDevice.findMany({
                include: {
                    snapshot: {
                        select: {
                            id: true,
                            snapshotNumber: true,
                            timestamp: true
                        }
                    }
                },
                orderBy: [
                    { snapshot: { snapshotNumber: "desc" } },
                    { createdAt: "desc" }
                ]
            });

            if (allDevices.length === 0) {
                return NextResponse.json({ error: "No devices available in Master Topology to trace path" }, { status: 404 });
            }

            const deviceMap = new Map<string, any>();
            for (const dev of allDevices) {
                const canon = (dev.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
                const key = canon || (dev.ipAddress || "").trim();
                if (key && !deviceMap.has(key)) {
                    deviceMap.set(key, dev);
                }
            }
            devices = Array.from(deviceMap.values());
            snapshot = { id: "master", snapshotNumber: "Master" };
        } else if (snapshotId) {
            const numId = parseInt(snapshotId, 10);
            snapshot = await prisma.crawlSnapshot.findFirst({
                where: isNaN(numId) ? { id: snapshotId } : { OR: [{ id: snapshotId }, { snapshotNumber: numId }] },
                include: { devices: true }
            });
            if (snapshot) devices = snapshot.devices;
        } else {
            snapshot = await prisma.crawlSnapshot.findFirst({
                orderBy: { snapshotNumber: "desc" },
                include: { devices: true }
            });
            if (snapshot) devices = snapshot.devices;
        }

        if (!snapshot || devices.length === 0) {
            return NextResponse.json({ error: "No snapshots available to trace path" }, { status: 404 });
        }

        const tracer = new NativePathTracer(devices);
        const result = tracer.trace(snapshot.id, sourceIp, destIp);

        // Audit Log
        await logAudit(
            'CRAWLER_PATH_TRACE',
            `Simulated path from ${sourceIp.trim()} to ${destIp.trim()} on Snapshot #${snapshot.snapshotNumber} (${result.delivered ? 'Delivered in ' + result.hops.length + ' hops' : 'Failed/Dropped'})`,
            (session?.user as any)?.id,
            (session?.user as any)?.ipAddress
        );

        const snapDate = snapshot.timestamp ? new Date(snapshot.timestamp) : new Date();
        const ageHours = Math.max(0, Math.round((Date.now() - snapDate.getTime()) / (3600 * 1000)));
        const isStale = ageHours > 24;

        return NextResponse.json({
            ...result,
            snapshotNumber: snapshot.snapshotNumber,
            snapshotTimestamp: snapDate.toISOString(),
            snapshotAgeHours: ageHours,
            isStale,
            routingFreshness: isStale ? "STALE" : "FRESH",
            freshnessMessage: isStale 
                ? `Point-in-time routing table is ${ageHours}h old (>24h)` 
                : `Point-in-time routing table is ${ageHours}h old (fresh, <24h)`
        });
    } catch (error: any) {
        console.error("Failed to run path trace:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
