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
        const cleanId = (id || "").trim();
        const isMaster = cleanId.toLowerCase() === "master";

        let snapshot: any = null;
        let devices: any[] = [];
        let links: any[] = [];
        const masterVerifiedMap = new Map<string, string>();

        if (isMaster) {
            const latestSnapshot = await prisma.crawlSnapshot.findFirst({
                orderBy: { snapshotNumber: "desc" }
            });

            if (!latestSnapshot) {
                return NextResponse.json({ error: "No snapshots available to construct Master Topology" }, { status: 404 });
            }

            // Fetch all devices across snapshots, newest first
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

            const deviceMap = new Map<string, any>();
            for (const dev of allDevices) {
                const canon = (dev.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
                const key = canon || (dev.ipAddress || "").trim();
                if (!key) continue;

                // Track latest verified reachable timestamp for lastVerifiedAt
                if (dev.status === "REACHABLE" && !masterVerifiedMap.has(dev.hostname)) {
                    const ts = dev.snapshot?.timestamp || dev.createdAt;
                    masterVerifiedMap.set(dev.hostname, ts ? new Date(ts).toISOString() : new Date().toISOString());
                }

                // First encounter across newest snapshots is the device's authoritative state
                if (!deviceMap.has(key)) {
                    deviceMap.set(key, dev);
                }
            }

            devices = Array.from(deviceMap.values());

            // Fetch all links across snapshots, newest first
            const allLinks = await prisma.crawlLink.findMany({
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

            const linkMap = new Map<string, any>();
            for (const link of allLinks) {
                const srcCanon = (link.sourceDevice || "").split(".")[0].split("(")[0].trim().toLowerCase();
                const dstCanon = (link.targetDevice || "").split(".")[0].split("(")[0].trim().toLowerCase();

                if (!deviceMap.has(srcCanon) && !deviceMap.has(dstCanon)) {
                    continue;
                }

                const pairKey = [
                    `${srcCanon}:${(link.sourceInterface || "").toLowerCase()}`,
                    `${dstCanon}:${(link.targetInterface || "").toLowerCase()}`
                ].sort().join(" <-> ");

                if (!linkMap.has(pairKey)) {
                    linkMap.set(pairKey, link);
                }
            }

            links = Array.from(linkMap.values());

            snapshot = {
                id: "master",
                snapshotNumber: "Master",
                timestamp: latestSnapshot.timestamp,
                crawlProfile: "MASTER",
                maxHops: null,
                seedDevices: ["Master Cumulative"],
                totalDiscovered: devices.length,
                totalReachable: devices.filter(d => d.status === "REACHABLE").length,
                totalUnreachable: devices.filter(d => d.status !== "REACHABLE").length,
                durationSeconds: 0,
                reseedFrontier: latestSnapshot.reseedFrontier || [],
                isMaster: true
            };
        } else {
            const isNumeric = /^\d+$/.test(cleanId);
            const numId = isNumeric ? parseInt(cleanId, 10) : NaN;

            snapshot = await prisma.crawlSnapshot.findFirst({
                where: isNumeric ? { OR: [{ id: cleanId }, { snapshotNumber: numId }] } : { id: cleanId },
                include: {
                    devices: true,
                    links: true
                }
            });

            if (!snapshot) {
                return NextResponse.json({ error: `Snapshot '${cleanId}' not found` }, { status: 404 });
            }

            devices = snapshot.devices;
            links = snapshot.links;
        }

        // Calculate summary counters
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
            let intfs: Record<string, any> = {};
            try {
                intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : (dev.interfaces || {});
            } catch {
                intfs = {};
            }
            if (intfs && typeof intfs === "object") {
                for (const intf of Object.values<any>(intfs)) {
                    if (intf && intf.ip_address && intf.cidr) {
                        subnets.add(`${intf.ip_address}${intf.cidr}`);
                    }
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
            }).catch(() => [])
            : [];

        // Build CDP platform & connected peer port description lookup from all reachable neighbor tables
        const cdpPlatformMap = new Map<string, string>();
        const cdpPortMap = new Map<string, string>();
        const cdpDescMap = new Map<string, string>();

        for (const dev of devices) {
            if (dev.status === "REACHABLE" && dev.cdpNeighbors) {
                let intfs: Record<string, any> = {};
                try {
                    intfs = typeof dev.interfaces === "string" 
                        ? JSON.parse(dev.interfaces) 
                        : (dev.interfaces || {});
                } catch {
                    intfs = {};
                }

                let neighbors: any[] = [];
                try {
                    neighbors = Array.isArray(dev.cdpNeighbors)
                        ? dev.cdpNeighbors
                        : typeof dev.cdpNeighbors === "string"
                        ? JSON.parse(dev.cdpNeighbors)
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
        }

        // Fetch overrides
        let overrides: any[] = [];
        try {
            overrides = await prisma.crawlerDeviceOverride.findMany();
        } catch (e) {
            console.warn("Could not query crawler overrides:", e);
        }
        const overrideMap = new Map<string, any>();
        for (const ov of overrides) {
            if (ov?.hostname) {
                overrideMap.set(ov.hostname.toLowerCase(), ov);
            }
        }

        const latestVerifiedMap = new Map<string, string>();
        if (isMaster) {
            masterVerifiedMap.forEach((v, k) => latestVerifiedMap.set(k, v));
        } else {
            for (const record of historicalSuccesses) {
                if (record?.hostname && !latestVerifiedMap.has(record.hostname)) {
                    const ts = record.snapshot?.timestamp || record.createdAt;
                    latestVerifiedMap.set(record.hostname, ts ? ts.toISOString() : record.createdAt.toISOString());
                }
            }
        }

        const enrichedDevices = devices.map(d => {
            let lastVerifiedAt: string | null = null;
            if (d.status === "REACHABLE") {
                const ts = isMaster ? (d.snapshot?.timestamp || d.createdAt) : (snapshot.timestamp || d.createdAt);
                lastVerifiedAt = ts ? new Date(ts).toISOString() : new Date().toISOString();
            } else if (latestVerifiedMap.has(d.hostname)) {
                lastVerifiedAt = latestVerifiedMap.get(d.hostname)!;
            }

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
                lastVerifiedAt,
                tag: override?.tag || null,
                isVendorManaged: override?.tag === "VENDOR_MANAGED",
                isIgnored: override?.tag === "IGNORED",
                overrideReason: override?.reason || null,
                excludeFromTopology: override ? override.excludeFromTopology : false,
                excludeFromFailures: override ? override.excludeFromFailures : false
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
        return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
    }
}
