import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function ipToLong(ip: string): number {
    const parts = ip.trim().split(".").map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IPv4 address: ${ip}`);
    }
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isIpInSubnet(ipStr: string, netStr: string, cidr: number): boolean {
    const ip = ipToLong(ipStr);
    const net = ipToLong(netStr);
    const mask = cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0;
    return (ip & mask) === (net & mask);
}

function normalizeMac(mac: string): string {
    return mac.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { query, snapshotId } = body;

        if (!query || typeof query !== "string") {
            return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
        }

        const trimmed = query.trim();

        // 1. Fetch latest crawl snapshot or master devices
        let snapshot: any = null;
        let devices: any[] = [];

        if (snapshotId && String(snapshotId).toLowerCase() === "master") {
            const allDevices = await prisma.crawlDevice.findMany({
                include: {
                    snapshot: {
                        select: { id: true, snapshotNumber: true, timestamp: true }
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
                if (key && !deviceMap.has(key)) {
                    deviceMap.set(key, dev);
                }
            }
            devices = Array.from(deviceMap.values());
            snapshot = { id: "master", snapshotNumber: "Master", timestamp: allDevices[0]?.snapshot?.timestamp || new Date() };
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
            return NextResponse.json({ error: "No crawl snapshot data available" }, { status: 404 });
        }

        const isIpv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(trimmed);
        const cleanMac = normalizeMac(trimmed);
        const isMac = cleanMac.length === 12;

        // --- CASE 1: IP ADDRESS LOOKUP ---
        if (isIpv4) {
            // A. Check if the IP is directly a switch/router management or interface IP
            for (const dev of devices) {
                if (dev.ipAddress === trimmed) {
                    return NextResponse.json({
                        type: "DEVICE_DIRECT",
                        query: trimmed,
                        device: {
                            id: dev.id,
                            hostname: dev.hostname,
                            ipAddress: dev.ipAddress,
                            role: dev.role,
                            site: dev.site,
                            idf: dev.idf,
                            platform: dev.platform,
                            serialNumber: dev.serialNumber,
                            status: dev.status
                        },
                        message: `IP ${trimmed} is the management IP of ${dev.hostname}`
                    });
                }

                const intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : dev.interfaces || {};
                for (const [intfName, intf] of Object.entries<any>(intfs)) {
                    if (intf.ip_address === trimmed) {
                        return NextResponse.json({
                            type: "DEVICE_INTERFACE",
                            query: trimmed,
                            device: {
                                id: dev.id,
                                hostname: dev.hostname,
                                ipAddress: dev.ipAddress,
                                role: dev.role,
                                site: dev.site,
                                idf: dev.idf,
                                platform: dev.platform
                            },
                            interface: intfName,
                            message: `IP ${trimmed} is directly configured on ${dev.hostname} interface ${intfName}`
                        });
                    }
                }
            }

            // B. Find the actual SVI / Default Gateway (supporting /22 to /30, never assuming .1)
            let bestGateway: { device: any; intfName: string; intf: any; prefixLen: number } | null = null;

            for (const dev of devices) {
                if (dev.status !== "REACHABLE") continue;
                const routes = typeof dev.routes === "string" ? JSON.parse(dev.routes) : dev.routes || [];
                const isL3 = (dev.role === "Router" || dev.role === "L3 Switch" || routes.length > 0) ? 1 : 0;
                const intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : dev.interfaces || {};

                for (const [intfName, intf] of Object.entries<any>(intfs)) {
                    if (!intf.ip_address) continue;
                    const cidrStr = intf.cidr || "/24";
                    const cidrNum = parseInt(cidrStr.replace("/", ""), 10);
                    if (isNaN(cidrNum)) continue;

                    try {
                        if (isIpInSubnet(trimmed, intf.ip_address, cidrNum)) {
                            if (!bestGateway || (isL3 && !bestGateway.prefixLen) || cidrNum > bestGateway.prefixLen) {
                                bestGateway = { device: dev, intfName, intf, prefixLen: cidrNum };
                            }
                        }
                    } catch {}
                }
            }

            // C. Search ARP tables across all switches to find MAC address
            let foundMac: string | null = null;
            let arpDevice: string | null = null;
            let arpInterface: string | null = null;

            for (const dev of devices) {
                const arpTable = typeof dev.arpTable === "string" ? JSON.parse(dev.arpTable) : dev.arpTable || [];
                for (const entry of arpTable) {
                    const entryIp = entry.ip_address || entry.ip || entry.address;
                    if (entryIp === trimmed) {
                        foundMac = entry.mac_address || entry.mac || entry.hardware_address || null;
                        arpDevice = dev.hostname;
                        arpInterface = entry.interface || null;
                        break;
                    }
                }
                if (foundMac) break;
            }

            // D. If MAC found, find edge access switch
            let edgeSwitch: any = null;
            let edgePort: string | null = arpInterface;

            if (foundMac) {
                const targetCleanMac = normalizeMac(foundMac);
                for (const dev of devices) {
                    const arpTable = typeof dev.arpTable === "string" ? JSON.parse(dev.arpTable) : dev.arpTable || [];
                    for (const entry of arpTable) {
                        const m = entry.mac_address || entry.mac;
                        if (m && normalizeMac(m) === targetCleanMac && dev.role === "L2 Switch") {
                            edgeSwitch = dev;
                            edgePort = entry.interface || edgePort;
                            break;
                        }
                    }
                    if (edgeSwitch) break;
                }
            }

            const focalDevice = edgeSwitch || bestGateway?.device || devices[0];

            return NextResponse.json({
                type: "ENDPOINT_IP",
                query: trimmed,
                macAddress: foundMac,
                arpResolvedBy: arpDevice,
                arpInterface,
                gateway: bestGateway ? {
                    hostname: bestGateway.device.hostname,
                    ipAddress: bestGateway.device.ipAddress,
                    sviName: bestGateway.intfName,
                    sviIp: bestGateway.intf.ip_address, // The actual configured SVI IP! (e.g. .254, .129, etc.)
                    cidr: bestGateway.intf.cidr || `/${bestGateway.prefixLen}`,
                    site: bestGateway.device.site,
                    idf: bestGateway.device.idf,
                    role: bestGateway.device.role
                } : null,
                edgeDevice: edgeSwitch ? {
                    hostname: edgeSwitch.hostname,
                    ipAddress: edgeSwitch.ipAddress,
                    site: edgeSwitch.site,
                    idf: edgeSwitch.idf,
                    role: edgeSwitch.role,
                    port: edgePort
                } : null,
                focalDevice: {
                    hostname: focalDevice.hostname,
                    site: focalDevice.site,
                    idf: focalDevice.idf
                },
                message: bestGateway 
                    ? `Resolved IP ${trimmed} via SVI ${bestGateway.intfName} (${bestGateway.intf.ip_address}${bestGateway.intf.cidr || `/${bestGateway.prefixLen}`}) on ${bestGateway.device.hostname}${foundMac ? ` [MAC: ${foundMac}]` : ""}`
                    : `No active subnet gateway found for IP ${trimmed}`
            });
        }

        // --- CASE 2: MAC ADDRESS LOOKUP ---
        if (isMac) {
            let foundIp: string | null = null;
            let matchedDevice: any = null;
            let matchedPort: string | null = null;

            for (const dev of devices) {
                const arpTable = typeof dev.arpTable === "string" ? JSON.parse(dev.arpTable) : dev.arpTable || [];
                for (const entry of arpTable) {
                    const m = entry.mac_address || entry.mac || entry.hardware_address;
                    if (m && normalizeMac(m) === cleanMac) {
                        foundIp = entry.ip_address || entry.ip || null;
                        matchedDevice = dev;
                        matchedPort = entry.interface || null;
                        break;
                    }
                }
                if (matchedDevice) break;
            }

            if (matchedDevice) {
                return NextResponse.json({
                    type: "ENDPOINT_MAC",
                    query: trimmed,
                    normalizedMac: cleanMac,
                    ipAddress: foundIp,
                    device: {
                        hostname: matchedDevice.hostname,
                        ipAddress: matchedDevice.ipAddress,
                        site: matchedDevice.site,
                        idf: matchedDevice.idf,
                        role: matchedDevice.role
                    },
                    port: matchedPort,
                    focalDevice: {
                        hostname: matchedDevice.hostname,
                        site: matchedDevice.site,
                        idf: matchedDevice.idf
                    },
                    message: `Located MAC ${trimmed} on ${matchedDevice.hostname}${matchedPort ? ` port ${matchedPort}` : ""}${foundIp ? ` (IP: ${foundIp})` : ""}`
                });
            }

            return NextResponse.json({
                type: "NOT_FOUND",
                query: trimmed,
                message: `MAC address ${trimmed} not found in current ARP or MAC tables`
            });
        }

        // --- CASE 3: TEXT / HOSTNAME / SERIAL / CLOSET SEARCH ---
        const queryLower = trimmed.toLowerCase();
        const matches = devices.filter(dev => {
            const host = (dev.hostname || "").toLowerCase();
            const ip = (dev.ipAddress || "").toLowerCase();
            const serial = (dev.serialNumber || "").toLowerCase();
            const platform = (dev.platform || "").toLowerCase();
            const site = (dev.site || "").toLowerCase();
            const idf = (dev.idf || "").toLowerCase();

            return host.includes(queryLower) ||
                   ip.includes(queryLower) ||
                   serial.includes(queryLower) ||
                   platform.includes(queryLower) ||
                   site === queryLower ||
                   idf.includes(queryLower);
        }).slice(0, 10);

        return NextResponse.json({
            type: "DEVICE_SEARCH",
            query: trimmed,
            matches: matches.map(d => ({
                id: d.id,
                hostname: d.hostname,
                ipAddress: d.ipAddress,
                role: d.role,
                platform: d.platform,
                serialNumber: d.serialNumber,
                site: d.site,
                idf: d.idf,
                status: d.status
            })),
            count: matches.length
        });

    } catch (error: any) {
        console.error("Endpoint locate error:", error);
        return NextResponse.json({ error: error.message || "Failed to locate target" }, { status: 500 });
    }
}
