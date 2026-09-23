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

        const [unreachableDevices, reachableDevices] = await Promise.all([
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
                    cdpNeighbors: true,
                    interfaces: true
                }
            })
        ]);

        // Safely fetch overrides without crashing if table is locked or unmigrated
        let overrides: any[] = [];
        try {
            overrides = await prisma.crawlerDeviceOverride.findMany();
        } catch (e) {
            console.warn("Could not query crawler overrides in unreachable route:", e);
        }

        // Build CDP platform & connected peer port description lookup from all reachable neighbor tables
        const cdpPlatformMap = new Map<string, string>();
        const cdpPortMap = new Map<string, string>();
        const cdpDescMap = new Map<string, string>();

        for (const rDev of reachableDevices) {
            let intfs: Record<string, any> = {};
            try {
                intfs = typeof rDev.interfaces === "string" 
                    ? JSON.parse(rDev.interfaces) 
                    : (rDev.interfaces || {});
            } catch {
                intfs = {};
            }

            let neighbors: any[] = [];
            try {
                neighbors = Array.isArray(rDev.cdpNeighbors)
                    ? rDev.cdpNeighbors
                    : typeof rDev.cdpNeighbors === "string"
                    ? JSON.parse(rDev.cdpNeighbors)
                    : [];
            } catch {
                neighbors = [];
            }

            if (Array.isArray(neighbors)) {
                for (const n of neighbors) {
                    if (!n || typeof n !== "object") continue;
                    const canon = n.destination_host ? String(n.destination_host).split(".")[0].split("(")[0].trim().toLowerCase() : null;
                    const ip = n.management_ip ? String(n.management_ip).trim() : null;

                    if (n.platform) {
                        if (canon && !cdpPlatformMap.has(canon)) cdpPlatformMap.set(canon, String(n.platform));
                        if (ip && !cdpPlatformMap.has(ip)) cdpPlatformMap.set(ip, String(n.platform));
                    }

                    if (n.local_interface) {
                        const localIntfName = String(n.local_interface);
                        if (canon && !cdpPortMap.has(canon)) cdpPortMap.set(canon, localIntfName);
                        if (ip && !cdpPortMap.has(ip)) cdpPortMap.set(ip, localIntfName);

                        // Look up description on rDev's local interface
                        let matchedIntf = intfs && typeof intfs === "object" ? intfs[localIntfName] : null;
                        if (!matchedIntf && intfs && typeof intfs === "object") {
                            const targetKey = localIntfName.toLowerCase();
                            for (const [k, v] of Object.entries(intfs)) {
                                if (k.toLowerCase() === targetKey || k.toLowerCase().replace(/gigabitethernet/i, "gi") === targetKey.replace(/gigabitethernet/i, "gi")) {
                                    matchedIntf = v;
                                    break;
                                }
                            }
                        }

                        const desc = matchedIntf?.description;
                        if (desc) {
                            if (canon && !cdpDescMap.has(canon)) cdpDescMap.set(canon, String(desc));
                            if (ip && !cdpDescMap.has(ip)) cdpDescMap.set(ip, String(desc));
                        }
                    }
                }
            }
        }

        // Build overrides lookup by normalized hostname
        const overrideMap = new Map<string, any>();
        for (const ov of overrides) {
            if (ov?.hostname) {
                overrideMap.set(ov.hostname.toLowerCase(), ov);
            }
        }

        const enriched = unreachableDevices.map(d => {
            const canon = (d.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
            const ip = (d.ipAddress || "").trim();
            const cdpPlatform = d.platform || cdpPlatformMap.get(canon) || (ip ? cdpPlatformMap.get(ip) : null) || null;
            const cdpPort = cdpPortMap.get(canon) || (ip ? cdpPortMap.get(ip) : null) || null;
            const peerDesc = cdpDescMap.get(canon) || (ip ? cdpDescMap.get(ip) : null) || null;
            const override = overrideMap.get(canon) || (ip ? overrideMap.get(ip) : null);

            return {
                ...d,
                platform: cdpPlatform,
                discoveredPort: (d as any).discoveredPort || cdpPort || null,
                peerInterfaceDescription: peerDesc,
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
