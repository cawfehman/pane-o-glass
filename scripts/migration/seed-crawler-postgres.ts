import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

interface SnapshotJson {
    metadata: {
        snapshot_id: number;
        timestamp: string;
        seed_devices: string[];
        total_discovered: number;
        total_reachable: number;
        total_unreachable: number;
        duration_seconds: number;
    };
    devices: any[];
}

function normalizeHost(host: string): string {
    return host.split(".")[0].trim();
}

function correlateLinks(devices: any[]): any[] {
    const deviceMap = new Map<string, any>();
    for (const d of devices) {
        deviceMap.set(d.hostname, d);
        deviceMap.set(d.hostname.toLowerCase(), d);
    }

    const seenPairs = new Set<string>();
    const links: any[] = [];

    for (const dev of devices) {
        if (dev.status !== "REACHABLE") continue;

        for (const cdp of (dev.cdp_neighbors || [])) {
            if (cdp.is_ap) continue;

            const remoteHost = normalizeHost(cdp.destination_host);
            const localIntf = cdp.local_interface;
            const remoteIntf = cdp.remote_interface;

            const pairItems = [
                `${dev.hostname}:${localIntf}`,
                `${remoteHost}:${remoteIntf}`
            ].sort();
            const pairKey = pairItems.join(" <-> ");

            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const srcIntf = dev.interfaces?.[localIntf];
            const remoteDev = deviceMap.get(remoteHost) || deviceMap.get(remoteHost.toLowerCase());
            const dstIntf = remoteDev?.interfaces?.[remoteIntf];

            let linkType = "L2_TRUNK";
            if (srcIntf?.is_trunk) {
                linkType = "L2_TRUNK";
            } else if (srcIntf?.ip_address || dstIntf?.ip_address) {
                linkType = "L3_ROUTED";
            } else if (dev.role === "Router" || remoteDev?.role === "Router") {
                linkType = "L3_ROUTED";
            }

            links.push({
                sourceDevice: dev.hostname,
                sourceInterface: localIntf,
                sourceIp: srcIntf?.ip_address || null,
                targetDevice: remoteHost,
                targetInterface: remoteIntf,
                targetIp: dstIntf?.ip_address || null,
                linkType,
                status: "UP"
            });
        }
    }

    return links;
}

async function main() {
    console.log("Starting PostgreSQL Crawler Seed Migration...");

    const snapshotsDir = path.join(process.cwd(), "services", "crawler", "snapshots");
    if (!fs.existsSync(snapshotsDir)) {
        console.error("Snapshots directory not found at:", snapshotsDir);
        process.exit(1);
    }

    const files = fs.readdirSync(snapshotsDir)
        .filter(f => f.startsWith("snapshot_") && f.endsWith(".json"))
        .sort();

    console.log(`Found ${files.length} snapshot JSON file(s) to import.`);

    for (const file of files) {
        const filePath = path.join(snapshotsDir, file);
        const data: SnapshotJson = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        const meta = data.metadata;

        console.log(`Processing Snapshot #${meta.snapshot_id} (${meta.timestamp})...`);

        // Check if snapshot already exists
        const existing = await prisma.crawlSnapshot.findFirst({
            where: { snapshotNumber: meta.snapshot_id }
        });

        if (existing) {
            console.log(`Snapshot #${meta.snapshot_id} already exists (ID: ${existing.id}). Skipping.`);
            continue;
        }

        const snapshot = await prisma.crawlSnapshot.create({
            data: {
                snapshotNumber: meta.snapshot_id,
                timestamp: new Date(meta.timestamp.replace(" ", "T")),
                seedDevices: meta.seed_devices,
                totalDiscovered: meta.total_discovered,
                totalReachable: meta.total_reachable,
                totalUnreachable: meta.total_unreachable,
                durationSeconds: meta.duration_seconds
            }
        });

        console.log(`Created CrawlSnapshot ID: ${snapshot.id}`);

        // Insert Devices
        for (const dev of data.devices) {
            await prisma.crawlDevice.create({
                data: {
                    snapshotId: snapshot.id,
                    hostname: dev.hostname,
                    ipAddress: dev.ip_address,
                    platform: dev.platform,
                    osVersion: dev.os_version,
                    serialNumber: dev.serial_number,
                    role: dev.role,
                    status: dev.status,
                    failureReason: dev.failure_reason,
                    discoveredVia: dev.discovered_via,
                    site: dev.site_info?.site || null,
                    idf: dev.site_info?.idf || null,
                    roleCode: dev.site_info?.role_code || null,
                    iterator: dev.site_info?.iterator || null,
                    interfaces: dev.interfaces || {},
                    routes: dev.routes || [],
                    vlans: dev.vlans || [],
                    cdpNeighbors: dev.cdp_neighbors || [],
                    arpTable: dev.arp_table || []
                }
            });
        }
        console.log(`Inserted ${data.devices.length} devices for Snapshot #${meta.snapshot_id}.`);

        // Correlate and Insert Links
        const links = correlateLinks(data.devices);
        for (const link of links) {
            await prisma.crawlLink.create({
                data: {
                    snapshotId: snapshot.id,
                    sourceDevice: link.sourceDevice,
                    sourceInterface: link.sourceInterface,
                    sourceIp: link.sourceIp,
                    targetDevice: link.targetDevice,
                    targetInterface: link.targetInterface,
                    targetIp: link.targetIp,
                    linkType: link.linkType,
                    status: link.status
                }
            });
        }
        console.log(`Correlated and inserted ${links.length} links for Snapshot #${meta.snapshot_id}.`);
    }

    const count = await prisma.crawlSnapshot.count();
    const devCount = await prisma.crawlDevice.count();
    const linkCount = await prisma.crawlLink.count();

    console.log(`\nMigration Complete!`);
    console.log(`Total Snapshots in PostgreSQL: ${count}`);
    console.log(`Total Devices in PostgreSQL:   ${devCount}`);
    console.log(`Total Links in PostgreSQL:     ${linkCount}`);
}

main()
    .catch(err => {
        console.error("Migration failed:", err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
