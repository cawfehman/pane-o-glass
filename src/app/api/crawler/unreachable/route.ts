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

        const [unreachableDevices, reachableDevices, overrides] = await Promise.all([
            prisma.crawlDevice.findMany({
                where: {
                    snapshotId: targetSnapshot.id,
                    status: { not: "REACHABLE" }
                },
                select: {
                    id: true,
                    hostname: true,
                    ipAddress: true,
                    platform: true,
                    status: true,
                    failureReason: true,
                    discoveredVia: true,
                    site: true,
                    idf: true,
                    role: true
                }
            }),
            prisma.crawlDevice.findMany({
                where: {
                    snapshotId: targetSnapshot.id,
                    status: "REACHABLE"
                },
                select: {
                    hostname: true,
                    cdpNeighbors: true
                }
            }),
            prisma.crawlerDeviceOverride.findMany()
        ]);

        // Build CDP platform lookup from all reachable neighbor tables
        // destination_host (canonical lowercase) -> platform
        // management_ip -> platform
        const cdpPlatformMap = new Map<string, string>();
        for (const rDev of reachableDevices) {
            const neighbors: any[] = Array.isArray(rDev.cdpNeighbors)
                ? rDev.cdpNeighbors
                : typeof rDev.cdpNeighbors === "string"
                ? JSON.parse(rDev.cdpNeighbors)
                : [];
            for (const n of neighbors) {
                if (n.platform) {
                    if (n.destination_host) {
                        const canon = n.destination_host.split(".")[0].split("(")[0].trim().toLowerCase();
                        cdpPlatformMap.set(canon, n.platform);
                    }
                    if (n.management_ip) {
                        cdpPlatformMap.set(n.management_ip.trim(), n.platform);
                    }
                }
            }
        }

        // Build overrides lookup by normalized hostname
        const overrideMap = new Map<string, typeof overrides[0]>();
        for (const ov of overrides) {
            overrideMap.set(ov.hostname.toLowerCase(), ov);
        }

        const enriched = unreachableDevices.map(d => {
            const canon = (d.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
            const ip = (d.ipAddress || "").trim();
            const cdpPlatform = d.platform || cdpPlatformMap.get(canon) || (ip ? cdpPlatformMap.get(ip) : null) || null;
            const override = overrideMap.get(canon) || (ip ? overrideMap.get(ip) : null);

            return {
                ...d,
                platform: cdpPlatform,
                tag: override?.tag || null,
                isVendorManaged: override?.tag === "VENDOR_MANAGED",
                isIgnored: override?.tag === "IGNORED",
                overrideReason: override?.reason || null,
                excludeFromTopology: override ? override.excludeFromTopology : false,
                excludeFromFailures: override ? override.excludeFromFailures : false
            };
        });

        return NextResponse.json(enriched);
    } catch (error: any) {
        console.error("Failed to fetch unreachable devices:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
