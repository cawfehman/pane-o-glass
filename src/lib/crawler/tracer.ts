export interface PathHop {
    hopNumber: number;
    deviceName: string;
    deviceIp: string;
    role: string;
    ingressInterface?: string | null;
    egressInterface?: string | null;
    nextHopIp?: string | null;
    matchedRoute?: string | null;
    routeProtocol?: string | null;
    forwardingType: "L3_ROUTED" | "L2_SWITCHED" | "DIRECTLY_CONNECTED" | "TERMINAL" | "BLACKHOLE";
    notes: string;
}

export interface TraceResult {
    snapshotId: string;
    sourceIp: string;
    destIp: string;
    delivered: boolean;
    message: string;
    hops: PathHop[];
}

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

export class NativePathTracer {
    private devices: any[];
    private deviceMap: Map<string, any>;
    private deviceByIp: Map<string, any>;

    constructor(devices: any[]) {
        this.devices = devices;
        this.deviceMap = new Map();
        this.deviceByIp = new Map();

        for (const dev of devices) {
            this.deviceMap.set(dev.hostname, dev);
            this.deviceMap.set(dev.hostname.toLowerCase(), dev);
            if (dev.ipAddress) {
                this.deviceByIp.set(dev.ipAddress, dev);
            }

            const intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : dev.interfaces || {};
            for (const intf of Object.values<any>(intfs)) {
                if (intf.ip_address) {
                    this.deviceByIp.set(intf.ip_address, dev);
                }
            }
        }
    }

    private findSubnetGateway(targetIp: string): { device: any; intf: any } | null {
        let bestMatch: { device: any; intf: any; isL3: number; prefixLen: number } | null = null;

        for (const dev of this.devices) {
            if (dev.status !== "REACHABLE") continue;
            const routes = typeof dev.routes === "string" ? JSON.parse(dev.routes) : dev.routes || [];
            const isL3 = (dev.role === "Router" || dev.role === "L3 Switch" || dev.roleCode === "RT" || dev.roleCode === "CS" || dev.roleCode === "DS" || routes.length > 0) ? 1 : 0;
            const intfs = typeof dev.interfaces === "string" ? JSON.parse(dev.interfaces) : dev.interfaces || {};

            for (const intf of Object.values<any>(intfs)) {
                if (!intf.ip_address) continue;
                const cidrStr = intf.cidr || "/24";
                const cidrNum = parseInt(cidrStr.replace("/", ""), 10);
                if (isNaN(cidrNum)) continue;

                if (isIpInSubnet(targetIp, intf.ip_address, cidrNum)) {
                    if (!bestMatch || isL3 > bestMatch.isL3 || (isL3 === bestMatch.isL3 && cidrNum > bestMatch.prefixLen)) {
                        bestMatch = { device: dev, intf, isL3, prefixLen: cidrNum };
                    }
                }
            }
        }
        return bestMatch ? { device: bestMatch.device, intf: bestMatch.intf } : null;
    }

    private findL2AccessSwitch(clientIp: string): { device: any; arp: any } | null {
        for (const dev of this.devices) {
            if (dev.role !== "L2 Switch" || dev.status !== "REACHABLE") continue;
            const arpTable = typeof dev.arpTable === "string" ? JSON.parse(dev.arpTable) : dev.arpTable || [];

            for (const entry of arpTable) {
                if (entry.ip_address === clientIp) {
                    return { device: dev, arp: entry };
                }
            }
        }
        return null;
    }

    private longestPrefixMatch(device: any, targetIp: string): any | null {
        const routes = typeof device.routes === "string" ? JSON.parse(device.routes) : device.routes || [];
        let bestRoute: any = null;
        let bestPrefixLen = -1;

        for (const route of routes) {
            try {
                const cidrNum = parseInt(route.cidr.replace("/", ""), 10);
                if (isNaN(cidrNum)) continue;

                if (isIpInSubnet(targetIp, route.prefix, cidrNum)) {
                    if (cidrNum > bestPrefixLen) {
                        bestPrefixLen = cidrNum;
                        bestRoute = route;
                    }
                }
            } catch {
                continue;
            }
        }

        return bestRoute;
    }

