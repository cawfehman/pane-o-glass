import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if ((session?.user as any)?.role !== 'ADMIN') {
            return NextResponse.json({ error: "Forbidden: Administrator access required." }, { status: 403 });
        }

        const { id } = await context.params;
        const numId = parseInt(id, 10);

        const snapshot = await prisma.crawlSnapshot.findFirst({
            where: isNaN(numId) ? { id } : { OR: [{ id }, { snapshotNumber: numId }] },
            include: {
                devices: true,
                links: true
            }
        });

        if (!snapshot) {
            return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
        }

        // Calculate summary counters
        const devices = snapshot.devices;
        const routers = devices.filter(d => d.role === "Router").length;
        const l3Switches = devices.filter(d => d.role === "L3 Switch").length;
        const l2Switches = devices.filter(d => d.role === "L2 Switch").length;
        const reachable = devices.filter(d => d.status === "REACHABLE").length;
        const unreachable = devices.filter(d => d.status !== "REACHABLE").length;

        // Collect unique sites & subnets
        const sites = new Set<string>();
        const subnets = new Set<string>();

        for (const dev of devices) {
            if (dev.site) sites.add(dev.site);
            const intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : dev.interfaces || {};
            for (const intf of Object.values<any>(intfs)) {
                if (intf.ip_address && intf.cidr) {
                    subnets.add(`${intf.ip_address}${intf.cidr}`);
                }
            }
        }

        // Load site directory to enrich site containers with facility names
        let siteDirectory: Record<string, { name: string; address?: string }> = {};
        try {
            const { getCurrentSiteMap } = await import("@/lib/sites");
            const siteMap = await getCurrentSiteMap();
            siteMap.forEach((meta, code) => {
                siteDirectory[code.toUpperCase()] = { name: meta.name, address: meta.address };
            });
        } catch (e) {
            console.warn("Failed to load site directory for crawler:", e);
        }

        // Compute last verified timestamp for each device
        // If REACHABLE in this snapshot, verified date is this snapshot's timestamp
        // If UNVERIFIED/unreachable, look up the most recent snapshot where this device was REACHABLE
        const hostnamesNeedingLookup = devices
            .filter(d => d.status !== "REACHABLE")
            .map(d => d.hostname);

        const historicalSuccesses = hostnamesNeedingLookup.length > 0
            ? await prisma.crawlDevice.findMany({
                where: {
                    hostname: { in: hostnamesNeedingLookup },
                    status: "REACHABLE"
                },
                select: {
                    hostname: true,
                    createdAt: true,
                    snapshot: {
                        select: { timestamp: true }
                    }
                },
                orderBy: {
                    createdAt: "desc"
                }
            })
            : [];

        const latestVerifiedMap = new Map<string, string>();
        for (const record of historicalSuccesses) {
            if (!latestVerifiedMap.has(record.hostname)) {
                const ts = record.snapshot?.timestamp || record.createdAt;
                latestVerifiedMap.set(record.hostname, ts ? ts.toISOString() : record.createdAt.toISOString());
            }
        }

        const enrichedDevices = devices.map(d => {
            let lastVerifiedAt: string | null = null;
            if (d.status === "REACHABLE") {
                const ts = snapshot.timestamp || d.createdAt;
                lastVerifiedAt = ts ? new Date(ts).toISOString() : new Date().toISOString();
            } else if (latestVerifiedMap.has(d.hostname)) {
                lastVerifiedAt = latestVerifiedMap.get(d.hostname)!;
            }
            return {
                ...d,
                lastVerifiedAt
            };
        });

        return NextResponse.json({
            metadata: {
                id: snapshot.id,
                snapshotNumber: snapshot.snapshotNumber,
                timestamp: snapshot.timestamp,
                seedDevices: snapshot.seedDevices,
                totalDiscovered: snapshot.totalDiscovered,
                totalReachable: snapshot.totalReachable,
                totalUnreachable: snapshot.totalUnreachable,
                durationSeconds: snapshot.durationSeconds,
                crawlProfile: snapshot.crawlProfile,
                maxHops: snapshot.maxHops,
                reseedFrontier: snapshot.reseedFrontier || [],
            },
            summary: {
                totalDevices: devices.length,
                reachable,
                unreachable,
                routers,
                l3Switches,
                l2Switches,
                totalLinks: snapshot.links.length,
                siteCount: sites.size,
                sites: Array.from(sites).sort(),
                subnetCount: subnets.size
            },
            siteDirectory,
            devices: enrichedDevices,
            links: snapshot.links
        });
    } catch (error: any) {
        console.error("Failed to fetch snapshot details:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
