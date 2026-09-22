"""Hop-by-hop L2/L3 path simulation engine."""

from __future__ import annotations
import ipaddress
import logging
from typing import Dict, List, Optional, Tuple

from netcrawl.models import (
    Device,
    DeviceRole,
    DeviceStatus,
    Interface,
    PathHop,
    Route,
)
from netcrawl.topology.analyzer import TopologyAnalyzer

logger = logging.getLogger(__name__)


class PathTracer:
    """Simulates how a packet travels hop-by-hop between source and destination IP."""

    def __init__(self, devices: List[Device], analyzer: Optional[TopologyAnalyzer] = None):
        self.devices = devices
        self.analyzer = analyzer or TopologyAnalyzer(devices)
        self.device_map = self.analyzer.device_map
        self.device_by_ip = self.analyzer.device_by_ip

    def _longest_prefix_match(self, device: Device, target_ip_str: str) -> Optional[Route]:
        """Perform Longest Prefix Match (LPM) on the device's routing table."""
        try:
            target = ipaddress.ip_address(target_ip_str)
        except ValueError:
            return None

        best_route: Optional[Route] = None
        best_prefixlen = -1

        for route in device.routes:
            try:
                net = ipaddress.ip_network(f"{route.prefix}{route.cidr}", strict=False)
                if target in net:
                    if net.prefixlen > best_prefixlen:
                        best_prefixlen = net.prefixlen
                        best_route = route
            except ValueError:
                continue

        return best_route

    def _find_interface_by_ip(self, device: Device, ip_str: str) -> Optional[Interface]:
        for intf in device.interfaces.values():
            if intf.ip_address == ip_str:
                return intf
        return None

    def trace(self, source_ip_str: str, dest_ip_str: str) -> Tuple[List[PathHop], bool, str]:
        """
        Simulate hop-by-hop packet forwarding from source IP to destination IP.
        Returns (hops, is_delivered, status_message) and logs audit event.
        """
        hops, delivered, message = self._do_trace(source_ip_str, dest_ip_str)
        try:
            from netcrawl.audit.logger import get_audit_logger
            get_audit_logger().log(
                event_type="PATH_TRACE_EXECUTED",
                severity="INFO" if delivered else "WARNING",
                details={
                    "source_ip": source_ip_str.strip(),
                    "dest_ip": dest_ip_str.strip(),
                    "delivered": delivered,
                    "hop_count": len(hops),
                    "message": message,
                },
            )
        except Exception:
            pass
        return hops, delivered, message

    def _do_trace(self, source_ip_str: str, dest_ip_str: str) -> Tuple[List[PathHop], bool, str]:
        try:
            src_ip = ipaddress.ip_address(source_ip_str.strip())
            dst_ip = ipaddress.ip_address(dest_ip_str.strip())
        except ValueError as exc:
            return [], False, f"Invalid IP address: {exc}"

        hops: List[PathHop] = []
        visited_l3_nodes: List[str] = []
        hop_num = 1

        # 1. Locate Source Gateway and L2 attachment point
        src_gw_result = self.analyzer.find_subnet_gateway(str(src_ip))
        if not src_gw_result:
            return [], False, f"Source IP {src_ip} does not match any known subnet/gateway in this snapshot."

        src_gw_dev, src_gw_intf = src_gw_result

        # Check if source host is known on an L2 Access switch (via ARP)
        l2_src = self.analyzer.find_l2_access_switch(str(src_ip))
        if l2_src and l2_src[0].hostname != src_gw_dev.hostname:
            l2_dev, host_port = l2_src
            # Find trunk port to gateway
            trunk_port = "Uplink"
            for cdp in l2_dev.cdp_neighbors:
                if self.analyzer._normalize_host(cdp.destination_host).lower() == src_gw_dev.hostname.lower():
                    trunk_port = cdp.local_interface
                    break

            hops.append(PathHop(
                hop_number=hop_num,
                device_name=l2_dev.hostname,
                device_ip=l2_dev.ip_address,
                role=l2_dev.role.value,
                ingress_interface=host_port,
                egress_interface=trunk_port,
                forwarding_type="L2_SWITCHED",
                notes=f"Source host {src_ip} attached on access port {host_port}. Switched across 802.1Q trunk to gateway.",
            ))
            hop_num += 1

        # Start L3 Forwarding simulation at the source gateway
        curr_dev = src_gw_dev
        curr_ingress: Optional[str] = src_gw_intf.name

        # Check if source and destination are in the same subnet
        try:
            gw_net = ipaddress.ip_network(f"{src_gw_intf.ip_address}{src_gw_intf.cidr or '/24'}", strict=False)
            if dst_ip in gw_net:
                # Same subnet L2 communication!
                l2_dst = self.analyzer.find_l2_access_switch(str(dst_ip))
                dst_port = l2_dst[1] if l2_dst else "Access Port"
                hops.append(PathHop(
                    hop_number=hop_num,
                    device_name=curr_dev.hostname,
                    device_ip=curr_dev.ip_address,
                    role=curr_dev.role.value,
                    ingress_interface=curr_ingress,
                    egress_interface=curr_ingress,
                    forwarding_type="DIRECTLY_CONNECTED",
                    notes=f"Same-subnet traffic within {gw_net}. Switched locally to {dst_ip}.",
                ))
                return hops, True, f"Destination {dst_ip} is directly connected in same subnet {gw_net}."
        except Exception:
            pass

        # L3 Multi-Hop Forwarding Loop
        max_hops = 20
        while len(visited_l3_nodes) < max_hops:
            visited_l3_nodes.append(curr_dev.hostname.lower())

            # 1. Check if destination is directly connected on this router/switch
            dst_gw = self.analyzer.find_subnet_gateway(str(dst_ip))
            if dst_gw and dst_gw[0].hostname.lower() == curr_dev.hostname.lower():
                # Reached final L3 hop!
                egress_intf = dst_gw[1].name
                hops.append(PathHop(
                    hop_number=hop_num,
                    device_name=curr_dev.hostname,
                    device_ip=curr_dev.ip_address,
                    role=curr_dev.role.value,
                    ingress_interface=curr_ingress,
                    egress_interface=egress_intf,
                    matched_route=f"{dst_gw[1].ip_address}{dst_gw[1].cidr or '/24'}",
                    route_protocol="Connected",
                    forwarding_type="DIRECTLY_CONNECTED",
                    notes=f"Destination subnet directly connected on {egress_intf}.",
                ))
                hop_num += 1

                # Check if final destination is attached to an L2 access switch
                l2_dst = self.analyzer.find_l2_access_switch(str(dst_ip))
                if l2_dst and l2_dst[0].hostname.lower() != curr_dev.hostname.lower():
                    l2_dev, access_port = l2_dst
                    hops.append(PathHop(
                        hop_number=hop_num,
                        device_name=l2_dev.hostname,
                        device_ip=l2_dev.ip_address,
                        role=l2_dev.role.value,
                        ingress_interface="Trunk",
                        egress_interface=access_port,
                        forwarding_type="TERMINAL",
                        notes=f"Delivered to destination host {dst_ip} via access port {access_port}.",
                    ))

                return hops, True, f"Successfully traced path from {src_ip} to {dst_ip} ({len(hops)} hops)."

            # 2. Perform Longest Prefix Match
            best_route = self._longest_prefix_match(curr_dev, str(dst_ip))
            if not best_route:
                hops.append(PathHop(
                    hop_number=hop_num,
                    device_name=curr_dev.hostname,
                    device_ip=curr_dev.ip_address,
                    role=curr_dev.role.value,
                    ingress_interface=curr_ingress,
                    forwarding_type="BLACKHOLE",
                    notes=f"Packet dropped at {curr_dev.hostname}: No matching route for {dst_ip}.",
                ))
                return hops, False, f"Drop: No route to {dst_ip} on {curr_dev.hostname}."

            egress_intf = best_route.outgoing_interface
            next_hop_ip = best_route.next_hop

            # 3. Resolve the next hop device
            next_dev: Optional[Device] = None

            # Look up via next hop IP
            if next_hop_ip and next_hop_ip != "DIRECTLY_CONNECTED":
                next_dev = self.device_by_ip.get(next_hop_ip)

            # If not found by IP, check CDP neighbor on the egress interface
            if not next_dev and egress_intf:
                for cdp in curr_dev.cdp_neighbors:
                    if cdp.local_interface.lower() == egress_intf.lower() and not cdp.is_ap:
                        neighbor_name = self.analyzer._normalize_host(cdp.destination_host)
                        next_dev = self.device_map.get(neighbor_name) or self.device_map.get(neighbor_name.lower())
                        break

            # Record this L3 Hop
            hops.append(PathHop(
                hop_number=hop_num,
                device_name=curr_dev.hostname,
                device_ip=curr_dev.ip_address,
                role=curr_dev.role.value,
                ingress_interface=curr_ingress,
                egress_interface=egress_intf,
                next_hop_ip=next_hop_ip,
                matched_route=f"{best_route.prefix}{best_route.cidr}",
                route_protocol=best_route.protocol,
                forwarding_type="L3_ROUTED",
                notes=f"Matched route {best_route.prefix}{best_route.cidr} via {next_hop_ip or egress_intf} [{best_route.protocol}]",
            ))
            hop_num += 1

            if not next_dev:
                # Next hop is outside crawled scope (e.g. ISP or unreached network)
                return hops, True, f"Path forwarded to external/unmonitored next-hop {next_hop_ip or egress_intf}."

            # Check for routing loop
            if next_dev.hostname.lower() in visited_l3_nodes:
                hops.append(PathHop(
                    hop_number=hop_num,
                    device_name=next_dev.hostname,
                    device_ip=next_dev.ip_address,
                    role=next_dev.role.value,
                    forwarding_type="LOOP",
                    notes=f"ROUTING LOOP DETECTED: Returning to previously visited device {next_dev.hostname}!",
                ))
                return hops, False, f"Routing loop detected between {curr_dev.hostname} and {next_dev.hostname}."

            # Check if next device is unreachable
            if next_dev.status != DeviceStatus.REACHABLE:
                hops.append(PathHop(
                    hop_number=hop_num,
                    device_name=next_dev.hostname,
                    device_ip=next_dev.ip_address,
                    role=next_dev.role.value,
                    forwarding_type="BLACKHOLE",
                    notes=f"Forwarding halted: Next-hop device {next_dev.hostname} is unreachable ({next_dev.failure_reason}).",
                ))
                return hops, False, f"Next-hop device {next_dev.hostname} is unreachable."

            # Determine ingress interface on next device via CDP
            next_ingress = None
            for cdp in next_dev.cdp_neighbors:
                if self.analyzer._normalize_host(cdp.destination_host).lower() == curr_dev.hostname.lower():
                    next_ingress = cdp.local_interface
                    break

            # Advance to next hop
            curr_dev = next_dev
            curr_ingress = next_ingress

        return hops, False, "Path trace exceeded maximum hop limit (possible routing loop)."
