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

        const isMaster = Boolean(snapshotId && String(snapshotId).toLowerCase() === "master");
        let unreachableDevices: any[] = [];
        let reachableDevices: any[] = [];

        if (isMaster) {
            const allDevices = await prisma.crawlDevice.findMany({
                include: {
                    snapshot: {
                        select: {
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

            const masterMap = new Map<string, any>();
            for (const dev of allDevices) {
                const canon = (dev.hostname || "").split(".")[0].split("(")[0].trim().toLowerCase();
                const key = canon || (dev.ipAddress || "").trim();
                if (key && !masterMap.has(key)) {
                    masterMap.set(key, dev);
                }
            }

            for (const dev of masterMap.values()) {
                if (dev.status === "REACHABLE") {
                    reachableDevices.push(dev);
                } else {
                    unreachableDevices.push(dev);
                }
            }
        } else {
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

            const [unreach, reach] = await Promise.all([
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
                        site: true,
                        idf: true,
                        cdpNeighbors: true,
                        interfaces: true
                    }
                })
            ]);
            unreachableDevices = unreach;
            reachableDevices = reach;
        }

        // Safely fetch overrides without crashing if table is locked or unmigrated
        let overrides: any[] = [];
        try {
            overrides = await prisma.crawlerDeviceOverride.findMany();
        } catch (e) {
            console.warn("Could not query crawler overrides in unreachable route:", e);
        }

        // Build CDP platform & connected peer port description lookup from all reachable neighbor tables
        // Also track discovering closets so unverified devices inherit their neighbor's closet instead of creating phantom IDFs/sites
        const cdpPlatformMap = new Map<string, string>();
        const cdpPortMap = new Map<string, string>();
        const cdpDescMap = new Map<string, string>();

        interface DiscoveringClosetRecord {
            site: string;
            idf: string;
            discoveringHostname: string;
            platform: string | null;
        }
        const discoveringClosetsMap = new Map<string, DiscoveringClosetRecord[]>();

        for (const rDev of reachableDevices) {
            const devSite = rDev.site ? String(rDev.site).trim().toUpperCase() : "UNKNOWN";
            const devIdf = rDev.idf ? String(rDev.idf).trim().toUpperCase() : "MAIN";

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

                    const closetRecord: DiscoveringClosetRecord = {
                        site: devSite,
                        idf: devIdf,
                        discoveringHostname: rDev.hostname,
                        platform: n.platform ? String(n.platform).trim() : null
                    };
                    if (canon) {
                        if (!discoveringClosetsMap.has(canon)) discoveringClosetsMap.set(canon, []);
                        discoveringClosetsMap.get(canon)!.push(closetRecord);
                    }
                    if (ip) {
                        if (!discoveringClosetsMap.has(ip)) discoveringClosetsMap.set(ip, []);
                        discoveringClosetsMap.get(ip)!.push(closetRecord);
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

            let site = d.site;
            let idf = d.idf;
            let isMultiCloset = false;
            let flaggedForInvestigation = false;
            let investigationReason: string | null = null;
            let discoveredClosets: Array<{ site: string; idf: string; discoveringSwitches: string[] }> = [];

            const neighborClosets = [
                ...(discoveringClosetsMap.get(canon) || []),
                ...(ip ? (discoveringClosetsMap.get(ip) || []) : [])
            ];

            if (neighborClosets.length > 0) {
                const uniqueClosetMap = new Map<string, { site: string; idf: string; discoveringSwitches: string[] }>();
                for (const nc of neighborClosets) {
                    const key = `${nc.site}::${nc.idf}`;
                    if (!uniqueClosetMap.has(key)) {
                        uniqueClosetMap.set(key, {
                            site: nc.site,
                            idf: nc.idf,
                            discoveringSwitches: [nc.discoveringHostname]
                        });
                    } else {
                        const entry = uniqueClosetMap.get(key)!;
                        if (!entry.discoveringSwitches.includes(nc.discoveringHostname)) {
                            entry.discoveringSwitches.push(nc.discoveringHostname);
                        }
                    }
                }

                discoveredClosets = Array.from(uniqueClosetMap.values());

                if (discoveredClosets.length === 1) {
                    site = discoveredClosets[0].site;
                    idf = discoveredClosets[0].idf;
                    isMultiCloset = false;
                    flaggedForInvestigation = false;
                } else if (discoveredClosets.length > 1) {
                    isMultiCloset = true;
                    flaggedForInvestigation = true;
                    site = discoveredClosets[0].site;
                    idf = discoveredClosets[0].idf;
                    const closetSummary = discoveredClosets.map(c => `${c.site}/${c.idf} (via ${c.discoveringSwitches.join(', ')})`).join(' and ');
                    investigationReason = `Multi-closet conflict: Discovered by neighbors in multiple closets (${closetSummary}). Unverified device cannot be authoritatively placed into a single closet.`;
                }
            }

            return {
                ...d,
                site,
                idf,
                isMultiCloset,
                flaggedForInvestigation,
                investigationReason,
                discoveredClosets,
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
