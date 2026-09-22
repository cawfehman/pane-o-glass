"""Network topology analyzer using NetworkX."""

from __future__ import annotations
import ipaddress
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
import networkx as nx

from netcrawl.models import (
    Device,
    DeviceRole,
    DeviceStatus,
    Interface,
    TopologyLink,
)

logger = logging.getLogger(__name__)


class TopologyAnalyzer:
    """Builds topology graph, correlates links, and detects network anomalies."""

    def __init__(self, devices: List[Device]):
        self.devices = devices
        self.device_map: Dict[str, Device] = {d.hostname: d for d in devices}
        # Also map by lower hostname and IP
        self.device_by_ip: Dict[str, Device] = {d.ip_address: d for d in devices}
        for d in devices:
            self.device_map[d.hostname.lower()] = d
            for intf in d.interfaces.values():
                if intf.ip_address:
                    self.device_by_ip[intf.ip_address] = d

        self.graph = nx.DiGraph()
        self.links: List[TopologyLink] = []
        self.anomalies: List[Dict[str, Any]] = []
        self._build_topology()

    def _normalize_host(self, host: str) -> str:
        return host.split(".")[0].strip()

    def _build_topology(self) -> None:
        """Construct the NetworkX graph and canonical link set from CDP tables."""
        # 1. Add all devices as nodes
        for dev in self.devices:
            self.graph.add_node(
                dev.hostname,
                hostname=dev.hostname,
                ip=dev.ip_address,
                role=dev.role.value,
                status=dev.status.value,
                platform=dev.platform or "Unknown",
                site=dev.site_info.site if dev.site_info else "Unknown",
                idf=dev.site_info.idf if dev.site_info else "Unknown",
                failure_reason=dev.failure_reason,
                discovered_via=dev.discovered_via,
                device_obj=dev,
            )

        # 2. Correlate CDP neighbors into bidirectional links
        seen_pairs: Set[Tuple[str, str, str, str]] = set()

        for dev in self.devices:
            if dev.status != DeviceStatus.REACHABLE:
                continue

            for cdp in dev.cdp_neighbors:
                if cdp.is_ap:
                    continue

                remote_host = self._normalize_host(cdp.destination_host)
                local_intf = cdp.local_interface
                remote_intf = cdp.remote_interface

                # Canonical pair key (unordered between devices)
                canonical_key = tuple(sorted([
                    (dev.hostname, local_intf),
                    (remote_host, remote_intf),
                ]))

                if canonical_key in seen_pairs:
                    continue
                seen_pairs.add(canonical_key)

                # Determine link type, speed, duplex
                src_intf = dev.interfaces.get(local_intf)
                remote_dev = self.device_map.get(remote_host) or self.device_map.get(remote_host.lower())
                dst_intf = remote_dev.interfaces.get(remote_intf) if remote_dev else None

                link_type = "L2_TRUNK"
                if src_intf and src_intf.is_trunk:
                    link_type = "L2_TRUNK"
                elif (src_intf and src_intf.ip_address) or (dst_intf and dst_intf.ip_address):
                    link_type = "L3_ROUTED"
                elif dev.role == DeviceRole.ROUTER or (remote_dev and remote_dev.role == DeviceRole.ROUTER):
                    link_type = "L3_ROUTED"

                speed = src_intf.speed if src_intf else (dst_intf.speed if dst_intf else None)
                duplex = src_intf.duplex if src_intf else (dst_intf.duplex if dst_intf else None)

                # Anomaly checking
                status = "UP"
                if src_intf and dst_intf:
                    if src_intf.speed and dst_intf.speed and src_intf.speed != dst_intf.speed:
                        status = "MISMATCH"
                        self.anomalies.append({
                            "type": "SPEED_MISMATCH",
                            "message": f"Speed mismatch between {dev.hostname}:{local_intf} ({src_intf.speed}) and {remote_host}:{remote_intf} ({dst_intf.speed})",
                            "devices": [dev.hostname, remote_host],
                        })
                    if src_intf.duplex and dst_intf.duplex and src_intf.duplex != dst_intf.duplex:
                        status = "MISMATCH"
                        self.anomalies.append({
                            "type": "DUPLEX_MISMATCH",
                            "message": f"Duplex mismatch between {dev.hostname}:{local_intf} ({src_intf.duplex}) and {remote_host}:{remote_intf} ({dst_intf.duplex})",
                            "devices": [dev.hostname, remote_host],
                        })

                # Check if remote device is unreachable / failed
                if remote_dev and remote_dev.status != DeviceStatus.REACHABLE:
                    status = "DOWN"

                link = TopologyLink(
                    source_device=dev.hostname,
                    source_interface=local_intf,
                    source_ip=src_intf.ip_address if src_intf else dev.ip_address,
                    target_device=remote_host,
                    target_interface=remote_intf,
                    target_ip=dst_intf.ip_address if dst_intf else (remote_dev.ip_address if remote_dev else cdp.management_ip),
                    link_type=link_type,
                    speed=speed,
                    duplex=duplex,
                    status=status,
                )
                self.links.append(link)

                # Add edges in both directions in NetworkX graph
                self.graph.add_edge(
                    dev.hostname,
                    remote_host,
                    local_intf=local_intf,
                    remote_intf=remote_intf,
                    link_type=link_type,
                    speed=speed,
                    status=status,
                )
                self.graph.add_edge(
                    remote_host,
                    dev.hostname,
                    local_intf=remote_intf,
                    remote_intf=local_intf,
                    link_type=link_type,
                    speed=speed,
                    status=status,
                )

        # 3. Anomaly check: Unreachable devices
        for dev in self.devices:
            if dev.status != DeviceStatus.REACHABLE:
                self.anomalies.append({
                    "type": "DEVICE_UNREACHABLE",
                    "message": f"Device {dev.hostname} ({dev.ip_address}) failed SSH: {dev.failure_reason}",
                    "devices": [dev.hostname],
                    "discovered_via": dev.discovered_via,
                })

    def find_subnet_gateway(self, target_ip_str: str) -> Optional[Tuple[Device, Interface]]:
        """
        Find the L3 gateway device & interface (SVI or routed port) whose subnet contains target_ip.
        Picks the most specific subnet mask if multiple match.
        """
        try:
            target_ip = ipaddress.ip_address(target_ip_str)
        except ValueError:
            return None

        best_match: Optional[Tuple[Device, Interface, int, int]] = None

        for dev in self.devices:
            if dev.status != DeviceStatus.REACHABLE:
                continue

            # Prioritize routers and L3 switches with actual routes over L2 access switches
            is_l3 = 1 if (dev.role in [DeviceRole.ROUTER, DeviceRole.L3_SWITCH] and len(dev.routes) > 1) else 0

            for intf in dev.interfaces.values():
                if not intf.ip_address:
                    continue

                cidr_str = intf.cidr or "/24" # default /24 if not given
                try:
                    net = ipaddress.ip_network(f"{intf.ip_address}{cidr_str}", strict=False)
                    if target_ip in net:
                        prefixlen = net.prefixlen
                        score = (is_l3, prefixlen)
                        if best_match is None or score > (best_match[2], best_match[3]):
                            best_match = (dev, intf, is_l3, prefixlen)
                except ValueError:
                    pass

        return (best_match[0], best_match[1]) if best_match else None

    def find_l2_access_switch(self, target_ip_str: str, vlan_id: Optional[int] = None) -> Optional[Tuple[Device, str]]:
        """
        Find the L2 switch and port where the target IP/MAC is directly attached (via ARP or MAC table).
        """
        for dev in self.devices:
            if dev.status != DeviceStatus.REACHABLE:
                continue
            for arp in dev.arp_table:
                if arp.ip_address == target_ip_str:
                    # Found in ARP table, check if interface is an access port on an L2 switch
                    intf_name = arp.interface
                    # If this device is an L2 switch, return it
                    if dev.role == DeviceRole.L2_SWITCH:
                        return dev, intf_name
        return None

    def get_summary(self) -> Dict[str, Any]:
        """Return summary counters and health statistics."""
        roles = {r.value: 0 for r in DeviceRole}
        statuses = {s.value: 0 for s in DeviceStatus}

        for dev in self.devices:
            roles[dev.role.value] = roles.get(dev.role.value, 0) + 1
            statuses[dev.status.value] = statuses.get(dev.status.value, 0) + 1

        return {
            "total_devices": len(self.devices),
            "reachable": statuses.get("REACHABLE", 0),
            "unreachable": len(self.devices) - statuses.get("REACHABLE", 0),
            "roles": roles,
            "statuses": statuses,
            "total_links": len(self.links),
            "anomalies_count": len(self.anomalies),
            "anomalies": self.anomalies,
        }