    public trace(snapshotId: string, sourceIpStr: string, destIpStr: string): TraceResult {
        const srcIp = sourceIpStr.trim();
        const dstIp = destIpStr.trim();

        try {
            ipToLong(srcIp);
            ipToLong(dstIp);
        } catch (err: any) {
            return {
                snapshotId,
                sourceIp: srcIp,
                destIp: dstIp,
                delivered: false,
                message: `Invalid IP address format: ${err.message}`,
                hops: []
            };
        }

        const hops: PathHop[] = [];
        const visitedL3Nodes = new Set<string>();
        let hopNum = 1;

        // 1. Locate Source Gateway and L2 attachment
        const srcGw = this.findSubnetGateway(srcIp);
        if (!srcGw) {
            return {
                snapshotId,
                sourceIp: srcIp,
                destIp: dstIp,
                delivered: false,
                message: `Source IP ${srcIp} does not match any known subnet or gateway in this snapshot.`,
                hops: []
            };
        }

        const l2Src = this.findL2AccessSwitch(srcIp);
        let currentL3Dev = srcGw.device;

        // If source host attached to an L2 Access switch:
        if (l2Src && l2Src.device.hostname !== currentL3Dev.hostname) {
            const intfs = typeof l2Src.device.interfaces === "string" ? JSON.parse(l2Src.device.interfaces) : l2Src.device.interfaces || {};
            const uplink = Object.values<any>(intfs).find(i => i.description && i.description.includes(currentL3Dev.hostname)) ||
                           Object.values<any>(intfs).find(i => i.is_trunk) ||
                           Object.values<any>(intfs)[0];

            hops.push({
                hopNumber: hopNum++,
                deviceName: l2Src.device.hostname,
                deviceIp: l2Src.device.ipAddress,
                role: l2Src.device.role,
                ingressInterface: l2Src.arp.interface,
                egressInterface: uplink?.name || "UplinkTrunk",
                nextHopIp: currentL3Dev.ipAddress,
                matchedRoute: null,
                routeProtocol: null,
                forwardingType: "L2_SWITCHED",
                notes: `Host port ${l2Src.arp.interface} mapped via ARP (${l2Src.arp.mac_address}). Forwarding out 802.1Q trunk to distribution switch.`
            });
        }

        // 2. Hop-by-Hop L3 Forwarding
        let delivered = false;
        let message = "";
        let prevEgress: string | null = null;

        while (currentL3Dev && hopNum <= 25) {
            if (visitedL3Nodes.has(currentL3Dev.hostname)) {
                hops.push({
                    hopNumber: hopNum++,
                    deviceName: currentL3Dev.hostname,
                    deviceIp: currentL3Dev.ipAddress,
                    role: currentL3Dev.role,
                    ingressInterface: prevEgress,
                    egressInterface: null,
                    nextHopIp: null,
                    matchedRoute: null,
                    routeProtocol: null,
                    forwardingType: "BLACKHOLE",
                    notes: `ROUTING LOOP DETECTED: Device ${currentL3Dev.hostname} has already evaluated this packet.`
                });
                message = `Routing loop detected at ${currentL3Dev.hostname}.`;
                break;
            }
            visitedL3Nodes.add(currentL3Dev.hostname);

            // Check if current L3 node is direct gateway for destination
            const intfs = typeof currentL3Dev.interfaces === "string" ? JSON.parse(currentL3Dev.interfaces) : currentL3Dev.interfaces || {};
            let destDirectIntf: any = null;

            for (const intf of Object.values<any>(intfs)) {
                if (intf.ip_address) {
                    const cidrStr = intf.cidr || "/24";
                    const cidrNum = parseInt(cidrStr.replace("/", ""), 10);
                    if (!isNaN(cidrNum) && isIpInSubnet(dstIp, intf.ip_address, cidrNum)) {
                        destDirectIntf = intf;
                        break;
                    }
                }
            }

            if (destDirectIntf) {
                // Check if destination host exists on a downstream L2 switch
                const l2Dst = this.findL2AccessSwitch(dstIp);

                if (l2Dst && l2Dst.device.hostname !== currentL3Dev.hostname) {
                    hops.push({
                        hopNumber: hopNum++,
                        deviceName: currentL3Dev.hostname,
                        deviceIp: currentL3Dev.ipAddress,
                        role: currentL3Dev.role,
                        ingressInterface: prevEgress || srcGw.intf.name,
                        egressInterface: destDirectIntf.name,
                        nextHopIp: l2Dst.device.ipAddress,
                        matchedRoute: `${destDirectIntf.ip_address}${destDirectIntf.cidr}`,
                        routeProtocol: "C",
                        forwardingType: "DIRECTLY_CONNECTED",
                        notes: `Destination subnet directly connected on ${destDirectIntf.name}. Forwarding down trunk to Access switch ${l2Dst.device.hostname}.`
                    });

                    hops.push({
                        hopNumber: hopNum++,
                        deviceName: l2Dst.device.hostname,
                        deviceIp: l2Dst.device.ipAddress,
                        role: l2Dst.device.role,
                        ingressInterface: "UplinkTrunk",
                        egressInterface: l2Dst.arp.interface,
                        nextHopIp: dstIp,
                        matchedRoute: null,
                        routeProtocol: null,
                        forwardingType: "TERMINAL",
                        notes: `Packet delivered to destination host ${dstIp} on access port ${l2Dst.arp.interface} (MAC: ${l2Dst.arp.mac_address}).`
                    });
                } else {
                    hops.push({
                        hopNumber: hopNum++,
                        deviceName: currentL3Dev.hostname,
                        deviceIp: currentL3Dev.ipAddress,
                        role: currentL3Dev.role,
                        ingressInterface: prevEgress || srcGw.intf.name,
                        egressInterface: destDirectIntf.name,
                        nextHopIp: dstIp,
                        matchedRoute: `${destDirectIntf.ip_address}${destDirectIntf.cidr}`,
                        routeProtocol: "C",
                        forwardingType: "TERMINAL",
                        notes: `Destination subnet directly attached on ${destDirectIntf.name}. Forwarded to host IP ${dstIp}.`
                    });
                }

                delivered = true;
                message = `Packet successfully delivered from ${srcIp} to ${dstIp} in ${hops.length} hop(s).`;
                break;
            }

            // Longest Prefix Match on Routing Table
            const bestRoute = this.longestPrefixMatch(currentL3Dev, dstIp);
            if (!bestRoute) {
                hops.push({
                    hopNumber: hopNum++,
                    deviceName: currentL3Dev.hostname,
                    deviceIp: currentL3Dev.ipAddress,
                    role: currentL3Dev.role,
                    ingressInterface: prevEgress,
                    egressInterface: null,
                    nextHopIp: null,
                    matchedRoute: null,
                    routeProtocol: null,
                    forwardingType: "BLACKHOLE",
                    notes: `NO ROUTE TO HOST: Routing table on ${currentL3Dev.hostname} has no matching prefix or default gateway.`
                });
                message = `Packet dropped at ${currentL3Dev.hostname}: No route to host ${dstIp}.`;
                break;
            }

            const nextHopIp = bestRoute.next_hop;
            const egressIntf = bestRoute.outgoing_interface;

            hops.push({
                hopNumber: hopNum++,
                deviceName: currentL3Dev.hostname,
                deviceIp: currentL3Dev.ipAddress,
                role: currentL3Dev.role,
                ingressInterface: prevEgress || srcGw.intf.name,
                egressInterface: egressIntf || (nextHopIp ? `via ${nextHopIp}` : "Unknown"),
                nextHopIp: nextHopIp || null,
                matchedRoute: `${bestRoute.prefix}${bestRoute.cidr}`,
                routeProtocol: bestRoute.protocol,
                forwardingType: "L3_ROUTED",
                notes: `Matched route ${bestRoute.prefix}${bestRoute.cidr} via ${bestRoute.protocol === "O" ? "OSPF" : bestRoute.protocol === "S" ? "Static" : bestRoute.protocol} (Next-hop: ${nextHopIp || egressIntf}).`
            });

            prevEgress = egressIntf;

            // Resolve Next Device
            if (nextHopIp) {
                const nextDev = this.deviceByIp.get(nextHopIp);
                if (nextDev) {
                    currentL3Dev = nextDev;
                } else {
                    hops.push({
                        hopNumber: hopNum++,
                        deviceName: `External/Unmanaged (${nextHopIp})`,
                        deviceIp: nextHopIp,
                        role: "Gateway",
                        ingressInterface: "WAN",
                        egressInterface: null,
                        nextHopIp: null,
                        matchedRoute: null,
                        routeProtocol: null,
                        forwardingType: "TERMINAL",
                        notes: `Next-hop ${nextHopIp} leads to an unmonitored external router or internet gateway.`
                    });
                    delivered = true;
                    message = `Forwarded to external upstream router at ${nextHopIp}.`;
                    break;
                }
            } else {
                break;
            }
        }

        if (hopNum > 25) {
            message = "TTL Expired: Path simulation exceeded maximum hop limit (25). Potential forwarding loop.";
        }

        return {
            snapshotId,
            sourceIp: srcIp,
            destIp: dstIp,
            delivered,
            message,
            hops
        };
    }
}
